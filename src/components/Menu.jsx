import React from 'react'

export default function Menu({ mode, onSelect, theme, onToggleTheme }) {
  return (
    <aside className={`side-menu ${theme}`}>
      <h2>Unwanted Tools</h2>
      <nav>
        <button className={mode === 'wayback' ? 'active' : ''} onClick={() => onSelect('wayback')}>Wayback Search</button>
        <button className={mode === 'mp3' ? 'active' : ''} onClick={() => onSelect('mp3')}>MP3 Search</button>
        <button className={mode === 'lostmyspace' ? 'active' : ''} onClick={() => onSelect('lostmyspace')}>LostMySpace</button>
        <button className={mode === 'downloads' ? 'active' : ''} onClick={() => onSelect('downloads')}>Downloads</button>
        <button className={mode === 'credits' ? 'active' : ''} onClick={() => onSelect('credits')}>Credits</button>
      </nav>

      <div className="menu-footer">
        <label className="theme-toggle">
          <input type="checkbox" checked={theme === 'dark'} onChange={onToggleTheme} />
          <span>{theme === 'dark' ? 'Dark' : 'Light'}</span>
        </label>
        <small>v0.2.0</small>
      </div>
    </aside>
  )
}
