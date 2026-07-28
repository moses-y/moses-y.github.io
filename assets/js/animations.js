/*
 * animations.js — GSAP motion layer (separation of concerns).
 *
 * Purely additive polish. The site is fully functional without it:
 *   - if GSAP fails to load (offline/CDN blocked), nothing here runs;
 *   - the existing CSS `.reveal` / IntersectionObserver still shows all content;
 *   - respects `prefers-reduced-motion`.
 *
 * GSAP is client-side only and fully supported on GitHub Pages (static hosting).
 */
(function () {
  'use strict';

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var reduce = window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // No GSAP or user prefers less motion → leave the CSS reveal to do its job.
    if (reduce || typeof window.gsap === 'undefined') return;

    var gsap = window.gsap;
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

    // 1) Hero entrance — staggered rise on load.
    var heroBits = [
      '.hero-content .hero-badge',
      '.hero-content h1',
      '.hero-content .tagline',
      '.hero-content .bio',
      '.hero-content .hero-buttons',
      '.hero-content .hero-stats'
    ].map(function (s) { return document.querySelector(s); })
     .filter(Boolean);

    if (heroBits.length) {
      gsap.from(heroBits, {
        y: 24, opacity: 0, duration: 0.7, ease: 'power3.out',
        stagger: 0.12, clearProps: 'all'
      });
    }

    // 2) Scroll-triggered staggered reveals for card groups.
    if (window.ScrollTrigger) {
      var groups = [
        '.bento-grid .bento-card',
        '.services-grid .service-card',
        '.timeline-item'
      ];
      groups.forEach(function (sel) {
        var items = gsap.utils.toArray(sel);
        if (!items.length) return;
        gsap.from(items, {
          scrollTrigger: {
            trigger: items[0].parentNode,
            start: 'top 80%'
          },
          y: 32, opacity: 0, duration: 0.6, ease: 'power2.out',
          stagger: 0.1, clearProps: 'all'
        });
      });
    }
  });
})();
