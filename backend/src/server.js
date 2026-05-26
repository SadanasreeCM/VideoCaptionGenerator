import express from 'express'
import cors from 'cors'
import session from 'express-session'
import cookieParser from 'cookie-parser'
import config from './config.js'
import passport from './auth.js'
import authRoutes from './routes/auth.js'
import captionRoutes from './routes/captions.js'
import adminRoutes from './routes/admin.js'
import historyRoutes from './routes/history.js'
import { connectDb } from './db.js'

const app = express()


app.use(cors({
  origin: 'https://video-caption-generator.netlify.app'
}))
app.use(express.json({ limit: '50mb' }))
app.use(cookieParser())
app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false
  })
)
app.use(passport.initialize())
app.use(passport.session())

app.get('/api/health', (_req, res) => {
  res.json({ ok: true })
})

app.use('/api/auth', authRoutes)
app.use('/api/captions', captionRoutes)
app.use('/api/history', historyRoutes)
app.use('/api/admin', adminRoutes)

connectDb()
  .then(() => {
    app.listen(config.port, () => {
      console.log(`Backend running on http://localhost:${config.port}`)
    })
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message)
    process.exit(1)
  })
