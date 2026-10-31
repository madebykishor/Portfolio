/* Shared naming policy. File names are preserved, not prettified or numbered. */
(function (root) {
  'use strict';
  const FIELDS = ['originalFileName', 'originalFilename', 'original_file_name', 'original_filename', 'fileName', 'filename', 'file_name'];
  const VIDEO = /\.(?:mp4|mov|webm|m4v|avi|mkv|mxf|mts|m2ts|wmv|mpg|mpeg|3gp)$/i;
  const GENERIC = /^(?:(?:adobe |behance )?(?:audio\/video |video |media )?player|audio\/video|video|film|view video|watch video|untitled(?: film| video)?|google drive|sign in(?:.*)?|access denied|forbidden|not found|just a moment.*|\d{3}(?: error)?)$/i;
  const text = value => typeof value === 'string' && value.length <= 1024 ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim() : '';
  function fileName(value) {
    const name = text(value);
    return name && !/[/\\\r\n]/.test(name) && !/^https?:/i.test(name) && !['.', '..'].includes(name) ? name : '';
  }
  function fromLocalPath(value) {
    if (typeof value !== 'string' || !value || /^[a-z]+:\/\//i.test(value) || value.includes('..')) return '';
    let name = value.replace(/\\/g, '/').split('/').pop();
    try { name = decodeURIComponent(name); } catch { return ''; }
    return VIDEO.test(name) ? fileName(name) : '';
  }
  function fromMetadata(record) {
    if (!record || typeof record !== 'object') return '';
    // Only direct metadata for this video: never traverse unrelated player assets.
    for (const object of [record, record.file, record.video, record.asset, record.metadata]) {
      if (!object || typeof object !== 'object') continue;
      for (const key of FIELDS) {
        const name = fileName(object[key]);
        if (name) return name;
      }
      const name = fileName(object.name);
      if (name && VIDEO.test(name)) return name;
    }
    return '';
  }
  function sourceTitle(value) {
    const title = text(value);
    return title && !GENERIC.test(title) ? title : '';
  }
  function resolve(record = {}) {
    const originalFileName = fromMetadata(record) || fromLocalPath(record.localVideo);
    if (originalFileName) return { title: originalFileName, originalFileName, titleSource: 'filename' };
    const native = sourceTitle(record.sourceTitle);
    if (native) return { title: native, originalFileName: '', sourceTitle: native, titleSource: 'source-title' };
    const caption = sourceTitle(record.caption);
    if (caption) return { title: caption, originalFileName: '', caption, titleSource: 'caption' };
    // Never infer a file name from a provider ID, a CDN rendition, or a category.
    return { title: 'Watch video', originalFileName: '', titleSource: 'unavailable' };
  }
  function normalize(record) { return { ...record, ...resolve(record) }; }
  function merge(previous = {}, incoming = {}) {
    const name = fromMetadata(incoming) || fromMetadata(previous);
    const native = sourceTitle(incoming.sourceTitle) || sourceTitle(previous.sourceTitle);
    const caption = text(incoming.caption) || text(previous.caption);
    return normalize({ ...previous, ...incoming, originalFileName: name, sourceTitle: native, caption });
  }
  root.KixorVideoNames = Object.freeze({ fileName, fromLocalPath, fromMetadata, sourceTitle, resolve, normalize, merge });
})(typeof globalThis !== 'undefined' ? globalThis : window);
