import React, { useEffect, useMemo, useRef, useState } from 'react'

export default function VideoCaption({ file, previewUrl, captionData, language, onLanguageChange }) {
  const videoRef = useRef(null)
  const [currentTime, setCurrentTime] = useState(0)
  const [videoUrl, setVideoUrl] = useState('')

  useEffect(() => {
    if (!file) {
      setVideoUrl(previewUrl || '')
      return
    }
    const url = URL.createObjectURL(file)
    setVideoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [file, previewUrl])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    const onTime = () => setCurrentTime(video.currentTime)
    video.addEventListener('timeupdate', onTime)
    return () => video.removeEventListener('timeupdate', onTime)
  }, [])

  const segments = useMemo(() => {
    if (!captionData) return []
    if (language === 'source') return captionData.segments || []
    return captionData.translations?.[language]?.segments || []
  }, [captionData, language])

  const active = segments.find(s => currentTime >= s.start && currentTime <= s.end)
  const progressPct = useMemo(() => {
    if (!segments.length) return 0
    const duration = segments[segments.length - 1].end || 0
    if (!duration) return 0
    return Math.min(100, Math.max(0, (currentTime / duration) * 100))
  }, [segments, currentTime])

  const jumpToSegment = (seg) => {
    if (!videoRef.current) return
    videoRef.current.currentTime = seg.start
    videoRef.current.play().catch(() => {})
  }

  const copyCurrentCaption = async () => {
    if (!active?.text) return
    try {
      await navigator.clipboard.writeText(active.text)
    } catch (_err) {
      // ignore clipboard failures
    }
  }

  const downloadTranscript = () => {
    if (!segments.length) return
    const content = segments.map((seg) => seg.text).join('\n')
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const langLabel = language === 'source'
      ? (captionData?.sourceLanguage || captionData?.sourceLang || 'source')
      : language
    link.href = url
    link.download = `transcript-${langLabel}.txt`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  return (
    <div className="preview">
      <div className="video-wrap">
        <video ref={videoRef} controls src={videoUrl || undefined} />
        {!videoUrl && <div className="video-placeholder">Preview available for uploaded files.</div>}
        <div className="caption-overlay">
          <span>{active ? active.text : ' '}</span>
        </div>
        <div className="timeline-progress">
          <span style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {captionData && (
        <div className="caption-panel">
          <div className="panel-head">
            <h3>Captions</h3>
            <select value={language} onChange={(e) => onLanguageChange(e.target.value)}>
              <option value="source">Source ({captionData.sourceLanguage || captionData.sourceLang})</option>
              {Object.keys(captionData.translations || {}).map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>
          </div>
          <div className="panel-meta">
            <span>{segments.length} segments</span>
            <button className="ghost mini" onClick={copyCurrentCaption}>Copy current line</button>
            <button className="ghost mini" onClick={downloadTranscript}>Download transcript</button>
          </div>
          <div className="segments">
            {segments.map((seg, idx) => (
              <button
                type="button"
                key={idx}
                className={active === seg ? 'segment active' : 'segment'}
                onClick={() => jumpToSegment(seg)}
              >
                <span className="time">{seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s</span>
                <span>{seg.text}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
