/**
 * Public-page adapter, NOT an official Behance API.
 * Validated against beconfig-store_state from the supplied Behance HTML.
 * Fetches published content only. No login scraping, CAPTCHA bypass, or proxies.
 * If Behance blocks a request or changes markup, return explicit partial/failure
 * status and retain the saved portfolio; never report a failed sync as live.
 */
import '../video-names.js';
import { enrichVideoNames } from './video-metadata.mjs';
const Names = globalThis.KixorVideoNames;

import config from '../config/behance.json' with { type: 'json' };
import seed from '../data/portfolio.json' with { type: 'json' };

export { config, seed };
const HTTPS = /^https:\/\//i;
const VIDEO_HOSTS = new Set(['www-ccv.adobe.io', 'drive.google.com', 'www.youtube.com', 'www.youtube-nocookie.com', 'player.vimeo.com']);

export function decodeHTML(value = '') {
  return String(value).replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt);/gi, (whole, code) => {
    const table = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>' };
    if (table[code.toLowerCase()]) return table[code.toLowerCase()];
    const n = code.toLowerCase().startsWith('#x') ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}
export const plainText = value => decodeHTML(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

export function projectId(value) {
  try {
    const u = new URL(value, 'https://www.behance.net');
    if (u.protocol !== 'https:' || !['www.behance.net', 'behance.net'].includes(u.hostname) || u.username || u.password || u.port) return '';
    return u.pathname.match(/^\/gallery\/(\d+)(?:\/|$)/)?.[1] || '';
  } catch { return ''; }
}
export function videoURL(value) {
  try {
    const u = new URL(decodeHTML(value));
    if (u.protocol !== 'https:' || !VIDEO_HOSTS.has(u.hostname) || u.username || u.password || u.port) return '';
    const patterns = {
      'www-ccv.adobe.io': /^\/v1\/player\/ccv\/[\w-]+\/embed$/,
      'drive.google.com': /^\/file\/d\/[\w-]+\/preview$/,
      'www.youtube.com': /^\/embed\/[\w-]+$/,
      'www.youtube-nocookie.com': /^\/embed\/[\w-]+$/,
      'player.vimeo.com': /^\/video\/\d+$/
    };
    if (!patterns[u.hostname].test(u.pathname)) return '';
    u.searchParams.delete('autoplay');
    u.searchParams.delete('auto_play');
    return u.href;
  } catch { return ''; }
}
export function videoKey(value) {
  const url = videoURL(value);
  if (!url) return '';
  const u = new URL(url);
  return u.hostname + u.pathname;
}
export function imageURL(value) {
  if (value && typeof value === 'object') value = value.url || value.src || '';
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && !u.username && !u.password ? u.href : '';
  } catch { return ''; }
}
function attributes(tag) {
  const result = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[m[1].toLowerCase()] = decodeHTML(m[2] ?? m[3] ?? m[4]);
  return result;
}
export function readJSONScripts(html) {
  if (typeof html !== 'string' || html.length > 8_000_000) throw new Error('Invalid or oversized Behance page.');
  const found = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    const attrs = attributes(m[1]);
    if (!['application/json', 'application/ld+json'].includes(attrs.type)) continue;
    try { found.push(JSON.parse(m[2])); } catch { /* Reject executable/unparseable script bodies. */ }
  }
  return found;
}
function walk(root, visit) {
  const stack = [root]; let count = 0;
  while (stack.length && ++count < 60000) {
    const item = stack.pop();
    if (!item || typeof item !== 'object') continue;
    if (!Array.isArray(item)) visit(item);
    // Preserve document order when traversing arrays and object properties.
    stack.push(...Object.values(item).filter(v => v && typeof v === 'object').reverse());
  }
}
function ownerMatches(project, settings) {
  let owners = project.owners || project.creator || project.creators || [];
  if (!Array.isArray(owners)) owners = [owners];
  if (owners.length === 0) return false;
  return owners.some(o => {
    if (!o || typeof o !== 'object') return false;
    if (String(o.id || o.identifier || '') === String(settings.ownerId)) return true;
    if (String(o.username || '').toLowerCase() === settings.username.toLowerCase()) return true;
    try { return new URL(o.url).pathname.replace(/^\/|\/$/g, '').toLowerCase() === settings.username.toLowerCase(); }
    catch { return false; }
  });
}
function candidateURL(item) {
  if (projectId(item.url)) return item.url;
  if (/^\d+$/.test(String(item.id || '')) && (item.slug || item.__typename === 'Project')) {
    return `https://www.behance.net/gallery/${item.id}/${encodeURIComponent(item.slug || '')}`;
  }
  return '';
}
export function discoverProfileProjects(html, settings = config) {
  const urls = new Map();
  for (const root of readJSONScripts(html)) {
    walk(root, item => {
      const url = candidateURL(item);
      if (!url || !ownerMatches(item, settings) || item.isPrivate || item.isPublished === false) return;
      const id = projectId(url);
      urls.set(id, { id, url, name: plainText(item.name || item.title), publishedOn: Number(item.publishedOn || 0) });
    });
  }
  if (!urls.size) throw new Error('No owned projects found in public profile data. Discovery is not verified; existing collection checks continue.');
  return [...urls.values()].sort((a, b) => b.publishedOn - a.publishedOn);
}
export function inferCategory(project, settings = config) {
  const id = String(project.id);
  const explicit = settings.categoryOverrides?.[id] || settings.projectSources.find(s => s.id === id)?.category;
  if (explicit && seed.categories.some(c => c.id === explicit)) return explicit;
  const tags = (project.tags || []).map(t => typeof t === 'string' ? t : t.title || t.name || '');
  const text = `${project.name || ''} ${tags.join(' ')}`.toLowerCase();
  const rules = [
    ['real-estate', /real[ -]?estate|property|architecture|villa/],
    ['podcast', /podcast|interview/],
    ['motion-graphics', /motion graphic|kinetic|logo animation/],
    ['ai', /\bai\b|generative|artificial intelligence/],
    ['personal-branding', /personal brand|creator|talking.head/],
    ['commercial', /commercial|advertis|brand film|product|fashion/]
  ];
  return rules.find(([, test]) => test.test(text))?.[0] || 'other';
}
export function parseProjectPage(html, expectedId, settings = config) {
  let project;
  for (const root of readJSONScripts(html)) {
    // Actual schema in the source attachment.
    const p = root?.project?.project;
    if (p && String(p.id) === String(expectedId) && Array.isArray(p.modules)) project = p;
    if (!project) walk(root, item => {
      if (String(item.id) === String(expectedId) && Array.isArray(item.modules) && item.name) project = item;
    });
  }
  if (!project) throw new Error('Published project modules not present in public HTML. Behance markup may have changed.');
  if (!ownerMatches(project, settings)) throw new Error('Project ownership could not be verified; not imported.');
  if (project.isPrivate || project.isPublished === false || (project.privacyLevel && project.privacyLevel !== 'PUBLIC')) {
    throw new Error('Project is not public and published; not imported.');
  }
  const category = inferCategory(project, settings);
  const tags = (project.tags || []).map(t => plainText(typeof t === 'string' ? t : t.title || t.name)).filter(Boolean).slice(0, 8);
  const externalUrl = projectId(project.url) === String(expectedId) ? project.url : `https://www.behance.net/gallery/${expectedId}`;
  const output = []; const seen = new Set(); let videoModuleCount = 0;
  for (const module of project.modules) {
    if (!module || typeof module !== 'object') continue;
    const isVideo = /video|embed/i.test(module.__typename || module.type || '') || /<iframe\b/i.test(module.embed || '');
    if (!isVideo) continue;
    videoModuleCount++;
    const embed = String(module.embed || module.embedHtml || '');
    const sources = [...embed.matchAll(/<iframe\b([^>]*)>/gi)].map(m => attributes(m[1]).src);
    if (module.embedUrl) sources.push(module.embedUrl);
    for (const source of sources) {
      const url = videoURL(source);
      const key = videoKey(url);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const nativeId = new URL(url).pathname.split('/').filter(Boolean).at(-2);
      const caption = plainText(module.captionPlain || module.caption || module.title).slice(0, 160);
      const width = Number(module.width || 0), height = Number(module.height || 0);
      output.push({
        id: `behance-${expectedId}-${String(module.id || nativeId).replace(/[^\w-]/g, '').slice(0, 80)}`,
        category,
        ...Names.resolve({ originalFileName: Names.fromMetadata(module), sourceTitle: Names.sourceTitle(module.title), caption }),
        originalFileName: Names.fromMetadata(module),
        sourceTitle: Names.sourceTitle(module.title),
        caption,
        description: plainText(project.description).slice(0, 600),
        tags, embedUrl: url, externalUrl,
        sourceProjectId: String(expectedId),
        sourceModuleId: String(module.id || ''),
        thumbnail: imageURL(module.poster || module.posterUrl || module.thumbnail || module.thumbnailUrl || module.thumbnail_url),
        thumbnailMode: 'native-player',
        ratio: height > width && width > 0 ? '9/16' : '16/9',
        publishedOn: Number(project.publishedOn || 0)
      });
    }
  }
  // Never treat an unsupported/changed video schema as a successful empty feed.
  if (videoModuleCount && !output.length) throw new Error('Video modules found, but their player URLs are unsupported or changed. Saved videos retained.');
  const warnings = videoModuleCount > output.length ? ['Some media modules were unsupported. Only recognized video players were imported.'] : [];
  return { project: { id: String(expectedId), name: plainText(project.name), category, externalUrl }, videos: output, warnings };
}
export function mergeVideos(previous, incoming, refreshedIds = []) {
  const oldByVideo = new Map(previous.map(p => [videoKey(p.embedUrl), p]).filter(([key]) => key));
  const seen = new Set(); const newItems = []; const updates = new Map();
  for (const p of incoming) {
    const key = videoKey(p.embedUrl);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const old = oldByVideo.get(key);
    if (old) {
      updates.set(key, {
        ...old, ...p, id: old.id,
        ...Names.merge(old, p), id: old.id,
        description: p.description || old.description || '',
        tags: p.tags?.length ? p.tags : old.tags || [],
        thumbnail: p.thumbnail || old.thumbnail || ''
      });
    } else newItems.push(p);
  }
  const refreshed = new Set(refreshedIds.map(String));
  const remaining = previous.filter(p => {
    const source = String(p.sourceProjectId || projectId(p.externalUrl));
    return !refreshed.has(source) || seen.has(videoKey(p.embedUrl));
  }).map(p => updates.get(videoKey(p.embedUrl)) || p);
  const result = [...newItems.sort((a,b) => (b.publishedOn || 0) - (a.publishedOn || 0)), ...remaining];
  const final = new Map();
  result.forEach(p => { const k = videoKey(p.embedUrl); if (k && !final.has(k)) final.set(k, p); });
  return [...final.values()];
}
function categoriesFor(projects) {
  const categories = seed.categories.map(c => ({ ...c }));
  if (projects.some(p => p.category === 'other')) categories.push({ id:'other', name:'Other Work', subtitle:'New stories, new formats.', description:'Additional video projects from Behance.', group:'Independent / New work', number:'07', externalUrl:`https://www.behance.net/${config.username}`, cover:'' });
  return categories.map(c => ({ ...c, count: projects.filter(p => p.category === c.id).length }));
}
async function fetchHTML(url, fetcher, signal, settings) {
  const u = new URL(url);
  if (u.protocol !== 'https:' || u.hostname !== 'www.behance.net' || u.username || u.password || u.port) throw new Error('Only configured public Behance URLs are fetched.');
  const response = await fetcher(u.href, {
    headers: { 'Accept':'text/html', 'User-Agent':'KixorPortfolioSync/2.0 (owner-authorized public portfolio refresh)' },
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(settings.requestTimeoutMs)])
  });
  if (!response.ok) throw new Error(`Behance returned HTTP ${response.status}. No access-control bypass is attempted.`);
  const contentType = response.headers?.get?.('content-type') || '';
  if (contentType && !contentType.includes('text/html')) throw new Error('Behance did not return an HTML page.');
  const declaredSize = Number(response.headers?.get?.('content-length') || 0);
  if (declaredSize > 8_000_000) throw new Error('Behance response too large.');
  // Bound streamed bytes as well as Content-Length. Mock responses can use text().
  if (response.body?.getReader) {
    const reader = response.body.getReader(); const chunks = []; let total = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read(); if (done) break;
        total += value.byteLength;
        if (total > 8_000_000) { await reader.cancel(); throw new Error('Behance response too large.'); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  const text = await response.text();
  if (text.length > 8_000_000) throw new Error('Behance response too large.');
  return text;
}
async function concurrentMap(items, n, task) {
  let cursor = 0;
  const result = new Array(items.length);
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    for (;;) { const i = cursor++; if (i >= items.length) break; result[i] = await task(items[i]); }
  }));
  return result;
}
export async function performSync({ fetcher = fetch, settings = config, previous = seed.projects, lastSuccessfulAt = null, resolveNames = true } = {}) {
  const checkedAt = new Date().toISOString();
  const deadline = AbortSignal.timeout(settings.totalTimeoutMs);
  const profileUrl = `https://www.behance.net/${encodeURIComponent(settings.username)}`;
  const warnings = [];
  let discovered = [], discoveryOK = false;
  try { discovered = discoverProfileProjects(await fetchHTML(profileUrl, fetcher, deadline, settings), settings); discoveryOK = true; }
  catch (error) { warnings.push(`New-project discovery: ${error.message}`); }
  const targets = new Map(settings.projectSources.map(s => [String(s.id), s]));
  discovered.forEach(s => targets.set(s.id, s));
  // Recheck formerly discovered projects when a warm server has them cached.
  previous.forEach(p => {
    const id = projectId(p.externalUrl);
    if (id && !targets.has(id)) targets.set(id, { id, url: p.externalUrl });
  });
  const all = [...targets.values()];
  const limited = all.slice(0, settings.maxProjectsPerSync);
  if (all.length > limited.length) warnings.push(`Checked ${limited.length} of ${all.length} projects due to the configured scan limit. Increase maxProjectsPerSync and timeout together for larger profiles.`);
  const results = await concurrentMap(limited, settings.concurrency, async source => {
    try {
      const parsed = parseProjectPage(await fetchHTML(source.url, fetcher, deadline, settings), source.id, settings);
      return { source, parsed, ok:true };
    } catch (error) { return { source, ok:false, error:error.message }; }
  });
  const successful = results.filter(r => r.ok);
  // Only a completely understood collection may authorize deletions.
  const refreshedProjectIds = successful.filter(r => !r.parsed.warnings.length).map(r => r.source.id);
  const incoming = successful.flatMap(r => r.parsed.videos);
  successful.forEach(r => r.parsed.warnings.forEach(w => warnings.push(`${r.source.id}: ${w}`)));
  results.filter(r => !r.ok).forEach(r => warnings.push(`${r.source.id}: ${r.error}`));
  let projects = mergeVideos(previous, incoming, refreshedProjectIds).map(Names.normalize);
  let nameReport = null;
  if (resolveNames && !deadline.aborted) {
    const named = await enrichVideoNames(projects, {
      fetcher, useCache: fetcher === fetch,
      signal: AbortSignal.any([deadline, AbortSignal.timeout(10000)])
    });
    projects = named.projects; nameReport = named.report;
  }
  const complete = successful.length === results.length && discoveryOK && all.length <= limited.length && !warnings.length;
  const status = complete ? 'live' : successful.length ? 'partial' : 'unavailable';
  return {
    schemaVersion:1, status, profile: { username:settings.username, url:profileUrl },
    checkedAt, lastSuccessfulAt: successful.length ? checkedAt : lastSuccessfulAt,
    pollAfterSeconds:settings.cacheSeconds,
    discovery: { ok:discoveryOK, discovered:discovered.length, checked:limited.length, truncated:all.length > limited.length, scope:'Public profile HTML; client-side pagination is not crawled.' },
    refreshedProjectIds,
    sources:results.map(r => ({ id:r.source.id, url:r.source.url, status:r.ok ? 'ok' : 'failed', count:r.ok ? r.parsed.videos.length : null, message:r.ok ? 'Public project parsed' : r.error })),
    warnings, videoNames:nameReport, categories:categoriesFor(projects), projects
  };
}

let cached = null, expiresAt = 0, inFlight = null;
export async function getPortfolio() {
  if (cached && Date.now() < expiresAt) return cached;
  if (inFlight) return inFlight;
  inFlight = performSync({ previous: cached?.projects || seed.projects, lastSuccessfulAt:cached?.lastSuccessfulAt || null })
    .then(result => {
      cached = result;
      expiresAt = Date.now() + (result.status === 'unavailable' ? config.failureCacheSeconds : config.cacheSeconds) * 1000;
      return result;
    }).finally(() => { inFlight = null; });
  return inFlight;
}
