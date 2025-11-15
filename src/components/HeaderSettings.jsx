import { useState, useRef, useEffect } from 'react'
import ThemeSelector from './ThemeSelector'

export default function HeaderSettings({ lang, onLangChange, theme, onThemeChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function onDoc(e) {
      if (!ref.current) return
      if (!ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  return (
    <div className="header-settings" ref={ref}>
      <button className="settings-btn" onClick={() => setOpen(v => !v)} aria-haspopup="true" aria-expanded={open} title="Settings">
        ⚙️
      </button>
      {open && (
        <div className="settings-panel">
          <div className="settings-row">
            <label style={{ fontSize: 13, color: 'var(--muted)', marginRight: 8 }}>Language</label>
            <select value={lang} onChange={(e) => onLangChange && onLangChange(e.target.value)}>
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>

          <div style={{ marginTop: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--muted)' }}>Theme</label>
            <div style={{ marginTop: 6 }}>
              <ThemeSelector value={theme} onChange={(t) => onThemeChange && onThemeChange(t)} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
