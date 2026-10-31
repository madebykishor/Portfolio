/* Kixor Motion Studio: lightweight, dependency-free progressive enhancement. */
(() => {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduced.matches) return;
  const root = document.documentElement;
  const revealTargets = document.querySelectorAll('main section, .work-card, .reel-frame, .section-heading, .hero-kicker');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(({target, isIntersecting}) => {
        if (!isIntersecting) return;
        target.classList.add('motion-visible');
        observer.unobserve(target);
      });
    }, {threshold: .08, rootMargin: '0px 0px -30px 0px'});
    revealTargets.forEach((element, i) => {
      element.classList.add('motion-reveal');
      element.style.setProperty('--reveal-delay', `${Math.min(i % 4, 3) * 75}ms`);
      observer.observe(element);
    });
  }
  // Magnetic buttons only on fine-pointer devices; no mouse tracking on touch.
  if (window.matchMedia('(hover:hover) and (pointer:fine)').matches) {
    document.querySelectorAll('.button').forEach(button => {
      button.classList.add('motion-magnetic');
      button.addEventListener('pointermove', e => {
        const rect = button.getBoundingClientRect();
        const x = (e.clientX - rect.left - rect.width / 2) * .12;
        const y = (e.clientY - rect.top - rect.height / 2) * .12;
        button.style.setProperty('--mag-x', `${x.toFixed(1)}px`);
        button.style.setProperty('--mag-y', `${y.toFixed(1)}px`);
      }, {passive:true});
      button.addEventListener('pointerleave', () => {
        button.style.removeProperty('--mag-x');
        button.style.removeProperty('--mag-y');
      });
    });
  }
  const progress = document.createElement('div');
  progress.className = 'motion-scroll-progress';
  progress.setAttribute('aria-hidden','true');
  document.body.append(progress);
  let scheduled = false;
  const update = () => {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${max > 0 ? Math.min(1, Math.max(0, scrollY / max)) : 0})`;
    scheduled = false;
  };
  window.addEventListener('scroll', () => { if (!scheduled) {scheduled = true; requestAnimationFrame(update);} }, {passive:true});
  window.addEventListener('resize', update, {passive:true});
  update();
  root.classList.add('motion-ready');
})();
