window.JNA_SITE = {"businessName":"JOY NAIL ARTISTRY","timezone":"Africa/Lagos","currency":"₦","contact":{"whatsappNumber":"2347046387251","whatsappNumberFormatHint":"International format, digits only, e.g. 2348012345678","instagramUrl":"https://www.instagram.com/nailedbyjoy_","tiktokUrl":"https://www.tiktok.com/@joy_nailartistry","publicEmail":""},"formspree":{"formId":"xjykzqzp","attachFiles":false,"_note":"attachFiles: set to true only on a Formspree plan with file uploads (Personal or higher). Then the payment proof and inspiration photo are attached to the email."},"location":{"line1":"Ayekale beside Eskay Gas","line2":"Osogbo, Osun State","country":"Nigeria","mapQuery":"Ayekale, Osogbo, Osun State, Nigeria"},"hours":{"openDays":[1,2,3,4,5,6],"open":"10:00","close":"19:00","slotMinutes":60,"sameDayLeadMinutes":30,"bookableMonthsAhead":1},"deposit":{"amount":5000,"bank":"OPay","accountNumber":"7046387251","accountName":"Andrew Joy Loveth"},"services":[{"id":"pedicure","name":"Pedicure","price":10000,"group":"pedicure","image":"pedicure"},{"id":"gel-short","name":"Gel Short","size":"Short","price":15000,"group":"gel","exclusive":true,"image":"gel-small"},{"id":"gel-medium","name":"Gel Medium","size":"Medium","price":18000,"group":"gel","exclusive":true,"image":"gel-medium"},{"id":"gel-long","name":"Gel Long","size":"Long","price":23000,"group":"gel","exclusive":true,"image":"gel-long"},{"id":"acrylic-short","name":"Acrylic Short","size":"Short","price":16000,"group":"acrylic","exclusive":true,"image":"acrylic-small"},{"id":"acrylic-medium","name":"Acrylic Medium","size":"Medium","price":20000,"group":"acrylic","exclusive":true,"image":"acrylic-medium"},{"id":"acrylic-long","name":"Acrylic Long","size":"Long","price":27000,"group":"acrylic","exclusive":true,"image":"acrylic-long"},{"id":"toe-acrylic-plain","name":"Toe Acrylic Plain","price":10000,"group":"toe","exclusive":true},{"id":"toe-acrylic-french","name":"Toe Acrylic French","price":12000,"group":"toe","exclusive":true},{"id":"toe-gel-polish","name":"Toe Gel Polish","price":4000,"group":"toe","exclusive":true},{"id":"home-service","name":"Home Service","price":15000,"group":"extra","requiresAddress":true},{"id":"soak-off","name":"Soak Off","price":5000,"group":"extra"},{"id":"refill-design","name":"Refill & Design","price":20000,"group":"extra"}]};
/* JOY NAIL ARTISTRY: shared bookings engine (Supabase).
   Answers the same /api/* calls the booking pages already make, but bookings now live in Joy's
   Supabase database, so Joy sees every booking from any phone. The database refuses double bookings. */
(function () {
  'use strict';
  const SITE = window.JNA_SITE;
  const SB_URL = 'https://wskkrtcpufceolkvcovt.supabase.co';
  const SB_KEY = 'sb_publishable_MLVLmaj2U_ta_9-lIRNQSg_vLMzesUp';
  const TZ = SITE.timezone;
  window.JNA_FORMSPREE_REQUIRED = false; // the database is the source of truth; Formspree is just an extra email to Joy
  window.JNA_FS_FAILED_TEXT = '';

  const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} }, del: (k) => { try { sessionStorage.removeItem(k); } catch {} } };

  /* ---- load supabase-js on demand so no page has to change ---- */
  let sbp;
  function sb() {
    if (sbp) return sbp;
    sbp = new Promise((res, rej) => {
      const make = () => res(window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
      if (window.supabase) return make();
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.min.js';
      s.onload = make; s.onerror = () => { sbp = null; rej(new Error('load')); };
      document.head.appendChild(s);
    });
    return sbp;
  }

  /* ---- dates and times (Lagos) ---- */
  function partsNow() {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute, year: +p.year, month: +p.month };
  }
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const label = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const allSlots = () => { const out = []; const { open, close, slotMinutes } = SITE.hours; for (let t = toMin(open); t + slotMinutes <= toMin(close); t += slotMinutes) out.push(fromMin(t)); return out; };
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const weekday = (s) => new Date(s + 'T12:00:00Z').getUTCDay();
  const pretty = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  function range() {
    const n = partsNow();
    const end = new Date(Date.UTC(n.year, n.month - 1 + SITE.hours.bookableMonthsAhead + 1, 0));
    return { from: n.date, to: end.toISOString().slice(0, 10), today: n.date, nowMinutes: n.minutes };
  }
  const addDays = (s, n) => new Date(new Date(s + 'T12:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10);

  /* ---- what is busy (names/phones are never exposed, only dates and times) ---- */
  const busyCache = { at: 0, v: null };
  async function busy(force) {
    if (!force && busyCache.v && Date.now() - busyCache.at < 8000) return busyCache.v;
    const r = range(); const c = await sb();
    const { data, error } = await c.rpc('public_busy', { p_from: r.from, p_to: r.to });
    if (error) throw error;
    busyCache.v = {
      taken: new Set(data.taken.map((x) => x.date + ' ' + x.time)),
      blockedDates: new Set(data.blockedDates),
      blockedSlots: new Set(data.blockedSlots.map((x) => x.date + ' ' + x.time)),
    };
    busyCache.at = Date.now();
    return busyCache.v;
  }
  function slotsFor(date, B) {
    const r = range(); const cutoff = date === r.today ? r.nowMinutes + SITE.hours.sameDayLeadMinutes : -1;
    return allSlots().filter((t) => toMin(t) > cutoff).map((t) => {
      const k = date + ' ' + t; const booked = B.taken.has(k), blocked = B.blockedSlots.has(k);
      return { time: t, label: label(t), available: !booked && !blocked, reason: booked ? 'booked' : blocked ? 'blocked' : null };
    });
  }
  function dateProblem(date, B) {
    if (!isValidDate(date)) return 'invalid';
    const r = range();
    if (date < r.from) return 'past';
    if (date > r.to) return 'out-of-range';
    if (!SITE.hours.openDays.includes(weekday(date))) return 'closed';
    if (B.blockedDates.has(date)) return 'blocked';
    return null;
  }
  function monthStatus(month, B) {
    const [y, m] = month.split('-').map(Number); const days = new Date(Date.UTC(y, m, 0)).getUTCDate(); const r = range(), out = {};
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`; let st;
      if (date < r.from) st = 'past'; else if (date > r.to) st = 'out';
      else if (!SITE.hours.openDays.includes(weekday(date))) st = 'closed';
      else if (B.blockedDates.has(date)) st = 'blocked';
      else st = slotsFor(date, B).some((s) => s.available) ? 'open' : 'full';
      out[date] = st;
    }
    return out;
  }

  /* ---- responses ---- */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (msg, status = 400, field) => json(field ? { error: msg, field } : { error: msg }, status);
  const shape = (b) => ({ ...b, dateLabel: pretty(b.date), timeLabel: label(b.time) });
  function rpcError(e) {
    const hint = e && e.hint ? String(e.hint) : '';
    const msg = e && e.message ? String(e.message) : '';
    if (hint.startsWith('conflict:')) return err(msg, 409, hint.slice(9));
    if (hint === 'notfound') return err(msg, 404);
    if (/^(services|date|time|name|phone|email|address|payerName|agree|proof|message)$/.test(hint)) return err(msg, 400, hint);
    if (/Failed to fetch|NetworkError|load/i.test(msg)) return err('We could not reach the booking system. Please check your internet and try again.', 503);
    return err(msg && msg.length < 160 ? msg : 'Something went wrong. Please try again.', 400);
  }

  /* ---- files: shrink photos, keep small PDFs ---- */
  const hex = (n) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => (b % 16).toString(16)).join(''); };
  async function uploadFile(file, allowPdf, field) {
    if (!file || !file.size) return null;
    if (file.size > 12 * 1024 * 1024) throw Object.assign(new Error('That file is too large. Please upload one under 8 MB.'), { field });
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    let blob = file, ext = 'pdf', type = 'application/pdf';
    if (isPdf) {
      if (!allowPdf) throw Object.assign(new Error('Please upload an image (JPG, PNG or WebP).'), { field });
      if (file.size > 8 * 1024 * 1024) throw Object.assign(new Error('That file is too large. Please upload one under 8 MB.'), { field });
    } else {
      try {
        const url = URL.createObjectURL(file);
        const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
        const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
        blob = await new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('x'))), 'image/jpeg', 0.8));
        ext = 'jpg'; type = 'image/jpeg';
      } catch {
        throw Object.assign(new Error(allowPdf ? 'That file could not be read. Please upload a screenshot (JPG or PNG) or a PDF receipt.' : "That image couldn't be read. Please try a JPG or PNG photo."), { field });
      }
    }
    const name = hex(24) + '.' + ext; const c = await sb();
    const { error } = await c.storage.from('booking-files').upload(name, blob, { contentType: type, upsert: false });
    if (error) throw Object.assign(new Error('We could not upload that file. Please check your internet and try again.'), { field });
    return name;
  }

  /* ---- routes ---- */
  async function route(method, path, q, body) {
    if (method === 'GET' && path === 'config') {
      const { contact, location, hours, deposit, services, businessName, currency, timezone, formspree } = SITE;
      return json({ businessName, currency, timezone, contact, location, hours, deposit, services, formspree: { formId: formspree?.formId || '', attachFiles: !!formspree?.attachFiles } });
    }
    if (method === 'GET' && path === 'availability') {
      const r = range(); const month = q.get('month') || r.today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return err('Invalid month.');
      const B = await busy(true);
      return json({ month, today: r.today, from: r.from, to: r.to, days: monthStatus(month, B) });
    }
    if (method === 'GET' && path === 'slots') {
      const date = q.get('date') || ''; const B = await busy(true); const p = dateProblem(date, B);
      return json(p ? { date, slots: [], closed: p } : { date, slots: slotsFor(date, B) });
    }
    if (method === 'POST' && path === 'bookings') {
      const f = body; const g = (k) => (f && f.get ? f.get(k) : null); const c = await sb();
      let ids; try { ids = JSON.parse(g('services') || '[]'); } catch { ids = []; }
      const proofFile = g('proof');
      if (!proofFile || !proofFile.size) {
        // let the database check everything else first so the customer sees the first thing to fix
        const probe = await c.rpc('create_booking', { p: { services: ids, date: g('date'), time: g('time'), name: g('name'), phone: g('phone'), email: g('email'), address: g('address'), payerName: g('payerName'), policyAgreed: g('policyAgreed'), proofPath: '' } });
        return probe.error ? rpcError(probe.error) : err('Please upload your payment proof.', 400, 'proof');
      }
      let proof, insp;
      try { proof = await uploadFile(proofFile, true, 'proof'); insp = await uploadFile(g('inspiration'), false, 'inspiration'); }
      catch (e) { return err(e.message, 400, e.field); }
      const { data, error } = await c.rpc('create_booking', { p: {
        services: ids, date: g('date'), time: g('time'), name: g('name'), phone: g('phone'), email: g('email'), address: g('address'),
        notes: g('notes'), payerName: g('payerName'), paymentRef: g('paymentRef'), policyAgreed: g('policyAgreed'), proofPath: proof, inspirationPath: insp } });
      if (error) { busyCache.v = null; return rpcError(error); }
      busyCache.v = null;
      ls.set('jna-last-booking', JSON.stringify({ ref: data.ref, token: data.token }));
      return json({ booking: shape(data) }, 201);
    }
    let m;
    if ((m = path.match(/^bookings\/(JNA-[A-Z0-9]{6})(\/proof)?$/))) {
      const c = await sb(); const token = q.get('t') || '';
      if (method === 'GET' && !m[2]) {
        const { data, error } = await c.rpc('get_booking', { p_ref: m[1], p_token: token });
        return error ? rpcError(error) : json({ booking: shape(data) });
      }
      if (method === 'POST' && m[2]) {
        const file = body && body.get && body.get('proof');
        if (!file || !file.size) return err('Please upload your payment proof.');
        let proof; try { proof = await uploadFile(file, true, 'proof'); } catch (e) { return err(e.message, 400, e.field); }
        const { data, error } = await c.rpc('attach_proof', { p_ref: m[1], p_token: token, p_proof_path: proof, p_payer_name: body.get('payerName') || '', p_payment_ref: body.get('paymentRef') || '' });
        return error ? rpcError(error) : json({ booking: shape(data) });
      }
    }
    if (method === 'POST' && path === 'contact') {
      const d = body || {}; const c = await sb();
      const { error } = await c.rpc('submit_message', { p_name: d.name || '', p_email: d.email || '', p_message: d.message || '' });
      return error ? rpcError(error) : json({ ok: true }, 201);
    }
    return err('Not found.', 404);
  }

  /* ---- fetch interception ---- */
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const mm = url.pathname.match(/\/api\/(.+)$/);
    if (!mm) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    try { return await route(method, mm[1].replace(/\/$/, ''), url.searchParams, body); }
    catch (e) { console.warn(e); return rpcError(e); }
  };

  /* ---- links that carry a pre-selected service ---- */
  window.JNA_PRE = () => { const v = ss.get('jna-pre'); ss.del('jna-pre'); return v; };
  window.JNA_LAST = () => { try { return JSON.parse(ls.get('jna-last-booking')) || {}; } catch { return {}; } };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="book.html?services="]');
    if (!a) return;
    e.preventDefault();
    ss.set('jna-pre', new URL(a.href, location.href).searchParams.get('services') || '');
    location.href = new URL('book.html', location.href).href;
  }, true);

  /* ---- friendly note on the confirmation ---- */
  document.addEventListener('DOMContentLoaded', () => {
    const confirm = document.getElementById('confirm');
    if (confirm) new MutationObserver(() => {
      if (!confirm.children.length || confirm.querySelector('.preview-note')) return;
      confirm.insertAdjacentHTML('beforeend', '<p class="note preview-note" style="margin-top:24px">Your booking request has been sent to Joy. She will contact you once she has verified your deposit.</p>');
    }).observe(confirm, { childList: true });
  });
})();
