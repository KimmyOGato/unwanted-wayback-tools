import { useState, useEffect } from 'react'

const THEMES = [
  { id: 'preto-total', label: 'Preto total', desc: 'Contrast máximo, fundos 100% preto' },
  { id: 'preto', label: 'Preto', desc: 'Escuro com leve contraste' },
  { id: 'roxo-escuro', label: 'Roxo escuro', desc: 'Tons roxos sofisticados' },
  { id: 'vermelho-escuro', label: 'Vermelho escuro', desc: 'Tons quentes e sóbrios' }
]

export default function ThemeSelector({ value, onChange }) {
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
    <div className="theme-selector" role="group" aria-label="Selecionar tema">
      {THEMES.map(t => (
        <button
          key={t.id}
          className={`theme-btn ${selected === t.id ? 'active' : ''}`}
          title={`${t.label} — ${t.desc}`}
          onClick={() => pick(t.id)}
        >
          <span className={`swatch ${t.id}`} aria-hidden />
          <span className="lbl">{t.label}</span>
        </button>
      ))}
    </div>
  )
}
