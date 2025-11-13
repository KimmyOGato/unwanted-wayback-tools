import { useState } from 'react'

export default function ResultCard({ item, isSelected, onToggle, locale }) {
  const [showPreview, setShowPreview] = useState(false)
  const isImage = item.mimetype?.startsWith('image/')
  const isAudio = item.mimetype?.startsWith('audio/')
  const isVideo = item.mimetype?.startsWith('video/')

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
            <audio controls style={{ width: '100%' }}>
              <source src={item.archived} type={item.mimetype} />
            </audio>
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