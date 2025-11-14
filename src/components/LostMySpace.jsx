import React, { useState } from 'react'
import Player from './Player'

export default function LostMySpace() {
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    try {
      const res = await window.searchApi.searchLostMySpace({ q })
      if (res.error) {
        alert('Error: ' + res.error)
        setResults([])
      } else {
        setResults(res.items || [])
      }
    } catch (e) {
      alert(String(e))
    }
    setLoading(false)
  }

  const handleOpen = (url) => {
    window.api.openExternal(url)
  }

  const handleDownload = async (it) => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const filename = it.title || it.url.split('/').pop()
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    window.dispatchEvent(new CustomEvent('enqueue-download', { detail: { id, archived: it.url, folder, filename } }))
    alert('Download queued (check status)')
  }

  return (
    <div className="lost-myspace">
      <h3>LostMySpace Search</h3>
      <div className="controls">
        <input placeholder="Query (artist, username, etc)" value={q} onChange={e => setQ(e.target.value)} />
        <button onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
      </div>

      <div className="results-list">
        <h4>Results ({results.length})</h4>
        <ul>
          {results.map((it, idx) => (
            <li key={idx} className="mp3-item">
              <div className="res-left">
                <div className="res-title">{it.title}</div>
                <div className="res-meta">{it.url}</div>
              </div>
              <div className="res-right">
                <Player src={it.url} />
                <div className="res-actions">
                  <button onClick={() => handleDownload(it)}>Download</button>
                  <button onClick={() => handleOpen(it.url)}>Site</button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
