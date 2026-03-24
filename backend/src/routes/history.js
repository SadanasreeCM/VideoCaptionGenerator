import express from 'express'
import { authRequired } from '../middleware/auth.js'
import { getHistoryByUser } from '../db.js'

const router = express.Router()

router.get('/', authRequired, async (req, res) => {
  try {
    const history = await getHistoryByUser(req.user.id, 200)
    return res.json({ history })
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load history' })
  }
})

export default router
