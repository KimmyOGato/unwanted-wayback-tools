const { contextBridge, ipcRenderer } = require('electron')

console.log('[Preload] Initializing preload script')

const apiHandler = {
  selectFolder: () => {
    console.log('[Preload] selectFolder called')
    return ipcRenderer.invoke('select-folder')
  },
  fetchResources: (link, filters) => {
    console.log('[Preload] fetchResources called with link:', link)
    return ipcRenderer.invoke('fetch-resources', link, filters)
  },
  downloadResource: (opts) => {
    console.log('[Preload] downloadResource called with opts:', opts)
    return ipcRenderer.invoke('download-resource', opts)
  },
  probeResource: (opts) => {
    console.log('[Preload] probeResource called with opts:', opts)
    return ipcRenderer.invoke('probe-resource', opts)
  },
  openExternal: (url) => {
    console.log('[Preload] openExternal called with url:', url)
    return ipcRenderer.invoke('open-external', url)
  },
  onDownloadProgress: (cb) => {
    console.log('[Preload] onDownloadProgress listener registered')
    ipcRenderer.on('download-progress', (e, data) => cb(data))
  }
}

// menu-open listener
try {
  apiHandler.onMenuOpen = (cb) => {
    console.log('[Preload] onMenuOpen listener registered')
    ipcRenderer.on('menu-open-mode', (e, mode) => cb(mode))
  }
} catch (e) {
  console.error('[Preload] Failed to register onMenuOpen:', e)
}

// download-complete listener
try {
  apiHandler.onDownloadComplete = (cb) => {
    console.log('[Preload] onDownloadComplete listener registered')
    ipcRenderer.on('download-complete', (e, data) => cb(data))
  }
} catch (err) {
  console.error('[Preload] Failed to register onDownloadComplete:', err)
}

try {
  contextBridge.exposeInMainWorld('api', apiHandler)
  console.log('[Preload] Successfully exposed window.api')
} catch (err) {
  console.error('[Preload] Failed to expose window.api:', err)
}

// expose additional search APIs
try {
  contextBridge.exposeInMainWorld('searchApi', {
    searchMp3: (opts) => ipcRenderer.invoke('search-mp3', opts),
    searchLostMySpace: (opts) => ipcRenderer.invoke('search-lostmyspace', opts)
  })
  console.log('[Preload] Successfully exposed window.searchApi')
} catch (err) {
  console.error('[Preload] Failed to expose window.searchApi:', err)
}

// Expose Soulseek API
try {
  contextBridge.exposeInMainWorld('soulseek', {
    checkServer: (opts) => ipcRenderer.invoke('soulseek-check', opts),
    hasClient: () => ipcRenderer.invoke('soulseek-has-client'),
    search: (opts) => ipcRenderer.invoke('soulseek-search', opts),
    download: (opts) => ipcRenderer.invoke('soulseek-download', opts)
  })
  console.log('[Preload] Exposed window.soulseek')
} catch (err) {
  console.error('[Preload] Failed to expose window.soulseek:', err)
}

// soulseek download progress listener
try {
  contextBridge.exposeInMainWorld('soulseekEvents', {
    onDownloadProgress: (cb) => {
      console.log('[Preload] soulseek onDownloadProgress listener registered')
      ipcRenderer.on('soulseek-download-progress', (e, data) => cb(data))
    }
  })
} catch (e) {
  console.error('[Preload] Failed to expose soulseekEvents:', e)
}