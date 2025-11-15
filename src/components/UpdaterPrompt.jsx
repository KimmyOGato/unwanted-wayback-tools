import React, { useEffect, useState } from 'react'

export default function UpdaterPrompt() {
  const [availableInfo, setAvailableInfo] = useState(null)
  const [downloadedInfo, setDownloadedInfo] = useState(null)
  const [error, setError] = useState(null)
  const [progress, setProgress] = useState({ percent: 0, transferred: 0, total: 0 })
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!window.updater) return
    const onAvail = (info) => setAvailableInfo(info)
    const onDownloaded = (info) => setDownloadedInfo(info)
    const onError = (err) => setError(err)
    const onProgress = (p) => {
      // p may contain { percent, bytesPerSecond, transferred, total }
      const percent = Math.round((p.percent || 0) * 100) / 100
      const transferred = p.transferred || 0
      const total = p.total || 0
      const bytesPerSecond = p.bytesPerSecond || p.bytesPerSecond === 0 ? p.bytesPerSecond : null
      const eta = (bytesPerSecond && total > transferred) ? Math.round((total - transferred) / bytesPerSecond) : null
      setProgress({ percent, transferred, total, bytesPerSecond, eta })
    }

    window.updater.onUpdateAvailable(onAvail)
    window.updater.onUpdateDownloaded(onDownloaded)
    window.updater.onUpdateError(onError)
    if (window.updater.onUpdateDownloadProgress) window.updater.onUpdateDownloadProgress(onProgress)

    return () => {
      // no-op: preload listeners are simple and not removed here
    }
  }, [])

  const checkNow = async () => {
    if (!window.updater) return
    setChecking(true)
    try {
      await window.updater.checkForUpdates()
    } catch (e) {
      setError(String(e))
    }
    setChecking(false)
  }

  const doDownload = async () => {
    if (!window.updater) return
    try {
      await window.updater.downloadUpdate()
    } catch (e) {
      setError(String(e))
    }
  }

  const doCancel = async () => {
    if (!window.updater || !window.updater.cancelDownload) {
      setError('Cancel not supported on this platform')
      return
    }
    try {
      const res = await window.updater.cancelDownload()
      if (res && res.ok) {
        // reset progress and dismiss available prompt
        setProgress({ percent: 0, transferred: 0, total: 0 })
        setAvailableInfo(null)
      } else {
        setError(res && res.error ? res.error : 'Cancel failed')
      }
    } catch (e) {
      setError(String(e))
    }
  }

  const doInstall = async () => {
    if (!window.updater) return
    try {
      await window.updater.installUpdate()
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div>
      {/* Minimal visible control: check now button in the UI */}
      <div style={{ position: 'fixed', right: 12, bottom: 12, zIndex: 2000 }}>
        <button className="btn" onClick={checkNow} disabled={checking}>{checking ? 'Checking...' : 'Check for updates'}</button>
      </div>

      {/* Modal: update available */}
      {availableInfo && !downloadedInfo && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Update available</h3>
            <p>Version {availableInfo && availableInfo.version} is available. Do you want to download it now?</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button className="btn" onClick={doDownload}>Download</button>
              <button className="btn btn-ghost" onClick={() => setAvailableInfo(null)}>Later</button>
              {progress && progress.total > 0 && (
                <div style={{ marginLeft: 12, minWidth: 220 }}>
                  <div className="progress-bar" style={{ height: 10, borderRadius: 6, background: 'rgba(255,255,255,0.06)' }}>
                    <div className="progress-fill" style={{ width: `${progress.percent}%`, height: '100%', background: 'linear-gradient(90deg,#60a5fa,#3b82f6)' }} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                    {progress.percent}% — {Math.round(progress.transferred/1024)}KB / {Math.round(progress.total/1024)}KB
                    {progress.bytesPerSecond ? ` — ${Math.round(progress.bytesPerSecond/1024)} KB/s` : ''}
                    {progress.eta ? ` — ETA ${Math.round(progress.eta)}s` : ''}
                  </div>
                  {progress.transferred > 0 && progress.percent < 100 && (
                    <div style={{ marginTop: 8 }}>
                      <button className="btn btn-ghost" onClick={doCancel}>Cancel download</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: downloaded and ready to install */}
      {downloadedInfo && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h3>Update ready</h3>
            <p>Update {downloadedInfo && downloadedInfo.version} has been downloaded. Install now?</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={doInstall}>Install and Restart</button>
              <button className="btn btn-ghost" onClick={() => setDownloadedInfo(null)}>Later</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div style={{ position: 'fixed', left: 12, bottom: 12, background: 'rgba(220,20,60,0.9)', color: '#fff', padding: 8, borderRadius: 6 }}>
          <strong>Error:</strong> {String(error)}
        </div>
      )}
    </div>
  )
}
