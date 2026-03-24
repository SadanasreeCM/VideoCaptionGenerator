import mongoose from 'mongoose'
import config from './config.js'

const { Schema } = mongoose

const UserSchema = new Schema(
  {
    id: { type: String, unique: true, index: true },
    email: { type: String, index: true },
    passwordHash: { type: String },
    name: { type: String },
    provider: { type: String, index: true },
    providerId: { type: String, index: true },
    isAdmin: { type: Boolean, default: false }
  },
  { timestamps: true }
)

const HistorySchema = new Schema(
  {
    userId: { type: String, index: true },
    email: { type: String },
    sourceLanguage: { type: String },
    targetLanguage: { type: String },
    transcript: { type: String },
    segmentsCount: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    translationCount: { type: Number, default: 0 },
    provider: { type: String },
    meta: { type: Object, default: {} }
  },
  { timestamps: true }
)

const User = mongoose.models.User || mongoose.model('User', UserSchema)
const History = mongoose.models.History || mongoose.model('History', HistorySchema)

let connectPromise = null

export async function connectDb() {
  if (connectPromise) return connectPromise
  if (!config.mongoUri) {
    throw new Error('MONGODB_URI is not set')
  }
  connectPromise = mongoose.connect(config.mongoUri, {
    autoIndex: true
  })
  return connectPromise
}

export async function getUserById(id) {
  if (!id) return null
  return User.findOne({ id }).lean()
}

export async function getUserByEmail(email) {
  if (!email) return null
  return User.findOne({ email }).lean()
}

export async function getUserByProvider(provider, providerId) {
  if (!provider || !providerId) return null
  return User.findOne({ provider, providerId }).lean()
}

export async function createUser(user) {
  const created = await User.create(user)
  return created.toObject()
}

export async function upsertUserByProvider(provider, providerId, user) {
  return User.findOneAndUpdate(
    { provider, providerId },
    { $setOnInsert: user },
    { new: true, upsert: true }
  ).lean()
}

export async function createHistory(entry) {
  const created = await History.create(entry)
  return created.toObject()
}

export async function getHistoryByUser(userId, limit = 50) {
  return History.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean()
}

export async function getAdminOverview({ historyLimit = 200 } = {}) {
  const [users, histories, languageBuckets] = await Promise.all([
    User.countDocuments(),
    History.countDocuments(),
    History.aggregate([
      { $sort: { createdAt: -1 } },
      { $limit: historyLimit },
      {
        $project: {
          languages: {
            $cond: [
              {
                $gt: [
                  { $size: { $ifNull: ['$meta.targetLanguages', []] } },
                  0
                ]
              },
              '$meta.targetLanguages',
              {
                $cond: [
                  {
                    $and: [
                      { $ifNull: ['$targetLanguage', false] },
                      { $ne: ['$targetLanguage', 'none'] }
                    ]
                  },
                  ['$targetLanguage'],
                  []
                ]
              }
            ]
          }
        }
      },
      { $unwind: '$languages' },
      { $group: { _id: '$languages', count: { $sum: 1 } } },
      {
        $facet: {
          top: [
            { $sort: { count: -1 } },
            { $limit: 6 },
            { $project: { _id: 0, language: '$_id', count: 1 } }
          ],
          bottom: [
            { $sort: { count: 1 } },
            { $limit: 6 },
            { $project: { _id: 0, language: '$_id', count: 1 } }
          ]
        }
      }
    ])
  ])
  const facet = Array.isArray(languageBuckets) ? languageBuckets[0] : null
  const topLanguages = facet?.top || []
  const bottomLanguages = facet?.bottom || []
  return { users, histories, topLanguages, bottomLanguages }
}

export async function getAdminUsers(limit = 200) {
  return User.find().sort({ createdAt: -1 }).limit(limit).lean()
}

export async function getAdminHistory(limit = 200) {
  return History.find().sort({ createdAt: -1 }).limit(limit).lean()
}
