import passport from 'passport'
import { Strategy as GoogleStrategy } from 'passport-google-oauth20'
import config from './config.js'
import { createUser, getUserById, getUserByProvider, upsertUserByProvider } from './db.js'
import { v4 as uuid } from 'uuid'

passport.serializeUser((user, done) => {
  done(null, user.id)
})

passport.deserializeUser(async (id, done) => {
  try {
    const row = await getUserById(id)
    done(null, row)
  } catch (err) {
    done(err)
  }
})

if (config.google.clientId && config.google.clientSecret) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: config.google.clientId,
        clientSecret: config.google.clientSecret,
        callbackURL: config.google.callbackUrl
      },
      async (_accessToken, _refreshToken, profile, done) => {
        const providerId = profile.id
        let user = await getUserByProvider('google', providerId)

        if (!user) {
          const id = uuid()
          const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null
          const name = profile.displayName || 'Google User'
          user = await upsertUserByProvider('google', providerId, {
            id,
            email,
            name,
            provider: 'google',
            providerId,
            isAdmin: Boolean(email && config.adminEmail && email === config.adminEmail)
          })
        }

        done(null, user)
      }
    )
  )
}

export default passport
