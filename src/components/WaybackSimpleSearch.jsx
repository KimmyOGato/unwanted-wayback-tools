import React, { useState } from 'react'
import ResultsGrid from './ResultsGrid'

export default function WaybackSimpleSearch() {
  const [url, setUrl] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [type, setType] = useState('all')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState(new Set())

  const handleSearch = async () => {
    if (!url.trim()) return alert('Please enter a URL, domain, or Wayback link')
    setLoading(true)
    try {
      // Check if it's a Wayback link or a simple URL
      const isWaybackLink = url.includes('web.archive.org')
      
      let fetchUrl = url
      let filters = {}
      
      // If it's not a Wayback link, treat it as a domain search with date filters
      if (!isWaybackLink) {
        filters = { from: fromDate, to: toDate }
      }
      // If it's a Wayback link, pass it as-is for parsing
      
      console.log(`[WaybackSimpleSearch] Input type: ${isWaybackLink ? 'Wayback link' : 'Domain/URL'}`)
      console.log(`[WaybackSimpleSearch] Fetching resources from: ${fetchUrl}`)
      
      const res = await window.api.fetchResources(fetchUrl, filters)
      if (res.error) {
        alert('Error: ' + res.error)
        setResults([])
      } else {
        let filtered = res.items || []
        console.log(`[WaybackSimpleSearch] Raw results: ${filtered.length} items`)
        
        // Apply type filter
        if (type === 'images') {
          filtered = filtered.filter(it => {
            const mime = (it.mimetype || '').toLowerCase()
            return mime.startsWith('image/')
          })
          console.log(`[WaybackSimpleSearch] After image filter: ${filtered.length} items`)
        } else if (type === 'media') {
          filtered = filtered.filter(it => {
            const mime = (it.mimetype || '').toLowerCase()
            return mime.startsWith('audio/') || mime.startsWith('video/')
          })
          console.log(`[WaybackSimpleSearch] After media filter: ${filtered.length} items`)
        } else if (type === 'documents') {
          filtered = filtered.filter(it => {
            const mime = (it.mimetype || '').toLowerCase()
            return mime.includes('pdf') || mime.startsWith('text/')
          })
          console.log(`[WaybackSimpleSearch] After documents filter: ${filtered.length} items`)
        }
        
        // Log sample mimetypes to debug
        console.log('[WaybackSimpleSearch] Sample mimetypes:', filtered.slice(0, 5).map(it => it.mimetype))
        
        setResults(filtered)
        setSelected(new Set())
      }
    } catch (e) {
      alert('Error: ' + String(e))
    }
    setLoading(false)
  }

  const handleDownloadSelected = async () => {
    if (selected.size === 0) return alert('Select at least one item')
    const folder = await window.api.selectFolder()
    if (!folder) return
    const toDownload = Array.from(selected).map(idx => results[idx]).filter(Boolean)
    for (const it of toDownload) {
      const filename = `${it.timestamp || ''}_${it.original.split('/').pop()}`
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
      window.dispatchEvent(new CustomEvent('enqueue-download', { detail: { id, archived: it.archived, folder, filename } }))
    }
    alert('Downloads requested for ' + toDownload.length + ' items')
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !loading) handleSearch()
  }

  return (
    <div className="wayback-simple-search">
      <h3>Wayback Machine Search</h3>
      <p>Search for archived versions of any website or domain.</p>

      <div className="search-controls">
        <input
          type="text"
          placeholder="Enter URL or domain (e.g., example.com or http://example.com)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={loading}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} disabled={loading}>
          <option value="all">All Types</option>
          <option value="images">Images</option>
          <option value="media">Audio/Video</option>
          <option value="documents">Documents</option>
        </select>
        <button onClick={handleSearch} disabled={loading} className="search-btn">
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>

      <div className="filter-section">
        <details>
          <summary>🔍 Date Filters (Optional)</summary>
          <div className="date-filters">
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              placeholder="From"
              disabled={loading}
            />
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              placeholder="To"
              disabled={loading}
            />
          </div>
        </details>
      </div>

      <div className="results-section">
        <div className="results-header">
          <h4>Results ({results.length})</h4>
          {results.length > 0 && (
            <button onClick={handleDownloadSelected} disabled={selected.size === 0} className="download-selected-btn">
              Download Selected ({selected.size})
            </button>
          )}
        </div>
        {results.length > 0 ? (
          <ResultsGrid items={results} selected={selected} onSelect={setSelected} locale={{}} />
        ) : (
          <p className="no-results">{loading ? 'Searching...' : 'No results yet. Enter a URL and search.'}</p>
        )}
      </div>
    </div>
  )
}
