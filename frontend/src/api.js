const API_BASE = 'https://videocaptiongenerator.onrender.com'

export function setToken(token) {
  if (token) {
    localStorage.setItem('token', token)
  } else {
    localStorage.removeItem('token')
  }
}

export function getToken() {
  return localStorage.getItem('token')
}

async function request(path, options = {}) {
  const token = getToken()
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  }
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    credentials: 'include'
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Request failed')
  }

  return res.json()
}

export const api = {
  register: (data) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(data) })
}

export function parseTokenClaims(token) {
  if (!token) return null
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=')
    const decoded = JSON.parse(atob(normalized))
    return decoded
  } catch (_err) {
    return null
  }
}

export async function getHistory() {
  return request('/api/history', { method: 'GET' })
}

export async function getAdminOverview() {
  return request('/api/admin/overview', { method: 'GET' })
}

export async function getAdminUsers() {
  return request('/api/admin/users', { method: 'GET' })
}

export async function getAdminHistory() {
  return request('/api/admin/history', { method: 'GET' })
}

export async function transcribeVideo({ file, videoUrl, sourceLanguage, targetLanguage }) {
  const token = getToken()
  const formData = new FormData()
  if (file) {
    formData.append('video', file)
  }
  if (videoUrl) {
    formData.append('videoUrl', videoUrl)
  }
  formData.append('sourceLanguage', sourceLanguage)
  if (targetLanguage && targetLanguage !== 'none') {
    formData.append('targetLanguage', targetLanguage)
  }

  const res = await fetch(`${API_BASE}/api/captions/transcribe`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Transcription failed')
  }

  return res.json()
}

export async function renderBurnedVideo({ file, captions, language }) {
  const token = getToken()
  const formData = new FormData()
  if (file) {
    formData.append('video', file)
  }
  if (captions?.sourceId) {
    formData.append('sourceId', captions.sourceId)
  }
  formData.append('captions', JSON.stringify(captions))
  formData.append('language', language)

  const res = await fetch(`${API_BASE}/api/captions/burn`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || 'Render failed')
  }

  return res.blob()
}
