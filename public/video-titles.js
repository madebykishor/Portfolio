/* Exact original labels, not invented marketing names. The CSS stays premium.
   Approved mappings use the source video identity, never its position in a list. */
(function (root) {
  'use strict';
  const videoExtension = /\.(?:mp4|mov|webm|m4v|avi|mkv|mxf|mts|m2ts|wmv|mpg|mpeg|3gp)$/i;
  const text = value => typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 500) : '';
  const generic = /^(?:watch video|open film|video|film|audio\/video player|untitled(?: video| film)?|google drive|sign in(?:.*)?|access denied|forbidden|not found)$/i;
  const catalog = root.KIXOR_ORIGINAL_VIDEO_NAMES || [];
  function baseName(value) {
    let name = text(value);
    if (!name || /^https?:\/\//i.test(name)) return '';
    try { if (/%[0-9a-f]{2}/i.test(name)) name = decodeURIComponent(name); } catch { /* Preserve literal %. */ }
    return name.replace(videoExtension, '').trim();
  }
  // Deliberately conservative: no fuzzy semantic matching, dropped numbers,
  // spell correction, export-suffix removal, or inferred category-to-name links.
  const signature = value => baseName(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  const lookup = new Map();
  for (const name of catalog) {
    const key = signature(name);
    lookup.set(key, lookup.has(key) ? null : name);
  }
  function format(value) {
    const name = baseName(value);
    if (!name || generic.test(name)) return '';
    return lookup.get(signature(name)) || name;
  }
  function sourceKey(project = {}) {
    if (root.KixorVideoNames?.fromLocalPath(project.localVideo)) return 'local:' + project.localVideo;
    try {
      const u = new URL(project.embedUrl || project.externalUrl);
      if (u.protocol !== 'https:' || u.username || u.password || u.port) return '';
      if (u.hostname === 'www-ccv.adobe.io') {
        const m = u.pathname.match(/^\/v1\/player\/ccv\/([\w-]+)\/embed$/);
        return m ? 'adobe:' + m[1] : '';
      }
      if (u.hostname === 'drive.google.com') {
        const m = u.pathname.match(/^\/file\/d\/([\w-]+)\/(?:preview|view)$/);
        return m ? 'drive:' + m[1] : '';
      }
      if (u.hostname === 'www.youtube.com' || u.hostname === 'www.youtube-nocookie.com') {
        const m = u.pathname.match(/^\/embed\/([\w-]+)$/);
        return m ? 'youtube:' + m[1] : '';
      }
      if (u.hostname === 'player.vimeo.com') {
        const m = u.pathname.match(/^\/video\/(\d+)$/);
        return m ? 'vimeo:' + m[1] : '';
      }
    } catch { /* Missing source. */ }
    return '';
  }
  function resolve(project = {}) {
    const key = sourceKey(project);
    const map = root.KIXOR_VIDEO_TITLE_MAP || {};
    if (key && Object.hasOwn(map, key)) {
      const approved = text(map[key]);
      if (approved && !/^https?:\/\//i.test(approved)) return { title: approved, source: 'owner-confirmed' };
    }
    const Names = root.KixorVideoNames;
    const filename = Names?.fromMetadata(project) || Names?.fromLocalPath(project.localVideo) || '';
    for (const [raw, source] of [[filename, 'filename'], [project.sourceTitle, 'source-title'], [project.caption, 'caption']]) {
      const title = format(raw);
      if (title) return { title, source };
    }
    // A screenshot alone cannot tell which player ID is the matching video.
    // This is an action label, never a fabricated original title.
    return { title: 'Watch video', source: 'unavailable' };
  }
  const title = project => resolve(project).title;
  root.KixorVideoTitles = Object.freeze({ format, resolve, title, sourceKey, catalog });
})(typeof globalThis !== 'undefined' ? globalThis : window);
