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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('')
  const [results, setResults] = useState([])
  const [itemStatus, setItemStatus] = useState({})
  const [debugIndex, setDebugIndex] = useState(null)
  const [debugPayload, setDebugPayload] = useState(null)

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

  const check = async () => {
    setStatus('Checking server...')
    const res = await window.soulseek.checkServer({ host, port })
    if (res && res.ok) setStatus('Server reachable')
    else setStatus('Server not reachable: ' + (res && res.error ? res.error : 'unknown'))
  }

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
    <>
      <div style={{ padding: 12 }}>
      <h3>Soulseek</h3>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={host} onChange={(e) => setHost(e.target.value)} placeholder='host' />
        <input value={port} onChange={(e) => setPort(Number(e.target.value || 0))} style={{ width: 80 }} />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder='username' />
        <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder='password' type='password' />
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder='search query' style={{ flex: 1 }} />
        <button onClick={doSearch}>Search</button>
        <button onClick={check}>Check</button>
      </div>

      <div style={{ marginBottom: 8 }}><strong>Status:</strong> {status}</div>

      <div style={{ maxHeight: '60vh', overflow: 'auto', borderTop: '1px solid rgba(255,255,255,0.04)', paddingTop: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', color: 'white' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: '#bbb', fontSize: 13 }}>
              <th style={{ padding: '6px 8px' }}>User</th>
              <th style={{ padding: '6px 8px', width: 120 }}>Speed</th>
              <th style={{ padding: '6px 8px', width: 80 }}>Slots</th>
              <th style={{ padding: '6px 8px', width: 120 }}>Size</th>
              <th style={{ padding: '6px 8px' }}>Filename</th>
              <th style={{ padding: '6px 8px', width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                <td style={{ padding: '8px' }}>{r.user || r.username || ''}</td>
                <td style={{ padding: '8px' }}>{humanSpeed(r.speed || r.upload || '')}</td>
                <td style={{ padding: '8px' }}>{r.slots ? 'Yes' : 'No'}</td>
                <td style={{ padding: '8px' }}>{humanSize(r.size)}</td>
                <td style={{ padding: '8px' }}>{renderFilename(r)}</td>
                <td style={{ padding: '8px' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button onClick={() => startDownload(r, i)}>Download</button>
                    <button onClick={() => { setDebugIndex(i); setDebugPayload(r) }}>Debug</button>
                    <div style={{ fontSize: 12, color: '#aaa' }}>
                      {itemStatus[i] ? itemStatus[i].status : ''}
                      {itemStatus[i] && itemStatus[i].message ? ` — ${itemStatus[i].message}` : ''}
                      {itemStatus[i] && itemStatus[i].log ? ` (log: ${itemStatus[i].log})` : ''}
                    </div>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
      {/* render debug modal when requested */}
      <DebugModal open={debugIndex !== null} payload={debugPayload} onClose={() => { setDebugIndex(null); setDebugPayload(null) }} />
    </>
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
