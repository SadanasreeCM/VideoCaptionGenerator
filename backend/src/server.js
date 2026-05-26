import express from 'express'
import cors from 'cors'
import captionRoutes from './routes/captions.js'
import authRoutes from './routes/auth.js'

const app = express()

app.use(express.json())

// CORS FIX
const allowedOrigins = [
  'https://video-caption-generator.netlify.app',
  'https://caption-generator-pro.netlify.app'
]

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin
    if (!origin) return callback(null, true)

    if (allowedOrigins.includes(origin)) {
      return callback(null, true)
    }

    return callback(new Error('Not allowed by CORS'))
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}))

// Handle preflight requests
app.options('*', cors())

// ROUTES
app.use('/api/captions', captionRoutes)
app.use('/api/auth', authRoutes)

// TEST ROUTE
app.get('/', (req, res) => {
  res.send('Backend running')
})

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`)
})