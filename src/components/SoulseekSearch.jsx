import React, { useState } from 'react'

function humanSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  const b = Number(bytes)
  if (b < 1024) return b + ' B'
  const units = ['KB', 'MB', 'GB']
  let i = -1
  let value = b
  while (value >= 1024 && i < units.length - 1) {
    value = value / 1024
    i++
  }
  return value.toFixed(i < 0 ? 0 : 1) + ' ' + (units[i] || 'GB')
}

function humanSpeed(sp) {
  if (!sp && sp !== 0) return ''
  // slsk reports speed as number; convert to KiB/s if big
  const n = Number(sp)
  if (n >= 1024) return (n / 1024).toFixed(2) + ' KiB/s'
  return n + ' B/s'
}

export default function SoulseekSearch() {
  const [host, setHost] = useState('server.slsknet.org')
  const [port, setPort] = useState(2242)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [credsLoaded, setCredsLoaded] = useState(false)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  const [itemStatus, setItemStatus] = useState({})
  // debug helpers removed for production

  // listen for download progress from main
  React.useEffect(() => {
    if (window.soulseekEvents && window.soulseekEvents.onDownloadProgress) {
      window.soulseekEvents.onDownloadProgress(({ filename, received }) => {
        // find index by filename
        const idx = results.findIndex(r => renderFilename(r) === filename)
        if (idx >= 0) {
          setItemStatus(s => ({ ...s, [idx]: { ...(s[idx] || {}), status: 'downloading', received } }))
        }
      })
    }
  }, [results])

  // Load saved Soulseek credentials from localStorage on mount
  React.useEffect(() => {
    ;(async () => {
      try {
        if (window.soulseek && window.soulseek.getCreds) {
          const res = await window.soulseek.getCreds()
          if (res && res.ok && res.creds) {
            const obj = res.creds
            if (obj.host) setHost(obj.host)
            if (obj.port) setPort(obj.port)
            if (obj.username) setUsername(obj.username)
            if (obj.password) setPassword(obj.password)
          }
        }
      } catch (e) {
        console.warn('[Soulseek] failed to load saved creds', e)
      } finally {
        setCredsLoaded(true)
      }
    })()
  }, [])

  // Persist credentials automatically when they change
  React.useEffect(() => {
    // wait until initial load to avoid overwriting
    if (!credsLoaded) return
    try {
      if (window.soulseek && window.soulseek.storeCreds) {
        const obj = { host, port, username, password }
        try {
          window.soulseek.storeCreds(obj).catch?.(() => {})
        } catch (e) {
          // ignore
        }
      }
    } catch (e) {
      console.warn('[Soulseek] failed to save creds', e)
    }
  }, [host, port, username, password, credsLoaded])

  const check = async () => {
    setStatus('Checking server...')
    const res = await window.soulseek.checkServer({ host, port })
    if (res && res.ok) setStatus('Server reachable')
    else setStatus('Server not reachable: ' + (res && res.error ? res.error : 'unknown'))
  }

  // Guess plausible registration URLs for the given host
  // Username checking and automatic registration helpers removed — unreliable across environments.

  // Account creation option removed — not supported reliably by clients.

  const doSearch = async () => {
    setStatus('Searching...')
    setResults([])
    setItemStatus({})
    try {
      const res = await window.soulseek.search({ host, port, username, password, query })
      if (res && res.items) {
        setResults(res.items)
        setStatus(`Found ${res.items.length} items`)
      } else if (res && res.error) {
        setStatus('Error: ' + res.error + (res.message ? ' - ' + res.message : ''))
      } else setStatus('No results')
    } catch (e) {
      setStatus('Search failed: ' + String(e))
    }
  }

  const startDownload = async (item, idx) => {
    setItemStatus(s => ({ ...s, [idx]: { status: 'starting' } }))
    try {
      // Ask the user where to save the file
      const folder = await window.api.selectFolder()
      if (!folder) {
        setItemStatus(s => ({ ...s, [idx]: { status: 'cancelled' } }))
        return
      }

      // Build destination including filename. Detect path separator from folder.
      const filename = renderFilename(item) || `slsk_${Date.now()}`
      const sep = folder.includes('\\') ? '\\' : '/'
      const destination = folder.replace(/[\\/]+$/, '') + sep + filename

      // Provide the full search-result object under `fileId` so the main
      // handler can normalize it reliably.
      const res = await window.soulseek.download({ fileId: item, destination, creds: { host, port, username, password } })
      if (res && res.ok) {
        setItemStatus(s => ({ ...s, [idx]: { status: 'completed', path: res.path || '', raw: res } }))
      } else {
        setItemStatus(s => ({ ...s, [idx]: { status: 'error', message: (res && res.message) || res.error || 'unknown', log: res && res.log, raw: res } }))
      }
    } catch (e) {
      setItemStatus(s => ({ ...s, [idx]: { status: 'error', message: String(e), raw: e } }))
    }
  }

  const renderFilename = (file) => {
    if (!file) return ''
    const raw = (file.file || file.path || file.name || '').toString()
    // remove leading @@ or @@user prefix
    return raw.replace(/^@@?/, '').split(/[\\/]/).pop()
  }

  return (
    <div className="soulseek-search">
      <div className="soulseek-header">
        <h3>Soulseek</h3>
        <div className="soulseek-conn">
          <input className="ss-input" value={host} onChange={(e) => setHost(e.target.value)} placeholder="host" />
          <input className="ss-input ss-port" value={port} onChange={(e) => setPort(Number(e.target.value || 0))} placeholder="port" />
        </div>
        <div className="soulseek-creds">
          <input className="ss-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" />
          <input className="ss-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" type="password" />
          {/* Username check removed */}
        </div>
        <div className="soulseek-searchbar">
          <input className="ss-input ss-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="search query" />
          <div className="soulseek-actions">
            <button className="btn" onClick={doSearch}>Search</button>
            <button className="btn btn-ghost" onClick={check}>Check</button>
          </div>
        </div>
        <div className="soulseek-status"><strong>Status:</strong> <span className="status-text">{status}</span></div>
      </div>

      <div className="soulseek-results">
        <table className="soulseek-table">
          <thead>
            <tr>
              <th>User</th>
              <th className="col-speed">Speed</th>
              <th className="col-slots">Slots</th>
              <th className="col-size">Size</th>
              <th>Filename</th>
              <th className="col-actions">Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} className="soulseek-row">
                <td className="td-user">{r.user || r.username || ''}</td>
                <td className="td-speed">{humanSpeed(r.speed || r.upload || '')}</td>
                <td className="td-slots">{r.slots ? 'Yes' : 'No'}</td>
                <td className="td-size">{humanSize(r.size)}</td>
                <td className="td-file">{renderFilename(r)}</td>
                <td className="td-actions">
                  <div className="action-wrap">
                    {/* Determine availability: prefer explicit flags, fallback to slots truthiness */}
                    {(() => {
                      const avail = !!(r.available || r.open || (typeof r.slots !== 'undefined' && !!r.slots))
                      return (
                        <div className={`availability ${avail ? 'available' : 'unavailable'}`} title={avail ? 'Available for download' : 'Not available (no open slots or blocked)'}>
                          <span className="avail-dot" />
                          <span className="avail-text">{avail ? 'Available' : 'Unavailable'}</span>
                        </div>
                      )
                    })()}

                    <button className="btn" onClick={() => startDownload(r, i)} disabled={!(r.available || r.open || (typeof r.slots !== 'undefined' && !!r.slots))}>Download</button>
                    <div className="item-status">{itemStatus[i] ? itemStatus[i].status : ''}{itemStatus[i] && itemStatus[i].message ? ` — ${itemStatus[i].message}` : ''}</div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Debug modal removed in production build */}
    </div>
  )
}

// Debug modal component appended to module
function DebugModal({ open, payload, onClose }) {
  if (!open) return null
  return (
    <div style={{ position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: '80%', maxHeight: '80%', overflow: 'auto', background: '#111', color: '#eee', padding: 16, borderRadius: 6 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Debug</strong>
          <button onClick={onClose}>Close</button>
        </div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{JSON.stringify(payload, null, 2)}</pre>
      </div>
    </div>
  )
}


// Debug modal rendered at end of file
