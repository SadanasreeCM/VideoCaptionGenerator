import jwt from 'jsonwebtoken'
import config from '../config.js'

export function authRequired(req, res, next) {
  const header = req.headers.authorization || ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : null

  if (!token) {
    return res.status(401).json({ error: 'Missing token' })
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret)
    req.user = payload
    return next()
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' })
  }
}

export function adminRequired(req, res, next) {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ error: 'Admin access required' })
  }
  return next()
}
