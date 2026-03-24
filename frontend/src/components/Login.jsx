import React, { useState } from 'react'

export default function Login({ onSubmit }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ email, password })
      }}
    >
      <h2>Welcome back</h2>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </label>
      <label>
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
      </label>
      <button className="primary" type="submit">Log in</button>
    </form>
  )
}
