const fs = require('fs')
const path = require('path')
const fetch = require('node-fetch')

async function fetchUrl(u) {
  try {
    console.log('Fetching', u)
    const res = await fetch(u, { timeout: 60000, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } })
    if (!res.ok) {
      console.error('HTTP', res.status)
      return null
    }
    const html = await res.text()
    return html
  } catch (err) {
    console.error('Error fetching', u, String(err))
    return null
  }
}

(async () => {
  const args = process.argv.slice(2)
  if (args.length === 0) {
    console.error('Usage: node fetch-lostmyspace.js <url> [<url> ...]')
    process.exit(1)
  }
  const outDir = path.join(__dirname, '..', 'build')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

    // Removed: helper used during LostMySpace investigation
  process.exit(0)
})()
