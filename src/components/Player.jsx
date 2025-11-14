import React, { useEffect, useRef, useState } from 'react'

export default function Player({ src, autoPlay = false }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!audioRef.current) audioRef.current = new Audio()
    const audio = audioRef.current
    audio.src = src || ''
    audio.preload = 'metadata'

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrent(audio.currentTime || 0)
    const onDur = () => setDuration(audio.duration || 0)
    const onEnded = () => setPlaying(false)

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('durationchange', onDur)
    audio.addEventListener('ended', onEnded)

    if (autoPlay) {
      audio.play().catch(() => {})
    }

    return () => {
      audio.pause()
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('durationchange', onDur)
      audio.removeEventListener('ended', onEnded)
    }
  }, [src, autoPlay])

  const toggle = () => {
    const a = audioRef.current
    if (!a) return
    if (playing) a.pause()
    else a.play().catch(() => {})
  }

  const format = (t) => {
    if (!isFinite(t) || t <= 0) return '0:00'
    const s = Math.floor(t % 60).toString().padStart(2, '0')
    const m = Math.floor(t / 60)
    return `${m}:${s}`
  }

  const onSeek = (e) => {
    const a = audioRef.current
    if (!a) return
    const val = parseFloat(e.target.value)
    a.currentTime = val
    setCurrent(val)
  }

  return (
    <div className="player">
      <button className="player-btn" onClick={toggle}>{playing ? '⏸' : '▶'}</button>
      <div className="player-time">{format(current)} / {format(duration)}</div>
      <input className="player-seek" type="range" min={0} max={duration || 0} step={0.1} value={current} onChange={onSeek} />
    </div>
  )
}
