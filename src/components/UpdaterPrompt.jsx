import React, { useEffect, useState } from 'react'

export default function UpdaterPrompt() {
  const [availableInfo, setAvailableInfo] = useState(null)
  const [downloadedInfo, setDownloadedInfo] = useState(null)
  const [error, setError] = useState(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    if (!window.updater) return
    const onAvail = (info) => setAvailableInfo(info)
    const onDownloaded = (info) => setDownloadedInfo(info)
    const onError = (err) => setError(err)

    window.updater.onUpdateAvailable(onAvail)
    window.updater.onUpdateDownloaded(onDownloaded)
    window.updater.onUpdateError(onError)

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
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" onClick={doDownload}>Download</button>
              <button className="btn btn-ghost" onClick={() => setAvailableInfo(null)}>Later</button>
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
