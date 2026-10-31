(() => {
  'use strict';
  const button = document.getElementById('check-sync');
  const summary = document.getElementById('sync-summary');
  const heading = document.getElementById('sync-heading');
  function node(tag, text, className = '') { const n = document.createElement(tag); n.textContent = text; n.className = className; return n; }
  async function check() {
    if (location.protocol === 'file:') { heading.textContent = 'Server hosting required'; summary.textContent = 'Start the included Node server or deploy the complete project. Double-clicking an HTML file does not run the sync backend.'; return; }
    button.disabled = true; heading.textContent = 'Checking the connection';
    summary.textContent = 'Reading the server result. Saved videos remain available.';
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 55000);
    try {
      const response = await fetch('/api/behance', { headers:{ Accept:'application/json' }, signal:controller.signal });
      if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('The server endpoint is not installed on this host.');
      const data = await response.json();
      if (data.schemaVersion !== 1) throw new Error('Invalid sync response.');
      heading.textContent = data.status === 'live' ? 'All requested checks succeeded' : data.status === 'partial' ? 'Partially connected' : 'Live connection unavailable';
      summary.textContent = data.status === 'live' ? 'The configured collections and public-profile discovery were read successfully. This is a read of public HTML, not an official webhook.' : data.status === 'partial' ? 'Some checks succeeded. Review the failed sources below; new projects may not be discoverable yet.' : 'Do not rely on automatic updates yet. The website is showing the saved portfolio.';
      const details = document.getElementById('sync-details'); details.replaceChildren();
      const entries = [ ['Profile', data.profile?.url || '-'], ['Last attempted check', data.checkedAt || '-'], ['Last successful collection check', data.lastSuccessfulAt || 'None'], ['New-project discovery', data.discovery?.ok ? 'Profile data parsed' : 'Not working'], ['Visible video records', String(data.projects?.length || 0)], ['Refresh cache', `${data.pollAfterSeconds / 60} minutes`], ['Discovery scope', data.discovery?.scope || '-'] ];
      entries.forEach(([key,value]) => details.append(node('dt', key), node('dd', value)));
      const sources = document.getElementById('sync-sources'); sources.replaceChildren();
      (data.sources || []).forEach(source => {
        const row = node('div','', 'sync-source');
        row.append(node('span', `${source.id} / ${source.status}`), node('span', source.status === 'ok' ? `${source.count} recognized video modules` : source.message)); sources.append(row);
      });
      const warnings = document.getElementById('sync-warnings'); warnings.replaceChildren();
      (data.warnings?.length ? data.warnings : ['No errors reported for this check. Public profile pagination is not crawled; only projects present in the returned HTML and configured sources are checked.']).forEach(w => warnings.append(node('p', w, 'sync-warning')));
    } catch (error) {
      heading.textContent = 'Live connection unavailable'; summary.textContent = error.message + ' The saved website remains usable.';
    } finally { clearTimeout(timer); button.disabled = false; }
  }
  button.addEventListener('click', check);
})();
