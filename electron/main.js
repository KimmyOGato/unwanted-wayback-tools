const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
// Ensure application name is consistent in menus and window titles
try { app.name = 'Unwanted Tools' } catch (e) { /* ignore */ }
let autoUpdater
try {
  // electron-updater is optional in dev; require if available
  // eslint-disable-next-line global-require
  const { autoUpdater: _au } = require('electron-updater')
  autoUpdater = _au
} catch (e) {
  console.log('[Main] electron-updater not available:', e && e.message)
}
// Some node/http libraries (undici) expect Web `File` to exist.
// Electron/Node may not provide it in all runtimes; provide a minimal polyfill
// before loading `node-fetch`/undici to avoid ReferenceError: File is not defined
if (typeof global.File === 'undefined') {
  global.File = class File {
    constructor(bits = [], filename = '', options = {}) {
      this.bits = bits
      this.name = filename
      this.lastModified = options.lastModified || Date.now()
      this.size = Array.isArray(bits) ? bits.reduce((s, b) => s + (b ? b.length || 0 : 0), 0) : 0
      this.type = options.type || ''
    }
  }
}

const fetch = require('node-fetch')
const cheerio = require('cheerio')
const soulseek = require('./soulseek')

// Detect development mode: check if dist folder exists and has index.html
// If not, we're in dev mode; also check NODE_ENV
let isDev = !fs.existsSync(path.join(__dirname, '../dist/index.html')) || process.env.NODE_ENV === 'development'

console.log('[Main] isDev:', isDev)
console.log('[Main] NODE_ENV:', process.env.NODE_ENV)
console.log('[Main] dist/index.html exists:', fs.existsSync(path.join(__dirname, '../dist/index.html')))

let mainWindow = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    // Use native frame in production (when not dev). In dev we keep frameless for easier testing.
    frame: !isDev,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Keep global reference so menu handlers can act on it
  mainWindow = win

  // Set window title
  win.setTitle('Unwanted Tools')

  console.log('[Main] Creating window, isDev:', isDev)

  if (isDev) {
    console.log('[Main] Loading from dev server: http://localhost:5173')
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    const filePath = path.join(__dirname, '../dist/index.html')
    console.log('[Main] Loading from file:', filePath)
    win.loadFile(filePath)
    // Open DevTools in production when running directly (debugging)
    if (process.argv.includes('--debug')) {
      win.webContents.openDevTools()
    }
  }

  // Handle any uncaught exceptions in the renderer
  win.webContents.on('crashed', () => {
    console.error('[Main] Renderer process crashed')
  })

  win.on('closed', () => {
    // Clear reference so we can re-open later
    if (mainWindow === win) mainWindow = null
  })
}

// Window control IPC
ipcMain.on('window-minimize', () => {
  try { if (mainWindow) mainWindow.minimize() } catch (e) { console.error('[Main] window-minimize', e) }
})
ipcMain.on('window-close', () => {
  try { if (mainWindow) mainWindow.close() } catch (e) { console.error('[Main] window-close', e) }
})
ipcMain.on('window-toggle-maximize', () => {
  try {
    if (!mainWindow) return
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
    try { mainWindow.webContents.send('window-is-maximized', mainWindow.isMaximized()) } catch (e) {}
  } catch (e) { console.error('[Main] window-toggle-maximize', e) }
})
ipcMain.handle('window-is-maximized', () => {
  try { return mainWindow ? mainWindow.isMaximized() : false } catch (e) { return false }
})

// Expose frameless/native frame state to renderer
// Note: frameless detection removed; renderer uses native window chrome by default

// Auto-update setup (if electron-updater is available)
if (autoUpdater) {
  try {
    autoUpdater.autoDownload = false
    autoUpdater.logger = console
    autoUpdater.on('error', (err) => {
      console.error('[Main][AutoUpdater] error', err)
      try { if (mainWindow) mainWindow.webContents.send('update-error', String(err)) } catch (e) {}
    })
    autoUpdater.on('update-available', (info) => {
      console.log('[Main][AutoUpdater] update-available', info)
      try { if (mainWindow) mainWindow.webContents.send('update-available', info) } catch (e) {}
    })
    autoUpdater.on('update-not-available', (info) => {
      console.log('[Main][AutoUpdater] update-not-available', info)
      try { if (mainWindow) mainWindow.webContents.send('update-not-available', info) } catch (e) {}
    })
    autoUpdater.on('update-downloaded', (info) => {
      console.log('[Main][AutoUpdater] update-downloaded', info)
      try { if (mainWindow) mainWindow.webContents.send('update-downloaded', info) } catch (e) {}
    })
  } catch (e) {
    console.error('[Main] autoUpdater setup failed', e)
  }

  ipcMain.handle('check-for-updates', async () => {
    try { autoUpdater.checkForUpdates() } catch (e) { return { error: String(e) } }
    return { ok: true }
  })

  ipcMain.handle('download-update', async () => {
    try { await autoUpdater.downloadUpdate(); return { ok: true } } catch (e) { return { error: String(e) } }
  })

  ipcMain.handle('install-update', async () => {
    try {
      // quitAndInstall will restart the app
      autoUpdater.quitAndInstall()
      return { ok: true }
    } catch (e) { return { error: String(e) } }
  })
}

app.whenReady().then(() => {
  createWindow()
  // Create the application menu once the app is ready
  try {
    createAppMenu()
  } catch (e) {
    console.error('[Main] createAppMenu failed', e)
  }

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
})

function createAppMenu() {
  const isMac = process.platform === 'darwin'

  const template = []

  if (isMac) {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push({
    label: 'File',
    submenu: [
      {
        label: 'Open Soulseek',
        click: () => {
          try {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.focus()
              mainWindow.webContents.send('menu-open-mode', 'soulseek')
            }
          } catch (e) { console.error('[Main][Menu] open soulseek', e) }
        }
      },
      {
        label: 'Open Main Window',
        click: () => {
          try {
            if (mainWindow) {
              if (mainWindow.isMinimized()) mainWindow.restore()
              mainWindow.focus()
            } else {
              createWindow()
            }
          } catch (e) { console.error('[Main][Menu] open main window', e) }
        }
      },
      { type: 'separator' },
      { role: 'quit', label: 'Quit' }
    ]
  })

  template.push({
    label: 'View',
    submenu: [
      { role: 'reload' },
      { label: 'Toggle DevTools', accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I', click: () => { if (mainWindow) mainWindow.webContents.toggleDevTools() } },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  })

  template.push({
    label: 'Window',
    submenu: [
      { label: 'Minimize', click: () => { if (mainWindow) mainWindow.minimize() }, accelerator: 'Ctrl+M' },
      { label: 'Close', click: () => { if (mainWindow) mainWindow.close() } }
    ]
  })

  template.push({
    label: 'Help',
    submenu: [
      { label: 'About', click: () => { dialog.showMessageBox({ type: 'info', title: 'About', message: 'Unwanted Tools', detail: 'Built with Electron + Vite' }) } }
    ]
  })

  const menu = Menu.buildFromTemplate(template)
  // On macOS we keep the application menu; on other platforms remove it
  if (isMac) {
    Menu.setApplicationMenu(menu)
  } else {
    // Remove the default application menu to avoid the native top bar
    Menu.setApplicationMenu(null)
  }
}

function parseWaybackInput(input) {
  try {
    const u = new URL(input)
    if (u.hostname.includes('web.archive.org')) {
      // pathname can contain a full URL after the stamp (including http://),
      // so use a regex to reliably extract stamp and original resource.
      // Examples supported:
      //  - /web/20020527110458/http://www.pulseultra.com/
      //  - /web/*/http://example.com/
      const m = (u.pathname || '').match(/^\/web\/([^/]+)\/(.+)$/)
      if (m) {
        const stamp = m[1] === '*' ? null : m[1]
        // m[2] may contain encoded or raw url path — preserve as-is but normalize
        let rest = m[2]
        try {
          // If rest already begins with a protocol, use directly; otherwise assume http
          rest = rest.startsWith('http') ? rest : 'http://' + rest
        } catch (e) {
          rest = rest
        }
        return { original: rest, stamp }
      }
    }
    return { original: input, stamp: null }
  } catch (e) {
    return { original: input, stamp: null }
  }
}

async function getResourcesFromArchivedPage(stamp, original) {
  try {
    const archivedPage = `https://web.archive.org/web/${stamp}/${original}`
    const res = await fetch(archivedPage, { timeout: 20000 })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const body = await res.text()
    if (!/\<\s*html/i.test(body)) return { items: [] }

    const $ = cheerio.load(body)
    const candidates = new Set()

    const pushCandidate = (link) => {
      if (!link) return
      try {
        // Some captures rewrite URLs inserting a /web/<stamp>.../ prefix on the original host.
        // If we detect a pattern like /web/<stamp>.../http://..., extract the original URL.
        const m = String(link).match(/\/web\/(\d+)[^\/]*\/(https?:\/\/.+)$/)
        if (m) {
          candidates.add(m[2])
          return
        }
        const absolute = new URL(link, original).toString()
        candidates.add(absolute)
      } catch (e) { }
    }

    // img, picture/srcset, audio/video, anchors, data-attrs, inline styles
    $('img[src], img[data-src]').each((i, el) => pushCandidate($(el).attr('src') || $(el).attr('data-src')))
    $('source[src], source[srcset], img[srcset], [data-srcset]').each((i, el) => {
      const s = $(el).attr('src') || $(el).attr('srcset') || $(el).attr('data-srcset')
      if (!s) return
      // srcset may contain multiple candidates separated by commas
      s.split(',').forEach(part => {
        const urlPart = part.trim().split(' ')[0]
        pushCandidate(urlPart)
      })
    })
    $('audio source[src], audio[src], video source[src], video[src]').each((i, el) => pushCandidate($(el).attr('src')))
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const lower = href.toLowerCase()
      if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|mp3|ogg|m4a|wav|mp4|mov)(\?|$)/) || lower.includes('media') || lower.includes('files')) {
        pushCandidate(href)
      }
    })
    $('[data-src], [data-href], [data-url]').each((i, el) => pushCandidate($(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-url')))
    $('*[style]').each((i, el) => {
      const st = $(el).attr('style') || ''
      const m = st.match(/background-image:\s*url\(['"]?([^'\")]+)['"]?\)/i)
      if (m && m[1]) pushCandidate(m[1])
    })

    // Build items: normalize each candidate into a web.archive.org archived URL using the provided stamp
    const items = []
    const guessMime = (urlStr) => {
      try {
        const p = new URL(urlStr).pathname
        const ext = (p.split('.').pop() || '').toLowerCase()
        const map = {
          jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
          mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav',
          mp4: 'video/mp4', mov: 'video/quicktime'
        }
        return map[ext] || null
      } catch (e) { return null }
    }

    for (const cand of Array.from(candidates)) {
      try {
        const absolute = new URL(cand, original).toString()
        let archivedUrl = ''
        // If candidate already mentions web.archive.org, keep it
        if (absolute.includes('web.archive.org')) archivedUrl = absolute
        else if (stamp && stamp !== '*') archivedUrl = `https://web.archive.org/web/${stamp}/${absolute}`
        else archivedUrl = `https://web.archive.org/web/*/${absolute}`

        const mimetype = guessMime(absolute)
        items.push({ timestamp: stamp || null, original: absolute, mimetype, archived: archivedUrl, length: 0 })
      } catch (e) { /* ignore */ }
    }

    return { items }
  } catch (err) {
    return { error: String(err) }
  }
}

ipcMain.handle('select-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled) return null
  return res.filePaths[0]
})

ipcMain.handle('fetch-resources', async (event, inputLink, filters = {}) => {
  // Support single link (string) or array of links for deeper search
  const links = Array.isArray(inputLink) ? inputLink.slice(0, 50) : [inputLink]
  const aggregate = []
  const seen = new Set()

  for (const l of links) {
    const { original, stamp } = parseWaybackInput(l)
    if (!original) continue

    // If user provided a Wayback link with a timestamp, fetch the archived HTML
    // and extract embedded resources (images, audio, video) for that capture.
    if (stamp) {
      try {
        const res = await getResourcesFromArchivedPage(stamp, original)
        if (res && res.items) {
          for (const it of res.items) {
            const key = `${it.timestamp}::${it.original}`
            if (seen.has(key)) continue
            seen.add(key)
            aggregate.push(it)
          }
        } else if (res && res.error) {
          console.error('[Main] fetch-resources archived-page error for', l, res.error)
        }
      } catch (err) {
        console.error('[Main] fetch-resources archived-page error for', l, err)
      }
      continue
    }

    // Build CDX query with optional date filters for non-stamped inputs
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
      if (!res.ok) continue
      const json = await res.json()
      const rows = json.slice(1)

      for (const r of rows) {
        const [timestamp, orig, mimetype, length] = r
        const key = `${timestamp}::${orig}`
        if (seen.has(key)) continue
        seen.add(key)
        const archived = `https://web.archive.org/web/${timestamp}/${orig}`
        aggregate.push({ timestamp, original: orig, mimetype, archived, length: parseInt(length) || 0 })
      }
    } catch (err) {
      console.error('[Main] fetch-resources error for', l, err)
    }
  }

  return { items: aggregate }
})

// Search MP3 Search Archive (buildism.net) — returns simple list of results with title and url
ipcMain.handle('search-mp3', async (event, { artist = '', song = '', genre = '' } = {}) => {
  try {
    const params = new URLSearchParams({ artist, song, genre, submit: 'Search' })
    const url = `https://buildism.net/mp3-search/?${params.toString()}`
    console.log('[Main][search-mp3] requesting:', url)
    const res = await fetch(url, { timeout: 30000 })
    console.log('[Main][search-mp3] status:', res.status)
    if (!res.ok) return { error: `MP3 search returned ${res.status}` }
    const html = await res.text()
    console.log('[Main][search-mp3] HTML length:', html.length)
    // DEBUG: log first 2000 chars of HTML to see structure
    console.log('[Main][search-mp3] HTML preview:', html.substring(0, 2000))
    const $ = cheerio.load(html)
    const items = []
    const pushIfNew = (link, title) => {
      if (!link || link.trim() === '') return
      try {
        const absolute = new URL(link, url).toString()
        if (!items.find(i => i.url === absolute)) {
          items.push({ title: title || absolute.split('/').pop() || 'audio', url: absolute })
          console.log('[Main][search-mp3] added:', absolute, 'title:', title)
        }
      } catch (e) { 
        console.log('[Main][search-mp3] invalid URL:', link, e.message)
      }
    }

    // CRITICAL: Extract from .audio-row elements with data-url attribute (buildism.net structure)
    $('.audio-row').each((i, el) => {
      const dataUrl = $(el).attr('data-url')
      if (dataUrl) {
        console.log('[Main][search-mp3] found .audio-row with data-url:', dataUrl)
        pushIfNew(dataUrl, null)
      }
    })

    // anchors ending with audio extensions
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const lower = href.toLowerCase()
      const text = $(el).text().trim()
      if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.flac') || lower.endsWith('.wav')) {
        pushIfNew(href, text || null)
      }
    })

    // any anchor that looks like it points to audio
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href')
      if (!href) return
      const lower = href.toLowerCase()
      const text = $(el).text().trim().toLowerCase()
      if (text.includes('download') || text.includes('play') || text.includes('listen') || text.includes('stream') || lower.includes('download') || lower.includes('files')) {
        pushIfNew(href, text || null)
      }
    })

    // audio tags and sources
    $('audio').each((i, el) => {
      const src = $(el).attr('src')
      if (src) pushIfNew(src, null)
      $(el).find('source[src]').each((j, srcEl) => {
        const s = $(srcEl).attr('src')
        if (s) pushIfNew(s, null)
      })
    })

    // iframes may embed players
    $('iframe[src]').each((i, el) => {
      const src = $(el).attr('src')
      pushIfNew(src, null)
    })

    // data attributes (common for lazy-load)
    $('[data-src], [data-href], [data-url]').each((i, el) => {
      const s = $(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-url')
      pushIfNew(s, null)
    })

    // check for embedded JSON
    $('script[type="application/json"], script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).text())
        if (data && data.url) pushIfNew(data.url, data.name || null)
      } catch (e) { /* ignore */ }
    })

    console.log('[Main][search-mp3] final count:', items.length, 'items for', url)
    return { items }
  } catch (err) {
    console.error('[Main][search-mp3] error:', String(err))
    return { error: String(err) }
  }
})

// Search LostMySpace (simple query) — returns anchors found
ipcMain.handle('search-lostmyspace', async (event, { q = '' } = {}) => {
  try {
    const params = new URLSearchParams({ q })
    const url = `https://lostmyspace.com/?${params.toString()}`
    console.log('[Main][search-lostmyspace] requesting:', url)

    // Retry/backoff for transient network issues — exponential backoff with longer timeouts
    const attempts = 6
    const backoffDelays = [1000, 2000, 4000, 8000, 16000, 30000] // ms between attempts
    let lastErr = null
    let res = null
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        console.log(`[Main][search-lostmyspace] attempt ${attempt}/${attempts}...`)
        res = await fetch(url, {
          timeout: 90000, // increased timeout
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        })
        console.log(`[Main][search-lostmyspace] attempt ${attempt} status:`, res.status)
        if (res && res.ok) break
        lastErr = new Error(`HTTP ${res.status}`)
      } catch (e) {
        console.log(`[Main][search-lostmyspace] attempt ${attempt} failed:`, e.message)
        lastErr = e
      }
      // exponential backoff before retrying
      if (attempt < attempts) {
        const wait = backoffDelays[attempt - 1] || 30000
        console.log(`[Main][search-lostmyspace] waiting ${wait}ms before retry...`)
        await new Promise((r) => setTimeout(r, wait))
      }
    }

    if (!res || !res.ok) {
      console.error('[Main][search-lostmyspace] all attempts failed')
      return { error: lastErr ? String(lastErr) : 'Network error' }
    }

    const html = await res.text()
    console.log('[Main][search-lostmyspace] HTML length:', html.length)

    const $ = cheerio.load(html)
    const items = []
    const pushIfNew = (link, title) => {
      if (!link || link.trim() === '') return
      try {
        const absolute = new URL(link, url).toString()
        if (!items.find(i => i.url === absolute)) {
          items.push({ title: title || absolute.split('/').pop() || 'track', url: absolute })
          console.log('[Main][search-lostmyspace] added:', absolute, 'title:', title)
        }
      } catch (e) { 
        console.log('[Main][search-lostmyspace] invalid URL:', link, e.message)
      }
    }

    // anchors with .mp3 or music keywords
    $('a[href]').each((i, el) => {
      const href = $(el).attr('href')
      const text = $(el).text().trim()
      if (!href) return
      const lower = href.toLowerCase()
      const textLower = text.toLowerCase()
      if (lower.endsWith('.mp3') || lower.endsWith('.ogg') || lower.endsWith('.m4a') || lower.endsWith('.flac')) {
        pushIfNew(href, text || null)
      } else if (lower.includes('myspace') || lower.includes('music') || lower.includes('artist') || 
                 lower.includes('band') || textLower.includes('play') || textLower.includes('listen')) {
        pushIfNew(href, text || null)
      } else if (lower.includes('download') || lower.includes('archive') || lower.includes('files')) {
        pushIfNew(href, text || null)
      }
    })

    // audio tags
    $('audio').each((i, el) => {
      const src = $(el).attr('src')
      if (src) pushIfNew(src, null)
      $(el).find('source[src]').each((j, srcEl) => {
        const s = $(srcEl).attr('src')
        if (s) pushIfNew(s, null)
      })
    })

    // iframes
    $('iframe[src]').each((i, el) => {
      const src = $(el).attr('src')
      pushIfNew(src, null)
    })

    // data attributes
    $('[data-src], [data-href], [data-music], [data-audio]').each((i, el) => {
      const s = $(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-music') || $(el).attr('data-audio')
      pushIfNew(s, null)
    })

    // check for tables/divs with music data
    $('tr, .track, .song, .music-item, [class*="track"], [class*="song"]').each((i, el) => {
      $(el).find('a[href]').each((j, aEl) => {
        const href = $(aEl).attr('href')
        const text = $(aEl).text().trim()
        const lower = href ? href.toLowerCase() : ''
        if (lower.includes('.mp3') || lower.includes('music') || lower.includes('download')) {
          pushIfNew(href, text || null)
        }
      })
    })

    // embedded JSON
    $('script[type="application/json"], script[type="application/ld+json"]').each((i, el) => {
      try {
        const data = JSON.parse($(el).text())
        if (data && typeof data === 'object') {
          if (data.url) pushIfNew(data.url, data.name || null)
          if (data.audio) pushIfNew(data.audio, null)
          if (data.musicURL) pushIfNew(data.musicURL, null)
        }
      } catch (e) { /* ignore */ }
    })

    console.log('[Main][search-lostmyspace] final count:', items.length, 'items for', url)
    return { items }
  } catch (err) {
    console.error('[Main][search-lostmyspace] error:', String(err))
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
      fileStream.on('finish', () => {
        // notify renderer that download completed
        try {
          event.sender.send('download-complete', { url, filename: safeName, path: fullPath })
        } catch (e) { /* best-effort */ }
        resolve({ path: fullPath })
      })
      fileStream.on('error', (e) => {
        try {
          event.sender.send('download-complete', { url, filename: safeName, error: String(e) })
        } catch (err) { /* ignore */ }
        reject({ error: String(e) })
      })
    })
  } catch (err) {
    return { error: String(err) }
  }
})

// Probe resource to determine content-type and try to find direct audio links when pages require JS "load" buttons
ipcMain.handle('probe-resource', async (event, { url } = {}) => {
  try {
    console.log('[Main][probe-resource] probing:', url)
    // Try HEAD first to get content-type
    let ct = ''
    try {
      const headRes = await fetch(url, { method: 'HEAD', timeout: 10000 })
      if (headRes && headRes.ok) ct = headRes.headers.get('content-type') || ''
      console.log('[Main][probe-resource] HEAD content-type:', ct)
    } catch (e) {
      console.log('[Main][probe-resource] HEAD failed, will try GET:', e.message)
      // HEAD may be blocked; fall back to GET below
    }

    // If HEAD suggests audio, return immediately
    if (ct && ct.split(';')[0].trim().startsWith('audio/')) {
      console.log('[Main][probe-resource] detected audio via HEAD')
      return { type: 'audio', contentType: ct, url }
    }

    // Fetch the body to inspect HTML and try to locate a direct audio URL
    const res = await fetch(url, { timeout: 20000 })
    if (!res.ok) {
      console.log('[Main][probe-resource] fetch failed:', res.status)
      return { error: `HTTP ${res.status}` }
    }
    const contentType = res.headers.get('content-type') || ''
    console.log('[Main][probe-resource] GET content-type:', contentType)
    if (contentType.split(';')[0].trim().startsWith('audio/')) {
      console.log('[Main][probe-resource] detected audio via GET')
      return { type: 'audio', contentType, url }
    }

    const body = await res.text()
    console.log('[Main][probe-resource] body length:', body.length)
    // If HTML, parse and look for audio tags, anchors to .mp3, or scripts containing media urls
    if (contentType.includes('text/html') || /<\s*html/i.test(body)) {
      console.log('[Main][probe-resource] detected HTML, searching for audio links')
      const $ = cheerio.load(body)
      // try audio tags first
      const candidates = []
      $('audio source[src], audio[src]').each((i, el) => {
        const s = $(el).attr('src')
        if (s) {
          candidates.push(s)
          console.log('[Main][probe-resource] found audio tag src:', s)
        }
      })
      // anchors pointing to mp3
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href')
        if (href && href.toLowerCase().includes('.mp3')) {
          candidates.push(href)
          console.log('[Main][probe-resource] found mp3 link:', href)
        }
      })
      // iframes
      $('iframe[src]').each((i, el) => {
        const s = $(el).attr('src')
        if (s && s.toLowerCase().includes('.mp3')) {
          candidates.push(s)
          console.log('[Main][probe-resource] found iframe src:', s)
        }
      })

      // normalize and test candidates for absolute url
      for (const c of candidates) {
        try {
          const absolute = new URL(c, url).toString()
          // lightweight HEAD check for audio
          try {
            const h = await fetch(absolute, { method: 'HEAD', timeout: 8000 })
            const ct2 = h.headers.get('content-type') || ''
            if (ct2.split(';')[0].trim().startsWith('audio/')) {
              console.log('[Main][probe-resource] candidate confirmed audio:', absolute)
              return { type: 'audio', contentType: ct2, url: absolute }
            }
          } catch (e) {
            console.log('[Main][probe-resource] candidate HEAD failed:', absolute, e.message)
            // ignore candidate if HEAD fails
          }
        } catch (e) {
          console.log('[Main][probe-resource] invalid candidate URL:', c, e.message)
        }
      }

      // nothing found — page likely requires JS interaction (load button)
      console.log('[Main][probe-resource] no direct audio found, page likely needs JS')
      return { type: 'html', contentType, needsInteraction: true }
    }

    console.log('[Main][probe-resource] unknown type')
    return { type: 'unknown', contentType }
  } catch (err) {
    console.error('[Main][probe-resource] error:', String(err))
    return { error: String(err) }
  }
})

ipcMain.handle('open-external', async (event, url) => {
  try {
    const { shell } = require('electron')
    await shell.openExternal(url)
    return { ok: true }
  } catch (e) {
    return { error: String(e) }
  }
})

// Soulseek: check server, search and download handlers
ipcMain.handle('soulseek-check', async (event, { host = 'server.slsknet.org', port = 2242 } = {}) => {
  try {
    const res = await soulseek.checkServer(host, port, 5000)
    return res
  } catch (e) {
    return { ok: false, error: String(e) }
  }
})

ipcMain.handle('soulseek-has-client', async () => {
  return { available: soulseek.hasClient }
})

ipcMain.handle('soulseek-search', async (event, { host, port, username, password, query } = {}) => {
  if (!soulseek.hasClient) return { error: 'missing-soulseek-lib', message: 'No Soulseek client library installed. Install a compatible package (e.g. slsk-client) and restart the app.' }
  try {
    const client = await soulseek.createClient({ host, port, username, password })
    if (!client) return { error: 'client-init-failed' }
    // library-specific API: attempt common patterns (promisify callback APIs)
    if (client.search) {
      return await new Promise((resolve) => {
        try {
          client.search({ req: query, timeout: 5000 }, (err, res) => {
            if (err) return resolve({ error: String(err) })
            return resolve({ items: res || [] })
          })
        } catch (e) { return resolve({ error: String(e) }) }
      })
    }
    if (client.find) {
      return await new Promise((resolve) => {
        try {
          client.find(query, (err, res) => {
            if (err) return resolve({ error: String(err) })
            return resolve({ items: res || [] })
          })
        } catch (e) { return resolve({ error: String(e) }) }
      })
    }
    return { error: 'unsupported-client-api' }
  } catch (e) {
    return { error: String(e), stack: e && e.stack ? String(e.stack) : undefined }
  }
})

ipcMain.handle('soulseek-download', async (event, payload = {}) => {
  const { fileId, file, peer, destination, creds } = payload || {}
  if (!soulseek.hasClient) return { error: 'missing-soulseek-lib' }
  try {
    const client = await soulseek.createClient(creds)
    if (!client) return { error: 'client-init-failed' }

    // Normalize incoming file object from several possible shapes.
    // Many clients expect the full search-result object (with `user`, `slots`, etc.),
    // so preserve the original object when provided. If a raw string is passed,
    // convert it into an object { file: string } to keep a consistent shape.
    let fileObj = null
    let originalItem = null
    if (fileId && typeof fileId === 'object') {
      originalItem = fileId
      fileObj = fileId // keep full object (client often expects user + file fields)
    } else if (fileId && typeof fileId === 'string') {
      fileObj = { file: fileId }
    } else if (file && typeof file === 'object') {
      originalItem = file
      fileObj = file
    } else if (file && typeof file === 'string') {
      fileObj = { file }
    }

    if (!fileObj) {
      if (fileId && typeof fileId === 'string' && peer) {
        return { error: 'missing-file-object', message: 'Provide the original search result object (contains `file` and `user`).' }
      }
      return { error: 'missing-file-object', message: 'Provide the search result file object when requesting download.' }
    }

    const filePathStr = (typeof fileObj === 'string') ? fileObj : (fileObj.file || fileObj.path || fileObj.name || fileObj.filename || '')
    const filename = (filePathStr || '').toString().replace(/^@@/, '').split(/[\\/]/).pop() || `slsk_${Date.now()}`

    // Normalize destination: accept folder or full file path
    let outPath = ''
    if (destination) {
      try {
        if (fs.existsSync(destination) && fs.lstatSync(destination).isDirectory()) {
          outPath = path.join(destination, filename)
        } else if (String(destination).endsWith('/') || String(destination).endsWith('\\')) {
          outPath = path.join(destination, filename)
        } else {
          outPath = destination
        }
      } catch (e) {
        outPath = destination
      }
    } else {
      outPath = path.join(app.getPath('downloads') || os.tmpdir(), filename)
    }

    // Prepare logs directory
    try { fs.mkdirSync(path.join(__dirname, '..', 'build', 'logs'), { recursive: true }) } catch (e) { }

    // If client provides downloadStream (preferred) use it. Add timeouts
    if (typeof client.downloadStream === 'function') {
      try {
        const stream = await new Promise((resolve, reject) => {
          let settled = false
          const timer = setTimeout(() => {
            if (!settled) {
              settled = true
              return reject(new Error('downloadStream-callback-timeout'))
            }
          }, 30000)
          try {
            client.downloadStream({ file: fileObj }, (err, s) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              if (err) return reject(err)
              return resolve(s)
            })
          } catch (e) {
            if (!settled) { settled = true; clearTimeout(timer); reject(e) }
          }
        })

        return await new Promise((resolve) => {
          try {
            const ws = fs.createWriteStream(outPath)
            let received = 0
            let finished = false
            const streamTimer = setTimeout(() => {
              if (!finished) {
                finished = true
                try { ws.end() } catch (e) {}
                const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-stream-timeout-${Date.now()}.log`)
                try { fs.writeFileSync(logPath, 'stream end timeout\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (e) {}
                return resolve({ error: 'stream-timeout', log: logPath })
              }
            }, 5 * 60 * 1000)

            stream.on('data', (chunk) => {
              received += chunk.length
              try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('soulseek-download-progress', { filename, received }) } catch (e) {}
            })
            stream.on('end', () => { if (finished) return; finished = true; clearTimeout(streamTimer); ws.end(); resolve({ ok: true, path: outPath }) })
            stream.on('error', (err) => {
              if (finished) return; finished = true; clearTimeout(streamTimer)
              try { ws.end() } catch (e) {}
              const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-${Date.now()}.log`)
              try { fs.writeFileSync(logPath, String(err.stack || err) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (e) {}
              return resolve({ error: String(err), log: logPath })
            })
            stream.pipe(ws)
          } catch (e) {
            const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-init-${Date.now()}.log`)
            try { fs.writeFileSync(logPath, String(e.stack || e) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (er) {}
            return resolve({ error: String(e), log: logPath })
          }
        })
      } catch (e) {
        const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-init-${Date.now()}.log`)
        try { fs.writeFileSync(logPath, String(e.stack || e) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (er) {}
        return { error: String(e), log: logPath }
      }
    }

    // Fallback: callback-based download
    if (typeof client.download === 'function') {
      return await new Promise((resolve) => {
        try {
          let settled = false
          const cbTimer = setTimeout(() => {
            if (!settled) {
              settled = true
              const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-cb-timeout-${Date.now()}.log`)
              try { fs.writeFileSync(logPath, 'download callback timeout\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (e) {}
              return resolve({ error: 'download-cb-timeout', log: logPath })
            }
          }, 120000)

          client.download({ file: fileObj, path: outPath }, (err, data) => {
            if (settled) return
            settled = true
            clearTimeout(cbTimer)
            if (err) {
              const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-cb-${Date.now()}.log`)
              try { fs.writeFileSync(logPath, String(err.stack || err) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (e) {}
              return resolve({ error: String(err), log: logPath })
            }
            try {
              if (Buffer.isBuffer(data)) { fs.writeFileSync(outPath, data); return resolve({ ok: true, path: outPath }) }
              return resolve({ ok: true, path: outPath })
            } catch (e) {
              const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-write-${Date.now()}.log`)
              try { fs.writeFileSync(logPath, String(e.stack || e) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (er) {}
              return resolve({ error: String(e), log: logPath })
            }
          })
        } catch (e) {
          const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-throw-${Date.now()}.log`)
          try { fs.writeFileSync(logPath, String(e.stack || e) + '\n\n' + JSON.stringify({ fileObj }, null, 2)) } catch (er) {}
          return resolve({ error: String(e), log: logPath })
        }
      })
    }

    return { error: 'unsupported-client-download', message: 'Client does not expose download or downloadStream methods.' }
  } catch (e) {
    const logPath = path.join(__dirname, '..', 'build', 'logs', `soulseek-download-exception-${Date.now()}.log`)
    try { fs.writeFileSync(logPath, String(e.stack || e) + '\n\n' + JSON.stringify({ payload: payload }, null, 2)) } catch (er) {}
    return { error: String(e), log: logPath, stack: e && e.stack ? String(e.stack) : undefined }
  }
})