import { useState, useEffect, useRef } from 'react'
import { useLocale, formatMessage } from './locales'
import SearchForm from './components/SearchForm'
import ResultsGrid from './components/ResultsGrid'
import DownloadStatus from './components/DownloadStatus'
import Menu from './components/Menu'
import WaybackSimpleSearch from './components/WaybackSimpleSearch'
import Mp3Search from './components/Mp3Search'
import LostMySpace from './components/LostMySpace'
import SoulseekSearch from './components/SoulseekSearch'
import './App.css'

// Check if window.api is available (Electron preload injection)
if (!window.api) {
  throw new Error('Electron IPC API not available. This app must run inside Electron with preload script enabled.')
}

export default function App() {
  const [lang, setLang] = useState('pt-BR')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState(new Set())
  const [downloadQueue, setDownloadQueue] = useState([])
  const [downloadStatus, setDownloadStatus] = useState({})
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [mode, setMode] = useState('wayback')
  const [theme, setTheme] = useState('dark')
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
        [item.filename]: { status: 'downloading', received: 0, total: 0 }
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
            [item.filename]: { status: 'error', message: res.error }
          }))
        } else {
          setDownloadStatus(prev => ({
            ...prev,
            [item.filename]: { status: 'completed' }
          }))
          // autoplay if requested and path available
          try {
            if (item.playAfter && res.path) {
              const fileUrl = `file://${res.path.replace(/\\\\/g, '/')}`
              const audio = new Audio(fileUrl)
              audio.play().catch(() => {})
            }
          } catch (e) { /* ignore playback errors */ }
        }
      } catch (e) {
        setDownloadStatus(prev => ({
          ...prev,
          [item.filename]: { status: 'error', message: String(e) }
        }))
      }

      activeDownloads--
      processQueue()
    }

    if (downloadQueue.length > 0 && queuePos < downloadQueue.length) {
      processQueue()
    }
  }, [downloadQueue])

  // Listen to enqueue-download events from other components
  useEffect(() => {
    const onEnqueue = (e) => {
      const detail = e.detail
      if (!detail) return
      setDownloadQueue(prev => [...prev, detail])
    }
    window.addEventListener('enqueue-download', onEnqueue)
    return () => window.removeEventListener('enqueue-download', onEnqueue)
  }, [])

  // Listen to progress events
  useEffect(() => {
    window.api.onDownloadProgress((data) => {
      setDownloadStatus(prev => ({
        ...prev,
        [data.filename]: { ...prev[data.filename], received: data.received, total: data.total }
      }))
    })
    if (window.api.onDownloadComplete) {
      window.api.onDownloadComplete((data) => {
        setDownloadStatus(prev => ({
          ...prev,
          [data.filename]: data.error ? { status: 'error', message: data.error } : { status: 'completed' }
        }))
        try {
          const q = downloadQueue.find(i => i.filename === data.filename)
          if (q && q.playAfter && !data.error && data.path) {
            const fileUrl = `file://${data.path.replace(/\\\\/g, '/')}`
            const audio = new Audio(fileUrl)
            audio.play().catch(() => {})
          }
        } catch (e) { /* ignore */ }
      })
    }
  }, [])

  // Listen for menu actions (open specific tabs)
  useEffect(() => {
    if (window.api && window.api.onMenuOpen) {
      window.api.onMenuOpen((modeName) => {
        try {
          if (modeName) setMode(modeName)
        } catch (e) { }
      })
    }
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

  const handleModeSelect = (m) => setMode(m)

  const toggleTheme = () => setTheme(t => (t === 'dark' ? 'light' : 'dark'))

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
    <div className={`app ${theme}`}>
      <Menu mode={mode} onSelect={handleModeSelect} theme={theme} onToggleTheme={toggleTheme} />
      <main className="main-area">
      <header className="header">
        <div className="header-inner">
          <div className="brand">
            <div className="brand-accent" />
            <div className="brand-text">
              <h1>{locale.title}</h1>
              <p className="subtitle">{locale.subtitle}</p>
            </div>
          </div>

          <div className="lang-selector">
            <select value={lang} onChange={(e) => setLang(e.target.value)}>
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>
        </div>
      </header>

      {mode === 'wayback' && (
        <WaybackSimpleSearch />
      )}

      {mode === 'mp3' && (
        <Mp3Search />
      )}

      {mode === 'lostmyspace' && (
        <LostMySpace />
      )}

      {mode === 'soulseek' && (
        <SoulseekSearch />
      )}

      {mode === 'credits' && (
        <div className="credits">
          <h3>Credits</h3>
          <ul>
            <li><a href="https://github.com/KimmyOGato" target="_blank" rel="noreferrer">KimmyOGato</a></li>
            <li><a href="https://github.com/Oyukihiro/Unwanted" target="_blank" rel="noreferrer">Oyukihiro / Unwanted</a></li>
          </ul>
        </div>
      )}

      {mode === 'downloads' && (
        <DownloadStatus
          queue={downloadQueue}
          status={downloadStatus}
          locale={locale}
        />
      )}
      </main>
    </div>
  )
}