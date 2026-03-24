import React, { useState } from 'react'
import { getAdminOverview, getAdminUsers, getAdminHistory } from '../api.js'
import { Link, useNavigate } from 'react-router-dom'
import PieChart from './PieChart.jsx'

export default function AdminDashboard({ onLogout }) {
  const navigate = useNavigate()
  const [adminOverview, setAdminOverview] = useState(null)
  const [adminUsers, setAdminUsers] = useState([])
  const [adminHistory, setAdminHistory] = useState([])
  const [adminLoading, setAdminLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPair, setSelectedPair] = useState('')

  const handleLogout = () => {
    onLogout()
    navigate('/')
  }

  const loadAdminData = async () => {
    setError('')
    setAdminLoading(true)
    try {
      const [overview, users, historyData] = await Promise.all([
        getAdminOverview(),
        getAdminUsers(),
        getAdminHistory()
      ])
      setAdminOverview(overview)
      setAdminUsers(Array.isArray(users.users) ? users.users : [])
      setAdminHistory(Array.isArray(historyData.history) ? historyData.history : [])
    } catch (err) {
      setError(err.message)
    } finally {
      setAdminLoading(false)
    }
  }

  const chartColors = ['#136f63', '#ea5b2a', '#1d4f91', '#f2b134', '#7f6aa6', '#2d9c75']
  const historySnapshot = adminHistory.slice(0, 10)
  const colorByKey = new Map()
  const getColorForKey = (key) => {
    if (!colorByKey.has(key)) {
      colorByKey.set(key, chartColors[colorByKey.size % chartColors.length])
    }
    return colorByKey.get(key)
  }
  const groupedSnapshot = historySnapshot.reduce((acc, item) => {
    const key = `${item.sourceLanguage || 'source'}->${item.targetLanguage || 'none'}`
    acc[key] = (acc[key] || 0) + 1
    return acc
  }, {})
  const groupedEntries = Object.entries(groupedSnapshot).map(([key, count]) => ({
    key,
    count
  }))

  return (
    <div className="app admin-page">
      <header className="hero admin-hero">
        <div>
          <p className="tag">Admin Control</p>
          <h1>Caption Forge Command Center</h1>
          <p className="sub">
            Monitor user growth, review activity, and keep the pipeline healthy.
          </p>
          <div className="hero-chips">
            <span>Realtime Insights</span>
            <span>Secure Access</span>
            <span>Operational Clarity</span>
          </div>
        </div>
        <div className="admin-actions">
          <button className="ghost" onClick={loadAdminData} disabled={adminLoading}>
            {adminLoading ? 'Loading...' : 'Refresh data'}
          </button>
          <Link to="/" className="ghost">Back to app</Link>
          <button className="ghost" onClick={handleLogout}>Log out</button>
        </div>
      </header>

      <section className="card">
        {error && <div className="error">{error}</div>}

        <div className="admin-grid">
          {adminOverview && (
            <div className="stats-grid">
              <article className="stat-card">
                <p>Total Users</p>
                <strong>{adminOverview.users}</strong>
                <span className="stat-note">All registered accounts</span>
              </article>
              <article className="stat-card">
                <p>Total Histories</p>
                <strong>{adminOverview.histories}</strong>
                <span className="stat-note">Caption runs recorded</span>
              </article>
              <article className="stat-card">
                <p>Activity Ratio</p>
                <strong>
                  {adminOverview.users ? Math.round((adminOverview.histories / adminOverview.users) * 10) / 10 : 0}
                </strong>
                <span className="stat-note">Runs per user</span>
              </article>
            </div>
          )}

          {adminOverview && (
            <div className="chart-section">
              <div className="panel-head">
                <h4>System Snapshot</h4>
                <span className="muted-note">Latest 10 history records</span>
              </div>

              {groupedEntries.length ? (
                <>
                  <PieChart
                    data={groupedEntries.map((entry) => ({
                      value: entry.count,
                      color: getColorForKey(entry.key),
                      label: entry.key.replace('->', ' → ')
                    }))}
                    onSliceSelect={(item) => setSelectedPair(item?.label || '')}
                  />
                  <div className="chart-legend">
                    {groupedEntries.map((entry, index) => (
                      <div key={entry.key || index}>
                        <span style={{ background: getColorForKey(entry.key) }}></span>
                        {entry.key.replace('->', ' → ')} ({entry.count})
                      </div>
                    ))}
                  </div>
                  {selectedPair && (
                    <div className="selected-note">Selected: {selectedPair}</div>
                  )}
                </>
              ) : (
                <div className="empty-note">No translation history yet.</div>
              )}
            </div>
          )}
        </div>

        {!!adminUsers.length && (
          <div className="table-card">
            <h4>Latest Users</h4>
            <div className="table">
              {adminUsers.map((user) => (
                <div className="table-row" key={user._id || user.id}>
                  <span>{user.name || 'User'}</span>
                  <span>{user.email || 'n/a'}</span>
                  <span>{user.isAdmin ? 'admin' : 'user'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!!adminHistory.length && (
          <div className="table-card">
            <h4>Latest History</h4>
            <div className="table">
              {adminHistory.map((item) => (
                <div className="table-row" key={item._id || item.id}>
                  <span>{item.email || item.userId || 'unknown'}</span>
                  <span>{item.sourceLanguage} - {item.targetLanguage}</span>
                  <span>{Math.round(item.durationSeconds || 0)}s</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <footer className="footer">Built for fast, accurate global captions.</footer>
    </div>
  )
}
