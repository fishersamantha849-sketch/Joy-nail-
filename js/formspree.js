/* Formspree integration (Vanilla JS / AJAX).
   Sends a copy of every booking request and contact message to Joy's Formspree form,
   so each one lands in her email inbox as soon as it's submitted.
   The form ID lives in config/site.json → "formspree". */
(function () {
  'use strict';
  const JNA = (window.JNA = window.JNA || {});
  const naira = (n) => '₦' + Number(n || 0).toLocaleString('en-NG');

  /** POSTs fields (and optional files) to Formspree. Resolves true/false and never throws. */
  async function send(fields, files) {
    let cfg;
    try { cfg = await JNA.config(); } catch { return false; }
    const id = cfg?.formspree?.formId;
    if (!id) return false;
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') fd.append(k, String(v)); });
    if (cfg.formspree.attachFiles && files) Object.entries(files).forEach(([k, f]) => { if (f) fd.append(k, f, f.name || k); });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 20000);
    try {
      const r = await fetch(`https://formspree.io/f/${encodeURIComponent(id)}`, { method: 'POST', body: fd, headers: { Accept: 'application/json' }, signal: ctrl.signal });
      if (!r.ok) console.warn('Formspree:', r.status, await r.text().catch(() => ''));
      return r.ok;
    } catch (e) {
      console.warn('Formspree not reachable:', e.message);
      return false;
    } finally { clearTimeout(timer); }
  }

  JNA.formspree = {
    send,

    /** Booking request → Joy's inbox. `b` is the saved booking, `extra` holds what the form collected. */
    booking(b, extra) {
      const attach = (f) => (f ? 'Uploaded on the website. See the booking dashboard' : 'None');
      return JNA.config().then((cfg) => {
        const filesOn = !!cfg?.formspree?.attachFiles;
        return send({
          _subject: `New booking request: ${b.name}, ${b.dateLabel} at ${b.timeLabel}`,
          'Form': 'Booking request',
          'Booking reference': b.ref,
          'Status': 'Pending payment verification',
          'Services': b.services.map((s) => `${s.name} (${naira(s.price)})`).join(', '),
          'Subtotal': naira(b.subtotal),
          'Deposit': naira(b.deposit),
          'Remaining balance': naira(b.balance),
          'Date': b.dateLabel,
          'Time': b.timeLabel,
          'Where': extra.address ? 'Home service' : 'Studio',
          'Home service address': extra.address || '',
          'Name': b.name,
          'Phone / WhatsApp': extra.phone,
          email: extra.email, // Formspree uses this as the reply-to address
          'Notes': extra.notes || '',
          'Paid from (account name)': extra.payerName,
          'Payment reference': extra.paymentRef || '',
          'Payment proof': filesOn && extra.proof ? 'Attached' : attach(extra.proof),
          'Inspiration photo': filesOn && extra.insp ? 'Attached' : attach(extra.insp),
          'Booking policy': 'Agreed',
          'Customer booking link': extra.link || '',
        }, { payment_proof: extra.proof, inspiration_photo: extra.insp });
      }).catch(() => false);
    },

    /** Contact form message → Joy's inbox. */
    message({ name, email, message }) {
      return send({ _subject: `New website message from ${name}`, 'Form': 'Contact message', 'Name': name, email, 'Message': message });
    },
  };
})();
