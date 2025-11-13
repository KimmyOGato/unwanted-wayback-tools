const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const fetch = require('node-fetch')

let isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

function parseWaybackInput(input) {
  try {
    const u = new URL(input)
    if (u.hostname.includes('web.archive.org')) {
      const parts = u.pathname.split('/').filter(Boolean)
      const webIdx = parts.indexOf('web')
      if (webIdx >= 0) {
        const stamp = parts[webIdx + 1]
        const rest = parts.slice(webIdx + 2).join('/')
        const original = rest ? (rest.startsWith('http') ? rest : 'http://' + rest) : null
        return { original, stamp }
      }
    }
    return { original: input, stamp: null }
  } catch (e) {
    return { original: input, stamp: null }
  }
}

ipcMain.handle('select-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled) return null
  return res.filePaths[0]
})

ipcMain.handle('fetch-resources', async (event, inputLink, filters = {}) => {
  const { original } = parseWaybackInput(inputLink)
  if (!original) return { error: 'Could not extract original URL.' }

  // Build CDX query with optional date filters
  let cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(original)}&output=json&fl=timestamp,original,mimetype,length&filter=statuscode:200&collapse=digest&limit=10000`

  if (filters.from) {
    const from = filters.from.replace(/-/g, '')
    cdxUrl += `&from=${from}`
  }
  if (filters.to) {
    const to = filters.to.replace(/-/g, '')
    cdxUrl += `&to=${to}`
  }

  try {
    const res = await fetch(cdxUrl, { timeout: 30000 })
    if (!res.ok) return { error: `CDX API returned ${res.status}` }
    const json = await res.json()
    const rows = json.slice(1)
    const seen = new Set()
    const items = []

    for (const r of rows) {
      const [timestamp, orig, mimetype, length] = r
      const key = `${timestamp}::${orig}`
      if (seen.has(key)) continue
      seen.add(key)

      const archived = `https://web.archive.org/web/${timestamp}/${orig}`
      items.push({ timestamp, original: orig, mimetype, archived, length: parseInt(length) || 0 })
    }

    return { items }
  } catch (err) {
    return { error: String(err) }
  }
})

ipcMain.handle('download-resource', async (event, { url, destFolder, filename }) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return { error: `HTTP ${res.status}` }

    fs.mkdirSync(destFolder, { recursive: true })

    const unsafeName = filename || path.basename(new URL(url).pathname) || `resource_${Date.now()}`
    let safeName = unsafeName.replace(/[<>:"/\\|?*]+/g, '_')
    const ext = path.extname(safeName)

    if (!ext) {
      const ct = res.headers.get('content-type') || ''
      const map = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'audio/mpeg': '.mp3',
        'audio/ogg': '.ogg',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov'
      }
      if (map[ct.split(';')[0].trim()]) {
        safeName += map[ct.split(';')[0].trim()]
      } else {
        try {
          const pExt = path.extname(new URL(url).pathname)
          if (pExt) safeName += pExt
        } catch (e) {
          // ignore
        }
      }
    }

    const fullPath = path.join(destFolder, safeName)

    const fileStream = fs.createWriteStream(fullPath)
    return await new Promise((resolve, reject) => {
      const body = res.body
      let received = 0
      const total = res.headers.get('content-length') ? parseInt(res.headers.get('content-length'), 10) : 0

      body.on('data', (chunk) => {
        received += chunk.length
        event.sender.send('download-progress', { url, filename: safeName, received, total, path: fullPath })
      })

      body.pipe(fileStream)
      fileStream.on('finish', () => resolve({ path: fullPath }))
      fileStream.on('error', (e) => reject({ error: String(e) }))
    })
  } catch (err) {
    return { error: String(err) }
  }
})