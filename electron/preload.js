const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  fetchResources: (link, filters) => ipcRenderer.invoke('fetch-resources', link, filters),
  downloadResource: (opts) => ipcRenderer.invoke('download-resource', opts),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (e, data) => cb(data))
})