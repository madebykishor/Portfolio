/* Native provider posters: never substitute unrelated category artwork. */
(() => {
  'use strict';
  const items = new Map();
  const safeURL = value => {
    try {
      const u = new URL(value);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
      const paths = {
        'www-ccv.adobe.io': /^\/v1\/player\/ccv\/[\w-]+\/embed$/,
        'drive.google.com': /^\/file\/d\/[\w-]+\/preview$/,
        'www.youtube.com': /^\/embed\/[\w-]+$/,
        'www.youtube-nocookie.com': /^\/embed\/[\w-]+$/,
        'player.vimeo.com': /^\/video\/\d+$/
      };
      if (!paths[u.hostname]?.test(u.pathname)) return '';
      u.searchParams.delete('autoplay');
      u.searchParams.delete('auto_play');
      if (u.hostname.includes('youtube') || u.hostname.includes('vimeo')) u.searchParams.set('autoplay', '0');
      return u.href;
    } catch { return ''; }
  };
  function imageURL(value) {
    if (typeof value !== 'string' || !value) return '';
    if (/^assets\/[\w./%-]+$/.test(value) && !value.includes('..')) return value;
    try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password ? u.href : ''; }
    catch { return ''; }
  }
  function mount(record) {
    if (!record.node.isConnected || record.media || navigator.onLine === false) return;
    const { node, project } = record;
    const poster = imageURL(project.thumbnail);
    if (poster && !record.imageFailed) {
      const img = document.createElement('img');
      img.src = poster; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async';
      img.addEventListener('error', () => { img.remove(); record.media = null; record.imageFailed = true; mount(record); }, { once:true });
      record.media = img; node.append(img); return;
    }
    const source = safeURL(project.embedUrl);
    if (!source) return;
    const frame = document.createElement('iframe');
    frame.title = `${window.KixorVideoTitles?.title(project) || project.title} - original video poster`;
    frame.tabIndex = -1;
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
    frame.allow = 'fullscreen; encrypted-media'; // No autoplay permission in thumbnail frames.
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.loading = 'lazy';
    frame.src = source;
    frame.addEventListener('error', () => {
      frame.remove();
      node.classList.add('preview-unavailable');
      // Do not retry indefinitely. The parent link still opens the main player.
    }, { once:true });
    record.media = frame;
    node.append(frame);
    // A cross-origin iframe load event cannot confirm video/poster availability.
  }
  function unmount(record) {
    if (record.media) record.media.remove();
    record.media = null;
  }
  const observer = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
    entries.forEach(entry => {
      const record = items.get(entry.target);
      if (!record) return;
      window.clearTimeout(record.timer);
      if (entry.isIntersecting) mount(record);
      else record.timer = window.setTimeout(() => unmount(record), 1500);
    });
  }, { rootMargin:'100px 0px', threshold:0.01 }) : null;

  function prune() {
    for (const [node, record] of items) {
      if (node.isConnected) continue;
      window.clearTimeout(record.timer);
      observer?.unobserve(node);
      unmount(record);
      items.delete(node);
    }
  }
  function create(project, className = '') {
    const node = document.createElement('span');
    node.className = `native-thumbnail ${className}`.trim();
    node.dataset.posterFor = project.id || '';
    node.classList.toggle('is-portrait', project.ratio === '9/16');
    const fallback = document.createElement('span');
    fallback.className = 'poster-fallback';
    fallback.setAttribute('aria-hidden', 'true');
    const play = document.createElement('span'); play.className = 'poster-play'; play.textContent = '\u25b6';
    const label = document.createElement('span'); label.textContent = 'Open film';
    fallback.append(play, label); node.append(fallback);
    const record = { node, project, media:null, imageFailed:false, timer:null };
    items.set(node, record);
    if (observer) observer.observe(node);
    else window.setTimeout(() => mount(record), 0);
    return node;
  }
  window.addEventListener('online', () => {
    for (const record of items.values()) {
      const box = record.node.getBoundingClientRect();
      if (box.bottom > -100 && box.top < innerHeight + 100) mount(record);
    }
  });
  window.KixorThumbnails = Object.freeze({ create, prune, safeURL });
})();
