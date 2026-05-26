import express from 'express'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuid } from 'uuid'
import ffmpeg from 'fluent-ffmpeg'
import ffmpegPath from 'ffmpeg-static'
import config from '../config.js'
import { segmentFromWords } from '../utils/captions.js'
import { spawn } from 'child_process'
import jwt from 'jsonwebtoken'
import { createHistory } from '../db.js'
import dns from 'dns/promises'

const router = express.Router()
const upload = multer({ dest: 'uploads/' })

if (ffmpegPath) {
  try {
    fs.chmodSync(ffmpegPath, 0o755)
    ffmpeg.setFfmpegPath(ffmpegPath)
    console.log('FFmpeg path set:', ffmpegPath)
  } catch (err) {
    console.error('Failed to set FFmpeg permissions:', err)
  }
}

let speechClient = null
let translateClient = null
if (!config.localTranscribe) {
  const { SpeechClient } = await import('@google-cloud/speech')
  speechClient = new SpeechClient({
    projectId: config.google.projectId || undefined
  })
}
if (!config.localTranslate) {
  const { Translate } = await import('@google-cloud/translate/build/src/v2/index.js')
  translateClient = new Translate({
    projectId: config.google.projectId || undefined
  })
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const workDir = path.join(__dirname, '..', '..', 'work')
if (!fs.existsSync(workDir)) {
  fs.mkdirSync(workDir, { recursive: true })
}

const sourceStore = new Map()
const SOURCE_TTL_MS = 2 * 60 * 60 * 1000

function registerSource(id, filePath) {
  const existing = sourceStore.get(id)
  if (existing?.timeout) clearTimeout(existing.timeout)
  const timeout = setTimeout(() => {
    const entry = sourceStore.get(id)
    if (entry) {
      safeUnlink(entry.path)
      sourceStore.delete(id)
    }
  }, SOURCE_TTL_MS)
  sourceStore.set(id, { path: filePath, timeout })
}

router.post('/transcribe', upload.single('video'), async (req, res) => {
  let tempUploadPath = null
  let tempDownloadPath = null
  let audioPath = null
  try {
    const user = parseUserFromRequest(req)
    let sourceLang = req.body.sourceLanguage || req.body.sourceLang || config.defaultSourceLang
    let sourceShort = sourceLang === 'auto' ? '' : sourceLang.split('-')[0].toLowerCase()
    let targetLangs = []
    if (req.body.targetLanguage) {
      targetLangs = [req.body.targetLanguage]
    } else if (req.body.targetLangs) {
      targetLangs = JSON.parse(req.body.targetLangs)
    }
    targetLangs = Array.from(
      new Set(
        (Array.isArray(targetLangs) ? targetLangs : [])
          .filter(Boolean)
          .filter((lang) => lang !== sourceLang && lang !== 'source')
      )
    )

    const videoUrl = String(req.body.videoUrl || req.body.url || '').trim()
    if (!req.file && !videoUrl) {
      return res.status(400).json({ error: 'Missing video file or URL' })
    }

    const id = uuid()
    audioPath = path.join(workDir, `${id}.wav`)

    let inputPath = null
    let sourceId = null
    if (req.file) {
      tempUploadPath = req.file.path
      inputPath = tempUploadPath
    } else {
      if (!isAllowedVideoUrl(videoUrl)) {
        return res.status(400).json({ error: 'Only YouTube and Instagram URLs are supported.' })
      }
      tempDownloadPath = await downloadVideoFromUrl(videoUrl, id)
      inputPath = tempDownloadPath
      sourceId = id
      registerSource(sourceId, inputPath)
      tempDownloadPath = null
    }

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .audioChannels(1)
        .audioFrequency(16000)
        .format('wav')
        .on('end', resolve)
        .on('error', reject)
        .save(audioPath)
    })

    let transcript = ''
    let segments = []

    if (config.localTranscribe) {
      const result = await runPythonJson(config.pythonPath, [
        path.join(__dirname, '..', '..', 'scripts', 'transcribe.py'),
        '--audio',
        audioPath,
        '--language',
        sourceShort,
        '--model',
        config.whisperModel,
        '--device',
        config.whisperDevice,
        '--compute-type',
        config.whisperComputeType,
        '--beam-size',
        String(config.whisperBeamSize),
        '--best-of',
        String(config.whisperBestOf),
        ...(config.whisperVadFilter ? ['--vad-filter'] : [])
      ])
      if (sourceLang === 'auto' && result.detectedLanguage) {
        sourceLang = String(result.detectedLanguage).toLowerCase()
        sourceShort = sourceLang.split('-')[0].toLowerCase()
      }
      transcript = result.transcript || ''
      segments = Array.isArray(result.segments) ? result.segments : []
    } else {
      const audioBytes = fs.readFileSync(audioPath).toString('base64')
      const request = {
        audio: { content: audioBytes },
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: sourceLang,
          enableWordTimeOffsets: true
        }
      }

      const [operation] = await speechClient.longRunningRecognize(request)
      const [response] = await operation.promise()

      const words = []
      const transcriptParts = []
      for (const result of response.results || []) {
        const alt = result.alternatives && result.alternatives[0]
        if (alt) {
          transcriptParts.push(alt.transcript)
          if (alt.words) {
            for (const w of alt.words) words.push(w)
          }
        }
      }

      transcript = transcriptParts.join(' ').trim()
      segments = segmentFromWords(words)
    }

    const translations = {}
    if (targetLangs.length > 0) {
      const googleCredsAvailable =
        Boolean(config.google.projectId) || Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS)
      if (!config.localTranslate && !googleCredsAvailable) {
        return res.status(400).json({
          error:
            'Target translation requested, but translation provider is not configured. Set LOCAL_TRANSLATE=1 with Argos packages, or configure Google Translate credentials.'
        })
      }
      const segmentTexts = segments.map(s => s.text)
      for (const lang of targetLangs) {
        let segArray = []
        if (config.localTranslate) {
          if (!sourceShort) {
            return res.status(400).json({
              error: 'Unable to detect source language for local translation. Please choose source language explicitly.'
            })
          }
          const targetShort = lang.split('-')[0].toLowerCase()
          try {
            segArray = await runPythonArray(config.pythonPath, [
              path.join(__dirname, '..', '..', 'scripts', 'translate.py'),
              '--source',
              sourceShort,
              '--target',
              targetShort
            ], segmentTexts)
          } catch (err) {
            const message = String(err?.message || '')
            const shouldFallbackToPublicTranslate =
              message.includes('Argos Translate not installed') ||
              message.includes('unable to infer type for attribute "REGEX"')
            if (!shouldFallbackToPublicTranslate) {
              throw err
            }
            segArray = await translateWithPublicApi(segmentTexts, sourceShort, targetShort)
          }
        } else {
          const [translatedSegments] = await translateClient.translate(segmentTexts, lang)
          segArray = Array.isArray(translatedSegments) ? translatedSegments : [translatedSegments]
        }

        if (!Array.isArray(segArray)) {
          if (segArray && typeof segArray === 'object' && segArray.error) {
            throw new Error(segArray.error)
          }
          segArray = [String(segArray ?? '')]
        }
        const translatedTranscript = segArray.join(' ')
        translations[lang] = {
          transcript: translatedTranscript,
          segments: segments.map((s, i) => ({
            start: s.start,
            end: s.end,
            text: segArray[i] || s.text
          }))
        }
      }
    }

    if (user) {
      try {
        const durationSeconds = segments.length ? segments[segments.length - 1].end : 0
        const targetLanguage = targetLangs.length ? targetLangs[0] : 'none'
        await createHistory({
          userId: user.id,
          email: user.email,
          sourceLanguage: sourceLang,
          targetLanguage,
          transcript,
          segmentsCount: segments.length,
          durationSeconds,
          translationCount: Object.keys(translations).length,
          provider: config.localTranscribe ? 'local' : 'google',
          meta: {
            targetLanguages: targetLangs
          }
        })
      } catch (err) {
        console.warn('History write failed:', err.message)
      }
    }

    return res.json({
      sourceLang,
      sourceLanguage: sourceLang,
      transcript,
      segments,
      translations,
      sourceId,
      sourceType: sourceId ? 'url' : 'upload'
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Transcription failed', details: err.message })
  } finally {
    safeUnlink(tempUploadPath)
    safeUnlink(tempDownloadPath)
    safeUnlink(audioPath)
  }
})

router.get('/diagnose', async (req, res) => {
  const host = String(req.query.host || 'instagram.com').trim()
  if (!host) {
    return res.status(400).json({ ok: false, error: 'Missing host' })
  }
  try {
    const addresses = await dns.resolve(host)
    return res.json({ ok: true, host, addresses })
  } catch (err) {
    return res.status(500).json({
      ok: false,
      host,
      error: err?.code || err?.message || String(err)
    })
  }
})

router.get('/source/:id', (req, res) => {
  const sourceId = req.params.id
  const entry = sourceStore.get(sourceId)
  if (!entry || !entry.path || !fs.existsSync(entry.path)) {
    return res.status(404).json({ error: 'Source not found or expired' })
  }

  const stat = fs.statSync(entry.path)
  const fileSize = stat.size
  const range = req.headers.range
  const ext = path.extname(entry.path)
  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = Number(parts[0])
    const end = parts[1] ? Number(parts[1]) : fileSize - 1
    const chunkSize = end - start + 1
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': ext ? `video/${ext.replace('.', '')}` : 'video/mp4'
    })
    const stream = fs.createReadStream(entry.path, { start, end })
    return stream.pipe(res)
  }

  res.writeHead(200, {
    'Content-Length': fileSize,
    'Content-Type': ext ? `video/${ext.replace('.', '')}` : 'video/mp4'
  })
  const stream = fs.createReadStream(entry.path)
  return stream.pipe(res)
})

router.post('/burn', upload.single('video'), async (req, res) => {
  let cleanupSourceId = null
  try {
    const sourceId = req.body.sourceId
    if (!req.file && !sourceId) {
      return res.status(400).json({ error: 'Missing video file or sourceId' })
    }
    if (sourceId && !sourceStore.has(sourceId)) {
      return res.status(400).json({ error: 'Source not found or expired' })
    }

    const language = req.body.language || 'source'
    const captionsRaw = req.body.captions ? JSON.parse(req.body.captions) : null
    if (!captionsRaw) {
      return res.status(400).json({ error: 'Missing captions' })
    }

    const segments =
      language === 'source'
        ? captionsRaw.segments || []
        : captionsRaw.translations?.[language]?.segments || []

    if (!segments.length) {
      return res.status(400).json({ error: 'No captions available for selected language' })
    }

    const id = uuid()
    const inputPath = req.file ? req.file.path : sourceStore.get(sourceId).path
    const srtPath = path.join(workDir, `${id}.srt`)
    const outputPath = path.join(workDir, `${id}.mp4`)
    if (sourceId) cleanupSourceId = sourceId

    fs.writeFileSync(srtPath, srtFromSegments(segments), 'utf-8')

    const srtFilterPath = srtPath.replace(/\\/g, '/').replace(':', '\\:').replace(/'/g, "\\'")

    await new Promise((resolve, reject) => {
      const filter = `subtitles='${srtFilterPath}':force_style='FontName=Arial,FontSize=24,PrimaryColour=&HFFFFFF&,OutlineColour=&H000000&,Outline=2,Shadow=1'`

      ffmpeg(inputPath)
        .outputOptions([
          '-y',
          '-c:v libx264',
          '-preset veryfast',
          '-crf 22',
          '-c:a aac',
          '-b:a 128k'
        ])
        .videoFilters(filter)
        .on('end', resolve)
        .on('error', reject)
        .save(outputPath)
    })

    res.setHeader('Content-Type', 'video/mp4')
    res.setHeader('Content-Disposition', 'attachment; filename="captioned.mp4"')
    const stream = fs.createReadStream(outputPath)
    stream.pipe(res)
    stream.on('close', () => {
      if (req.file) safeUnlink(inputPath)
      safeUnlink(srtPath)
      safeUnlink(outputPath)
      if (cleanupSourceId) {
        const entry = sourceStore.get(cleanupSourceId)
        if (entry?.timeout) clearTimeout(entry.timeout)
        if (entry?.path) safeUnlink(entry.path)
        sourceStore.delete(cleanupSourceId)
      }
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: 'Render failed', details: err.message })
  }
})

function safeUnlink(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath)
  } catch (_err) {
    // ignore cleanup errors
  }
}

function srtTime(seconds) {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const s = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const m = totalMinutes % 60
  const h = Math.floor(totalMinutes / 60)
  const pad = (n, w = 2) => String(n).padStart(w, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
}

function srtFromSegments(segments) {
  return segments
    .map((seg, idx) => {
      const start = srtTime(seg.start)
      const end = srtTime(seg.end)
      const text = String(seg.text || '').replace(/\r?\n/g, ' ')
      return `${idx + 1}\n${start} --> ${end}\n${text}\n`
    })
    .join('\n')
}

function runPythonJson(pythonPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => {
      const trimmed = stdout.trim()
      const match = trimmed.match(/\{[\s\S]*\}$/)
      const jsonText = match ? match[0] : trimmed
      try {
        const parsed = JSON.parse(jsonText)
        if (code !== 0) {
          const errMessage =
            (parsed && typeof parsed === 'object' && parsed.error) || stderr || stdout || 'Python process failed'
          return reject(new Error(String(errMessage)))
        }
        return resolve(parsed)
      } catch (err) {
        if (code !== 0) {
          return reject(new Error(stderr || stdout || 'Python process failed'))
        }
        return reject(new Error(`Invalid JSON from python: ${err.message}\n${stderr || trimmed}`))
      }
    })
  })
}

function runPythonArray(pythonPath, args, payload) {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => {
      const trimmed = stdout.trim()
      const match = trimmed.match(/\[[\s\S]*\]$/)
      const jsonText = match ? match[0] : trimmed
      try {
        const parsed = JSON.parse(jsonText)
        if (code !== 0) {
          const errMessage =
            (parsed && typeof parsed === 'object' && parsed.error) || stderr || stdout || 'Python process failed'
          return reject(new Error(String(errMessage)))
        }
        return resolve(parsed)
      } catch (err) {
        if (code !== 0) {
          return reject(new Error(stderr || stdout || 'Python process failed'))
        }
        return reject(new Error(`Invalid JSON from python: ${err.message}\n${stderr || trimmed}`))
      }
    })
    proc.stdin.write(JSON.stringify(payload || []))
    proc.stdin.end()
  })
}

function parseUserFromRequest(req) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null
  if (!token) return null
  try {
    return jwt.verify(token, config.jwtSecret)
  } catch (_err) {
    return null
  }
}

function isAllowedVideoUrl(rawUrl) {
  if (!rawUrl) return false
  let parsed = null
  try {
    parsed = new URL(rawUrl)
  } catch (_err) {
    return false
  }
  const host = parsed.hostname.toLowerCase()
  return (
    host === 'youtu.be' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube.com' ||
    host === 'instagram.com' ||
    host.endsWith('.instagram.com')
  )
}

function downloadVideoFromUrl(rawUrl, id) {
  return new Promise((resolve, reject) => {
    const outputPath = path.join(workDir, `${id}.mp4`)
    const extraArgs = []
    if (config.ytDlpCookies) {
      extraArgs.push('--cookies', config.ytDlpCookies)
    }
    if (config.ytDlpProxy) {
      extraArgs.push('--proxy', config.ytDlpProxy)
    }
    const args = [
      '--no-playlist',
      '-f',
      'bestvideo+bestaudio/best',
      '--merge-output-format',
      'mp4',
      '-o',
      outputPath,
      ...extraArgs,
      rawUrl
    ]
    const proc = spawn(config.ytDlpPath, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('error', (err) => {
      reject(new Error(`yt-dlp failed to start: ${err.message}`))
    })
    proc.on('close', (code) => {
      if (code !== 0) {
        let message = stderr.trim() || 'Video download failed'
        if (message.toLowerCase().includes('getaddrinfo failed')) {
          message =
            `${message}\n` +
            'Hint: DNS/network resolution failed. Check internet access, VPN/proxy/DNS settings, ' +
            'or run yt-dlp manually to confirm it can reach Instagram.'
        }
        return reject(new Error(message))
      }
      if (!fs.existsSync(outputPath)) {
        return reject(new Error('Video download did not produce an output file'))
      }
      return resolve(outputPath)
    })
  })
}

async function translateWithPublicApi(texts, sourceShort, targetShort) {
  const concurrency = Number.isFinite(config.publicTranslateConcurrency)
    ? Math.max(1, config.publicTranslateConcurrency)
    : 8
  const results = new Array(texts.length)
  let idx = 0

  async function worker() {
    while (true) {
      const current = idx++
      if (current >= texts.length) return
      results[current] = await translateTextWithPublicApi(
        String(texts[current] || ''),
        sourceShort,
        targetShort
      )
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, texts.length) }, () => worker())
  await Promise.all(workers)
  return results
}

async function translateTextWithPublicApi(text, sourceShort, targetShort) {
  if (!text.trim()) return text
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${encodeURIComponent(sourceShort)}` +
    `&tl=${encodeURIComponent(targetShort)}` +
    `&dt=t&q=${encodeURIComponent(text)}`

  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  })

  if (!response.ok) {
    throw new Error(`Public translation fallback failed (${response.status})`)
  }

  const data = await response.json()
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Public translation fallback returned invalid response')
  }

  return data[0].map((part) => part?.[0] || '').join('').trim() || text
}

export default router
