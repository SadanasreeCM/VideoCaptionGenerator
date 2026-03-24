import React, { useMemo, useState } from 'react'
import {
  api,
  setToken,
  transcribeVideo,
  renderBurnedVideo,
  parseTokenClaims,
  getHistory
} from './api.js'
import { Link, Routes, Route, useNavigate } from 'react-router-dom'
import Login from './components/Login.jsx'
import Register from './components/Register.jsx'
import VideoCaption from './components/VideoCaption.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'

const LANG_OPTIONS = [
  { code: 'auto', label: 'Auto Detect' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'ar', label: 'Arabic' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'pt', label: 'Portuguese' }
]

export default function App() {
  const [view, setView] = useState('login')
  const [token, setTokenState] = useState(() => localStorage.getItem('token'))
  const [file, setFile] = useState(null)
  const [inputMode, setInputMode] = useState('upload')
  const [videoUrl, setVideoUrl] = useState('')
  const [sourceLang, setSourceLang] = useState('en-US')
  const [targetLanguage, setTargetLanguage] = useState(
    () => LANG_OPTIONS.find((lang) => lang.code !== 'en-US' && lang.code !== 'auto')?.code || 'none'
  )
  const [captionLanguage, setCaptionLanguage] = useState('source')
  const [loading, setLoading] = useState(false)
  const [rendering, setRendering] = useState(false)
  const [captionData, setCaptionData] = useState(null)
  const [renderedUrl, setRenderedUrl] = useState('')
  const [error, setError] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [history, setHistory] = useState([])
  // removed admin-specific states (moved to separate page)
  const [dragActive, setDragActive] = useState(false)
  const [sourceQuery, setSourceQuery] = useState('')
  const [targetQuery, setTargetQuery] = useState('')
  const [opStartMs, setOpStartMs] = useState(0)
  const [elapsedMs, setElapsedMs] = useState(0)

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const oauthToken = params.get('token')
    if (oauthToken) {
      setToken(oauthToken)
      setTokenState(oauthToken)
      const claims = parseTokenClaims(oauthToken)
      setIsAdmin(Boolean(claims?.isAdmin))
      params.delete('token')
      const next = `${window.location.pathname}`
      window.history.replaceState({}, '', next)
    }
  }, [])

  React.useEffect(() => {
    if (!loading && !rendering) return undefined
    const tick = () => setElapsedMs(Date.now() - opStartMs)
    tick()
    const id = setInterval(tick, 200)
    return () => clearInterval(id)
  }, [loading, rendering, opStartMs])

  const handleAuth = async (action, data) => {
    setError('')
    try {
      const res = await action(data)
      setToken(res.token)
      setTokenState(res.token)
      const claims = parseTokenClaims(res.token)
      setIsAdmin(Boolean(claims?.isAdmin))
    } catch (err) {
      setError(err.message)
    }
  }

  const navigate = useNavigate()

  const handleLogout = () => {
    setToken(null)
    setTokenState(null)
    setIsAdmin(false)
    setHistory([])
    // when logging out, return to home route
    navigate('/')
  }

  const handleTranscribe = async () => {
    const trimmedUrl = videoUrl.trim()
    if (inputMode === 'upload' && !file) {
      setError('Please select a video file')
      return
    }
    if (inputMode === 'url') {
      if (!trimmedUrl) {
        setError('Please paste a video URL')
        return
      }
      if (!isSupportedVideoUrl(trimmedUrl)) {
        setError('Only YouTube or Instagram links are supported right now.')
        return
      }
    }
    setError('')
    setOpStartMs(Date.now())
    setElapsedMs(0)
    setLoading(true)
    try {
      const requestedTarget = targetLanguage === sourceLang ? 'none' : targetLanguage
      const data = await transcribeVideo({
        file: inputMode === 'upload' ? file : null,
        videoUrl: inputMode === 'url' ? trimmedUrl : '',
        sourceLanguage: sourceLang,
        targetLanguage: requestedTarget
      })
      setCaptionData(data)
      if (requestedTarget !== 'none' && data?.translations?.[requestedTarget]) {
        setCaptionLanguage(requestedTarget)
      } else {
        setCaptionLanguage('source')
      }
      setRenderedUrl('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRender = async () => {
    if (!captionData) return
    if (!file && !captionData?.sourceId) {
      setError('Upload a file or generate captions from a URL first')
      return
    }
    setError('')
    setOpStartMs(Date.now())
    setElapsedMs(0)
    setRendering(true)
    try {
      const blob = await renderBurnedVideo({
        file,
        captions: captionData,
        language: captionLanguage
      })
      const url = URL.createObjectURL(blob)
      setRenderedUrl(url)
    } catch (err) {
      setError(err.message)
    } finally {
      setRendering(false)
    }
  }

  const loadHistory = async () => {
    try {
      const data = await getHistory()
      setHistory(Array.isArray(data.history) ? data.history : [])
    } catch (err) {
      setError(err.message)
    }
  }


  const availableTargets = useMemo(
    () => LANG_OPTIONS.filter(l => l.code !== sourceLang && l.code !== 'auto'),
    [sourceLang]
  )

  const filteredSourceLangs = useMemo(() => {
    const q = sourceQuery.trim().toLowerCase()
    if (!q) return LANG_OPTIONS
    return LANG_OPTIONS.filter((lang) => lang.label.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q))
  }, [sourceQuery])

  const filteredTargetLangs = useMemo(() => {
    const q = targetQuery.trim().toLowerCase()
    if (!q) return availableTargets
    return availableTargets.filter((lang) => lang.label.toLowerCase().includes(q) || lang.code.toLowerCase().includes(q))
  }, [availableTargets, targetQuery])

  const captionStats = useMemo(() => {
    const sourceSegments = captionData?.segments || []
    const translationCount = Object.keys(captionData?.translations || {}).length
    const durationSeconds = sourceSegments.length ? sourceSegments[sourceSegments.length - 1].end : 0
    return {
      sourceSegments: sourceSegments.length,
      translationCount,
      durationSeconds
    }
  }, [captionData])

  const activeStatus = loading ? 'Generating captions...' : rendering ? 'Rendering MP4...' : 'Ready'
  const elapsedText = `${(elapsedMs / 1000).toFixed(1)}s`

  const handleDroppedFiles = (files) => {
    const videoFile = Array.from(files || []).find((f) => f.type.startsWith('video/'))
    if (!videoFile) {
      setError('Please drop a valid video file')
      return
    }
    setError('')
    setInputMode('upload')
    setVideoUrl('')
    setFile(videoFile)
  }

  const formatDuration = (seconds) => {
    const total = Math.max(0, Math.floor(seconds))
    const mins = Math.floor(total / 60)
    const secs = total % 60
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  React.useEffect(() => {
    if (targetLanguage === sourceLang || targetLanguage === 'auto') {
      const fallback = LANG_OPTIONS.find((lang) => lang.code !== sourceLang && lang.code !== 'auto')
      setTargetLanguage(fallback ? fallback.code : 'none')
    }
  }, [sourceLang, targetLanguage])

  const isSupportedVideoUrl = (value) => {
    try {
      const parsed = new URL(value)
      const host = parsed.hostname.toLowerCase()
      return (
        host === 'youtu.be' ||
        host === 'youtube.com' ||
        host.endsWith('.youtube.com') ||
        host === 'instagram.com' ||
        host.endsWith('.instagram.com')
      )
    } catch (_err) {
      return false
    }
  }

  // build main screen JSX in a variable so it's easier to reuse
  const previewUrl = captionData?.sourceId ? `/api/captions/source/${captionData.sourceId}` : ''
  const canRender = Boolean(file || captionData?.sourceId)

  const mainScreen = (
    <div className="app">
      <header className="hero">
        <div>
          <p className="tag">Caption Forge</p>
          <h1>AI captions that speak every language.</h1>
          <p className="sub">
            Upload a video, generate multilingual captions, and preview them live on the timeline.
          </p>
          <div className="hero-chips">
            <span>Fast Workflow</span>
            <span>Live Preview</span>
            <span>One-Click Export</span>
          </div>
        </div>
        <div className="auth">
          {token ? (
            <>
              {isAdmin && (
                <Link className="ghost" to="/admin" style={{ marginRight: '8px' }}>
                  Dashboard
                </Link>
              )}
              <button className="ghost" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <div className="toggle">
              <button className={view === 'login' ? 'active' : ''} onClick={() => setView('login')}>Log in</button>
              <button className={view === 'register' ? 'active' : ''} onClick={() => setView('register')}>Register</button>
            </div>
          )}
        </div>
      </header>

      {!token ? (
        <section className="card auth-card">
          {view === 'login' ? (
            <Login onSubmit={(data) => handleAuth(api.login, data)} />
          ) : (
            <Register onSubmit={(data) => handleAuth(api.register, data)} />
          )}
        </section>
      ) : (
        <section className="card">
          <div className="status-row">
            <div className="status-pill">{activeStatus}</div>
            {(loading || rendering) && <div className="status-time">{elapsedText}</div>}
            {captionData && (
              <button className="ghost" onClick={() => { setCaptionData(null); setRenderedUrl('') }}>
                Clear session
              </button>
            )}
          </div>

          <div className="stats-grid">
            <article className="stat-card">
              <p>Source Segments</p>
              <strong>{captionStats.sourceSegments}</strong>
            </article>
            <article className="stat-card">
              <p>Translations</p>
              <strong>{captionStats.translationCount}</strong>
            </article>
            <article className="stat-card">
              <p>Caption Duration</p>
              <strong>{formatDuration(captionStats.durationSeconds)}</strong>
            </article>
          </div>

          <div className="controls">
            <div className="toggle source-toggle">
              <button
                className={inputMode === 'upload' ? 'active' : ''}
                onClick={() => { setInputMode('upload'); setVideoUrl('') }}
              >
                Upload file
              </button>
              <button
                className={inputMode === 'url' ? 'active' : ''}
                onClick={() => { setInputMode('url'); setFile(null) }}
              >
                Paste URL
              </button>
            </div>
            <div
              className={dragActive ? 'file file-active' : 'file'}
              style={{ display: inputMode === 'upload' ? 'block' : 'none' }}
              onDragEnter={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={(e) => { e.preventDefault(); setDragActive(false) }}
              onDrop={(e) => {
                e.preventDefault()
                setDragActive(false)
                handleDroppedFiles(e.dataTransfer.files)
              }}
            >
              <input
                id="video-upload"
                type="file"
                accept="video/*"
                onChange={(e) => handleDroppedFiles(e.target.files)}
              />
              <label htmlFor="video-upload" className="file-cta">
                {file ? file.name : 'Drop your video here or click to browse'}
              </label>
              <p className="file-hint">MP4, MOV, AVI supported</p>
            </div>
            {inputMode === 'url' && (
              <div className="url-box">
                <label>
                  Video URL
                  <input
                    value={videoUrl}
                    onChange={(e) => setVideoUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                  />
                </label>
                <p className="file-hint">YouTube and Instagram links only</p>
              </div>
            )}
            <div className="selects">
              <label>
                Source language
                <input
                  value={sourceQuery}
                  onChange={(e) => setSourceQuery(e.target.value)}
                  placeholder="Search language..."
                />
                <select value={sourceLang} onChange={(e) => setSourceLang(e.target.value)}>
                  {filteredSourceLangs.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Target language
                <input
                  value={targetQuery}
                  onChange={(e) => setTargetQuery(e.target.value)}
                  placeholder="Search language..."
                />
                <select value={targetLanguage} onChange={(e) => setTargetLanguage(e.target.value)}>
                  <option value="none">No translation (source only)</option>
                  {filteredTargetLangs.map(lang => (
                    <option key={lang.code} value={lang.code}>{lang.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="quick-actions">
              <button
                className="ghost"
                onClick={() => {
                  if (sourceLang === 'auto' || targetLanguage === 'none') return
                  const nextTarget = sourceLang
                  setSourceLang(targetLanguage)
                  setTargetLanguage(nextTarget)
                }}
              >
                Swap languages
              </button>
              <button className="ghost" onClick={() => setTargetLanguage('en-US')}>
                Translate to English
              </button>
            </div>
            <button className="primary" disabled={loading} onClick={handleTranscribe}>
              {loading ? 'Generating...' : 'Generate captions'}
            </button>
          </div>

          {error && <div className="error">{error}</div>}

          <VideoCaption
            file={file}
            previewUrl={previewUrl}
            captionData={captionData}
            language={captionLanguage}
            onLanguageChange={setCaptionLanguage}
          />

          <div className="history-section">
            <div className="panel-head">
              <h3>My History</h3>
              <button className="ghost" onClick={loadHistory}>Refresh</button>
            </div>
            {!history.length ? (
              <p className="muted-note">No history yet. Generate captions to start logging activity.</p>
            ) : (
              <div className="history-list">
                {history.map((item) => (
                  <div className="history-card" key={item._id || item.id}>
                    <div>
                      <strong>{item.sourceLanguage} → {item.targetLanguage}</strong>
                      <p className="muted-note">{new Date(item.createdAt || '').toLocaleString()}</p>
                    </div>
                    <div className="history-meta">
                      <span>{item.segmentsCount || 0} segments</span>
                      <span>{Math.round(item.durationSeconds || 0)}s</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {captionData && (
            <div className="render-box">
              <div>
                <h3>Export Video</h3>
                <p>Burn captions into a new MP4 using the selected caption language.</p>
              </div>
              <button className="primary" onClick={handleRender} disabled={rendering || !canRender}>
                {rendering ? 'Rendering...' : 'Render MP4'}
              </button>
            </div>
          )}

          {renderedUrl && (
            <div className="rendered">
              <h3>Rendered Video</h3>
              <video controls src={renderedUrl} />
              <a className="ghost" href={renderedUrl} download="captioned.mp4">Download MP4</a>
            </div>
          )}
        </section>
      )}

      <footer className="footer">Built for fast, accurate global captions.</footer>
    </div>
  )

  return (
    <Routes>
      <Route path="/" element={mainScreen} />
      <Route path="/admin" element={<AdminDashboard onLogout={handleLogout} />} />
    </Routes>
  )
}
