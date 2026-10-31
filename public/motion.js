/* Optional motion layer. Native scrolling, no animation library, no hidden dependencies. */
(() => {
  'use strict';
  const root = document.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const header = $('.site-header');
  const nav = $('#main-nav');
  const reel = $('.reel-cover');
  let scheduled = false;
  let revealObserver;
  let sectionObserver;
  const observed = new WeakSet();
  const motionAllowed = () => !reduce.matches;

  // Never gate essential content behind an animation or a font/network request.
  root.classList.add('motion-ready');
  function observeReveals(scope = document) {
    scope.querySelectorAll('[data-reveal]').forEach(node => {
      if (observed.has(node)) return;
      observed.add(node);
      if (!motionAllowed() || !('IntersectionObserver' in window)) {
        node.classList.add('is-visible'); return;
      }
      node.classList.add('will-reveal');
      revealObserver.observe(node);
    });
  }
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      });
    }, { threshold:.04, rootMargin:'0px 0px -12px 0px' });
  }
  observeReveals();

  // New items added by the Behance feed receive the same finite reveal.
  const grid = $('.work-grid') || $('#project-list');
  if (grid && 'MutationObserver' in window) {
    new MutationObserver(() => observeReveals(grid)).observe(grid, { childList:true });
  }

  // Subtle active-link background slides; the actual link hit areas never move.
  let indicator;
  const links = nav ? [...nav.querySelectorAll('[data-nav-section]')] : [];
  if (nav) {
    indicator = document.createElement('span');
    indicator.className = 'nav-indicator';
    indicator.setAttribute('aria-hidden','true');
    nav.prepend(indicator);
    nav.classList.add('has-indicator');
  }
  function moveIndicator(link) {
    if (!indicator) return;
    if (!link || innerWidth <= 760) { indicator.style.opacity = '0'; return; }
    indicator.style.width = `${link.offsetWidth}px`;
    indicator.style.transform = `translateX(${link.offsetLeft}px)`;
    indicator.style.opacity = '1';
  }
  function setActive(id) {
    links.forEach(link => {
      if (link.dataset.navSection === id) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    });
    moveIndicator(links.find(link => link.dataset.navSection === id));
  }
  if (document.body.dataset.page === 'home' && 'IntersectionObserver' in window) {
    sectionObserver = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin:'-15% 0px -55% 0px', threshold:0 });
    ['projects','about','contact'].forEach(id => { const node = document.getElementById(id); if (node) sectionObserver.observe(node); });
  }
  links.forEach(link => {
    link.addEventListener('pointerenter',() => moveIndicator(link));
    link.addEventListener('focus',() => moveIndicator(link));
  });
  nav?.addEventListener('pointerleave',() => moveIndicator(links.find(link => link.hasAttribute('aria-current'))));
  nav?.addEventListener('focusout',() => requestAnimationFrame(() => {
    if (!nav.contains(document.activeElement)) moveIndicator(links.find(link => link.hasAttribute('aria-current')));
  }));

  // At most one frame per scroll event burst. No perpetual animation loop.
  function updateScroll() {
    scheduled = false;
    const y = scrollY;
    // Hysteresis prevents header-height changes from oscillating at the cutoff.
    // The 16px height change must not immediately cross the opposite threshold.
    if (y > 40) header?.classList.add('is-scrolled');
    else if (y < 4) header?.classList.remove('is-scrolled');
    if (motionAllowed()) {
      const maximum = Math.max(1,root.scrollHeight - innerHeight);
      root.style.setProperty('--progress', String(Math.min(1,Math.max(0,y / maximum))));
      if (reel && fine.matches) {
        const box = reel.getBoundingClientRect();
        if (box.bottom >= 0 && box.top <= innerHeight) {
          const shift = Math.max(-12,Math.min(12,(innerHeight / 2 - (box.top + box.height / 2)) * .025));
          reel.style.setProperty('--reel-y', `${shift.toFixed(2)}px`);
        }
      }
    }
    if (y < 80 && document.body.dataset.page === 'home') setActive(null);
  }
  function schedule() { if (!scheduled) { scheduled = true; requestAnimationFrame(updateScroll); } }
  addEventListener('scroll',schedule,{ passive:true });
  addEventListener('resize',() => { schedule(); moveIndicator(links.find(link => link.hasAttribute('aria-current'))); },{ passive:true });
  updateScroll();
  moveIndicator(links.find(link => link.hasAttribute('aria-current')));
  if (document.fonts?.ready) document.fonts.ready.then(() => moveIndicator(links.find(link => link.hasAttribute('aria-current'))));

  // Small pointer response on button CONTENT only: its layout and hit area stay fixed.
  $$('[data-magnetic]').forEach(button => {
    const inner = document.createElement('span');
    inner.className = 'magnetic-inner';
    inner.style.display = 'inline-flex'; inner.style.alignItems = 'center'; inner.style.gap = '16px';
    inner.style.transition = 'transform .45s cubic-bezier(.22,1,.36,1)';
    while (button.firstChild) inner.append(button.firstChild);
    button.append(inner);
    button.addEventListener('pointermove',event => {
      if (!motionAllowed() || !fine.matches) return;
      const box = button.getBoundingClientRect();
      const x = ((event.clientX - box.left) / box.width - .5) * 5;
      const y = ((event.clientY - box.top) / box.height - .5) * 4;
      inner.style.transform = `translate(${x.toFixed(2)}px,${y.toFixed(2)}px)`;
    },{ passive:true });
    button.addEventListener('pointerleave',() => { inner.style.transform = 'none'; });
    button.addEventListener('blur',() => { inner.style.transform = 'none'; });
  });

  // Responsive filter feedback; animations are cancelled instead of stacking up.
  document.addEventListener('kixor:filtered',() => {
    if (!grid) return;
    observeReveals(grid);
    const rows = [...grid.querySelectorAll('.film-row:not([hidden])')];
    rows.forEach((row,index) => {
      if (!motionAllowed() || !row.animate) return;
      row.getAnimations().forEach(animation => animation.cancel());
      const box = row.getBoundingClientRect();
      if (box.top > innerHeight || box.bottom < 0) return;
      row.classList.add('is-visible');
      row.animate([{ opacity:.2,transform:'translateY(8px)' },{ opacity:1,transform:'none' }], {
        duration:400,delay:Math.min(index,5)*28,easing:'cubic-bezier(.22,1,.36,1)'
      });
    });
  });

  // One configurable path serves every resume button, including mobile navigation.
  const path = window.KIXOR_PORTFOLIO?.person?.resume;
  if (typeof path === 'string' && /^assets\/resume\/[a-zA-Z0-9_./% -]+\.pdf$/i.test(path) && !path.includes('..')) {
    $$('[data-resume-link]').forEach(link => { link.href = path; });
  }
  function motionPreferenceChanged() {
    if (!reduce.matches) return;
    revealObserver?.disconnect();
    $$('[data-reveal]').forEach(node => node.classList.add('is-visible'));
    document.getAnimations().forEach(animation => animation.cancel());
    reel?.style.removeProperty('--reel-y');
  }
  if (reduce.addEventListener) reduce.addEventListener('change',motionPreferenceChanged);
  else reduce.addListener?.(motionPreferenceChanged);
})();
