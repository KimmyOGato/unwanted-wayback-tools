import React, { useState } from 'react'

export default function Navigation({ mode, onSelect, theme, onToggleTheme, locale = {} }) {
  const t = locale || {}
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const menuItems = [
    { id: 'wayback', label: t.menu_wayback || 'Wayback', icon: '🕰️' },
    { id: 'mp3', label: t.menu_mp3 || 'MP3 Search', icon: '🎵' },
    { id: 'soulseek', label: t.menu_soulseek || 'Soulseek', icon: '🔗' },
    { id: 'video', label: t.video_downloader || 'Video', icon: '🎬' },
    { id: 'statistics', label: t.statistics || 'Stats', icon: '📊' },
    { id: 'credits', label: t.menu_credits || 'Credits', icon: '✨' }
  ]

  return (
    <nav className={`navbar ${theme}`}>
      <div className="navbar-container">
        {/* Logo/Title */}
        <div className="navbar-brand">
          <h1>{t.title || 'Unwanted Tools'}</h1>
        </div>

        {/* Menu Items */}
        <div className={`navbar-menu ${mobileMenuOpen ? 'active' : ''}`}>
          {menuItems.map(item => (
            <button
              key={item.id}
              className={`nav-item ${mode === item.id ? 'active' : ''}`}
              onClick={() => {
                onSelect(item.id)
                setMobileMenuOpen(false)
              }}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </div>

        {/* Right Section */}
        <div className="navbar-right">
          <button
            className="btn-theme"
            onClick={onToggleTheme}
            title="Toggle theme"
          >
            {theme === 'dark' ? '☀️' : '🌙'}
          </button>
          
          {/* Mobile Menu Toggle */}
          <button
            className="menu-toggle"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            ☰
          </button>
        </div>
      </div>
    </nav>
  )
}
