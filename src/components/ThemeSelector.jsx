import { useState, useEffect } from 'react'

const THEME_IDS = [
  'preto-total',
  'preto',
  'roxo-escuro',
  'vermelho-escuro',
  'rosa',
  'azul',
  'verde'
]

export default function ThemeSelector({ value, onChange, locale = {} }) {
  const [selected, setSelected] = useState(value || 'preto')

  useEffect(() => {
    if (value) setSelected(value)
  }, [value])

  const pick = (id) => {
    setSelected(id)
    try {
      localStorage.setItem('uwt:theme', id)
    } catch (e) { /* ignore */ }
    if (onChange) onChange(id)
  }

  return (
    <div className="theme-selector" role="group" aria-label={locale.label_theme || 'Theme'}>
      {THEME_IDS.map(id => {
        const keyBase = `theme_${id.replace(/-/g, '_')}`
        const label = locale[`${keyBase}_label`] || id
        const desc = locale[`${keyBase}_desc`] || ''
        return (
          <button
            key={id}
            className={`theme-btn ${selected === id ? 'active' : ''}`}
            title={desc ? `${label} — ${desc}` : label}
            onClick={() => pick(id)}
          >
            <span className={`swatch ${id}`} aria-hidden />
            <span className="lbl">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
