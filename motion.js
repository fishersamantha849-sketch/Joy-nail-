/* JOY NAIL ARTISTRY — motion layer: intro, hero entrance, scroll progress, parallax,
   3D tilt, spotlight, cursor glow, magnetic buttons, gallery stagger, CTA draw, confetti.
   Everything is skipped for users who prefer reduced motion. */
(function () {
  'use strict';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  document.addEventListener('DOMContentLoaded', () => {
    const hero = $('.hero');
    const startHero = () => hero && hero.classList.add('go');

    /* ---- Intro (homepage, once per browser session) ---- */
    const intro = $('#intro');
    let seen = false;
    try { seen = sessionStorage.getItem('jna-intro') === '1'; sessionStorage.setItem('jna-intro', '1'); } catch {}
    if (intro && !reduce && !seen) {
      document.body.style.overflow = 'hidden';
      setTimeout(() => { intro.classList.add('done'); document.body.style.overflow = ''; startHero(); }, 1500);
      intro.addEventListener('click', () => { intro.classList.add('done'); document.body.style.overflow = ''; startHero(); });
    } else {
      intro?.classList.add('skip');
      startHero();
    }

    /* ---- Scroll progress + parallax (one rAF loop, only while scrolling) ---- */
    const bar = $('#scroll-progress');
    const para = reduce ? [] : [
      ...(innerWidth >= 960 ? $$('.hero-media').map((el) => [el, -0.08]) : []),
      ...(innerWidth >= 960 ? $$('.hero-copy').map((el) => [el, 0.05]) : []),
      ...$$('.about-media picture').map((el, i) => [el, [0.04, -0.06, 0.08][i] || 0.04]),
      ...$$('.feature picture').map((el) => [el, -0.05]),
      ...$$('.toe-strip figure').map((el, i) => [el, [0.03, -0.04, 0.05][i] || 0]),
    ];
    let ticking = false;
    function frame() {
      ticking = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.transform = `scaleX(${max > 0 ? Math.min(1, scrollY / max) : 0})`;
      const vh = innerHeight;
      for (const [el, speed] of para) {
        const r = el.getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) continue;
        const center = r.top + r.height / 2 - vh / 2;
        el.style.translate = `0 ${(center * speed).toFixed(1)}px`;
      }
    }
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    frame();

    if (reduce) {
      $$('.stagger-items .g-item').forEach((el) => el.classList.add('in'));
      $$('.cta-band').forEach((el) => el.classList.add('in'));
      return;
    }

    /* ---- Gallery stagger + CTA draw on enter ---- */
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((entries) => {
        let i = 0;
        entries.forEach((en) => {
          if (!en.isIntersecting) return;
          const el = en.target;
          el.style.transitionDelay = el.classList.contains('g-item') ? `${(i++ % 4) * 90}ms` : '';
          el.classList.add('in');
          if (el.classList.contains('g-item')) setTimeout(() => (el.style.transitionDelay = ''), 1200);
          io.unobserve(el);
        });
      }, { threshold: 0.12, rootMargin: '0px 0px -5% 0px' });
      $$('.stagger-items .g-item, .cta-band').forEach((el) => io.observe(el));
    } else {
      $$('.stagger-items .g-item, .cta-band').forEach((el) => el.classList.add('in'));
    }

    /* ---- Spotlight cards (touch: follows the finger too) ---- */
    $$('.spot, .extra').forEach((el) => {
      el.classList.add('spot');
      const move = (x, y) => { const r = el.getBoundingClientRect(); el.style.setProperty('--mx', `${x - r.left}px`); el.style.setProperty('--my', `${y - r.top}px`); };
      el.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    });

    if (!finePointer) return; // everything below is mouse-only

    /* ---- 3D tilt on service cards ---- */
    $$('.size-card, .why-item').forEach((card) => {
      card.classList.add('tilt');
      card.addEventListener('pointermove', (e) => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(900px) rotateX(${(-py * 7).toFixed(2)}deg) rotateY(${(px * 9).toFixed(2)}deg) translateZ(0)`;
      });
      card.addEventListener('pointerleave', () => (card.style.transform = ''));
    });

    /* ---- Magnetic primary buttons ---- */
    $$('.btn-primary').forEach((b) => {
      b.addEventListener('pointermove', (e) => {
        const r = b.getBoundingClientRect();
        b.style.translate = `${((e.clientX - r.left) / r.width - 0.5) * 8}px ${((e.clientY - r.top) / r.height - 0.5) * 8}px`;
      });
      b.addEventListener('pointerleave', () => (b.style.translate = ''));
    });

    /* ---- Cursor glow ---- */
    const glow = document.createElement('div');
    glow.className = 'cursor-glow'; glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);
    let gx = innerWidth / 2, gy = innerHeight / 2, tx = gx, ty = gy, running = false;
    const loop = () => {
      gx += (tx - gx) * 0.12; gy += (ty - gy) * 0.12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      if (Math.abs(tx - gx) + Math.abs(ty - gy) > 0.5) requestAnimationFrame(loop); else running = false;
    };
    addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY; glow.classList.add('on');
      if (!running) { running = true; requestAnimationFrame(loop); }
    }, { passive: true });
    document.addEventListener('pointerleave', () => glow.classList.remove('on'));
  });

  /* ---- Nail-shaped confetti burst when a booking is confirmed ---- */
  window.JNA = window.JNA || {};
  window.JNA.burst = function (x = innerWidth / 2, y = innerHeight / 3) {
    if (reduce) return;
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('span');
      p.className = 'burst';
      const a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 180;
      p.style.left = x + 'px'; p.style.top = y + 'px';
      p.style.setProperty('--dx', `${Math.cos(a) * d}px`);
      p.style.setProperty('--dy', `${Math.sin(a) * d + 120}px`);
      p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      p.style.animationDelay = `${Math.random() * 120}ms`;
      if (i % 3 === 0) p.style.background = '#FFA3DF';
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 1600);
    }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const confirm = document.getElementById('confirm');
    if (!confirm) return;
    new MutationObserver(() => {
      if (!confirm.children.length) return;
      setTimeout(() => { const t = confirm.querySelector('.tick'); const r = t ? t.getBoundingClientRect() : null; window.JNA.burst(r ? r.left + r.width / 2 : undefined, r ? r.top + r.height / 2 : undefined); }, 350);
    }).observe(confirm, { childList: true });
  });
})();
