/* Shared site behaviour: config, WhatsApp/social links, prices, nav, reveal animations, toast. */
(function () {
  'use strict';
  document.documentElement.classList.add('js');

  const JNA = (window.JNA = window.JNA || {});
  /** Booking-policy agreement, remembered on this device so customers only tick it once. */
  JNA.policy = {
    get() { try { return localStorage.getItem('jna-policy-agreed') === '1'; } catch { return !!JNA._agreed; } },
    set(v) { JNA._agreed = !!v; try { v ? localStorage.setItem('jna-policy-agreed', '1') : localStorage.removeItem('jna-policy-agreed'); } catch {} },
  };
  JNA.naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');

  let cfgPromise;
  JNA.config = () => (cfgPromise ||= fetch('/api/config').then((r) => { if (!r.ok) throw new Error('config'); return r.json(); }));

  JNA.toast = (msg, ms = 3200) => {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), ms);
  };

  JNA.waLink = (cfg, text) => {
    const num = String(cfg?.contact?.whatsappNumber || '').replace(/\D/g, '');
    return num ? `https://wa.me/${num}${text ? '?text=' + encodeURIComponent(text) : ''}` : null;
  };

  function wireLinks(cfg) {
    document.querySelectorAll('[data-wa]').forEach((a) => {
      const href = JNA.waLink(cfg, a.dataset.wa);
      if (href) { a.href = href; a.target = '_blank'; a.rel = 'noopener'; }
      else {
        a.href = document.getElementById('contact') ? '#contact' : 'index.html#contact';
        a.addEventListener('click', () => JNA.toast('WhatsApp is coming soon — please send Joy a message with the contact form for now.'));
      }
    });
    const socials = { instagram: cfg?.contact?.instagramUrl, tiktok: cfg?.contact?.tiktokUrl };
    document.querySelectorAll('[data-social]').forEach((a) => {
      const url = socials[a.dataset.social];
      if (url) { a.href = url; a.target = '_blank'; a.rel = 'noopener'; }
      else {
        a.setAttribute('aria-disabled', 'true');
        a.addEventListener('click', (e) => { e.preventDefault(); JNA.toast(`${a.dataset.social === 'tiktok' ? 'TikTok' : 'Instagram'} link coming soon.`); });
      }
    });
    if (cfg) {
      const byId = Object.fromEntries(cfg.services.map((s) => [s.id, s]));
      document.querySelectorAll('[data-price]').forEach((el) => { const s = byId[el.dataset.price]; if (s) el.textContent = JNA.naira(s.price); });
      document.querySelectorAll('[data-deposit]').forEach((el) => { el.textContent = JNA.naira(cfg.deposit.amount); });
      document.querySelectorAll('[data-pay]').forEach((el) => { if (cfg.deposit[el.dataset.pay]) el.textContent = cfg.deposit[el.dataset.pay]; });
    }
  }

  function nav() {
    const navEl = document.getElementById('nav');
    if (!navEl) return;
    const onScroll = () => navEl.classList.toggle('scrolled', window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const btn = navEl.querySelector('.menu-btn');
    const menu = document.getElementById('mobile-menu');
    if (!btn || !menu) return;
    const set = (open) => {
      document.body.classList.toggle('menu-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      menu.setAttribute('aria-hidden', String(!open));
      menu.inert = !open;
      if (open) menu.querySelector('a')?.focus();
    };
    menu.inert = true;
    btn.addEventListener('click', () => set(!document.body.classList.contains('menu-open')));
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.body.classList.contains('menu-open')) { set(false); btn.focus(); } });
  }

  function reveal() {
    const els = document.querySelectorAll('.reveal, .reveal-img');
    if (!('IntersectionObserver' in window)) { els.forEach((el) => el.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    els.forEach((el) => io.observe(el));
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-year]').forEach((el) => (el.textContent = new Date().getFullYear()));
    nav();
    reveal();
    JNA.config().then(wireLinks).catch(() => wireLinks(null));
  });
})();
