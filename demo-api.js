window.JNA_SITE = {"businessName":"JOY NAIL ARTISTRY","timezone":"Africa/Lagos","currency":"₦","contact":{"whatsappNumber":"2347046387251","whatsappNumberFormatHint":"International format, digits only, e.g. 2348012345678","instagramUrl":"https://www.instagram.com/nailedbyjoy_","tiktokUrl":"https://www.tiktok.com/@joy_nailartistry","publicEmail":""},"formspree":{"formId":"xjykzqzp","attachFiles":false,"_note":"attachFiles: set to true only on a Formspree plan with file uploads (Personal or higher). Then the payment proof and inspiration photo are attached to the email."},"location":{"line1":"Ayekale beside Eskay Gas","line2":"Osogbo, Osun State","country":"Nigeria","mapQuery":"Ayekale, Osogbo, Osun State, Nigeria"},"hours":{"openDays":[1,2,3,4,5,6],"open":"10:00","close":"19:00","slotMinutes":60,"sameDayLeadMinutes":30,"bookableMonthsAhead":1},"deposit":{"amount":5000,"bank":"OPay","accountNumber":"7046387251","accountName":"Andrew Joy Loveth"},"services":[{"id":"pedicure","name":"Pedicure","price":10000,"group":"pedicure","image":"pedicure"},{"id":"gel-short","name":"Gel Short","size":"Short","price":15000,"group":"gel","exclusive":true,"image":"gel-small"},{"id":"gel-medium","name":"Gel Medium","size":"Medium","price":18000,"group":"gel","exclusive":true,"image":"gel-medium"},{"id":"gel-long","name":"Gel Long","size":"Long","price":23000,"group":"gel","exclusive":true,"image":"gel-long"},{"id":"acrylic-short","name":"Acrylic Short","size":"Short","price":16000,"group":"acrylic","exclusive":true,"image":"acrylic-small"},{"id":"acrylic-medium","name":"Acrylic Medium","size":"Medium","price":20000,"group":"acrylic","exclusive":true,"image":"acrylic-medium"},{"id":"acrylic-long","name":"Acrylic Long","size":"Long","price":27000,"group":"acrylic","exclusive":true,"image":"acrylic-long"},{"id":"toe-acrylic-plain","name":"Toe Acrylic Plain","price":10000,"group":"toe","exclusive":true},{"id":"toe-acrylic-french","name":"Toe Acrylic French","price":12000,"group":"toe","exclusive":true},{"id":"toe-gel-polish","name":"Toe Gel Polish","price":4000,"group":"toe","exclusive":true},{"id":"home-service","name":"Home Service","price":15000,"group":"extra","requiresAddress":true},{"id":"soak-off","name":"Soak Off","price":5000,"group":"extra"},{"id":"refill-design","name":"Refill & Design","price":20000,"group":"extra"}]};
/* JOY NAIL ARTISTRY — live preview engine.
   Runs the booking system entirely in the browser so the hosted preview is fully clickable:
   it answers the same /api/* calls as the real Node server (same rules, prices, statuses),
   and keeps bookings in this browser's storage. The production server replaces this file. */
(function () {
  'use strict';
  const SITE = window.JNA_SITE; // injected at build time from config/site.json
  const KEY = 'jna-preview-v1';
  const TZ = SITE.timezone;
  const ACTIVE = ['PENDING PAYMENT', 'PAYMENT VERIFICATION', 'CONFIRMED', 'RESCHEDULED'];
  const STATUSES = ['PENDING PAYMENT', 'PAYMENT VERIFICATION', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'];
  const byId = Object.fromEntries(SITE.services.map((s) => [s.id, s]));
  window.JNA_PREVIEW = true;
  window.JNA_FORMSPREE_REQUIRED = true;
  window.JNA_FS_FAILED_TEXT = 'We could not send your booking to Joy automatically. Please send her your booking reference and a screenshot of this page on WhatsApp so she receives it.';

  /* ---------------- storage (never required: falls back to memory) ---------------- */
  const blank = () => ({ seq: 0, bookings: [], events: [], blockedDates: {}, blockedSlots: {}, notifications: [], messages: [], files: {} });
  let mem = null;
  function load() {
    if (mem) return mem;
    try { mem = JSON.parse(localStorage.getItem(KEY)) || blank(); } catch { mem = blank(); }
    return mem;
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(mem)); }
    catch { // storage full: drop the oldest stored photos, keep the records
      const ids = Object.keys(mem.files); ids.slice(0, Math.ceil(ids.length / 2)).forEach((k) => delete mem.files[k]);
      try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch {}
    }
  }
  const ss = { get(k) { try { return sessionStorage.getItem(k); } catch { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch {} }, del(k) { try { sessionStorage.removeItem(k); } catch {} } };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  /* ---------------- time (always Lagos) ---------------- */
  function partsNow() {
    const f = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(new Date()).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: +p.hour * 60 + +p.minute, year: +p.year, month: +p.month };
  }
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const label = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };
  const allSlots = () => { const out = []; const { open, close, slotMinutes } = SITE.hours; for (let t = toMin(open); t + slotMinutes <= toMin(close); t += slotMinutes) out.push(fromMin(t)); return out; };
  const isValidDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
  const weekday = (s) => new Date(s + 'T12:00:00Z').getUTCDay();
  const pretty = (s) => new Date(s + 'T12:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const nowIso = () => new Date().toISOString().replace('T', ' ').slice(0, 19);
  function range() {
    const n = partsNow();
    const end = new Date(Date.UTC(n.year, n.month - 1 + SITE.hours.bookableMonthsAhead + 1, 0));
    return { from: n.date, to: end.toISOString().slice(0, 10), today: n.date, nowMinutes: n.minutes };
  }

  /* ---------------- availability ---------------- */
  function slotsFor(date, { exclude = null, includePast = false } = {}) {
    const db = load(), r = range();
    const taken = new Set(db.bookings.filter((b) => b.date === date && ACTIVE.includes(b.status) && b.id !== exclude).map((b) => b.time));
    const blocked = new Set(db.blockedSlots[date] || []);
    const cutoff = date === r.today ? r.nowMinutes + SITE.hours.sameDayLeadMinutes : -1;
    return allSlots().filter((t) => includePast || toMin(t) > cutoff)
      .map((t) => ({ time: t, label: label(t), available: !taken.has(t) && !blocked.has(t), reason: taken.has(t) ? 'booked' : blocked.has(t) ? 'blocked' : null }));
  }
  function dateProblem(date) {
    if (!isValidDate(date)) return 'invalid';
    const r = range();
    if (date < r.from) return 'past';
    if (date > r.to) return 'out-of-range';
    if (!SITE.hours.openDays.includes(weekday(date))) return 'closed';
    if (load().blockedDates[date] !== undefined) return 'blocked';
    return null;
  }
  function monthStatus(month) {
    const [y, m] = month.split('-').map(Number);
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const r = range(), out = {};
    for (let d = 1; d <= days; d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      let st;
      if (date < r.from) st = 'past';
      else if (date > r.to) st = 'out';
      else if (!SITE.hours.openDays.includes(weekday(date))) st = 'closed';
      else if (load().blockedDates[date] !== undefined) st = 'blocked';
      else st = slotsFor(date).some((s) => s.available) ? 'open' : 'full';
      out[date] = st;
    }
    return out;
  }

  /* ---------------- helpers ---------------- */
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const err = (msg, status = 400, field) => json(field ? { error: msg, field } : { error: msg }, status);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const PHONE_RE = /^\+?[\d\s()-]{7,20}$/;
  const rand = (n, alpha) => { const a = new Uint8Array(n); crypto.getRandomValues(a); return Array.from(a, (b) => alpha[b % alpha.length]).join(''); };
  const newRef = () => 'JNA-' + rand(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
  const newToken = () => rand(48, '0123456789abcdef');
  const logEvent = (id, actor, action, detail) => load().events.push({ booking_id: id, at: nowIso(), actor, action, detail: detail || null });
  const notify = (type, message, booking_id) => { const db = load(); db.notifications.unshift({ id: ++db.seq, at: nowIso(), type, message, booking_id: booking_id || null, read: 0 }); };

  function priceServices(ids) {
    if (!Array.isArray(ids) || !ids.length) return { error: 'Please select a service.' };
    const uniq = [...new Set(ids)];
    if (uniq.length > 8 || uniq.some((id) => !byId[id])) return { error: 'Please select a service.' };
    const groups = {};
    for (const id of uniq) { const s = byId[id]; if (s.exclusive) { if (groups[s.group]) return { error: `Please choose only one ${s.group === 'toe' ? 'toe nail' : s.group} option.` }; groups[s.group] = id; } }
    const services = uniq.map((id) => ({ id, name: byId[id].name, price: byId[id].price }));
    const subtotal = services.reduce((a, s) => a + s.price, 0);
    const deposit = Math.min(SITE.deposit.amount, subtotal);
    return { services, subtotal, deposit, balance: subtotal - deposit, needsAddress: uniq.some((id) => byId[id].requiresAddress) };
  }

  /** Shrinks an uploaded photo to a light JPEG data URL (keeps storage small). PDFs are kept as-is if small. */
  async function storeFile(file, allowPdf) {
    if (!file || !file.size) return null;
    if (file.size > 8 * 1024 * 1024) throw new Error(allowPdf ? 'That file is too large. Please upload a file under 8 MB.' : 'That image is too large. Please upload one under 8 MB.');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    const id = rand(16, '0123456789abcdef');
    if (isPdf) {
      if (!allowPdf) throw new Error('Please upload an image (JPG, PNG or WebP).');
      load().files[id] = { pdf: true, data: file.size < 700000 ? await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => res(null); r.readAsDataURL(file); }) : null };
      return id;
    }
    try {
      const url = URL.createObjectURL(file);
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
      const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * scale); c.height = Math.round(img.naturalHeight * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      load().files[id] = { pdf: false, data: c.toDataURL('image/jpeg', 0.72) };
      return id;
    } catch {
      throw new Error(allowPdf ? 'That file could not be read. Please upload a screenshot (JPG or PNG) or a PDF receipt.' : "That image couldn't be read. Please try a JPG or PNG photo.");
    }
  }
  window.JNA_DEMO_FILE = (id, kind) => {
    const b = load().bookings.find((x) => x.id === Number(id));
    const f = b && load().files[kind === 'proof' ? b.proof_file : b.inspiration_file];
    return f && f.data ? f.data : 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><rect width="300" height="300" fill="#1b1b1b"/><text x="150" y="155" fill="#999" font-family="sans-serif" font-size="16" text-anchor="middle">File not stored in this preview</text></svg>');
  };

  function publicBooking(b) {
    return { ref: b.ref, token: b.token, status: b.status, name: b.name, services: b.services, subtotal: b.subtotal, deposit: b.deposit, balance: b.balance,
      date: b.date, dateLabel: pretty(b.date), time: b.time, timeLabel: label(b.time), depositVerified: !!b.payment_verified_at,
      cancelReason: b.status === 'CANCELLED' ? b.cancel_reason : null, homeService: !!b.address };
  }
  function adminShape(b) {
    const f = load().files[b.proof_file];
    return { id: b.id, ref: b.ref, status: b.status, name: b.name, phone: b.phone, email: b.email, address: b.address, notes: b.notes,
      services: b.services, subtotal: b.subtotal, deposit: b.deposit, balance: b.balance, date: b.date, dateLabel: pretty(b.date), time: b.time, timeLabel: label(b.time),
      hasProof: !!b.proof_file, proofIsPdf: !!(f && f.pdf), hasInspiration: !!b.inspiration_file, payerName: b.payer_name, paymentRef: b.payment_ref,
      proofUploadedAt: b.proof_uploaded_at, depositVerified: !!b.payment_verified_at, paymentVerifiedAt: b.payment_verified_at,
      cancelReason: b.cancel_reason, createdAt: b.created_at, updatedAt: b.updated_at, policyAgreedAt: b.policy_agreed_at || null };
  }
  const isAdmin = () => ss.get('jna-preview-admin') === '1';

  /* ---------------- routes ---------------- */
  async function route(method, path, q, body) {
    const db = load();
    // ---- public ----
    if (method === 'GET' && path === 'config') {
      const { contact, location, hours, deposit, services, businessName, currency, timezone, formspree } = SITE;
      return json({ businessName, currency, timezone, contact, location, hours, deposit, services, formspree: { formId: formspree?.formId || '', attachFiles: !!formspree?.attachFiles } });
    }
    if (method === 'GET' && path === 'availability') {
      const r = range(); const month = q.get('month') || r.today.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(month)) return err('Invalid month.');
      return json({ month, today: r.today, from: r.from, to: r.to, days: monthStatus(month) });
    }
    if (method === 'GET' && path === 'slots') {
      const date = q.get('date') || ''; const p = dateProblem(date);
      return json(p ? { date, slots: [], closed: p } : { date, slots: slotsFor(date) });
    }
    if (method === 'POST' && path === 'bookings') {
      const f = body; const g = (k) => (f && f.get ? f.get(k) : null);
      let ids; try { ids = JSON.parse(g('services') || '[]'); } catch { ids = null; }
      const priced = priceServices(ids);
      if (priced.error) return err(priced.error, 400, 'services');
      const date = str(g('date'), 10), time = str(g('time'), 5);
      if (!date) return err('Please select a date.', 400, 'date');
      if (!time) return err('Please select a time.', 400, 'time');
      const name = str(g('name'), 80), phone = str(g('phone'), 20), email = str(g('email'), 120).toLowerCase();
      const address = str(g('address'), 300), notes = str(g('notes'), 1000), payerName = str(g('payerName'), 80), paymentRef = str(g('paymentRef'), 80);
      if (name.length < 2) return err('Please enter your name.', 400, 'name');
      if (!PHONE_RE.test(phone)) return err('Please enter a valid phone or WhatsApp number.', 400, 'phone');
      if (!EMAIL_RE.test(email)) return err('Please enter a valid email address.', 400, 'email');
      if (priced.needsAddress && address.length < 5) return err('Please enter the address for your home service.', 400, 'address');
      if (!payerName) return err('Please enter the name on the account you paid from.', 400, 'payerName');
      if (g('policyAgreed') !== '1') return err('Please agree to the booking policy to submit your booking.', 400, 'agree');
      const proofFile = g('proof');
      if (!proofFile || !proofFile.size) return err('Please upload your payment proof.', 400, 'proof');
      if (dateProblem(date) || !slotsFor(date).some((s) => s.time === time && s.available)) return err('Sorry — that time was just taken or is no longer available. Please choose another time.', 409, 'time');
      let proof, insp;
      try { proof = await storeFile(proofFile, true); insp = await storeFile(g('inspiration'), false); }
      catch (e) { return err(e.message, 400, /screenshot|PDF/.test(e.message) ? 'proof' : 'inspiration'); }
      const b = { id: ++db.seq, ref: newRef(), token: newToken(), status: 'PAYMENT VERIFICATION', name, phone, email, address: priced.needsAddress ? address : null, notes: notes || null,
        services: priced.services, subtotal: priced.subtotal, deposit: priced.deposit, balance: priced.balance, date, time, inspiration_file: insp, proof_file: proof,
        payer_name: payerName, payment_ref: paymentRef || null, proof_uploaded_at: nowIso(), policy_agreed_at: nowIso(), payment_verified_at: null, cancel_reason: null, created_at: nowIso(), updated_at: nowIso() };
      db.bookings.push(b);
      logEvent(b.id, 'customer', 'Booking submitted', `Deposit proof uploaded (payer: ${payerName})`);
      notify('booking', `New booking from ${name} — ${pretty(date)} at ${label(time)}`, b.id);
      save();
      ls.set('jna-preview-last', JSON.stringify({ ref: b.ref, token: b.token }));
      return json({ booking: publicBooking(b) }, 201);
    }
    let m;
    if ((m = path.match(/^bookings\/(JNA-[A-Z0-9]{6})(\/proof)?$/))) {
      const b = db.bookings.find((x) => x.ref === m[1] && x.token === q.get('t'));
      if (!b) return err("We couldn't find that booking. Please check your link.", 404);
      if (method === 'GET' && !m[2]) return json({ booking: publicBooking(b) });
      if (method === 'POST' && m[2]) {
        if (b.status !== 'PENDING PAYMENT') return err('This booking is not waiting for a payment proof.');
        const file = body && body.get && body.get('proof');
        if (!file || !file.size) return err('Please upload your payment proof.');
        try { b.proof_file = await storeFile(file, true); } catch (e) { return err(e.message); }
        b.payer_name = str(body.get('payerName'), 80) || b.payer_name; b.payment_ref = str(body.get('paymentRef'), 80) || b.payment_ref;
        b.proof_uploaded_at = nowIso(); b.status = 'PAYMENT VERIFICATION'; b.updated_at = nowIso();
        logEvent(b.id, 'customer', 'New payment proof uploaded', `Payer: ${b.payer_name}`);
        notify('proof', `New payment proof from ${b.name} (${b.ref})`, b.id);
        save();
        return json({ booking: publicBooking(b) });
      }
    }
    if (method === 'POST' && path === 'contact') {
      const d = body || {}; const name = str(d.name, 80), email = str(d.email, 120), message = str(d.message, 2000);
      if (name.length < 2) return err('Please enter your name.', 400, 'name');
      if (!EMAIL_RE.test(email)) return err('Please enter a valid email address.', 400, 'email');
      if (message.length < 5) return err('Please write a short message.', 400, 'message');
      db.messages.unshift({ id: ++db.seq, at: nowIso(), name, email, message, read: 0 });
      notify('message', `New message from ${name}`, null); save();
      return json({ ok: true }, 201);
    }

    // ---- admin ----
    if (path.startsWith('admin/')) {
      const a = path.slice(6);
      if (a === 'me') return json({ authed: isAdmin(), setup: true, emailConfigured: false });
      if (a === 'login' && method === 'POST') {
        const u = String(body?.username || '').trim().toLowerCase(), p = String(body?.password || '');
        if (u === 'joy' && p === 'preview') { ss.set('jna-preview-admin', '1'); return json({ ok: true }); }
        return err('Incorrect username or password. In this preview use joy / preview.', 401);
      }
      if (a === 'logout') { ss.del('jna-preview-admin'); return json({ ok: true }); }
      if (!isAdmin()) return err('Please sign in.', 401);
      const today = partsNow().date;
      const count = (fn) => db.bookings.filter(fn).length;
      if (a === 'stats') return json({ today,
        needsVerification: count((b) => b.status === 'PAYMENT VERIFICATION'), pendingPayment: count((b) => b.status === 'PENDING PAYMENT'),
        todayCount: count((b) => b.date === today && ACTIVE.includes(b.status)), upcoming: count((b) => b.date >= today && ACTIVE.includes(b.status)),
        completed: count((b) => b.status === 'COMPLETED'), unreadNotifications: db.notifications.filter((n) => !n.read).length,
        unreadMessages: db.messages.filter((x) => !x.read).length, emailConfigured: false });
      if (a === 'bookings' && method === 'GET') {
        const view = q.get('view') || 'upcoming', s = (q.get('q') || '').toLowerCase();
        let rows = db.bookings.filter((b) => {
          if (view === 'upcoming') return b.date >= today && ACTIVE.includes(b.status);
          if (view === 'verify') return ['PAYMENT VERIFICATION', 'PENDING PAYMENT'].includes(b.status);
          if (view === 'past') return b.date < today || ['COMPLETED', 'CANCELLED'].includes(b.status);
          if (STATUSES.includes(view)) return b.status === view;
          return true;
        });
        if (s) rows = rows.filter((b) => [b.name, b.phone, b.email, b.ref].some((v) => String(v).toLowerCase().includes(s)));
        rows.sort((x, y) => (x.date + x.time).localeCompare(y.date + y.time) * (view === 'past' ? -1 : 1));
        return json({ bookings: rows.map(adminShape) });
      }
      if ((m = a.match(/^bookings\/(\d+)$/)) && method === 'GET') {
        const b = db.bookings.find((x) => x.id === +m[1]); if (!b) return err('Booking not found.', 404);
        db.notifications.forEach((n) => { if (n.booking_id === b.id) n.read = 1; }); save();
        return json({ booking: adminShape(b), events: db.events.filter((e) => e.booking_id === b.id).slice().reverse() });
      }
      if ((m = a.match(/^bookings\/(\d+)\/action$/)) && method === 'POST') {
        const b = db.bookings.find((x) => x.id === +m[1]); if (!b) return err('Booking not found.', 404);
        const T = {
          'confirm-payment': [['PAYMENT VERIFICATION', 'PENDING PAYMENT', 'RESCHEDULED'], 'CONFIRMED', 'Deposit verified — booking confirmed'],
          'approve': [['PAYMENT VERIFICATION', 'PENDING PAYMENT', 'RESCHEDULED'], 'CONFIRMED', 'Booking approved'],
          'reject-proof': [['PAYMENT VERIFICATION'], 'PENDING PAYMENT', 'Payment proof not accepted'],
          'reject': [['PAYMENT VERIFICATION', 'PENDING PAYMENT'], 'CANCELLED', 'Booking rejected'],
          'cancel': [['PAYMENT VERIFICATION', 'PENDING PAYMENT', 'CONFIRMED', 'RESCHEDULED'], 'CANCELLED', 'Booking cancelled'],
          'complete': [['CONFIRMED', 'RESCHEDULED'], 'COMPLETED', 'Appointment completed'],
          'reschedule': [['PAYMENT VERIFICATION', 'PENDING PAYMENT', 'CONFIRMED', 'RESCHEDULED'], 'RESCHEDULED', 'Booking rescheduled'],
        };
        const action = String(body?.action || ''), tr = T[action];
        if (!tr) return err('Unknown action.');
        if (!tr[0].includes(b.status)) return err(`Can't do that while the booking is "${b.status}".`);
        const reason = str(body?.reason, 300);
        if (action === 'reschedule') {
          const { date, time } = body; const p = dateProblem(date);
          if (!isValidDate(date) || p === 'invalid' || p === 'past') return err('Please choose a valid future date.');
          const slot = slotsFor(date, { exclude: b.id }).find((s) => s.time === time);
          if (!slot) return err('Please choose a valid time.');
          if (slot.reason === 'booked') return err('That time is already booked.');
          logEvent(b.id, 'admin', tr[2], `From ${pretty(b.date)} ${label(b.time)} → ${pretty(date)} ${label(time)}${reason ? ' · ' + reason : ''}`);
          Object.assign(b, { date, time, status: 'RESCHEDULED', updated_at: nowIso() });
        } else {
          b.status = tr[1]; b.updated_at = nowIso();
          if (action === 'confirm-payment') b.payment_verified_at = nowIso();
          if (tr[1] === 'CANCELLED') b.cancel_reason = reason || (action === 'reject' ? 'Booking was not accepted.' : null);
          logEvent(b.id, 'admin', tr[2], reason || null);
        }
        save();
        return json({ booking: adminShape(b) });
      }
      if (a === 'day') {
        const date = q.get('date') || ''; if (!isValidDate(date)) return err('Invalid date.');
        const exclude = +q.get('exclude') || null; const n = partsNow();
        const held = Object.fromEntries(db.bookings.filter((b) => b.date === date && ACTIVE.includes(b.status) && b.id !== exclude).map((b) => [b.time, { id: b.id, ref: b.ref, name: b.name, time: b.time, status: b.status }]));
        const bs = new Set(db.blockedSlots[date] || []);
        return json({ date, dateLabel: pretty(date), closedDay: dateProblem(date) === 'closed', blockedDay: db.blockedDates[date] !== undefined ? (db.blockedDates[date] || 'Blocked') : null,
          slots: allSlots().map((t) => ({ time: t, label: label(t), past: date < n.date || (date === n.date && toMin(t) <= n.minutes), booking: held[t] || null, blocked: bs.has(t) })) });
      }
      if (a === 'blocked' && method === 'GET') {
        const today2 = partsNow().date;
        return json({
          dates: Object.entries(db.blockedDates).filter(([d]) => d >= today2).sort().map(([date, reason]) => ({ date, reason, dateLabel: pretty(date) })),
          slots: Object.entries(db.blockedSlots).filter(([d]) => d >= today2).sort().flatMap(([date, ts]) => ts.slice().sort().map((time) => ({ date, time, dateLabel: pretty(date), timeLabel: label(time) }))),
        });
      }
      if (a === 'blocked/date' && method === 'POST') {
        if (!isValidDate(body?.date)) return err('Invalid date.');
        if (body.blocked) db.blockedDates[body.date] = str(body.reason, 120); else delete db.blockedDates[body.date];
        save(); return json({ ok: true });
      }
      if (a === 'blocked/slot' && method === 'POST') {
        if (!isValidDate(body?.date) || !allSlots().includes(body.time)) return err('Invalid slot.');
        const set = new Set(db.blockedSlots[body.date] || []);
        body.blocked ? set.add(body.time) : set.delete(body.time);
        if (set.size) db.blockedSlots[body.date] = [...set]; else delete db.blockedSlots[body.date];
        save(); return json({ ok: true });
      }
      if (a === 'notifications') return json({ notifications: db.notifications.slice(0, 100) });
      if (a === 'notifications/read') { db.notifications.forEach((n) => (n.read = 1)); save(); return json({ ok: true }); }
      if (a === 'messages') return json({ messages: db.messages });
      if (a === 'messages/read') { db.messages.forEach((x) => (x.read = 1)); save(); return json({ ok: true }); }
    }
    return err('Not found.', 404);
  }

  /* ---------------- fetch interception ---------------- */
  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init = {}) {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const mm = url.pathname.match(/\/api\/(.+)$/);
    if (!mm) return realFetch(input, init);
    const method = (init.method || 'GET').toUpperCase();
    let body = init.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
    try { return await route(method, mm[1].replace(/\/$/, ''), url.searchParams, body); }
    catch (e) { console.warn(e); return err('Your booking could not be submitted. Please try again.', 500); }
  };

  /* ---------------- links that carry a pre-selected service ---------------- */
  window.JNA_PRE = () => { const v = ss.get('jna-pre'); ss.del('jna-pre'); return v; };
  window.JNA_LAST = () => { try { return JSON.parse(ls.get('jna-preview-last')) || {}; } catch { return {}; } };
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="book.html?services="]');
    if (!a) return;
    e.preventDefault();
    ss.set('jna-pre', new URL(a.href, location.href).searchParams.get('services') || '');
    location.href = new URL('book.html', location.href).href;
  }, true);

  /* ---------------- honest preview notes ---------------- */
  document.addEventListener('DOMContentLoaded', () => {
    const confirm = document.getElementById('confirm');
    if (confirm) new MutationObserver(() => {
      if (!confirm.children.length || confirm.querySelector('.preview-note')) return;
      confirm.insertAdjacentHTML('beforeend', '<p class="note preview-note" style="margin-top:24px">' + (window.JNA_FS_FAILED ? window.JNA_FS_FAILED_TEXT : 'Your booking request has been sent to Joy. She will contact you once she has verified your deposit.') + '</p>');
    }).observe(confirm, { childList: true });
    const login = document.getElementById('login-form');
    if (login) login.querySelector('h1').insertAdjacentHTML('afterend', '<p class="note">Preview dashboard. Sign in with <b>joy</b> / <b>preview</b>. It shows bookings made in this browser.</p>');
  });
})();
