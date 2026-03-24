import React, { useState } from 'react'

export default function Register({ onSubmit }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <form
      className="form"
      onSubmit={(e) => {
        e.preventDefault()
        onSubmit({ name, email, password })
      }}
    >
      <h2>Create your account</h2>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Email
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
      </label>
      <label>
        Password
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
      </label>
      <button className="primary" type="submit">Create account</button>
    </form>
  )
}
