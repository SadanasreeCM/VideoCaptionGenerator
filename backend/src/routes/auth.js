import express from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import passport from '../auth.js'
import config from '../config.js'
import { createUser, getUserByEmail } from '../db.js'
import { v4 as uuid } from 'uuid'

const router = express.Router()

router.use('/google', (_req, res, next) => {
  if (!config.google.clientId || !config.google.clientSecret) {
    return res.status(503).json({ error: 'Google OAuth is not configured' })
  }
  return next()
})

router.post('/register', async (req, res) => {
  const { email, password, name } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const existing = await getUserByEmail(email)
  if (existing) {
    return res.status(409).json({ error: 'User already exists' })
  }

  const passwordHash = await bcrypt.hash(password, 10)
  const id = uuid()
  const isAdmin = Boolean(config.adminEmail && email === config.adminEmail)
  await createUser({
    id,
    email,
    passwordHash,
    name: name || 'User',
    provider: 'local',
    isAdmin
  })

  const token = jwt.sign({ id, email, name: name || 'User', isAdmin }, config.jwtSecret, { expiresIn: '7d' })
  return res.json({ token })
})

router.post('/login', async (req, res) => {
  const { email, password } = req.body
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password required' })
  }

  const user = await getUserByEmail(email)
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const ok = await bcrypt.compare(password, user.passwordHash)
  if (!ok) {
    return res.status(401).json({ error: 'Invalid credentials' })
  }

  const token = jwt.sign({ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin }, config.jwtSecret, {
    expiresIn: '7d'
  })
  return res.json({ token })
})

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }))

router.get(
  '/google/callback',
  passport.authenticate('google', { failureRedirect: '/api/auth/google/failure' }),
  (req, res) => {
    const user = req.user
    const token = jwt.sign({ id: user.id, email: user.email, name: user.name, isAdmin: user.isAdmin }, config.jwtSecret, {
      expiresIn: '7d'
    })

    const redirectUrl = new URL(config.frontendUrl)
    redirectUrl.searchParams.set('token', token)
    res.redirect(redirectUrl.toString())
  }
)

router.get('/google/failure', (_req, res) => {
  res.status(401).json({ error: 'Google authentication failed' })
})

export default router
