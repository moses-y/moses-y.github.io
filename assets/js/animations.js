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
      '.hero-content .hero-kicker',
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

    // 1b) Subtle scroll parallax — restrained depth, not a fairground ride.
    if (window.ScrollTrigger) {
      // Aurora background drifts slower than the page for a sense of depth.
      var bg = document.querySelector('.gradient-bg');
      if (bg) {
        gsap.to(bg, {
          yPercent: 18,
          ease: 'none',
          scrollTrigger: {
            trigger: document.body,
            start: 'top top',
            end: 'bottom top',
            scrub: 0.6
          }
        });
      }

      // Hero content lifts gently and fades as you scroll past it.
      var heroContent = document.querySelector('.hero-content');
      if (heroContent) {
        gsap.to(heroContent, {
          yPercent: -12,
          opacity: 0.65,
          ease: 'none',
          scrollTrigger: {
            trigger: '.hero',
            start: 'top top',
            end: 'bottom top',
            scrub: 0.5
          }
        });
      }

      // Any element tagged data-parallax gets a light scrub-linked drift.
      gsap.utils.toArray('[data-parallax]').forEach(function (el) {
        var depth = parseFloat(el.getAttribute('data-parallax')) || 8;
        gsap.fromTo(el, { yPercent: depth }, {
          yPercent: -depth,
          ease: 'none',
          scrollTrigger: {
            trigger: el,
            start: 'top bottom',
            end: 'bottom top',
            scrub: 0.5
          }
        });
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
