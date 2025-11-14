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