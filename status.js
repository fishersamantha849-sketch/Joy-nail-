/* Customer booking status page: /booking/?ref=JNA-XXXXXX&t=<token> */
(function () {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const naira = (n) => window.JNA.naira(n);
  const STATUS = {
    'PENDING PAYMENT': { cls: 's-pending', label: 'Pending payment', text: "Joy couldn't verify your deposit yet. Please upload a clear payment proof below, or message Joy." },
    'PAYMENT VERIFICATION': { cls: 's-verify', label: 'Pending payment verification', text: 'Joy is checking your deposit. Your appointment will be confirmed once it has been verified.' },
    'CONFIRMED': { cls: 's-confirmed', label: 'Confirmed', text: "Your appointment is confirmed. See you soon!" },
    'RESCHEDULED': { cls: 's-rescheduled', label: 'Rescheduled', text: 'Your appointment has been moved. The new date and time are shown below.' },
    'COMPLETED': { cls: 's-completed', label: 'Completed', text: 'Thank you for visiting Joy Nail Artistry!' },
    'CANCELLED': { cls: 's-cancelled', label: 'Cancelled', text: 'This booking has been cancelled.' },
  };

  let cfg = null;
  const params = new URLSearchParams(location.search);
  const _last = window.JNA_LAST ? window.JNA_LAST() : {};
  const ref = params.get('ref') || _last.ref || '', token = params.get('t') || _last.token || '';

  function render(b) {
    const st = STATUS[b.status] || { cls: '', label: b.status, text: '' };
    const icons = $('#icons').content;
    const wa = window.JNA.waLink(cfg, `Hi Joy! About my booking ${b.ref} (${b.dateLabel}, ${b.timeLabel}).`);
    const where = b.homeService ? 'Home service' : `${cfg.location.line1}, ${cfg.location.line2}`;
    let html = `
      <p class="eyebrow">Booking ${esc(b.ref)}</p>
      <h2>Hi ${esc(b.name.split(' ')[0])}.</h2>
      <span class="badge ${st.cls}">${esc(st.label)}</span>
      <p class="muted" style="margin:16px 0 0">${esc(st.text)}${b.status === 'CANCELLED' && b.cancelReason ? ` <br><b style="color:var(--white)">Note from Joy:</b> ${esc(b.cancelReason)}` : ''}</p>
      <div class="review" style="margin-top:24px">
        <section><h3>Appointment</h3><dl>
          <dt>Date</dt><dd>${esc(b.dateLabel)}</dd><dt>Time</dt><dd>${esc(b.timeLabel)}</dd><dt>Where</dt><dd>${esc(where)}</dd>
          <dt>Deposit</dt><dd>${naira(b.deposit)} · ${b.depositVerified ? '<span style="color:var(--ok)">verified</span>' : 'awaiting verification'}</dd>
        </dl></section>
        <section><h3>Services</h3><table class="lines"><tbody>
          ${b.services.map((s) => `<tr><td>${esc(s.name)}</td><td>${naira(s.price)}</td></tr>`).join('')}
          <tr class="sep total"><td>Subtotal</td><td>${naira(b.subtotal)}</td></tr>
          <tr class="dep"><td>Deposit</td><td>${naira(b.deposit)}</td></tr>
          <tr class="bal"><td>Remaining balance</td><td>${naira(b.balance)}</td></tr>
        </tbody></table></section>
      </div>`;
    if (b.status === 'PENDING PAYMENT') {
      html += `
      <div class="pay-card" style="margin-top:26px">
        <p class="pc-lead">To secure your appointment, please pay the ${naira(b.deposit)} booking deposit to:</p>
        <dl><dt>Bank</dt><dd>${esc(cfg.deposit.bank)}</dd><dt>Account</dt><dd>${esc(cfg.deposit.accountNumber)}</dd><dt>Name</dt><dd>${esc(cfg.deposit.accountName)}</dd></dl>
      </div>
      <form id="proof-form" novalidate style="max-width:620px">
        <div class="field"><label for="p-payer">Name on the account you paid from</label><input class="input" id="p-payer" name="payerName" maxlength="80"></div>
        <div class="field"><label for="p-ref">Payment reference <span class="opt">(optional)</span></label><input class="input" id="p-ref" name="paymentRef" maxlength="80"></div>
        <div class="field" id="p-field"><label for="p-file">Payment proof</label>
          <p class="hint">Upload your payment proof so Joy can verify your deposit.</p>
          <input class="input" id="p-file" name="proof" type="file" accept="image/*,application/pdf" style="padding:12px">
          <p class="err" id="p-err">Please upload your payment proof.</p></div>
        <button class="btn btn-primary" type="submit">Upload payment proof</button>
        <p class="form-status" id="p-status" role="status"></p>
      </form>`;
    }
    html += `<div class="actions">
        <a class="btn ${b.status === 'PENDING PAYMENT' ? '' : 'btn-primary'}" ${wa ? `href="${esc(wa)}" target="_blank" rel="noopener"` : 'href="index.html#contact" data-nowa'}>${icons.children[1].outerHTML} Contact Joy on WhatsApp</a>
        <a class="btn" href="index.html">Back to home</a>
      </div>
      <p class="hint" style="margin-top:22px">Need to reschedule or cancel? Message Joy — see the <a href="policies.html#rescheduling" style="color:var(--pink-soft)">rescheduling</a> and <a href="policies.html#cancellation" style="color:var(--pink-soft)">cancellation</a> policies.</p>`;
    $('#status-root').innerHTML = html;
    $('[data-nowa]')?.addEventListener('click', () => window.JNA.toast('WhatsApp is coming soon — please use the contact form for now.'));
    const form = $('#proof-form');
    form?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const file = $('#p-file').files[0];
      const statusEl = $('#p-status');
      $('#p-field').classList.toggle('invalid', !file);
      if (!file) return;
      if (file.size > 8 * 1024 * 1024) { $('#p-err').textContent = 'That file is too large. Please upload a file under 8 MB.'; $('#p-field').classList.add('invalid'); return; }
      const fd = new FormData(form);
      const btn = form.querySelector('button'); btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        const r = await fetch(`/api/bookings/${encodeURIComponent(ref)}/proof?t=${encodeURIComponent(token)}`, { method: 'POST', body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || 'Upload failed. Please try again.');
        render(j.booking);
        window.JNA.toast('Payment proof uploaded — Joy will review it.');
      } catch (err) {
        statusEl.className = 'form-status bad'; statusEl.textContent = err.message && !/fetch/i.test(err.message) ? err.message : 'Upload failed. Please check your connection and try again.';
        btn.disabled = false; btn.textContent = 'Upload payment proof';
      }
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = $('#status-root');
    const notFound = (msg) => { root.innerHTML = `<h2>Booking not found</h2><p class="muted">${esc(msg)}</p><div class="actions"><a class="btn btn-primary" href="book.html">Book an appointment</a><a class="btn" href="index.html#contact">Contact Joy</a></div>`; };
    if (!ref || !token) return notFound('This link looks incomplete. Please use the full booking link from your confirmation.');
    try {
      cfg = await window.JNA.config();
      const r = await fetch(`/api/bookings/${encodeURIComponent(ref)}?t=${encodeURIComponent(token)}`);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return notFound(j.error || "We couldn't find that booking.");
      render(j.booking);
    } catch { notFound("We couldn't load your booking. Please check your connection and try again."); }
  });
})();
