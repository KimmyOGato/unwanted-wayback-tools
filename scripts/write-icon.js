const fs = require('fs');
const path = require('path');

const base64Path = path.join(__dirname, '..', 'build', 'icon.base64.txt');
const outPng = path.join(__dirname, '..', 'build', 'icon.png');
const svgPath = path.join(__dirname, '..', 'build', 'icon.svg');

if (!fs.existsSync(path.dirname(outPng))) fs.mkdirSync(path.dirname(outPng), { recursive: true });

// If an SVG icon exists, prefer it and skip writing the base64 placeholder.
if (fs.existsSync(svgPath)) {
	console.log('Found build/icon.svg — skipping base64 PNG write.');
	// Do not attempt to convert here; CI or local user should convert SVG to PNG (e.g., ImageMagick or png-to-ico will be used later).
	process.exit(0);
}

if (!fs.existsSync(base64Path)) {
	console.error('Base64 icon not found at', base64Path);
	process.exit(1);
}

const b64 = fs.readFileSync(base64Path, 'utf8').trim();
const buf = Buffer.from(b64, 'base64');
fs.writeFileSync(outPng, buf);
console.log('Wrote', outPng);
