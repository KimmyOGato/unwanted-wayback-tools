import { useState, useRef, useEffect } from 'react'
import ThemeSelector from './ThemeSelector'

export default function HeaderSettings({ lang, onLangChange, theme, onThemeChange, locale }) {
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

  const t = locale || { settings_title: 'Settings', label_language: 'Language', label_theme: 'Theme', settings_button_title: 'Settings' }

  return (
    <div className="header-settings" ref={ref}>
      <button className="settings-btn" onClick={() => setOpen(v => !v)} aria-haspopup="true" aria-expanded={open} title={t.settings_button_title}>
        ⚙️
      </button>
      {open && (
        <div className="settings-panel" role="dialog" aria-label={t.settings_title}>
          <div className="settings-row">
            <label className="settings-label">{t.label_language}</label>
            <select className="settings-select" value={lang} onChange={(e) => onLangChange && onLangChange(e.target.value)}>
              <option value="pt-BR">Português (BR)</option>
              <option value="en-US">English (US)</option>
            </select>
          </div>

          <div className="settings-row" style={{ marginTop: 8 }}>
            <label className="settings-label">{t.label_theme}</label>
            <div style={{ marginTop: 6 }}>
              <ThemeSelector value={theme} onChange={(t) => onThemeChange && onThemeChange(t)} locale={locale} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
