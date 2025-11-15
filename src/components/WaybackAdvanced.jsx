import React, { useState } from 'react'
import ResultsGrid from './ResultsGrid'

export default function WaybackAdvanced() {
  const [text, setText] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const handleSearch = async () => {
    const links = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).slice(0,50)
    if (links.length === 0) return alert('Please paste one or more links (up to 50).')
    setLoading(true)
    try {
      const res = await window.api.fetchResources(links, {})
      if (res.error) {
        alert('Error: ' + res.error)
        setResults([])
      } else {
        setResults(res.items || [])
        setSelected(new Set())
      }
    } catch (e) {
      alert('Error: ' + String(e))
    }
    setLoading(false)
  }

  const handleDownload = async (item) => {
    const folder = await window.api.selectFolder()
    if (!folder) return
    const filename = `${item.timestamp || ''}_${item.original.split('/').pop()}`
    const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
    window.dispatchEvent(new CustomEvent('enqueue-download', { detail: { id, archived: item.archived, folder, filename, groupTitle: item.groupTitle, groupYear: item.groupYear } }))
    alert('Download queued (check status).')
  }

  const handleDownloadSelected = async () => {
    if (selected.size === 0) return alert('Select at least one item')
    const folder = await window.api.selectFolder()
    if (!folder) return
    const toDownload = Array.from(selected).map(idx => results[idx]).filter(Boolean)
    for (const it of toDownload) {
      const filename = `${it.timestamp || ''}_${it.original.split('/').pop()}`
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
        window.dispatchEvent(new CustomEvent('enqueue-download', { detail: { id, archived: it.archived, folder, filename, groupTitle: it.groupTitle, groupYear: it.groupYear } }))
    }
    alert('Downloads requested for ' + toDownload.length + ' items')
  }

  return (
    <div className="wayback-advanced">
      <h3>Wayback Deep Search</h3>
      <p>Paste up to 50 Wayback/original links (one per line). The app will aggregate results.</p>
      <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="https://web.archive.org/web/...\nhttp://example.com" rows={6}></textarea>
      <div style={{marginTop:8}}>
        <button onClick={handleSearch} disabled={loading}>{loading ? 'Searching...' : 'Search'}</button>
      </div>

      <div className="results-list">
        <h4>Results ({results.length})</h4>
        <div style={{ marginBottom: 8 }}>
          <button onClick={handleDownloadSelected} disabled={selected.size === 0}>Download Selected ({selected.size})</button>
        </div>
        <ResultsGrid items={results} selected={selected} onSelect={setSelected} locale={{}} />
      </div>
    </div>
  )
}
