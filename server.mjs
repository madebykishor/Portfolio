/** Local preview / plain Node hosting. No npm packages required. */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import behance from './api/behance.mjs';

const root = fileURLToPath(new URL('.', import.meta.url));
const files = new Set(['index.html','work.html','sync-status.html','style.css','script.js','site-data.js','sync-client.js','sync-status.js','video-thumbnails.js','video-names.js','video-titles.js','original-video-names.js','video-title-map.js','motion.js','robots.txt']);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml', '.webp':'image/webp', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.mp4':'video/mp4', '.webm':'video/webm', '.txt':'text/plain; charset=utf-8', '.pdf':'application/pdf' };
const port = Number(process.env.PORT || 3000);
const server = createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
  catch { res.statusCode=400; return res.end('Bad request'); }
  if (pathname === '/api/behance') return behance(req,res);
  if (!['GET','HEAD'].includes(req.method)) { res.statusCode=405; return res.end('Method not allowed'); }
  let relative = pathname.replace(/^\//, '') || 'index.html';
  if (relative === 'work') relative = 'work.html';
  if (relative === 'sync-status') relative = 'sync-status.html';
  // Do not serve source config, tests, environment files or server code.
  if ((!files.has(relative) && !relative.startsWith('assets/') && !relative.startsWith('css/') && !relative.startsWith('js/')) || relative.includes('..') || relative.includes('\\')) { res.statusCode=404; return res.end('Not found'); }
  const path = resolve(root,relative);
  if (!path.startsWith(root.endsWith(sep) ? root : root + sep)) { res.statusCode=403; return res.end('Forbidden'); }
  try {
    const info = await stat(path); if (!info.isFile()) throw new Error();
    const bytes = await readFile(path);
    res.setHeader('Content-Type',mime[extname(path)] || 'application/octet-stream');
    res.setHeader('Cache-Control','no-cache');
    // Byte ranges keep local MP4 seeking usable.
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range && ['.mp4','.webm'].includes(extname(path))) {
      const start=Number(range[1]), end=range[2] ? Math.min(Number(range[2]),bytes.length-1) : bytes.length-1;
      if (start > end || start >= bytes.length) { res.statusCode=416; res.setHeader('Content-Range',`bytes */${bytes.length}`); return res.end(); }
      res.statusCode=206; res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`); res.setHeader('Accept-Ranges','bytes'); res.setHeader('Content-Length',end-start+1);
      return res.end(req.method==='HEAD' ? undefined : bytes.subarray(start,end+1));
    }
    res.setHeader('Content-Length',bytes.length); res.end(req.method==='HEAD' ? undefined : bytes);
  } catch { res.statusCode=404; res.end('Not found'); }
});
server.listen(port, '0.0.0.0', () => console.log(`Kixor portfolio: http://localhost:${port}\nConnection check: http://localhost:${port}/sync-status.html`));
