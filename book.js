/* Booking flow: Service → Date → Time → Details → Inspiration → Review → Payment → Confirmation */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const naira = (n) => window.JNA.naira(n);
  const MAX_FILE = 8 * 1024 * 1024;
  const STORE = 'jna-booking-v1';
  const PROGRESS = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, 6: 5, 7: 5, 8: 6 };
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const GROUPS = [
    { key: 'gel', title: 'Gel Sets', hint: 'Pick one · tap again to remove', thumbs: true },
    { key: 'acrylic', title: 'Acrylic Sets', hint: 'Pick one · tap again to remove', thumbs: true },
    { key: 'pedicure', title: 'Pedicure', hint: 'Tap to add or remove' },
    { key: 'toe', title: 'Toe Nails', hint: 'Pick one · tap again to remove', image: 'toe-medium' },
    { key: 'extra', title: 'Home Service & Extras', hint: 'Tap to add or remove' },
  ];
  const DESCS = {
    'pedicure': 'Soak, tidy, shape and polish',
    'toe-acrylic-plain': 'Acrylic in one solid colour',
    'toe-acrylic-french': 'Acrylic with a French tip',
    'toe-gel-polish': 'Gel colour on natural toenails',
    'home-service': 'Joy comes to you — add to a nail service',
    'soak-off': 'Removal of an old gel or acrylic set',
    'refill-design': 'Fill in a grown-out set + new design',
  };

  let cfg = null, byId = {};
  const state = { step: 1, services: [], date: null, time: null, timeLabel: '', dateLabel: '', name: '', phone: '', email: '', address: '', notes: '', payerName: '', paymentRef: '', insp: null, proof: null };
  let submitting = false;
  let calMonth = '', calRange = null;

  /* ---------------- persistence (survives switching to the OPay app and back) ---------------- */
  function save() {
    try {
      const { insp, proof, ...rest } = state;
      sessionStorage.setItem(STORE, JSON.stringify(rest));
    } catch {}
  }
  function restore() {
    try {
      const raw = sessionStorage.getItem(STORE);
      if (raw) Object.assign(state, JSON.parse(raw), { insp: null, proof: null });
    } catch {}
    if (state.step > 7 || state.step < 1) state.step = 1;
    const qs = ((window.JNA_PRE && window.JNA_PRE()) || new URLSearchParams(location.search).get('services'));
    if (qs) {
      const ids = qs.split(',').filter((id) => byId[id]);
      if (ids.length) { state.services = normalize(ids); state.step = 1; }
      history.replaceState(null, '', location.pathname);
    }
    state.services = normalize(state.services.filter((id) => byId[id]));
  }
  const clearStore = () => { try { sessionStorage.removeItem(STORE); } catch {} };

  /** Keep at most one option per exclusive group (latest wins). */
  function normalize(ids) {
    const out = []; const seen = {};
    [...ids].reverse().forEach((id) => {
      const s = byId[id]; if (!s || out.includes(id)) return;
      if (s.exclusive) { if (seen[s.group]) return; seen[s.group] = true; }
      out.unshift(id);
    });
    return out;
  }

  /* ---------------- totals ---------------- */
  function totals() {
    const items = state.services.map((id) => byId[id]);
    const subtotal = items.reduce((a, s) => a + s.price, 0);
    const deposit = Math.min(cfg.deposit.amount, subtotal);
    return { items, subtotal, deposit, balance: subtotal - deposit };
  }
  function linesTable({ items, subtotal, deposit, balance }) {
    return `<table class="lines"><tbody>
      ${items.map((s) => `<tr><td>${esc(s.name)}</td><td>${naira(s.price)}</td></tr>`).join('')}
      <tr class="sep total"><td>Subtotal</td><td>${naira(subtotal)}</td></tr>
      <tr class="dep"><td>Deposit (pay now)</td><td>${naira(deposit)}</td></tr>
      <tr class="bal"><td>Remaining balance</td><td>${naira(balance)}</td></tr>
    </tbody></table>`;
  }

  /* ---------------- step 1: services ---------------- */
  function renderServices() {
    const html = GROUPS.map((g) => {
      const list = cfg.services.filter((s) => s.group === g.key);
      if (!list.length) return '';
      const opts = list.map((s) => {
        const checked = state.services.includes(s.id) ? 'checked' : '';
        const box = `<span class="o-box">${window.JNA_ICONS.check}</span>`;
        if (g.thumbs) {
          return `<label class="opt"><input type="checkbox" value="${s.id}" ${checked} data-group="${s.group}" data-exclusive="${s.exclusive}">
            <span class="opt-card"><img src="images/${s.image}-400.webp" alt="" loading="lazy" width="400" height="420">${box}
            <span class="o-meta"><span class="o-name">${esc(s.size || s.name)}</span><span class="o-price">${naira(s.price)}</span></span></span></label>`;
        }
        const thumb = s.image ? `<img src="images/${s.image}-400.webp" alt="" loading="lazy" width="52" height="52" style="width:52px;height:52px;object-fit:cover;border-radius:3px">` : '';
        return `<label class="opt"><input type="checkbox" value="${s.id}" ${checked} data-group="${s.group}" data-exclusive="${s.exclusive}">
          <span class="opt-card">${thumb}<span class="o-txt"><span class="o-name">${esc(s.name)}</span><span class="o-desc">${esc(DESCS[s.id] || '')}</span></span><span class="o-price">${naira(s.price)}</span>${box}</span></label>`;
      }).join('');
      return `<fieldset class="svc-group" style="border:0;padding:0;margin:0 0 28px"><legend class="svc-group-h" style="width:100%"><h3>${g.title}</h3>${g.hint ? `<span>${g.hint}</span>` : ''}</legend>
        <div class="opt-grid ${g.thumbs ? 'thumbs' : ''}">${opts}</div></fieldset>`;
    }).join('');
    $('#svc-list').innerHTML = html;
    $('#svc-list').addEventListener('change', (e) => {
      const inp = e.target;
      if (inp.type !== 'checkbox') return;
      if (inp.checked && inp.dataset.exclusive === 'true') {
        $$(`#svc-list input[data-group="${inp.dataset.group}"]`).forEach((o) => { if (o !== inp) o.checked = false; });
      }
      state.services = normalize($$('#svc-list input:checked').map((i) => i.value));
      $('#svc-err').style.display = 'none';
      hideAlert();
      updateSummary(); save();
    });
  }

  /* ---------------- step 2: calendar ---------------- */
  async function loadMonth(month) {
    const cal = $('#cal');
    cal.classList.add('cal-loading');
    try {
      const r = await fetch(`/api/availability${month ? `?month=${month}` : ''}`);
      if (!r.ok) throw 0;
      const data = await r.json();
      calRange = data; calMonth = data.month;
      renderCalendar(data);
    } catch {
      showAlert("We couldn't load available dates. Please check your connection and try again.");
    } finally { cal.classList.remove('cal-loading'); }
  }
  function monthAdd(month, n) { const [y, m] = month.split('-').map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); }
  function renderCalendar(data) {
    const [y, m] = data.month.split('-').map(Number);
    $('#cal-title').textContent = `${MONTHS[m - 1]} ${y}`;
    $('#cal-prev').disabled = data.month <= data.from.slice(0, 7);
    $('#cal-next').disabled = data.month >= data.to.slice(0, 7);
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    const offset = (first + 6) % 7; // Monday first
    let html = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow" role="columnheader" aria-label="${d}">${d.slice(0, 2)}</div>`).join('');
    for (let i = 0; i < offset; i++) html += '<span class="day empty" aria-hidden="true"></span>';
    const labels = { open: 'available', full: 'fully booked', closed: 'closed', blocked: 'unavailable', past: 'past', out: 'not yet open for booking' };
    Object.entries(data.days).forEach(([date, st]) => {
      const d = Number(date.slice(8));
      const pretty = new Date(date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
      const cls = ['day', st, date === state.date ? 'selected' : '', date === data.today ? 'today' : ''].join(' ');
      html += `<button type="button" class="${cls}" data-date="${date}" ${st !== 'open' ? 'disabled' : ''} aria-label="${pretty}, ${labels[st]}${date === data.today ? ' (today)' : ''}" ${date === state.date ? 'aria-pressed="true"' : ''}>${d}</button>`;
    });
    $('#cal-grid').innerHTML = html;
  }
  function wireCalendar() {
    $('#cal-prev').addEventListener('click', () => loadMonth(monthAdd(calMonth, -1)));
    $('#cal-next').addEventListener('click', () => loadMonth(monthAdd(calMonth, 1)));
    $('#cal-grid').addEventListener('click', (e) => {
      const b = e.target.closest('.day[data-date]');
      if (!b || b.disabled) return;
      if (state.date !== b.dataset.date) { state.time = null; state.timeLabel = ''; }
      state.date = b.dataset.date;
      state.dateLabel = new Date(state.date + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
      renderCalendar(calRange); updateSummary(); save();
      hideAlert();
      setTimeout(() => go(3), 160);
    });
  }

  /* ---------------- step 3: time slots ---------------- */
  async function loadSlots() {
    const box = $('#slots');
    $('#slot-date').textContent = state.dateLabel;
    box.innerHTML = '<p class="muted">Loading times…</p>';
    try {
      const r = await fetch(`/api/slots?date=${state.date}`);
      if (!r.ok) throw 0;
      const { slots } = await r.json();
      if (state.time && !slots.some((s) => s.time === state.time && s.available)) { state.time = null; state.timeLabel = ''; updateSummary(); }
      if (!slots.some((s) => s.available)) {
        box.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><b>No available appointments for this date.</b>Please pick another day.</div>`;
        return;
      }
      box.innerHTML = slots.map((s) => `<button type="button" class="slot" data-time="${s.time}" data-label="${s.label}" aria-pressed="${s.time === state.time}" ${s.available ? '' : `disabled aria-label="${s.label}, already booked"`}>${s.available ? s.label : `<span><s>${s.label}</s><small>Booked</small></span>`}</button>`).join('');
    } catch {
      box.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><b>We couldn't load times.</b>Please check your connection and try again.</div>`;
    }
  }
  function wireSlots() {
    $('#slots').addEventListener('click', (e) => {
      const b = e.target.closest('.slot');
      if (!b || b.disabled) return;
      state.time = b.dataset.time; state.timeLabel = b.dataset.label;
      $$('#slots .slot').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      hideAlert(); updateSummary(); save();
    });
  }

  /* ---------------- step 4: details ---------------- */
  const FIELDS = { name: '#f-name', phone: '#f-phone', email: '#f-email', address: '#f-address', notes: '#f-notes', payerName: '#f-payer', paymentRef: '#f-payref' };
  function wireFields() {
    Object.entries(FIELDS).forEach(([k, sel]) => {
      const el = $(sel);
      el.value = state[k] || '';
      el.addEventListener('input', () => { state[k] = el.value; setInvalid(el, false); save(); });
    });
  }
  function needsAddress() { return state.services.some((id) => byId[id]?.requiresAddress); }
  function setInvalid(input, bad, msg) {
    const field = input.closest('.field');
    field.classList.toggle('invalid', bad);
    input.setAttribute('aria-invalid', String(bad));
    const err = field.querySelector('.err');
    if (msg && err) err.textContent = msg;
    if (err?.id) {
      const ids = new Set((input.getAttribute('aria-describedby') || '').split(' ').filter(Boolean));
      bad ? ids.add(err.id) : ids.delete(err.id);
      ids.size ? input.setAttribute('aria-describedby', [...ids].join(' ')) : input.removeAttribute('aria-describedby');
    }
  }
  function validateDetails() {
    const checks = [
      ['#f-name', state.name.trim().length >= 2],
      ['#f-phone', /^\+?[\d\s()-]{7,20}$/.test(state.phone.trim()) && state.phone.replace(/\D/g, '').length >= 7],
      ['#f-email', /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(state.email.trim())],
    ];
    if (needsAddress()) checks.push(['#f-address', state.address.trim().length >= 5]);
    let first = null;
    checks.forEach(([sel, ok]) => { setInvalid($(sel), !ok); if (!ok && !first) first = $(sel); });
    const agreed = $('#f-agree').checked;
    $('#agree-field').classList.toggle('invalid', !agreed);
    if (!agreed && !first) first = $('#f-agree');
    if (first) first.focus();
    return !first;
  }

  /* ---------------- file uploads ---------------- */
  function wireUpload(kind, inputSel, previewSel, allowPdf) {
    const input = $(inputSel), preview = $(previewSel), drop = input.closest('.dropzone');
    const errEl = kind === 'insp' ? $('#insp-err') : $('#f-proof-err');
    const field = input.closest('.field');
    const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
    const set = (file) => {
      field.classList.remove('invalid');
      if (!file) { state[kind] = null; preview.classList.remove('show'); drop.hidden = false; input.value = ''; updateNext(); return; }
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const isImg = /^image\//.test(file.type) || /\.(jpe?g|png|webp|heic|heif|gif)$/i.test(file.name);
      let msg = null;
      if (!(isImg || (allowPdf && isPdf))) msg = allowPdf ? 'Please upload a screenshot (JPG or PNG) or a PDF receipt.' : 'Please upload an image (JPG, PNG or WebP).';
      else if (file.size > MAX_FILE) msg = 'That file is too large. Please upload a file under 8 MB.';
      if (msg) { errEl.textContent = msg; field.classList.add('invalid'); input.value = ''; return; }
      state[kind] = file;
      const img = preview.querySelector('img'), doc = preview.querySelector('.pv-doc');
      if (isPdf) { img.hidden = true; if (doc) doc.hidden = false; }
      else { img.hidden = false; if (doc) doc.hidden = true; img.src = URL.createObjectURL(file); }
      preview.querySelector('.pv-name').textContent = file.name;
      preview.querySelector('.pv-size').textContent = fmt(file.size);
      preview.classList.add('show'); drop.hidden = true;
      hideAlert(); updateNext();
    };
    input.addEventListener('change', () => set(input.files[0] || null));
    ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('drag')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) set(e.dataTransfer.files[0]); });
    preview.querySelector('[data-remove]').addEventListener('click', () => { set(null); input.focus(); });
  }

  /* ---------------- step 6: review ---------------- */
  function renderReview() {
    const t = totals();
    const where = needsAddress() ? `Home service · ${esc(state.address)}` : `Studio · ${esc(cfg.location.line1)}, ${esc(cfg.location.line2)}`;
    let insp = '<dd>None — skipped</dd>';
    if (state.insp) insp = `<dd><img class="insp" src="${$('#insp-preview img').src}" alt="Your inspiration photo"></dd>`;
    $('#review').innerHTML = `
      <section><h3>Services <button type="button" data-goto="1">Edit</button></h3>${linesTable(t)}</section>
      <section><h3>Appointment <button type="button" data-goto="2">Change</button></h3>
        <dl><dt>Date</dt><dd>${esc(state.dateLabel)}</dd><dt>Time</dt><dd>${esc(state.timeLabel)}</dd><dt>Where</dt><dd>${where}</dd></dl></section>
      <section><h3>Your details <button type="button" data-goto="4">Edit</button></h3>
        <dl><dt>Name</dt><dd>${esc(state.name)}</dd><dt>Phone / WhatsApp</dt><dd>${esc(state.phone)}</dd><dt>Email</dt><dd>${esc(state.email)}</dd>${state.notes.trim() ? `<dt>Notes</dt><dd>${esc(state.notes)}</dd>` : ''}</dl></section>
      <section><h3>Inspiration photo <button type="button" data-goto="5">${state.insp ? 'Change' : 'Add'}</button></h3><dl><dt>Photo</dt>${insp}</dl></section>`;
  }

  /* ---------------- summary + action bar ---------------- */
  function updateSummary() {
    if (!cfg) return;
    const t = totals();
    const sum = $('#summary');
    if (!t.items.length) sum.innerHTML = '<h2>Your booking</h2><p class="s-empty">No service selected yet.</p>';
    else sum.innerHTML = `<h2>Your booking</h2>${linesTable(t)}${state.date ? `<p class="s-when"><b>${esc(state.dateLabel)}</b>${state.timeLabel ? ` · <b>${esc(state.timeLabel)}</b>` : ' · <span class="muted">time not chosen</span>'}</p>` : ''}`;
    $('#ab-label').textContent = t.items.length ? t.items.map((s) => s.name).join(' + ') : 'No service selected';
    $('#ab-total').textContent = naira(t.subtotal);
    $('#address-field').hidden = !needsAddress();
  }
  function updateNext() {
    const labels = { 1: 'Continue', 2: 'Continue', 3: 'Continue', 4: 'Continue', 5: state.insp ? 'Continue' : 'Skip', 6: 'Continue to payment', 7: 'Submit booking' };
    const label = labels[state.step] || 'Continue';
    [$('#next-desk'), $('#next-mob')].forEach((b) => { if (!submitting) b.textContent = label; });
  }

  /* ---------------- navigation ---------------- */
  function go(step, { focus = true } = {}) {
    state.step = step;
    $$('.step').forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === step));
    const p = PROGRESS[step];
    $$('#progress li').forEach((li) => {
      const n = Number(li.dataset.p);
      li.classList.toggle('done', n < p); li.classList.toggle('current', n === p);
      n === p ? li.setAttribute('aria-current', 'step') : li.removeAttribute('aria-current');
    });
    $('#action-bar').hidden = step === 8;
    $('#step-actions').hidden = step === 8;
    if (step === 2) loadMonth(state.date ? state.date.slice(0, 7) : calMonth || '');
    if (step === 3) loadSlots();
    if (step === 6) renderReview();
    updateNext(); updateSummary();
    if (step !== 8) save();
    window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    if (focus) setTimeout(() => $(`.step[data-step="${step}"] .step-title`)?.focus({ preventScroll: true }), 50);
  }

  function next() {
    hideAlert();
    switch (state.step) {
      case 1: {
        if (!state.services.length) { $('#svc-err').style.display = 'block'; showAlert('Please select a service.'); return; }
        const onlyHome = state.services.every((id) => byId[id].requiresAddress);
        if (onlyHome) { showAlert('Home Service is added to a nail service — please choose the service you want too.'); return; }
        return go(2);
      }
      case 2: if (!state.date) return showAlert('Please select a date.'); return go(3);
      case 3: if (!state.time) return showAlert('Please select a time.'); return go(4);
      case 4: {
        if (validateDetails()) return go(5);
        const onlyAgree = !$$('#t4 ~ .form-grid .field.invalid').some((f) => f.id !== 'agree-field');
        return showAlert(onlyAgree ? 'Please agree to the booking policy to continue.' : needsAddress() && state.address.trim().length < 5 && state.name.trim().length >= 2 ? 'Please enter the address for your home service.' : 'Please check the highlighted fields.');
      }
      case 5: return go(6);
      case 6: return go(7);
      case 7: return submit();
    }
  }

  /* ---------------- submit ---------------- */
  async function submit() {
    if (submitting) return;
    let bad = null;
    if (state.payerName.trim().length < 2) { setInvalid($('#f-payer'), true); bad = bad || $('#f-payer'); }
    if (!state.proof) { $('#f-proof-err').textContent = 'Please upload your payment proof.'; $('#proof-field').classList.add('invalid'); bad = bad || $('#f-proof'); }
    if (!$('#f-agree').checked) { go(4); $('#agree-field').classList.add('invalid'); showAlert('Please agree to the booking policy to continue.'); return; }
    if (bad) { showAlert(!state.proof ? 'Please upload your payment proof.' : 'Please enter the name on the account you paid from.'); bad.focus(); return; }

    const fd = new FormData();
    fd.append('services', JSON.stringify(state.services));
    ['date', 'time', 'name', 'phone', 'email', 'notes', 'payerName', 'paymentRef'].forEach((k) => fd.append(k, (state[k] || '').trim()));
    if (needsAddress()) fd.append('address', state.address.trim());
    if (state.insp) fd.append('inspiration', state.insp);
    fd.append('proof', state.proof);
    fd.append('policyAgreed', '1');

    submitting = true;
    [$('#next-desk'), $('#next-mob')].forEach((b) => { b.disabled = true; b.innerHTML = '<span class="spinner" aria-hidden="true"></span> Submitting…'; });
    try {
      const r = await fetch('/api/bookings', { method: 'POST', body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        const msg = j.error || 'Your booking could not be submitted. Please try again.';
        const stepFor = { services: 1, date: 2, time: 3, name: 4, phone: 4, email: 4, address: 4, inspiration: 5, payerName: 7, proof: 7, agree: 4 };
        if (r.status === 409) { state.time = null; state.timeLabel = ''; go(3); showAlert(msg); return; }
        if (j.field && stepFor[j.field] && stepFor[j.field] !== 7) go(stepFor[j.field]);
        showAlert(msg);
        return;
      }
      clearStore();
      // Send a copy to Joy's inbox via Formspree (runs in the background; the booking is already saved).
      window.JNA.formspree?.booking(j.booking, {
        phone: state.phone.trim(), email: state.email.trim(), notes: state.notes.trim(), address: needsAddress() ? state.address.trim() : '',
        payerName: state.payerName.trim(), paymentRef: state.paymentRef.trim(), proof: state.proof, insp: state.insp,
        link: `${new URL('booking.html', location.href).href.split('?')[0].split('#')[0]}?ref=${encodeURIComponent(j.booking.ref)}&t=${j.booking.token}`,
      })?.then((ok) => {
        // Where Formspree is the only way bookings reach Joy, tell the customer if it didn't go through.
        if (ok || !window.JNA_FORMSPREE_REQUIRED) return;
        window.JNA_FS_FAILED = true;
        const n = document.querySelector('#confirm .preview-note');
        if (n) n.textContent = window.JNA_FS_FAILED_TEXT;
      });
      renderConfirmation(j.booking);
      go(8);
    } catch {
      showAlert('Your booking could not be submitted. Please check your connection and try again.');
    } finally {
      submitting = false;
      [$('#next-desk'), $('#next-mob')].forEach((b) => (b.disabled = false));
      updateNext();
    }
  }

  function renderConfirmation(b) {
    const link = `${new URL('booking.html', location.href).href.split('?')[0].split('#')[0]}?ref=${encodeURIComponent(b.ref)}&t=${b.token}`;
    const wa = window.JNA.waLink(cfg, `Hi Joy! I just booked ${b.services.map((s) => s.name).join(' + ')} for ${b.dateLabel} at ${b.timeLabel}. My booking reference is ${b.ref}.`);
    $('#confirm').innerHTML = `
      <div class="tick">${window.JNA_ICONS.check}</div>
      <h2>Booking Request Received!</h2>
      <p class="muted" style="margin:0 0 18px">Thank you, ${esc(b.name.split(' ')[0])}. Joy will verify your deposit and confirm your appointment.</p>
      <span class="badge s-verify">Pending payment verification</span>
      <div class="review" style="margin-top:22px">
        <section><h3>Booking ${esc(b.ref)}</h3>
          <dl><dt>Name</dt><dd>${esc(b.name)}</dd>
          <dt>Service${b.services.length > 1 ? 's' : ''}</dt><dd>${b.services.map((s) => esc(s.name)).join('<br>')}</dd>
          <dt>Date</dt><dd>${esc(b.dateLabel)}</dd><dt>Time</dt><dd>${esc(b.timeLabel)}</dd>
          <dt>Deposit</dt><dd>${naira(b.deposit)}</dd><dt>Balance</dt><dd>${naira(b.balance)}</dd>
          <dt>Status</dt><dd>Pending payment verification</dd></dl></section>
      </div>
      <p style="margin:22px 0 0;font-weight:700">Save your booking link</p>
      <p class="hint">Use it to check your booking status any time — including after Joy confirms.</p>
      <div class="link-box"><code>${esc(link)}</code><button class="copy-btn" type="button" id="copy-link">${window.JNA_ICONS.copy} Copy</button></div>
      <div class="actions">
        <a class="btn btn-primary" ${wa ? `href="${esc(wa)}" target="_blank" rel="noopener"` : 'href="index.html#contact" data-nowa'}>${window.JNA_ICONS.whatsapp} Contact Joy on WhatsApp</a>
        <a class="btn" href="${esc(link)}">View booking status</a>
      </div>
      <p style="margin-top:22px"><a class="link-arrow" href="index.html">Back to home</a></p>`;
    $('#copy-link').addEventListener('click', () => copy(link, 'Booking link copied'));
    $('[data-nowa]')?.addEventListener('click', () => window.JNA.toast('WhatsApp is coming soon — please use the contact form for now.'));
  }

  /* ---------------- helpers ---------------- */
  function showAlert(msg) { const a = $('#alert'); a.textContent = msg; a.hidden = false; a.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  function hideAlert() { $('#alert').hidden = true; }
  async function copy(text, done) {
    try { await navigator.clipboard.writeText(text); window.JNA.toast(done); }
    catch { window.JNA.toast('Copy not available — please copy it manually.'); }
  }

  /* ---------------- init ---------------- */
  document.addEventListener('DOMContentLoaded', async () => {
    $('#nav')?.classList.add('solid');
    window.JNA_ICONS = {
      check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
      copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a1 1 0 0 1 1-1h10"/></svg>',
      whatsapp: $('.help-link svg')?.outerHTML || '',
    };
    try { cfg = await window.JNA.config(); }
    catch { $('#svc-list').innerHTML = '<p class="alert">Booking is temporarily unavailable. Please refresh the page or contact Joy.</p>'; return; }
    byId = Object.fromEntries(cfg.services.map((s) => [s.id, s]));
    restore();

    $('#pay-amount').textContent = naira(cfg.deposit.amount);
    $('#pay-bank').textContent = cfg.deposit.bank;
    $('#pay-acct').textContent = cfg.deposit.accountNumber;
    $('#pay-name').textContent = cfg.deposit.accountName;
    $('#copy-acct').addEventListener('click', () => copy(cfg.deposit.accountNumber, 'Account number copied'));
    $('#f-agree').checked = window.JNA.policy.get();
    $('#f-agree').addEventListener('change', (e) => { window.JNA.policy.set(e.target.checked); $('#agree-field').classList.toggle('invalid', false); hideAlert(); });

    renderServices();
    wireCalendar(); wireSlots(); wireFields();
    wireUpload('insp', '#f-insp', '#insp-preview', false);
    wireUpload('proof', '#f-proof', '#proof-preview', true);
    $$('[data-back]').forEach((b) => b.addEventListener('click', () => { hideAlert(); go(state.step - 1); }));
    $('#review').addEventListener('click', (e) => { const b = e.target.closest('[data-goto]'); if (b) go(Number(b.dataset.goto)); });
    $('#next-desk').addEventListener('click', next);
    $('#next-mob').addEventListener('click', next);
    $('#book-form').addEventListener('submit', (e) => e.preventDefault());

    // Update pay-card foot when the deposit is the full amount (small bookings).
    const foot = () => { const t = totals(); $('#pay-amount').textContent = naira(t.deposit || cfg.deposit.amount); $('#pay-foot').textContent = t.balance > 0 ? `Your remaining balance of ${naira(t.balance)} is paid to Joy as arranged for your appointment.` : 'This covers your full booking total.'; };
    $('#svc-list').addEventListener('change', foot); foot();

    // Resume where the customer left off (e.g. after paying in the OPay app). Steps needing files restart at review.
    let start = state.step;
    if (start >= 3 && !state.date) start = 2;
    if (start >= 4 && !state.time) start = 3;
    if (start >= 2 && !state.services.length) start = 1;
    go(start, { focus: false });
  });

})();
