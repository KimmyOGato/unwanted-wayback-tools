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
let keytar
try {
  keytar = require('keytar')
  console.log('[Main] keytar available for secure credential storage')
} catch (e) {
  console.log('[Main] keytar not available:', e && e.message)
  keytar = null
}

// Expose registration helpers if the soulseek wrapper supports them
try {
  const canReg = soulseek.canRegister && soulseek.canRegister()
  console.log('[Main] soulseek.canRegister:', canReg)
} catch (e) {
  console.log('[Main] soulseek.canRegister check failed:', e && e.message)
}

// Detect development mode: check if dist folder exists and has index.html
// If not, we're in dev mode; also check NODE_ENV
// Determine dev mode:
// - If running the `electron-dev` npm script (concurrently starts Vite + Electron),
//   npm sets `npm_lifecycle_event='electron-dev'`, so treat that as dev.
// - Or if NODE_ENV==='development' or dist/index.html is missing.
let isDev = process.env.NODE_ENV === 'development' || process.env.npm_lifecycle_event === 'electron-dev' || !fs.existsSync(path.join(__dirname, '../dist/index.html'))

console.log('[Main] isDev:', isDev)
console.log('[Main] NODE_ENV:', process.env.NODE_ENV)
console.log('[Main] npm_lifecycle_event:', process.env.npm_lifecycle_event)
console.log('[Main] dist/index.html exists:', fs.existsSync(path.join(__dirname, '../dist/index.html')))

let mainWindow = null

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
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
    // Load Vite dev server
    console.log('[Main] Loading from dev server: http://localhost:5173')
    win.loadURL('http://localhost:5173')
    try { win.webContents.openDevTools() } catch (e) { /* ignore */ }
  } else {
    // Load the built index.html
    const filePath = path.join(__dirname, '../dist/index.html')
    console.log('[Main] Loading from file:', filePath)
    win.loadFile(filePath)
    // Allow forcing DevTools via command-line flags for debugging (temporary)
    if (process.argv.some(a => a && (a === '--debug' || a === '--force-devtools' || a === '--open-devtools'))) {
      try { win.webContents.openDevTools() } catch (e) {}
    }

    // Forward renderer console messages to main process terminal for easier capture
    try {
      win.webContents.on('console-message', (e, level, message, line, sourceId) => {
        console.log(`[Renderer][console:${level}] ${message} (${sourceId}:${line})`)
      })
    } catch (e) {
      console.error('[Main] Failed to register console-message listener', e)
    }

    // Inject global error handlers into renderer so uncaught errors are logged to console
    try {
      win.webContents.on('did-finish-load', () => {
        try {
          win.webContents.executeJavaScript(`
            window.addEventListener('error', (e) => {
              try { console.error('[Renderer][window.error]', e.message, e.filename + ':' + e.lineno) } catch (err) {}
            });
            window.addEventListener('unhandledrejection', (e) => {
              try { console.error('[Renderer][unhandledrejection]', e.reason) } catch (err) {}
            });
          `).catch(() => {})
        } catch (err) {}
      })
    } catch (e) {
      console.error('[Main] Failed to inject renderer error handlers', e)
    }
  }

  // Handle renderer crashes
  win.webContents.on('crashed', () => console.error('[Main] Renderer process crashed'))

  win.on('closed', () => { if (mainWindow === win) mainWindow = null })
  // Emit window state events so renderer can update maximize/restore UI
  try {
    win.on('maximize', () => { try { win.webContents.send('window-is-maximized', true) } catch (e) {} })
    win.on('unmaximize', () => { try { win.webContents.send('window-is-maximized', false) } catch (e) {} })
  } catch (e) {
    console.error('[Main] Failed to register window state events', e)
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

async function getResourcesFromArchivedPage(stamp, original, limit = 12) {
  try {
    // Helper: parse a single archived page body and extract resource items with context
    const parseBody = (body, usedStamp) => {
      const $ = cheerio.load(body)
      const candidates = []

      const pushCandidateRaw = (link, ctx) => {
        if (!link) return
        try {
          // Normalize web.archive.org prefixed links
          const m = String(link).match(/\/web\/(\d+)[^\/]*\/(https?:\/\/.+)$/)
          if (m) {
            candidates.push({ link: m[2], ctx })
            return
          }
          const absolute = new URL(link, original).toString()
          candidates.push({ link: absolute, ctx })
        } catch (e) {
          // ignore
        }
      }

      // Page-level metadata
      const pageTitle = ($('title').text() || '').trim()
      const metaOgImage = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || null
      const metaDate = ($('meta[property="article:published_time"]').attr('content') || $('meta[name="date"]').attr('content') || $('meta[name="publishdate"]').attr('content') || null)

      // Collect images from many patterns
      // img, data-src, srcset, picture/source
      $('img[src], img[data-src]').each((i, el) => pushCandidateRaw($(el).attr('src') || $(el).attr('data-src'), { type: 'img' }))
      $('picture source[src], picture source[srcset], source[src], source[srcset], img[srcset], [data-srcset]').each((i, el) => {
        const s = $(el).attr('src') || $(el).attr('srcset') || $(el).attr('data-srcset')
        if (!s) return
        s.split(',').forEach(part => {
          const urlPart = part.trim().split(' ')[0]
          pushCandidateRaw(urlPart, { type: 'img' })
        })
      })

      // meta og:image and link rel
      if (metaOgImage) pushCandidateRaw(metaOgImage, { type: 'meta' })
      const linkImage = $('link[rel="image_src"]').attr('href') || null
      if (linkImage) pushCandidateRaw(linkImage, { type: 'meta' })

      // audio/video tags
      $('audio source[src], audio[src], video source[src], video[src]').each((i, el) => pushCandidateRaw($(el).attr('src'), { type: 'media' }))

      // anchors that look like media
      $('a[href]').each((i, el) => {
        const href = $(el).attr('href')
        if (!href) return
        const lower = href.toLowerCase()
        if (lower.match(/\.(jpg|jpeg|png|gif|webp|bmp|svg|mp3|ogg|m4a|wav|mp4|mov)(\?|$)/) || lower.includes('media') || lower.includes('files')) {
          pushCandidateRaw(href, { type: 'link', text: $(el).text().trim() || null })
        }
      })

      // data attributes and inline styles
      $('[data-src], [data-href], [data-url]').each((i, el) => pushCandidateRaw($(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-url'), { type: 'data' }))
      $('*[style]').each((i, el) => {
        const st = $(el).attr('style') || ''
        const m = st.match(/background-image:\s*url\(['"]?([^'\")]+)['"]?\)/i)
        if (m && m[1]) pushCandidateRaw(m[1], { type: 'style' })
      })

      // For grouping: try to find section headings or gallery containers near each image
      const resolved = []
      for (const c of candidates) {
        try {
          const abs = new URL(c.link, original).toString()
          // Determine context: find nearest ancestor with class indicating gallery or a figure tag
          let groupTitle = null
          try {
            const el = $(`[src="${c.link}"]`).first()
            let node = el
            if (!node || node.length === 0) {
              // try by href
              node = $(`a[href="${c.link}"]`).first()
            }
            if (node && node.length > 0) {
              // climb up to find a header or gallery container
              let parent = node.parent()
              let found = null
              for (let i=0;i<6 && parent && parent.length>0;i++) {
                const cls = (parent.attr('class') || '').toLowerCase()
                if (cls && (cls.includes('gallery') || cls.includes('album') || cls.includes('photos') || cls.includes('track') || cls.includes('figure') || cls.includes('gallery-item'))) {
                  found = parent; break
                }
                parent = parent.parent()
              }
              if (found) {
                const h = found.find('h1,h2,h3').first()
                if (h && h.length>0) groupTitle = h.text().trim()
              }
              if (!groupTitle) {
                // fallback to nearest heading before the node
                const prevHead = node.prevAll('h1,h2,h3').first()
                if (prevHead && prevHead.length>0) groupTitle = prevHead.text().trim()
              }
            }
          } catch (e) { /* ignore context extraction errors */ }

          // If still no groupTitle, use pageTitle
          if (!groupTitle) groupTitle = pageTitle || null

          // Year from usedStamp if available
          let year = null
          try {
            if (usedStamp && /^\d{4}/.test(usedStamp)) year = usedStamp.substring(0,4)
            else if (metaDate && /^\d{4}/.test(metaDate)) year = metaDate.substring(0,4)
          } catch (e) { }

          // guess mimetype from extension
          let mimetype = null
          try {
            const p = new URL(abs).pathname
            const ext = (p.split('.').pop() || '').toLowerCase()
            const map = {
              jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
              mp3: 'audio/mpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', wav: 'audio/wav',
              mp4: 'video/mp4', mov: 'video/quicktime'
            }
            mimetype = map[ext] || null
          } catch (e) { mimetype = null }

          resolved.push({ original: abs, archived: (usedStamp && usedStamp !== '*') ? `https://web.archive.org/web/${usedStamp}/${abs}` : `https://web.archive.org/web/*/${abs}`, mimetype, timestamp: usedStamp || null, groupTitle, groupYear: year })
        } catch (e) {}
      }

      return resolved
    }

    // If stamp is missing or wildcard, query CDX to obtain capture stamps for the original page
    const items = []
    if (!stamp || stamp === '*' || String(stamp).trim() === '') {
      try {
        const cdxQuery = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(original)}&output=json&fl=timestamp,original&filter=statuscode:200&limit=${Number(limit||12)}`

        // Simple file cache for CDX responses to reduce repeated queries
        let cdxJson = null
        try {
          const cacheDir = path.join(app.getPath('userData') || os.tmpdir(), 'cdx-cache')
          try { fs.mkdirSync(cacheDir, { recursive: true }) } catch (e) {}
          const safeName = encodeURIComponent(original).replace(/[%]/g, '_')
          const cacheFile = path.join(cacheDir, `${safeName}.json`)
          let useCache = false
          try {
            if (fs.existsSync(cacheFile)) {
              const raw = fs.readFileSync(cacheFile, 'utf8')
              const obj = JSON.parse(raw)
              if (obj && obj.fetchedAt && Date.now() - obj.fetchedAt < 24 * 3600 * 1000 && obj.cdxJson) {
                cdxJson = obj.cdxJson
                useCache = true
              }
            }
          } catch (e) { /* ignore cache read errors */ }

          if (!useCache) {
            const cdxRes = await fetch(cdxQuery, { timeout: 20000 })
            if (cdxRes && cdxRes.ok) {
              cdxJson = await cdxRes.json()
              try {
                fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: Date.now(), cdxJson }), 'utf8')
              } catch (e) { /* ignore write errors */ }
            }
          }
        } catch (e) {
          // if cache logic fails, fall back to direct fetch
          try {
            const cdxRes = await fetch(cdxQuery, { timeout: 20000 })
            if (cdxRes && cdxRes.ok) cdxJson = await cdxRes.json()
          } catch (er) { /* ignore */ }
        }
        if (cdxJson) {
          // first row may be header if output=json
          // Collect timestamps to fetch (skip header row)
          const tsList = []
          for (let i = 1; i < Math.min(cdxJson.length, Number(limit||12)); i++) {
            const row = cdxJson[i]
            if (!row || !row[0]) continue
            tsList.push(row[0])
          }

          // Fetch archived pages in batches with limited concurrency
          const concurrency = 4
          for (let i = 0; i < tsList.length; i += concurrency) {
            const batch = tsList.slice(i, i + concurrency)
            const promises = batch.map(async (ts) => {
              try {
                const archivedPage = `https://web.archive.org/web/${ts}/${original}`
                const r = await fetch(archivedPage, { timeout: 20000 })
                if (!r || !r.ok) return []
                const body = await r.text()
                return parseBody(body, ts)
              } catch (e) {
                return []
              }
            })
            try {
              const results = await Promise.all(promises)
              for (const arr of results) {
                for (const p of arr) items.push(p)
              }
            } catch (e) {
              // ignore batch errors
            }
          }
        }
      } catch (e) {
        // fallback: return empty
      }
      return { items }
    }

    // Otherwise we have a specific stamp: fetch and parse once
    const archivedPage = `https://web.archive.org/web/${stamp}/${original}`
    const res = await fetch(archivedPage, { timeout: 20000 })
    if (!res.ok) return { error: `HTTP ${res.status}` }
    const body = await res.text()
    if (!/\<\s*html/i.test(body)) return { items: [] }
    const parsed = parseBody(body, stamp)
    for (const p of parsed) items.push(p)

    return { items }
  } catch (err) {
    return { error: String(err) }
  }
}

ipcMain.handle('select-folder', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow || null, { properties: ['openDirectory'] })
    if (!res) return null
    if (res.canceled) return null
    if (res.filePaths && res.filePaths.length > 0) return res.filePaths[0]
    return null
  } catch (e) {
    console.error('[Main][select-folder] error:', String(e))
    return null
  }
})

ipcMain.handle('download-resource', async (event, { url, destFolder, filename, groupTitle, groupYear }) => {
  try {
    const res = await fetch(url)
    if (!res.ok) return { error: `HTTP ${res.status}` }

    // Build target folder: if group metadata is provided, create a subfolder
    let targetFolder = destFolder
    try {
      if (groupTitle) {
        const safeGroup = String(groupTitle).replace(/[<>:"/\\|?*]+/g, '_').trim()
        const safeYear = groupYear ? String(groupYear).replace(/[<>:"/\\|?*]+/g, '_').trim() : ''
        const sub = safeYear ? `${safeGroup}_${safeYear}` : safeGroup
        targetFolder = path.join(destFolder, sub)
      }
    } catch (e) {
      // fallback to destFolder on any error
      targetFolder = destFolder
    }

    fs.mkdirSync(targetFolder, { recursive: true })

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

    const fullPath = path.join(targetFolder, safeName)

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

// Application lifecycle and menu
const isMac = process.platform === 'darwin'

function buildAppMenu() {
  const template = [
    { label: 'File', submenu: [ { role: 'quit', label: 'Quit' } ] },
    { label: 'Edit', submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { role: 'pasteAndMatchStyle' },
      { role: 'delete' },
      { role: 'selectAll' }
    ] },
    { label: 'View', submenu: [
      { role: 'reload', accelerator: 'CmdOrCtrl+R' },
      { role: 'toggledevtools', label: 'Toggle DevTools', accelerator: isMac ? 'Alt+Command+I' : 'Ctrl+Shift+I' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ] },
    { label: 'Navigate', submenu: [
      { label: 'Wayback Search', click: () => { try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('menu-open-mode', 'wayback') } catch (e) {} } },
      { label: 'MP3 Search', click: () => { try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('menu-open-mode', 'mp3') } catch (e) {} } },
      { label: 'Soulseek', click: () => { try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('menu-open-mode', 'soulseek') } catch (e) {} } },
      { label: 'Downloads', click: () => { try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('menu-open-mode', 'downloads') } catch (e) {} } },
      { label: 'Credits', click: () => { try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('menu-open-mode', 'credits') } catch (e) {} } }
    ] },
    { label: 'Window', role: 'window', submenu: [
      { role: 'minimize' },
      { role: 'zoom' },
      { type: 'separator' },
      ...(isMac ? [ { role: 'front' } ] : [ { role: 'close' } ])
    ] },
    { label: 'Help', submenu: [
      { label: 'About', click: () => { dialog.showMessageBox({ type: 'info', title: 'About', message: 'Unwanted Tools', detail: 'Built with Electron + Vite' }) } }
    ] }
  ]

  // Build and set a standard application menu so the native menu bar
  // (File / View / Navigate / Help) is visible again. On macOS we
  // prepend the app name menu for a native experience.
  try {
    if (isMac) {
      template.unshift({
        label: app.name,
        submenu: [
          { role: 'about' },
          { type: 'separator' },
          { role: 'services' },
          { type: 'separator' },
          { role: 'hide' },
          { role: 'hideothers' },
          { role: 'unhide' },
          { type: 'separator' },
          { role: 'quit' }
        ]
      })
    }

    const menu = Menu.buildFromTemplate(template)
    Menu.setApplicationMenu(menu)
  } catch (e) {
    console.error('[Main] Failed to set application menu:', e)
  }
}

// Start the app
app.whenReady().then(() => {
  buildAppMenu()
  createWindow()
  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })
}).catch((e) => {
  console.error('[Main] app.whenReady error:', String(e))
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Window control IPC handlers (used by renderer via preload)
try {
  ipcMain.on('window-minimize', () => { try { if (mainWindow) mainWindow.minimize() } catch (e) {} })
  ipcMain.on('window-toggle-maximize', () => {
    try {
      if (!mainWindow) return
      if (mainWindow.isMaximized()) { mainWindow.unmaximize(); mainWindow.webContents.send('window-is-maximized', false) }
      else { mainWindow.maximize(); mainWindow.webContents.send('window-is-maximized', true) }
    } catch (e) { console.error('[Main] window-toggle-maximize error', e) }
  })
  ipcMain.on('window-close', () => { try { if (mainWindow) mainWindow.close() } catch (e) {} })
  ipcMain.handle('window-is-maximized', () => !!(mainWindow && mainWindow.isMaximized()))
} catch (e) {
  console.error('[Main] Failed to register window IPC handlers', e)
}

// Auto-updater: wire electron-updater to renderer via IPC
try {
  if (autoUpdater) {
    // Do not auto-download by default; let renderer ask to download
    try { autoUpdater.autoDownload = false } catch (e) {}

    autoUpdater.on('checking-for-update', () => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-checking') } catch (e) {}
    })

    autoUpdater.on('update-available', (info) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-available', info) } catch (e) {}
    })

    autoUpdater.on('update-not-available', (info) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-not-available', info) } catch (e) {}
    })

    autoUpdater.on('error', (err) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-error', String(err)) } catch (e) {}
    })

    autoUpdater.on('download-progress', (progress) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-download-progress', progress) } catch (e) {}
    })

    autoUpdater.on('update-downloaded', (info) => {
      try { if (mainWindow && mainWindow.webContents) mainWindow.webContents.send('update-downloaded', info) } catch (e) {}
    })

    ipcMain.handle('check-for-updates', async () => {
      try {
        const res = await autoUpdater.checkForUpdates()
        return { ok: true, result: res }
      } catch (e) {
        console.error('[Main][updater] check-for-updates error', e)
        return { error: String(e) }
      }
    })

    ipcMain.handle('download-update', async () => {
      try {
        const res = await autoUpdater.downloadUpdate()
        return { ok: true, result: res }
      } catch (e) {
        console.error('[Main][updater] download-update error', e)
        return { error: String(e) }
      }
    })

    ipcMain.handle('cancel-update-download', async () => {
      try {
        if (typeof autoUpdater.cancelDownload === 'function') {
          await autoUpdater.cancelDownload()
          return { ok: true }
        }
        return { error: 'cancel_not_supported' }
      } catch (e) {
        console.error('[Main][updater] cancel-update-download error', e)
        return { error: String(e) }
      }
    })

    ipcMain.handle('install-update', async () => {
      try {
        // quitAndInstall may return immediately; call without forcing the app to run as admin
        try { autoUpdater.quitAndInstall(false, true) } catch (e) { try { autoUpdater.quitAndInstall() } catch (er) {} }
        return { ok: true }
      } catch (e) {
        console.error('[Main][updater] install-update error', e)
        return { error: String(e) }
      }
    })
  } else {
    // Provide no-op handlers so renderer calls don't throw if electron-updater missing
    ipcMain.handle('check-for-updates', async () => ({ error: 'updater_unavailable' }))
    ipcMain.handle('download-update', async () => ({ error: 'updater_unavailable' }))
    ipcMain.handle('cancel-update-download', async () => ({ error: 'updater_unavailable' }))
    ipcMain.handle('install-update', async () => ({ error: 'updater_unavailable' }))
  }
} catch (e) {
  console.error('[Main] Failed to initialize auto-updater IPC handlers:', e)
}

// Minimal MP3 search handler to avoid "No handler registered" errors.
// Returns an empty items array for now; can be expanded to implement real search logic.
ipcMain.handle('search-mp3', async (event, { artist = '', song = '', genre = '' } = {}) => {
  try {
    console.log('[Main][search-mp3] received opts:', { artist, song, genre })

    // Primary source: buildism.net MP3 search (site scraping)
    try {
      const params = new URLSearchParams({ artist, song, genre, submit: 'Search' })
      const url = `https://buildism.net/mp3-search/?${params.toString()}`
      console.log('[Main][search-mp3] requesting buildism:', url)
      const res = await fetch(url, { timeout: 30000, headers: { 'User-Agent': 'Mozilla/5.0' } })
      console.log('[Main][search-mp3] buildism status:', res.status)
      if (res && res.ok) {
        const html = await res.text()
        const $ = cheerio.load(html)
        const items = []
        const pushIfNew = (link, title) => {
          if (!link || !link.trim()) return
          try {
            const absolute = new URL(link, url).toString()
            if (!items.find(i => i.url === absolute)) {
              items.push({ title: title || absolute.split('/').pop() || 'audio', url: absolute })
              console.log('[Main][search-mp3] added:', absolute, 'title:', title)
            }
          } catch (e) {
            // ignore invalid urls
          }
        }

        // Look for custom audio rows (site-specific)
        $('.audio-row, .track, .song, .music-item').each((i, el) => {
          const dataUrl = $(el).attr('data-url') || $(el).attr('data-src') || $(el).find('a').attr('href')
          const title = $(el).find('.title, .track-title, .song-title').text().trim() || null
          if (dataUrl) pushIfNew(dataUrl, title)
        })

        // anchors ending with common audio extensions
        $('a[href]').each((i, el) => {
          const href = $(el).attr('href')
          if (!href) return
          const lower = href.toLowerCase()
          const text = $(el).text().trim()
          if (lower.match(/\.(mp3|ogg|m4a|flac|wav)(\?|$)/)) pushIfNew(href, text || null)
        })

        // audio/video tags
        $('audio source[src], audio[src], video source[src], video[src]').each((i, el) => {
          pushIfNew($(el).attr('src') || $(el).attr('data-src'), null)
        })

        // data attributes and JSON blobs
        $('[data-src], [data-href], [data-url]').each((i, el) => pushIfNew($(el).attr('data-src') || $(el).attr('data-href') || $(el).attr('data-url')))
        $('script[type="application/json"], script[type="application/ld+json"]').each((i, el) => {
          try {
            const data = JSON.parse($(el).text())
            if (data && typeof data === 'object') {
              if (data.url) pushIfNew(data.url, data.name || null)
              if (data.audio) pushIfNew(data.audio, null)
              if (data.musicURL) pushIfNew(data.musicURL, null)
            }
          } catch (e) { /* ignore invalid json */ }
        })

        console.log('[Main][search-mp3] final count:', items.length, 'items from buildism')
        if (items.length > 0) return { items }
      }
    } catch (err) {
      console.log('[Main][search-mp3] buildism search failed, will fallback to CDX:', String(err))
    }

    // Fallback: query Wayback CDX for .mp3 captures and filter by terms
    try {
      const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=*.mp3&output=json&fl=original,timestamp,mimetype&filter=statuscode:200&limit=500`
      console.log('[Main][search-mp3] querying CDX:', cdxUrl)
      const r2 = await fetch(cdxUrl, { timeout: 30000 })
      if (!r2 || !r2.ok) return { items: [] }
      const data = await r2.json()
      if (!Array.isArray(data) || data.length === 0) return { items: [] }

      const terms = [artist, song, genre].filter(Boolean).map(s => s.toLowerCase())
      const seen = new Set()
      const items = []
      for (const row of data) {
        if (!row || !row[0]) continue
        const original = row[0]
        const timestamp = row[1] || ''
        const mimetype = row[2] || ''
        if (seen.has(original)) continue
        seen.add(original)
        const low = original.toLowerCase()
        if (terms.length > 0) {
          let matched = false
          for (const t of terms) {
            if (!t) continue
            if (low.includes(t)) { matched = true; break }
          }
          if (!matched) continue
        }
        const archivedUrl = timestamp ? `https://web.archive.org/web/${timestamp}id_/${original}` : original
        const filename = original.split('/').pop() || original
        items.push({ url: archivedUrl, original, timestamp, mimetype, title: filename })
        if (items.length >= 200) break
      }
      return { items }
    } catch (cdxErr) {
      console.error('[Main][search-mp3] CDX fallback failed:', String(cdxErr))
      return { items: [] }
    }

  } catch (e) {
    console.error('[Main][search-mp3] error:', String(e))
    return { error: String(e) }
  }
})

// Minimal fetch-resources handler used by the renderer to retrieve items from a link.
// In the full app this resolves Wayback pages and extracts resources; here we return an empty set.
ipcMain.handle('fetch-resources', async (event, link, filters = {}) => {
  try {
    console.log('[Main][fetch-resources] link:', link, 'filters:', filters)
    // If link looks like a web.archive.org capture, try to parse resources
    try {
      const parsed = parseWaybackInput(link || '')
      if (parsed && parsed.original) {
        const res = await getResourcesFromArchivedPage(parsed.stamp || '*', parsed.original, filters && filters.limit ? Number(filters.limit) : 12)
        if (res && res.items) return { items: res.items }
      }
    } catch (e) {
      // fallthrough to empty
    }
    return { items: [] }
  } catch (e) {
    console.error('[Main][fetch-resources] error:', String(e))
    return { error: String(e) }
  }
})

// Soulseek credentials storage using OS keychain (keytar)
const SOULSEEK_SERVICE = 'unwanted-tools-soulseek'

ipcMain.handle('soulseek-store-creds', async (event, creds = {}) => {
  if (!keytar) return { error: 'secure storage not available' }
  try {
    // store the whole creds object as JSON under a single account name
    const payload = JSON.stringify(creds || {})
    await keytar.setPassword(SOULSEEK_SERVICE, 'soulseek', payload)
    return { ok: true }
  } catch (e) {
    console.error('[Main][soulseek-store-creds] error:', e)
    return { error: String(e) }
  }
})

ipcMain.handle('soulseek-get-creds', async () => {
  if (!keytar) return { error: 'secure storage not available' }
  try {
    const payload = await keytar.getPassword(SOULSEEK_SERVICE, 'soulseek')
    if (!payload) return { ok: false }
    try {
      const obj = JSON.parse(payload)
      return { ok: true, creds: obj }
    } catch (e) {
      // fallback: return raw string as password field
      return { ok: true, creds: { password: payload } }
    }
  } catch (e) {
    console.error('[Main][soulseek-get-creds] error:', e)
    return { error: String(e) }
  }
})

ipcMain.handle('soulseek-delete-creds', async () => {
  if (!keytar) return { error: 'secure storage not available' }
  try {
    const deleted = await keytar.deletePassword(SOULSEEK_SERVICE, 'soulseek')
    return { ok: !!deleted }
  } catch (e) {
    console.error('[Main][soulseek-delete-creds] error:', e)
    return { error: String(e) }
  }
})

// Check whether registration is supported by the installed client library
ipcMain.handle('soulseek-can-register', async () => {
  try {
    if (soulseek && typeof soulseek.canRegister === 'function') return { ok: !!soulseek.canRegister() }
    return { ok: false }
  } catch (e) {
    return { error: String(e) }
  }
})

// Attempt to create/register an account using the client library (best-effort)
ipcMain.handle('soulseek-create-account', async (event, opts = {}) => {
  try {
    if (!soulseek || typeof soulseek.registerAccount !== 'function') return { error: 'registration_not_supported' }
    const res = await soulseek.registerAccount(opts)
    return res
  } catch (e) {
    console.error('[Main][soulseek-create-account] error:', e)
    return { error: String(e) }
  }
})

ipcMain.handle('soulseek-check-username', async (event, opts = {}) => {
  try {
    if (!soulseek || typeof soulseek.checkUsernameAvailable !== 'function') return { error: 'check_not_supported' }
    const res = await soulseek.checkUsernameAvailable(opts)
    return res
  } catch (e) {
    console.error('[Main][soulseek-check-username] error:', e)
    return { error: String(e) }
  }
})