// Bundles the whole app into one self-contained HTML file (for file:// use on a phone).
// Run: node tools/build-single.js [outputPath]
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const out = process.argv[2] || path.join(root, 'MyLifeOS.html');
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const svg = read('icons/icon.svg').replace(/\s+/g, ' ').trim();
const iconData = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
html = html
  .replace(/\s*<link rel="manifest"[^>]*>/, '')
  .replace(/<link rel="icon"[^>]*>/, '<link rel="icon" href="' + iconData + '" type="image/svg+xml">')
  .replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '')
  .replace(/<link rel="stylesheet" href="css\/app.css">/, () => '<style>\n' + read('css/app.css') + '\n</style>')
  .replace(/<script src="([^"]+)"><\/script>/g, (m, src) => '<script>\n' + read(src).replace(/<\/script/gi, '<\/script') + '\n</script>');
if (/src="js\//.test(html) || /href="css\//.test(html)) throw new Error('unresolved reference left in bundle');
fs.writeFileSync(out, html);
console.log('wrote', out, Math.round(fs.statSync(out).size / 1024) + ' KB');
