/** Best-effort public player metadata; not a private or undocumented API.
 * Reads explicit filename fields, VideoObject data, or an advertised native
 * page title. Does not execute scripts, guess CDN file names, or bypass access.
 */
import '../video-names.js';
const Names = globalThis.KixorVideoNames;
const MAX_BYTES = 1_000_000;
const cache = new Map();
function decode(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (all, code) => {
    const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (entities[code.toLowerCase()]) return entities[code.toLowerCase()];
    const n = code.toLowerCase().startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}
function attrs(value) {
  const result = {};
  for (const m of value.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4]);
  return result;
}
export function allowedPlayerURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return '';
    const patterns = {
      'www-ccv.adobe.io': /^\/v1\/player\/ccv\/[\w-]+\/embed$/,
      'drive.google.com': /^\/file\/d\/[\w-]+\/preview$/
    };
    if (!patterns[url.hostname]?.test(url.pathname)) return '';
    url.searchParams.delete('autoplay');
    return url.href;
  } catch { return ''; }
}
export function parsePlayerMetadata(html) {
  if (typeof html !== 'string' || html.length > MAX_BYTES) throw new Error('Invalid player metadata size.');
  let originalFileName = '', sourceTitle = '';
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const a = attrs(m[1]);
    if (!['application/ld+json', 'application/json'].includes(a.type)) continue;
    let root;
    try { root = JSON.parse(m[2]); } catch { continue; }
    // Known, direct video metadata only. Advertising/recommended videos ignored.
    const nodes = Array.isArray(root) ? root.filter(p => p?.['@type'] === 'VideoObject') : [root];
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
      if (node['@type'] && !types.includes('VideoObject')) continue;
      originalFileName ||= Names.fromMetadata(node);
      if (types.includes('VideoObject')) sourceTitle ||= Names.sourceTitle(node.name);
    }
  }
  for (const m of html.matchAll(/<meta\b([^>]*)>/gi)) {
    const a = attrs(m[1]), key = (a.property || a.name || '').toLowerCase();
    if (['video:filename', 'video:file_name', 'original-filename'].includes(key)) originalFileName ||= Names.fileName(a.content);
    if (['og:title', 'twitter:title'].includes(key)) sourceTitle ||= Names.sourceTitle(a.content);
  }
  const pageTitle = decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] || '').replace(/\s+-\s+Google Drive\s*$/i, '').trim();
  sourceTitle ||= Names.sourceTitle(pageTitle);
  // A native title ending in .mp4 is still a native title, not proof of a filename.
  return { originalFileName, sourceTitle };
}
async function boundedHTML(response) {
  if (!response.ok) throw new Error(`Player returned HTTP ${response.status}.`);
  const type = response.headers?.get?.('content-type') || '';
  if (type && !type.includes('text/html')) throw new Error('No public HTML metadata.');
  if (Number(response.headers?.get?.('content-length')) > MAX_BYTES) throw new Error('Player response too large.');
  if (!response.body?.getReader) {
    const html = await response.text();
    if (Buffer.byteLength(html) > MAX_BYTES) throw new Error('Player response too large.');
    return html;
  }
  const reader = response.body.getReader(), chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Player response too large.'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new TextDecoder().decode(Buffer.concat(chunks));
}
export async function enrichVideoNames(projects, { fetcher = fetch, signal, useCache = true, requestTimeoutMs = 2500, concurrency = 8 } = {}) {
  const result = projects.map(Names.normalize);
  const report = { checked: 0, failed: 0, filenames: 0, sourceTitles: 0, unresolved: 0 };
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, result.length) }, async () => {
    for (;;) {
      const index = cursor++;
      if (index >= result.length) break;
      const item = result[index];
      if (item.originalFileName || signal?.aborted) continue;
      const url = allowedPlayerURL(item.embedUrl);
      if (!url) continue;
      let entry = useCache ? cache.get(url) : null;
      if (!entry || Date.now() >= entry.expiresAt) {
        report.checked++;
        try {
          const localDeadline = AbortSignal.timeout(requestTimeoutMs);
          const response = await fetcher(url, {
            headers: { Accept: 'text/html', 'User-Agent': 'KixorPortfolioSync/3.1 (public video display names)' },
            redirect: 'error', signal: signal ? AbortSignal.any([signal, localDeadline]) : localDeadline
          });
          const metadata = parsePlayerMetadata(await boundedHTML(response));
          const found = Boolean(metadata.originalFileName || metadata.sourceTitle);
          entry = { metadata, expiresAt: Date.now() + (found ? 900000 : 180000) };
        } catch {
          report.failed++;
          entry = { metadata: {}, expiresAt: Date.now() + 180000 };
        }
        if (useCache) {
          if (cache.size >= 1000) cache.delete(cache.keys().next().value);
          cache.set(url, entry);
        }
      }
      result[index] = Names.merge(item, entry.metadata);
    }
  }));
  for (const item of result) {
    if (item.titleSource === 'filename') report.filenames++;
    else if (item.titleSource === 'source-title') report.sourceTitles++;
    else report.unresolved++;
  }
  return { projects: result, report };
}
