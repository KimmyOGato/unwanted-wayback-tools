import { useState, useEffect, useRef } from 'react'
import { useLocale, formatMessage } from '../locales'
import SearchForm from './SearchForm'
import ResultsGrid from './ResultsGrid'
import DownloadStatus from './DownloadStatus'
import './App.css'

export default function App() {
  const [lang, setLang] = useState('pt-BR')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [downloadQueue, setDownloadQueue] = useState([])
  const [downloadStatus, setDownloadStatus] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const downloadWorkerRef = useRef(null)

  const locale = useLocale(lang)

  // Initialize download manager
  useEffect(() => {
    const MAX_CONCURRENT = 3
    let activeDownloads = 0
    let queuePos = 0

    const processQueue = async () => {
      if (queuePos >= downloadQueue.length || activeDownloads >= MAX_CONCURRENT) return

      const item = downloadQueue[queuePos]
      queuePos++
      activeDownloads++

      setDownloadStatus(prev => ({
        ...prev,
        [item.id]: { status: 'downloading', received: 0, total: 0 }
      }))

      try {
        const res = await window.api.downloadResource({
          url: item.archived,
          destFolder: item.folder,
          filename: item.filename
        })

        if (res.error) {
          setDownloadStatus(prev => ({
            ...prev,
            [item.id]: { status: 'error', message: res.error }
          }))
        } else {
          setDownloadStatus(prev => ({
            ...prev,
            [item.id]: { status: 'completed' }
          }))
        }
      } catch (e) {
        setDownloadStatus(prev => ({
          ...prev,
          [item.id]: { status: 'error', message: String(e) }
        }))
      }

      activeDownloads--
      processQueue()
    }

    if (downloadQueue.length > 0 && queuePos < downloadQueue.length) {
      processQueue()
    }
  }, [downloadQueue])

  // Listen to progress events
  useEffect(() => {
    window.api.onDownloadProgress((data) => {
      setDownloadStatus(prev => ({
        ...prev,
        [data.filename]: { ...prev[data.filename], received: data.received, total: data.total }
      }))
    })
  }, [])

  const handleSearch = async (link, type, filters) => {
    setLoading(true)
    setCurrentPage(1)
    try {
      const res = await window.api.fetchResources(link, filters)
      if (res.error) {
        alert(`Error: ${res.error}`)
        setItems([])
      } else {
        let filtered = res.items || []
        if (type === 'images') {
          filtered = filtered.filter(it => it.mimetype?.startsWith('image/'))
        } else if (type === 'media') {
          filtered = filtered.filter(it => it.mimetype?.startsWith('audio/') || it.mimetype?.startsWith('video/'))
        } else if (type === 'documents') {
          filtered = filtered.filter(it => it.mimetype?.startsWith('application/pdf') || it.mimetype?.startsWith('text/'))
        }
        setItems(filtered)
        setTotalPages(Math.ceil(filtered.length / 20))
      }
    } catch (e) {
      alert(`Error: ${String(e)}`)
      setItems([])
    }
    setLoading(false)
  }

  const handleDownload = async (indices) => {
    const folder = await window.api.selectFolder()
    if (!folder) return

    const toDownload = indices.map(idx => {
      const it = items[idx]
      const parsed = new URL(it.original)
      const base = parsed.pathname.split('/').pop() || `resource_${it.timestamp}`
      return {
        id: `${it.timestamp}_${idx}`,
        archived: it.archived,
        folder,
        filename: `${it.timestamp || 'na'}_${base}`
      }
    })

    setDownloadQueue(prev => [...prev, ...toDownload])
  }

  const paginatedItems = items.slice((currentPage - 1) * 20, currentPage * 20)

  return (
    <div className="app">
      <header className="header">
        <h1>{locale.title}</h1>
        <p>{locale.subtitle}</p>
        <div className="lang-selector">
          <select value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="pt-BR">Português (BR)</option>
            <option value="en-US">English (US)</option>
          </select>
        </div>
      </header>

      <SearchForm locale={locale} loading={loading} onSearch={handleSearch} />

      {items.length > 0 && (
        <>
          <div className="pagination">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
              {locale.prev}
            </button>
            <span>{formatMessage(locale.page, { page: currentPage, total: totalPages })}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
              {locale.next}
            </button>
          </div>

          <ResultsGrid
            items={paginatedItems}
            selected={selectedIndices}
            onSelect={setSelectedIndices}
            locale={locale}
          />

          <div className="actions">
            <button
              className="download-btn"
              onClick={() => handleDownload(Array.from(selectedIndices))}
              disabled={selectedIndices.size === 0}
            >
              {locale.download_selected} ({selectedIndices.size})
            </button>
          </div>
        </>
      )}

      {downloadQueue.length > 0 && (
        <DownloadStatus
          queue={downloadQueue}
          status={downloadStatus}
          locale={locale}
        />
      )}
    </div>
  )
}