import dotenv from 'dotenv'

dotenv.config()

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret',
  sessionSecret: process.env.SESSION_SECRET || 'dev-session',
  mongoUri: process.env.MONGODB_URI || '',
  adminEmail: process.env.ADMIN_EMAIL || '',
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    callbackUrl: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:4000/api/auth/google/callback',
    projectId: process.env.GOOGLE_PROJECT_ID || ''
  },
  defaultSourceLang: process.env.DEFAULT_SOURCE_LANG || 'en-US',
  localTranscribe: process.env.LOCAL_TRANSCRIBE === '1',
  localTranslate: process.env.LOCAL_TRANSLATE === '1',
  whisperModel: process.env.WHISPER_MODEL || 'base',
  whisperDevice: process.env.WHISPER_DEVICE || 'cpu',
  whisperComputeType: process.env.WHISPER_COMPUTE_TYPE || 'int8',
  whisperBeamSize: Number(process.env.WHISPER_BEAM_SIZE || 1),
  whisperBestOf: Number(process.env.WHISPER_BEST_OF || 1),
  whisperVadFilter: process.env.WHISPER_VAD_FILTER === '1',
  publicTranslateConcurrency: Number(process.env.PUBLIC_TRANSLATE_CONCURRENCY || 8),
  pythonPath: process.env.PYTHON_PATH || 'python',
  ytDlpPath: process.env.YTDLP_PATH || 'yt-dlp',
  ytDlpCookies: process.env.YTDLP_COOKIES || '',
  ytDlpProxy: process.env.YTDLP_PROXY || ''
}

export default config
