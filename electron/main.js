const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
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

// Detect development mode: check if dist folder exists and has index.html
// If not, we're in dev mode; also check NODE_ENV
let isDev = !fs.existsSync(path.join(__dirname, '../dist/index.html')) || process.env.NODE_ENV === 'development'

console.log('[Main] isDev:', isDev)
console.log('[Main] NODE_ENV:', process.env.NODE_ENV)
console.log('[Main] dist/index.html exists:', fs.existsSync(path.join(__dirname, '../dist/index.html')))

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

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
  // Support single link (string) or array of links for deeper search
  const links = Array.isArray(inputLink) ? inputLink.slice(0, 50) : [inputLink]
  const aggregate = []
  const seen = new Set()

  for (const l of links) {
    const { original } = parseWaybackInput(l)
    if (!original) continue

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