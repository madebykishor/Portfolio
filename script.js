/* kixor. Minimal progressive enhancement. No dependencies, tracking, or build step. */
(() => {
  'use strict';

  const data = window.KIXOR_PORTFOLIO;
  const Names = window.KixorVideoNames;
  const Titles = window.KixorVideoTitles;
  const displayName = project => Titles?.title(project) || project.title;
  if (!data || !Array.isArray(data.projects)) return;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const pad = number => String(number).padStart(2, '0');
  const categories = new Map(data.categories.map(category => [category.id, category]));
  let projects = data.projects.filter(project => categories.has(project.category)).map(Names.normalize);
  const projectMap = new Map(projects.map(project => [project.id, project]));
  const isLibrary = document.body.dataset.page === 'work';
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let activeFilter = 'all';
  let visibleProjects = projects.slice();
  let searchTerm = '';
  let activeProject = null;
  let playlist = [];
  let returnFocus = null;

  // Never accept script: or data: links from content configuration.
  function externalURL(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'https:' ? url.href : 'https://www.behance.net/madebykishor';
    } catch (_) {
      return 'https://www.behance.net/madebykishor';
    }
  }

  function embedURL(value) {
    return window.KixorThumbnails?.safeURL(value) || null;
  }

  function localVideoURL(value) {
    if (typeof value !== 'string' || value.includes('..')) return null;
    return /^(?:\.\/)?assets\/videos\/[a-zA-Z0-9_./% -]+\.(mp4|webm)$/i.test(value) ? value : null;
  }

  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    if (name === 'play') {
      svg.setAttribute('fill', 'currentColor');
      path.setAttribute('d', 'm9 5 11 7-11 7z');
    } else {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', '1.4');
      path.setAttribute('d', 'M5 19 19 5M5 5h14v14');
    }
    svg.append(path);
    return svg;
  }

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function routeUpdate(changes) {
    if (!isLibrary) return;
    try {
      const url = new URL(window.location.href);
      Object.entries(changes).forEach(([key, value]) => {
        if (value && value !== 'all') url.searchParams.set(key, value);
        else url.searchParams.delete(key);
      });
      // replaceState avoids adding a history entry for every keystroke.
      window.history.replaceState(null, '', url);
    } catch (_) {
      // Some file:// environments disallow history changes. Browsing still works.
    }
  }

  // Content hooks keep counts and contact actions aligned with site-data.js.
  $$('[data-total-videos]').forEach(node => { node.textContent = projects.length; });
  $$('[data-year]').forEach(node => { node.textContent = new Date().getFullYear(); });
  $$('[data-category-count]').forEach(node => {
    const count = projects.filter(project => project.category === node.dataset.categoryCount).length;
    node.textContent = `${pad(count)} films`;
  });
  if (data.person && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.person.email)) {
    $$('[data-email-link]').forEach(node => { node.href = `mailto:${data.person.email}`; });
    $$('[data-email-text]').forEach(node => { node.textContent = data.person.email; });
  }
  $$('[data-whatsapp-link]').forEach(node => {
    if (/^\d{10,15}$/.test(data.person.whatsapp)) node.href = `https://wa.me/${data.person.whatsapp}`;
  });

  // Mobile navigation remains ordinary, visible links when JavaScript is disabled.
  const header = $('.site-header');
  const menu = $('.menu-toggle');
  const nav = $('#main-nav');
  function closeMenu(restoreFocus = false) {
    if (!header || !menu) return;
    header.classList.remove('nav-open');
    menu.setAttribute('aria-expanded', 'false');
    if (restoreFocus) menu.focus();
  }
  if (header && menu && nav) {
    header.classList.add('nav-enhanced');
    menu.hidden = false;
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      header.classList.toggle('nav-open', open);
    });
    nav.addEventListener('click', event => {
      if (event.target.closest('a')) closeMenu();
    });
    document.addEventListener('click', event => {
      if (!header.contains(event.target)) closeMenu();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && header.classList.contains('nav-open')) closeMenu(true);
    });
    nav.addEventListener('focusout', () => {
      window.setTimeout(() => {
        if (!header.contains(document.activeElement)) closeMenu();
      }, 0);
    });
    const desktop = window.matchMedia('(min-width: 761px)');
    const onBreakpoint = () => closeMenu();
    if (desktop.addEventListener) desktop.addEventListener('change', onBreakpoint);
    else if (desktop.addListener) desktop.addListener(onBreakpoint);
  }

  // One player at a time. Closing the dialog destroys its iframe/video immediately.
  const dialog = $('#film-dialog');
  const stage = $('#player-stage');
  const nativeDialog = dialog && typeof dialog.showModal === 'function';
  const navigation = $('.player-navigation');

  function playerFallback(message, original) {
    const box = element('div', 'player-fallback');
    box.append(element('p', '', message));
    const link = element('a', '', 'Open original video');
    link.href = externalURL(original);
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    box.append(link);
    stage.replaceChildren(box);
  }

  function mountPlayer(project) {
    const oldVideo = $('video', stage);
    if (oldVideo) oldVideo.pause();
    stage.replaceChildren();
    stage.classList.toggle('is-portrait', project.ratio === '9/16');
    const local = localVideoURL(project.localVideo);
    if (project.localVideo) {
      if (!local) {
        playerFallback('The local video path is invalid. Check site-data.js.', project.externalUrl);
        return;
      }
      const video = document.createElement('video');
      video.controls = true;
      video.playsInline = true;
      video.preload = 'metadata';
      video.setAttribute('aria-label', displayName(project));
      video.src = local;
      video.addEventListener('error', () => {
        playerFallback('The video could not be loaded. Please check that the actual video file is uploaded.', project.externalUrl);
      }, { once: true });
      stage.append(video);
      // A user explicitly chose Play. A blocked play() never prevents using controls.
      const start = video.play();
      if (start && typeof start.catch === 'function') start.catch(() => {});
      return;
    }
    const source = embedURL(project.embedUrl);
    if (!source) {
      playerFallback('This provider is not enabled in the embedded player.', project.externalUrl);
      return;
    }
    const loading = element('span', 'player-loading', 'Loading the original player...');
    loading.setAttribute('aria-hidden', 'true');
    const iframe = document.createElement('iframe');
    iframe.title = displayName(project);
    iframe.allow = 'autoplay; fullscreen; encrypted-media; picture-in-picture';
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = 'strict-origin-when-cross-origin';
    iframe.loading = 'eager';
    iframe.src = source;
    // A load event is NOT treated as proof that a private/remote video is playable.
    iframe.addEventListener('load', () => loading.remove(), { once: true });
    stage.append(loading, iframe);
  }

  function showProject(project, trigger = null, list = []) {
    if (!nativeDialog) return false;
    if (trigger) returnFocus = trigger;
    activeProject = project;
    playlist = list.slice();
    $('#film-title').textContent = displayName(project);
    $('#film-title').title = displayName(project);
    $('#film-description').textContent = project.description || '';
    $('#film-category').textContent = categories.get(project.category)?.name || project.label || 'Featured edit';
    const original = $('#film-external');
    original.href = externalURL(project.externalUrl);
    original.firstChild.textContent = project.category ? 'Open on Behance ' : 'Open original ';
    const index = playlist.findIndex(item => item.id === project.id);
    navigation.hidden = playlist.length < 2 || index < 0;
    $('#film-position').textContent = index >= 0 ? `${index + 1} / ${playlist.length}` : '';
    closeMenu();
    if (!dialog.open) {
      dialog.showModal();
      document.body.classList.add('has-dialog');
    }
    mountPlayer(project);
    if (isLibrary && project.id) routeUpdate({ video: project.id });
    return true;
  }

  if (nativeDialog) {
    $('.close-dialog', dialog).addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      const video = $('video', stage);
      if (video) video.pause();
      stage.replaceChildren();
      document.body.classList.remove('has-dialog');
      activeProject = null;
      playlist = [];
      routeUpdate({ video: null });
      if (returnFocus && returnFocus.isConnected && returnFocus.getClientRects().length) {
        returnFocus.focus({ preventScroll: true });
      }
      returnFocus = null;
    });
    function moveFilm(direction) {
      if (!activeProject || playlist.length < 2) return;
      const index = playlist.findIndex(item => item.id === activeProject.id);
      const next = (index + direction + playlist.length) % playlist.length;
      showProject(playlist[next], null, playlist);
    }
    $('#film-prev').addEventListener('click', () => moveFilm(-1));
    $('#film-next').addEventListener('click', () => moveFilm(1));
    document.addEventListener('click', event => {
      const trigger = event.target.closest('[data-video-open], [data-featured-open]');
      if (!trigger || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const project = trigger.hasAttribute('data-featured-open') ? data.featured : projectMap.get(trigger.dataset.videoOpen);
      if (!project) return;
      event.preventDefault();
      showProject(project, trigger, project.id ? visibleProjects : []);
    });
  }
  const featuredLink = $('[data-featured-open]');
  if (featuredLink && data.featured) {
    featuredLink.href = externalURL(data.featured.externalUrl);
    featuredLink.setAttribute('aria-label', `Play ${displayName(data.featured)}`);
    const heading = $('.reel-bottom h2');
    if (heading) heading.textContent = displayName(data.featured);
    if (data.featured.localVideo) {
      const caption = $('.reel-caption > span');
      if (caption) caption.textContent = data.featured.label || 'Showreel';
    }
  }

  // Render from the editable content file. Static HTML remains the no-JS fallback.
  function renderProjectRows() {
    const list = $('#project-list');
    if (!list) return;
    const fragment = document.createDocumentFragment();
    projects.forEach((project, index) => {
      const category = categories.get(project.category);
      const article = element('article', 'film-row');
      article.dataset.reveal = '';
      article.style.setProperty('--stagger', `${(index % 3) * 70}ms`);
      article.dataset.projectRow = '';
      article.dataset.projectId = project.id;
      article.dataset.category = project.category;
      const link = element('a', 'film-row-link');
      link.href = externalURL(project.externalUrl);
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.dataset.videoOpen = project.id;
      link.setAttribute('aria-label', `Watch ${displayName(project)} - ${category.name}`);
      link.append(element('span', 'film-no', pad(index + 1)));
      const image = window.KixorThumbnails.create(project, 'film-thumb');
      link.append(image);
      const copy = element('div', 'film-row-copy');
      copy.append(element('span', 'film-row-category', category.name));
      const line = element('div', 'film-title-line');
      const title = element('h2', '', displayName(project));
      title.title = displayName(project);
      title.dataset.videoTitle = project.id;
      const arrow = element('span', 'film-title-arrow');
      arrow.setAttribute('aria-hidden', 'true');
      arrow.append(icon('arrow'));
      line.append(title, arrow);
      copy.append(line);
      const play = element('span', 'film-row-play');
      play.append(element('span', '', 'Watch film'), icon('play'));
      link.append(copy, play);
      article.append(link);
      fragment.append(article);
    });
    list.replaceChildren(fragment);
    window.KixorThumbnails.prune();
  }

  function applyFilters(updateRoute = true) {
    if (!isLibrary) return;
    const term = searchTerm.trim().toLocaleLowerCase();
    visibleProjects = projects.filter(project => {
      const category = categories.get(project.category);
      const matchesCategory = activeFilter === 'all' || project.category === activeFilter;
      const haystack = [displayName(project), project.title, project.originalFileName, project.sourceTitle, project.caption, project.description, category.name, ...(project.tags || [])].join(' ').toLocaleLowerCase();
      return matchesCategory && (!term || haystack.includes(term));
    });
    const visible = new Set(visibleProjects.map(project => project.id));
    let count = 0;
    $$('[data-project-row]').forEach(row => {
      row.hidden = !visible.has(row.dataset.projectId);
      if (!row.hidden) $('.film-no', row).textContent = pad(++count);
    });
    $$('[data-filter]').forEach(button => {
      const selected = button.dataset.filter === activeFilter;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    const selectedCategory = categories.get(activeFilter)?.name;
    $('#results-count').textContent = `${visibleProjects.length} ${visibleProjects.length === 1 ? 'film' : 'films'}${selectedCategory ? ` / ${selectedCategory}` : ''}`;
    $('#empty-state').hidden = visibleProjects.length > 0;
    if (updateRoute) routeUpdate({ category: activeFilter, q: searchTerm.trim(), video: null });
    document.dispatchEvent(new CustomEvent('kixor:filtered'));
  }

  function readRoute() {
    const params = new URLSearchParams(window.location.search);
    const category = params.get('category');
    activeFilter = categories.has(category) ? category : 'all';
    searchTerm = (params.get('q') || '').slice(0, 100);
    const search = $('#film-search');
    if (search) search.value = searchTerm;
    applyFilters(false);
    const requested = projectMap.get(params.get('video'));
    if (requested) {
      if (!visibleProjects.some(project => project.id === requested.id)) {
        activeFilter = requested.category;
        searchTerm = '';
        search.value = '';
        applyFilters(false);
      }
      showProject(requested, null, visibleProjects);
    } else if (nativeDialog && dialog.open) {
      dialog.close();
    }
  }

  function refreshCounts() {
    $$('[data-total-videos]').forEach(node => { node.textContent = projects.length; });
    $$('[data-total-categories]').forEach(node => { node.textContent = categories.size; });
    $$('[data-category-count]').forEach(node => {
      const count = projects.filter(p => p.category === node.dataset.categoryCount).length;
      node.textContent = `${pad(count)} films`;
    });
  }

  function renderFilterButtons() {
    const group = $('.filter-buttons');
    if (!group) return;
    const items = [{ id:'all', name:'All work' }, ...categories.values()];
    const fragment = document.createDocumentFragment();
    items.forEach(category => {
      const button = element('button', 'filter-button', `${category.name} `);
      button.type = 'button'; button.dataset.filter = category.id;
      const selected = activeFilter === category.id;
      button.classList.toggle('is-active', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.append(element('span', '', category.id === 'all' ? projects.length : projects.filter(p => p.category === category.id).length));
      fragment.append(button);
    });
    group.replaceChildren(fragment);
  }

  function renderHomeWork() {
    const grid = $('.work-grid');
    if (!grid) return;
    const fragment = document.createDocumentFragment();
    [...categories.values()].forEach((category, index) => {
      const films = projects.filter(p => p.category === category.id);
      if (!films.length) return;
      const article = element('article', 'work-card');
      article.dataset.reveal = '';
      article.style.setProperty('--stagger', `${(index % 3) * 80}ms`);
      const link = element('a', 'work-card-link');
      link.href = `work.html?category=${encodeURIComponent(category.id)}`;
      link.setAttribute('aria-label', `Explore ${category.name}: ${films.length} films`);
      const art = element('div', 'work-art');
      art.append(window.KixorThumbnails.create(films[0], 'collection-thumb'));
      const badge = element('span', 'work-badge', 'Explore '); badge.append(icon('arrow')); art.append(badge);
      const caption = element('div', 'work-caption');
      const copy = element('div');
      copy.append(element('p', 'work-meta', category.group || 'Video collection'));
      copy.append(element('h3', '', category.name));
      const arrow = element('span', 'work-arrow'); arrow.setAttribute('aria-hidden','true'); arrow.append(icon('arrow'));
      caption.append(copy, arrow); link.append(art, caption); article.append(link);
      const count = element('span', 'work-count', `${pad(films.length)} films`); count.dataset.categoryCount = category.id; article.append(count);
      fragment.append(article);
    });
    grid.replaceChildren(fragment);
    window.KixorThumbnails.prune();
  }

  let queuedPortfolio = null;
  function receivePortfolio(detail) {
    if (!detail?.projects || !detail?.categories) return;
    if (dialog?.open) { queuedPortfolio = detail; return; }
    categories.clear();
    detail.categories.forEach(category => categories.set(category.id, category));
    projects = detail.projects.filter(p => categories.has(p.category)).map(p => Names.merge(projectMap.get(p.id) || {}, p));
    projectMap.clear(); projects.forEach(p => projectMap.set(p.id, p));
    data.projects = projects; data.categories = [...categories.values()];
    if (!categories.has(activeFilter)) activeFilter = 'all';
    visibleProjects = projects.slice();
    if (isLibrary) {
      renderProjectRows(); renderFilterButtons(); applyFilters(false);
      // Resolve a link to a newly discovered film after its feed arrives.
      const requested = new URLSearchParams(location.search).get('video');
      if (requested && projectMap.has(requested) && !dialog?.open) readRoute();
    } else renderHomeWork();
    refreshCounts();
  }
  document.addEventListener('kixor:portfolio', event => receivePortfolio(event.detail));
  dialog?.addEventListener('close', () => {
    if (!queuedPortfolio) return;
    const next = queuedPortfolio; queuedPortfolio = null; receivePortfolio(next);
  });
  if (!isLibrary) renderHomeWork();
  refreshCounts();

  if (isLibrary) {
    renderProjectRows();
    const search = $('#film-search');
    renderFilterButtons();
    $('.filter-buttons').addEventListener('click', event => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      activeFilter = button.dataset.filter;
      applyFilters();
    });
    let searchTimer;
    search.addEventListener('input', () => {
      window.clearTimeout(searchTimer);
      searchTerm = search.value;
      searchTimer = window.setTimeout(applyFilters, 120);
    });
    $('#reset-filters').addEventListener('click', () => {
      activeFilter = 'all';
      searchTerm = '';
      search.value = '';
      applyFilters();
      $('[data-filter="all"]').focus();
    });
    readRoute();
    window.addEventListener('popstate', readRoute);
  }

  // Explicitly draft an email. No personal data is posted to a nonexistent service.
  const form = $('#contact-form');
  if (form) {
    const status = $('.form-status', form);
    function brief() {
      const values = new FormData(form);
      const get = name => String(values.get(name) || '').trim();
      return {
        subject: `Portfolio enquiry - ${get('type') || 'New project'}`,
        body: `Hello Kishor,\n\nName: ${get('name')}\nReply email: ${get('email')}\nProject type: ${get('type') || 'To discuss'}\nBudget: ${get('budget') || 'To discuss'}\n\n${get('message')}\n\nSent from the kixor. portfolio.`
      };
    }
    function isValid() {
      $('#contact-name').value = $('#contact-name').value.trim();
      $('#contact-message').value = $('#contact-message').value.trim();
      return form.reportValidity();
    }
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!isValid()) return;
      const message = brief();
      status.textContent = 'Your email app should open with the draft. Review it and press Send there. If nothing opens, use Copy brief and email it directly.';
      window.location.href = `mailto:${data.person.email}?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body)}`;
    });
    $('.copy-brief', form).addEventListener('click', async () => {
      if (!isValid()) return;
      const message = brief();
      const text = `To: ${data.person.email}\nSubject: ${message.subject}\n\n${message.body}`;
      let copied = false;
      if (navigator.clipboard && window.isSecureContext) {
        try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { /* Try a local fallback. */ }
      }
      if (!copied) {
        const active = document.activeElement;
        const temporary = document.createElement('textarea');
        temporary.value = text;
        temporary.style.position = 'fixed';
        temporary.style.opacity = '0';
        temporary.style.top = '0';
        document.body.append(temporary);
        temporary.select();
        try { copied = document.execCommand('copy'); } catch (_) { copied = false; }
        temporary.remove();
        if (active) active.focus({ preventScroll: true });
      }
      if (copied) {
        status.textContent = 'Brief copied. Paste it into an email or WhatsApp message, review it, and send.';
      } else {
        status.textContent = 'Automatic copying is unavailable. Select the brief below and copy it manually.';
        let fallback = $('#copy-fallback');
        if (!fallback) {
          fallback = document.createElement('textarea');
          fallback.id = 'copy-fallback';
          fallback.className = 'copy-fallback';
          fallback.setAttribute('aria-label', 'Your project brief, ready to copy');
          fallback.readOnly = true;
          form.append(fallback);
        }
        fallback.value = text;
        fallback.focus();
        fallback.select();
      }
    });
  }

  $$('[data-enhance]').forEach(node => { node.hidden = false; });

  // Optional motion is isolated in motion.js. All content remains usable without it.
})();
