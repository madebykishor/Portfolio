/* Same-origin updates. Static/local-file mode stays usable without a server. */
(() => {
  'use strict';
  const portfolio = window.KIXOR_PORTFOLIO;
  const Names = globalThis.KixorVideoNames;
  const settings = portfolio?.sync;
  if (!settings?.enabled) return;
  const storageKey = `kixor:behance:${settings.username}:v${settings.cacheVersion || 1}`;
  let current = { projects:portfolio.projects.map(Names.normalize), categories:portfolio.categories };
  let lastSuccessfulAt = null;
  let pending = false;
  let lastRequestAt = 0;
  let lastState = { state:'saved', message:'Showing saved work' };
  const getKey = p => {
    try {
      const valid = window.KixorThumbnails.safeURL(p.embedUrl);
      if (!valid) return '';
      const u = new URL(valid); return u.hostname + u.pathname;
    } catch { return ''; }
  };
  const sourceId = p => String(p.sourceProjectId || p.externalUrl?.match(/\/gallery\/(\d+)/)?.[1] || '');
  function safeText(value, max) { return typeof value === 'string' ? value.slice(0, max) : ''; }
  function cleanData(input) {
    if (!input || !Array.isArray(input.projects) || !Array.isArray(input.categories)) return null;
    if (input.projects.length > 1000 || input.categories.length > 30) return null;
    const categories = input.categories.filter(c => c && /^[a-z0-9-]{1,64}$/.test(c.id) && c.name).map(c => ({
      id:c.id, name:safeText(c.name, 80), subtitle:safeText(c.subtitle, 200),
      description:safeText(c.description, 600), group:safeText(c.group, 100), number:safeText(c.number, 3),
      externalUrl:safeText(c.externalUrl, 500)
    }));
    const known = new Set(categories.map(c => c.id)), ids = new Set(), keys = new Set();
    const projects = [];
    for (const p of input.projects) {
      if (!p || !/^[\w-]{1,180}$/.test(p.id) || !known.has(p.category)) continue;
      const key = getKey(p);
      if (!key || keys.has(key) || ids.has(p.id)) continue;
      let external;
      try {
        const u = new URL(p.externalUrl);
        if (u.protocol !== 'https:' || u.hostname !== 'www.behance.net' || !/^\/gallery\/\d+(\/|$)/.test(u.pathname) || u.username || u.password) continue;
        external = u.href;
      } catch { continue; }
      ids.add(p.id); keys.add(key);
      projects.push({
        id:p.id, category:p.category,
        ...Names.resolve({ originalFileName:safeText(p.originalFileName, 1024), sourceTitle:safeText(p.sourceTitle, 1024), caption:safeText(p.caption, 1024) }),
        sourceTitle:safeText(p.sourceTitle, 1024), caption:safeText(p.caption, 1024),
        description:safeText(p.description, 600), tags:(Array.isArray(p.tags) ? p.tags : []).filter(t => typeof t === 'string').slice(0,8).map(t => t.slice(0,80)),
        embedUrl:window.KixorThumbnails.safeURL(p.embedUrl), externalUrl:external,
        sourceProjectId:sourceId(p), sourceModuleId:safeText(p.sourceModuleId, 80),
        thumbnail:safeText(p.thumbnail, 2000), thumbnailMode:'native-player',
        ratio:p.ratio === '9/16' ? '9/16' : '16/9', publishedOn:Number(p.publishedOn) || 0
      });
    }
    // A completely empty, validated feed can be authoritative after deletions.
    return { categories, projects };
  }
  function setStatus(state, message, extra = {}) {
    lastState = { state, message, ...extra };
    document.querySelectorAll('[data-sync-message]').forEach(node => {
      node.textContent = message;
      if (lastSuccessfulAt) node.title = `Last successful collection check: ${new Date(lastSuccessfulAt).toLocaleString()}`;
    });
    document.querySelectorAll('[data-sync-state]').forEach(node => { node.dataset.syncState = state; });
    document.dispatchEvent(new CustomEvent('kixor:sync-status', { detail:{ ...lastState, lastSuccessfulAt } }));
  }
  function publish(next) {
    current = next;
    document.dispatchEvent(new CustomEvent('kixor:portfolio', { detail:next }));
  }
  function mergeResponse(next, refreshedIds) {
    const refreshed = new Set(refreshedIds.map(String));
    const incoming = new Map(next.projects.map(p => [getKey(p), p]));
    const previous = new Map(current.projects.map(p => [getKey(p), p]));
    const projects = next.projects.filter(p => !previous.has(getKey(p)));
    current.projects.forEach(p => {
      const key = getKey(p);
      if (refreshed.has(sourceId(p)) && !incoming.has(key)) return;
      if (incoming.has(key)) {
        const fresh = incoming.get(key);
        const named = Names.merge(p, { originalFileName:fresh.originalFileName, sourceTitle:fresh.sourceTitle, caption:fresh.caption });
        projects.push(refreshed.has(sourceId(p)) ? { ...fresh, ...Names.resolve(named), sourceTitle:named.sourceTitle, caption:named.caption, id:p.id } : named);
      } else projects.push(p);
    });
    const categories = new Map([...current.categories, ...next.categories].map(c => [c.id, c]));
    return { projects, categories:[...categories.values()] };
  }
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (stored?.username === settings.username && Date.now() - stored.savedAt < 30*86400000) {
      const valid = cleanData(stored.data);
      if (valid) {
        lastSuccessfulAt = typeof stored.lastSuccessfulAt === 'string' ? stored.lastSuccessfulAt : null;
        publish(valid); setStatus('saved', 'Showing saved work');
      }
    }
  } catch { /* Storage can be disabled. The supplied fallback still works. */ }

  async function refresh() {
    if (location.protocol === 'file:') {
      setStatus('local', 'Local preview - live sync needs hosting'); return;
    }
    if (!navigator.onLine) { setStatus('offline', 'Offline - showing saved work'); return; }
    if (pending || Date.now() - lastRequestAt < 60000) return;
    let endpoint;
    try {
      endpoint = new URL(settings.endpoint, location.href);
      if (endpoint.origin !== location.origin) throw new Error('Use a same-origin sync endpoint.');
    } catch { setStatus('unavailable', 'Showing saved work - sync not configured'); return; }
    pending = true; lastRequestAt = Date.now();
    setStatus('checking', 'Checking Behance for new work');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch(endpoint.href, { headers:{ Accept:'application/json' }, signal:controller.signal });
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Sync endpoint not installed.');
      const payload = await response.json();
      if (payload.schemaVersion !== 1 || payload.profile?.username !== settings.username) throw new Error('Unexpected sync response.');
      if (!['live','partial','unavailable'].includes(payload.status)) throw new Error('Invalid sync status.');
      const valid = cleanData(payload);
      if (!valid) throw new Error('Invalid project data.');
      if (payload.status === 'unavailable') {
        const matching = new Map(valid.projects.map(p => [getKey(p), p]));
        const named = current.projects.map(p => {
          const fresh = matching.get(getKey(p));
          return fresh ? Names.merge(p, { originalFileName:fresh.originalFileName, sourceTitle:fresh.sourceTitle, caption:fresh.caption }) : p;
        });
        if (named.some((p, index) => p.title !== current.projects[index].title || p.titleSource !== current.projects[index].titleSource)) {
          publish({ ...current, projects:named });
          try { localStorage.setItem(storageKey, JSON.stringify({ username:settings.username, savedAt:Date.now(), lastSuccessfulAt, data:current })); } catch {}
        }
        setStatus('unavailable', 'Showing saved work - Behance sync unavailable', { report:payload });
        return;
      }
      if (!response.ok) throw new Error('Sync request failed.');
      const next = mergeResponse(valid, Array.isArray(payload.refreshedProjectIds) ? payload.refreshedProjectIds : []);
      lastSuccessfulAt = payload.lastSuccessfulAt || lastSuccessfulAt;
      publish(next);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ username:settings.username, savedAt:Date.now(), lastSuccessfulAt, data:next }));
      } catch { /* Quota/private mode must not interrupt navigation. */ }
      setStatus(payload.status, payload.status === 'live' ? 'Updated from Behance' : 'Some collections updated - saved work retained', { report:payload });
    } catch (error) {
      setStatus('unavailable', 'Showing saved work - live sync unavailable');
      console.info('[Kixor] Live sync unavailable; existing portfolio retained.', error.message);
    } finally { clearTimeout(timeout); pending = false; }
  }
  // On-demand server cache, not a Behance webhook. No refresh while tab is hidden.
  const interval = Math.max(300, Number(settings.checkEverySeconds) || 300) * 1000;
  setInterval(() => { if (!document.hidden) refresh(); }, interval);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  window.addEventListener('online', refresh);
  window.KixorSync = Object.freeze({ refresh, getState:() => ({ ...lastState, lastSuccessfulAt }) });
  refresh();
})();
