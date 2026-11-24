/* Homepage: size selectors, gallery filter + lightbox, map, contact form, sticky book bar. */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  document.addEventListener('DOMContentLoaded', () => {
    /* ---- Gel / Acrylic size selectors ---- */
    const prices = {};
    $$('[data-price]').forEach((el) => (prices[el.dataset.price] = el));
    $$('[data-size-group]').forEach((group) => {
      const key = group.dataset.sizeGroup;
      const book = $(`[data-size-book="${key}"]`);
      const note = $(`[data-size-note="${key}"]`);
      const update = () => {
        const input = group.querySelector('input:checked');
        if (!input) {
          book.href = 'book.html';
          book.textContent = 'Choose your set';
          note.textContent = 'Tap a length to select it. Tap again to unselect.';
          return;
        }
        const card = input.closest('.size-opt');
        const size = card.querySelector('.sz').textContent;
        const price = card.querySelector('.pr').textContent;
        const label = { gel: 'Gel', acrylic: 'Acrylic' }[key] + ' ' + size;
        book.href = `book.html?services=${encodeURIComponent(input.value)}`;
        book.textContent = `Book ${label}`;
        note.innerHTML = `Selected: <b>${label} — ${price}</b>`;
      };
      // One length per set: picking one clears the others; tapping the picked one clears it.
      group.addEventListener('change', (e) => {
        if (e.target.checked) group.querySelectorAll('input').forEach((i) => { if (i !== e.target) i.checked = false; });
      });
      group.addEventListener('change', update);
      update();
      // Prices may update from config after load.
      window.JNA.config().then(() => setTimeout(update, 0)).catch(() => {});
    });

    /* ---- Booking policy agreement ---- */
    const box = $('#agree-box');
    if (box) {
      const check = $('#policy-check'), agree = $('#policy-agree');
      const render = () => {
        const on = window.JNA.policy.get();
        box.querySelector('.agree-off').hidden = on;
        box.querySelector('.agree-on').hidden = !on;
        agree.disabled = !check.checked;
      };
      check.addEventListener('change', render);
      agree.addEventListener('click', () => {
        if (!check.checked) return;
        window.JNA.policy.set(true); render();
        window.JNA.toast('Thank you — you agreed to the booking policy.');
        box.querySelector('.agree-on a')?.focus();
      });
      $('#policy-undo').addEventListener('click', () => { window.JNA.policy.set(false); check.checked = false; render(); check.focus(); });
      render();
    }

    /* ---- Gallery filter ---- */
    const items = $$('#masonry .g-item');
    $$('[data-filter]').forEach((chip) => chip.addEventListener('click', () => {
      $$('[data-filter]').forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      const f = chip.dataset.filter;
      items.forEach((it) => (it.hidden = f !== 'all' && it.dataset.cat !== f));
    }));

    /* ---- Lightbox ---- */
    const lb = $('#lightbox'), img = $('#lb-img'), cap = $('#lb-cap'), count = $('#lb-count');
    let list = [], idx = 0, lastFocus = null;
    const srcFor = (slug) => { const pic = $(`#masonry [data-slug="${slug}"] img`); return pic ? pic.currentSrc || pic.src : ''; };
    const bigSrc = (slug) => {
      const s = srcFor(slug); // swap to largest available size
      return s.replace(/-(\d+)\.(webp|jpg)$/, (m, w, ext) => {
        const srcset = $(`#masonry [data-slug="${slug}"] source`)?.srcset || '';
        const widths = srcset.split(',').map((x) => parseInt(x.trim().split(' ')[1], 10)).filter(Boolean);
        return `-${Math.max(...widths, +w)}.${ext}`;
      });
    };
    function show(i) {
      idx = (i + list.length) % list.length;
      const it = list[idx];
      img.style.opacity = 0;
      img.onload = () => (img.style.opacity = 1);
      img.src = bigSrc(it.dataset.slug);
      img.alt = it.querySelector('img').alt;
      cap.innerHTML = `<b>${it.dataset.title}</b>${it.dataset.desc}`;
      count.textContent = `${String(idx + 1).padStart(2, '0')} / ${String(list.length).padStart(2, '0')}`;
    }
    function open(slug) {
      list = items.filter((x) => !x.hidden);
      if (!list.some((x) => x.dataset.slug === slug)) list = items;
      lastFocus = document.activeElement;
      show(list.findIndex((x) => x.dataset.slug === slug));
      lb.classList.add('open'); lb.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      $('#lb-close').focus();
    }
    function close() {
      lb.classList.remove('open'); lb.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      lastFocus?.focus();
    }
    items.forEach((it) => it.addEventListener('click', () => open(it.dataset.slug)));
    $$('[data-open-gallery]').forEach((b) => b.addEventListener('click', () => {
      $$('[data-filter]')[0].click();
      open(b.dataset.openGallery);
    }));
    $('#lb-close').addEventListener('click', close);
    $('#lb-prev').addEventListener('click', () => show(idx - 1));
    $('#lb-next').addEventListener('click', () => show(idx + 1));
    lb.addEventListener('click', (e) => { if (e.target === lb || e.target.id === 'lb-stage') close(); });
    document.addEventListener('keydown', (e) => {
      if (!lb.classList.contains('open')) return;
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowLeft') show(idx - 1);
      else if (e.key === 'ArrowRight') show(idx + 1);
      else if (e.key === 'Tab') { // keep focus inside
        const f = $$('button', lb); const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    let sx = null;
    $('#lb-stage').addEventListener('touchstart', (e) => (sx = e.touches[0].clientX), { passive: true });
    $('#lb-stage').addEventListener('touchend', (e) => {
      if (sx === null) return;
      const dx = e.changedTouches[0].clientX - sx; sx = null;
      if (Math.abs(dx) > 45) show(idx + (dx < 0 ? 1 : -1));
    });

    /* ---- Map (loaded on request: faster page + no third-party tracking until asked) ---- */
    const loadMap = $('#load-map');
    loadMap?.addEventListener('click', async () => {
      let q = 'Ayekale, Osogbo, Osun State, Nigeria';
      try { q = (await window.JNA.config()).location.mapQuery || q; } catch {}
      $('#map').innerHTML = `<iframe title="Map showing Joy Nail Artistry in Ayekale, Osogbo" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(q)}&output=embed"></iframe>`;
    });

    /* ---- Contact form ---- */
    const form = $('#contact-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = $('#contact-status');
      status.className = 'form-status'; status.textContent = '';
      const data = Object.fromEntries(new FormData(form));
      const checks = [
        ['name', (v) => v.trim().length >= 2],
        ['email', (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim())],
        ['message', (v) => v.trim().length >= 5],
      ];
      let firstBad = null;
      checks.forEach(([k, ok]) => {
        const input = form.elements[k]; const field = input.closest('.field');
        const bad = !ok(data[k] || '');
        field.classList.toggle('invalid', bad);
        input.setAttribute('aria-invalid', String(bad));
        input.setAttribute('aria-describedby', bad ? field.querySelector('.err').id : '');
        if (bad && !firstBad) firstBad = input;
      });
      if (firstBad) { firstBad.focus(); return; }
      const btn = form.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        const r = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Your message could not be sent. Please try again.');
        window.JNA.formspree?.message({ name: data.name.trim(), email: data.email.trim(), message: data.message.trim() });
        form.reset();
        status.className = 'form-status ok'; status.textContent = 'Thank you! Your message has been sent — Joy will get back to you soon.';
      } catch (err) {
        status.className = 'form-status bad'; status.textContent = err.message && !/fetch/i.test(err.message) ? err.message : 'Your message could not be sent. Please check your connection and try again.';
      } finally { btn.disabled = false; btn.textContent = 'Send message'; }
    });

    /* ---- Sticky mobile book bar: show after hero, hide near contact/footer ---- */
    const bar = $('#sticky-book'), hero = $('.hero'), footer = $('.footer');
    if (bar && hero && 'IntersectionObserver' in window) {
      let pastHero = false, atFooter = false;
      const upd = () => bar.classList.toggle('show', pastHero && !atFooter);
      new IntersectionObserver(([en]) => { pastHero = !en.isIntersecting; upd(); }).observe(hero);
      new IntersectionObserver(([en]) => { atFooter = en.isIntersecting; upd(); }).observe(footer);
    }
  });
})();
