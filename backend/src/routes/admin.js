import express from 'express'
import { authRequired, adminRequired } from '../middleware/auth.js'
import { getAdminHistory, getAdminOverview, getAdminUsers } from '../db.js'

const router = express.Router()

router.use(authRequired, adminRequired)

router.get('/overview', async (_req, res) => {
  try {
    const data = await getAdminOverview({ historyLimit: 10 })
    return res.json(data)
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load overview' })
  }
})

router.get('/users', async (_req, res) => {
  try {
    const users = await getAdminUsers(500)
    return res.json({ users })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load users' })
  }
})

router.get('/history', async (_req, res) => {
  try {
    const history = await getAdminHistory(10)
    return res.json({ history })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load history' })
  }
})

export default router
