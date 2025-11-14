const net = require('net')
const os = require('os')
const path = require('path')
const fs = require('fs')

// Ensure common temp directories exist — `slsk-client` may attempt to mkdir '/tmp/slsk'
// which can fail on Windows. Create both '/tmp/slsk' and a platform temp subfolder.
try {
  try { fs.mkdirSync('/tmp/slsk', { recursive: true }) } catch (e) { /* ignore */ }
  const localTmp = path.join(os.tmpdir(), 'slsk')
  try { fs.mkdirSync(localTmp, { recursive: true }) } catch (e) { /* ignore */ }
  // Point common env vars to our temp folder so libraries pick it up on Windows
  process.env.TMPDIR = localTmp
  process.env.TEMP = localTmp
  process.env.TMP = localTmp
} catch (e) {
  // Non-fatal — continue and let connect fail with a meaningful error
}

/**
 * Lightweight wrapper that attempts to use an optional Soulseek client library if installed.
 * If no library is present, it will provide a minimal connectivity check and friendly errors.
 */
let clientLib = null
try {
  // try common package names
  clientLib = require('slsk-client') || require('node-slsk') || require('slsk')
} catch (e) {
  clientLib = null
}

async function checkServer(host = 'server.slsknet.org', port = 2242, timeout = 5000) {
  return new Promise((resolve) => {
    const s = new net.Socket()
    let done = false
    s.setTimeout(timeout)
    s.once('connect', () => {
      done = true
      s.destroy()
      resolve({ ok: true })
    })
    s.once('error', (err) => {
      if (done) return
      done = true
      resolve({ ok: false, error: String(err) })
    })
    s.once('timeout', () => {
      if (done) return
      done = true
      s.destroy()
      resolve({ ok: false, error: 'timeout' })
    })
    s.connect(port, host)
  })
}

async function createClient(opts = {}) {
  if (!clientLib) throw new Error('missing-soulseek-lib')

  // slsk-client exports an object with connect(opts, cb)
  if (clientLib && typeof clientLib.connect === 'function') {
    return new Promise((resolve, reject) => {
      try {
        clientLib.connect({ user: opts.username || opts.user, pass: opts.password || opts.pass, host: opts.host, port: opts.port, incomingPort: opts.incomingPort }, (err, client) => {
          if (err) return reject(err)
          resolve(client)
        })
      } catch (e) { reject(e) }
    })
  }

  // Some libraries export a constructor/factory
  if (typeof clientLib === 'function') {
    return clientLib(opts)
  }
  if (clientLib && clientLib.createClient) return clientLib.createClient(opts)
  throw new Error('unsupported-soulseek-lib')
}

module.exports = {
  checkServer,
  createClient,
  hasClient: !!clientLib
}
