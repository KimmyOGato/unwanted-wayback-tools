import React, { useState, useEffect } from 'react'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const b = Number(bytes)
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let value = b
  while (value >= 1024 && i < units.length - 1) {
    value = value / 1024
    i++
  }
  return value.toFixed(i === 0 ? 0 : 2) + ' ' + units[i]
}

function formatTime(ms) {
  if (!ms) return '0s'
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)
  
  if (days > 0) return days + 'd ' + (hours % 24) + 'h'
  if (hours > 0) return hours + 'h ' + (minutes % 60) + 'm'
  if (minutes > 0) return minutes + 'm ' + (seconds % 60) + 's'
  return seconds + 's'
}

export default function Statistics({ locale = {} }) {
  const t = locale
  const [stats, setStats] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    const loadStats = () => {
      try {
        const saved = localStorage.getItem('uwt:stats')
        if (saved) {
          const parsed = JSON.parse(saved)
          setStats(parsed)
        } else {
          setStats({
            totalFiles: 0,
            totalBytes: 0,
            totalTime: 0,
            byType: {}
          })
        }
      } catch (e) {
        console.log('Stats load error:', e.message)
        setStats({ totalFiles: 0, totalBytes: 0, totalTime: 0, byType: {} })
      }
    }
    loadStats()
  }, [refreshKey])

  const clearStats = () => {
    if (window.confirm('Deseja limpar todas as estatísticas?')) {
      localStorage.removeItem('uwt:stats')
      setStats({ totalFiles: 0, totalBytes: 0, totalTime: 0, byType: {} })
    }
  }

  const refreshStats = () => {
    setRefreshKey(prev => prev + 1)
  }

  if (!stats) return <div style={{ padding: '20px' }}>Carregando...</div>

  return (
    <div className="statistics-container">
      <div className="statistics-header">
        <h2>{t.statistics || 'Estatísticas'}</h2>
        <div className="stats-controls">
          <button onClick={refreshStats} className="btn-icon" title="Refresh">
            🔄
          </button>
          <button onClick={clearStats} className="btn-icon btn-danger" title="Clear">
            🗑️
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📥</div>
          <div className="stat-label">{t.files_downloaded || 'Arquivos'}</div>
          <div className="stat-value">{stats.totalFiles}</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">💾</div>
          <div className="stat-label">{t.space_saved || 'Espaço Total'}</div>
          <div className="stat-value">{formatBytes(stats.totalBytes)}</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-icon">⏱️</div>
          <div className="stat-label">{t.total_time || 'Tempo Total'}</div>
          <div className="stat-value">{formatTime(stats.totalTime)}</div>
        </div>
      </div>

      {Object.keys(stats.byType).length > 0 && (
        <div className="stat-by-type">
          <h3>{t.by_type || 'Por Tipo'}</h3>
          <div className="type-breakdown">
            {Object.entries(stats.byType).map(([type, count]) => (
              <div key={type} className="type-item">
                <span className="type-name">{type}</span>
                <span className="type-count">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.totalFiles === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>{t.no_stats || 'Nenhuma estatística ainda'}</p>
        </div>
      )}
    </div>
  )
}
