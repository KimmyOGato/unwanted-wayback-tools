import { useState } from 'react'
import Player from './Player'

export default function ResultCard({ item, isSelected, onToggle, locale }) {
  const [showPreview, setShowPreview] = useState(false)
  const isImage = item.mimetype?.startsWith('image/')
  const isAudio = item.mimetype?.startsWith('audio/')
  const isVideo = item.mimetype?.startsWith('video/')

  const handleOpen = (url) => {
    try { window.api.openExternal(url) } catch (e) { window.open(url, '_blank') }
  }

  const handleDownload = async () => {
    try {
      const folder = await window.api.selectFolder()
      if (!folder) return
      const filename = `${item.timestamp || Date.now()}_${item.original.split('/').pop()}`
      const id = `${Date.now()}_${Math.random().toString(36).slice(2,8)}`
      window.dispatchEvent(new CustomEvent('enqueue-download', { detail: { id, archived: item.archived, folder, filename } }))
      alert('Download queued (check status)')
    } catch (e) {
      alert('Download failed: ' + String(e))
    }
  }

  return (
    <div className={`result-card ${isSelected ? 'selected' : ''}`}>
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="checkbox"
      />

      {isImage && (
        <img
          src={item.archived}
          alt="thumbnail"
          className="thumbnail"
          loading="lazy"
          onClick={() => setShowPreview(true)}
        />
      )}

      {(isAudio || isVideo) && (
        <div className="media-preview">
          {isAudio && (
            <Player src={item.archived} />
          )}
          {isVideo && (
            <video controls style={{ width: '100%', height: '140px' }}>
              <source src={item.archived} type={item.mimetype} />
            </video>
          )}
        </div>
      )}

      <div className="card-title">{item.mimetype || 'unknown'} — {item.original.slice(-50)}</div>
      <div className="card-date">{item.timestamp}</div>

      <div className="card-actions">
        <button onClick={handleDownload}>Download</button>
        <button onClick={() => handleOpen(item.archived)}>Site</button>
      </div>

      {showPreview && isImage && (
        <div className="modal-overlay" onClick={() => setShowPreview(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <img src={item.archived} alt="full-size" style={{ maxWidth: '90vw', maxHeight: '90vh' }} />
          </div>
        </div>
      )}
    </div>
  )
}