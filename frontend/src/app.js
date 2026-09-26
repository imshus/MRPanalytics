/* MRPscan Analytics – single page app (hash routing, no build step). */
(function () {
  const view = document.getElementById('view');
  const searchInput = document.getElementById('searchInput');
  const searchForm = document.getElementById('searchForm');
  const TZ = 'Asia/Kolkata';

  // ---------- formatting ----------
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('en-IN');
  const fmtNum = (v) => (v == null ? '—' : nf.format(Math.round(Number(v))));
  const fmtDec = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmtINR = (v) => (v == null ? '—' : '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }));
  const fmtCompact = (v) => { v = Number(v) || 0; const a = Math.abs(v); if (a >= 1e7) return (v / 1e7).toFixed(2) + ' Cr'; if (a >= 1e5) return (v / 1e5).toFixed(2) + ' L'; if (a >= 1e3) return (v / 1e3).toFixed(1) + 'K'; return nf.format(Math.round(v * 100) / 100); };
  const fmtINRc = (v) => (v == null ? '—' : '₹' + fmtCompact(v));
  const fmtCredits = (v) => (v == null ? '—' : fmtDec(v, 2) + ' cr');
  const dtf = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
  const dtfT = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true });
  const dtfFull = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const fmtDate = (d) => (d ? dtf.format(new Date(d)) : '—');
  const fmtDT = (d) => (d ? dtfT.format(new Date(d)) : '—');
  const fmtDTFull = (d) => (d ? dtfFull.format(new Date(d)) : '—');
  const dayLabel = (key) => { const [y, m, d] = key.split('-'); return `${Number(d)} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m) - 1]}`; };
  const shortDate = (d) => new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);
  function relTime(d) {
    if (!d) return 'never';
    const diff = Date.now() - new Date(d).getTime(); const m = Math.round(diff / 60000);
    if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; const h = Math.round(m / 60); if (h < 24) return `${h} h ago`;
    const days = Math.round(h / 24); if (days < 30) return `${days} d ago`; const mo = Math.round(days / 30); if (mo < 12) return `${mo} mo ago`; return `${Math.round(mo / 12)} y ago`;
  }
  const initials = (name) => (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  const avatarColor = (seed) => { let h = 0; for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return `var(--series-${(h % 8) + 1})`; };
  const humanize = (s) => String(s || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^\w/, (c) => c.toUpperCase());

  const LICENSE_TONE = { FREE_TRIAL_LICENSE: 'warning', NO_LICENSE: 'critical', PERMANENT_LICENSE: 'good', ACTIVE: 'good', EXPIRED: 'critical', UNKNOWN: '' };
  const licenseChip = (lic) => { const st = lic?.status || 'UNKNOWN'; const tone = LICENSE_TONE[st] ?? (st.includes('PERMANENT') || st.includes('ACTIVE') ? 'good' : ''); const extra = st === 'FREE_TRIAL_LICENSE' && lic.daysLeft != null ? ` · ${lic.daysLeft > 0 ? lic.daysLeft + ' d left' : 'expired'}` : ''; return `<span class="chip ${tone}"><span class="dot"></span>${esc(humanize(st))}${extra}</span>`; };
  const statusPill = (s) => { const v = String(s || ''); const tone = /SUCCESS|VERIFIED|SUCCEEDED|success/.test(v) ? 'good' : /FAIL|failure/.test(v) ? 'critical' : /CREATED|SENT|PENDING/.test(v) ? 'warning' : ''; return `<span class="pill ${tone}">${esc(humanize(v))}</span>`; };

  const KIND_COLOR = { SCAN: 'var(--series-1)', CREDIT: 'var(--series-2)', PAYMENT: 'var(--series-3)', INVOICE: 'var(--series-4)', WISHLIST: 'var(--series-5)', LOGIN: 'var(--series-6)', LICENSE: 'var(--series-7)', SETTINGS: 'var(--series-8)', ACCOUNT: 'var(--muted)', EMPLOYEE: 'var(--ink-2)' };
  const KIND_LABEL = { SCAN: 'Scans', CREDIT: 'Credits', PAYMENT: 'Payments', INVOICE: 'Invoices', WISHLIST: 'Wishlist', LOGIN: 'Logins', LICENSE: 'License', SETTINGS: 'Settings', ACCOUNT: 'Account', EMPLOYEE: 'Employees' };

  // ---------- data ----------
  const cache = new Map();
  const KEY_STORE = 'pratham-analytics-key';
  const readKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
  const saveKey = (k) => { try { localStorage.setItem(KEY_STORE, k); } catch { /* storage unavailable */ } };
  class AuthError extends Error {}
  async function api(path) {
    if (cache.has(path)) return cache.get(path);
    const base = (window.MRP_CONFIG && window.MRP_CONFIG.apiUrl) || '';
    const res = await fetch(base + path, { headers: { 'x-access-key': readKey() } });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401) throw new AuthError(body.error || 'Access key required');
    if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
    cache.set(path, body); setTimeout(() => cache.delete(path), 30000);
    return body;
  }
  function renderKeyPrompt(message) {
    view.innerHTML = `<section class="card key-card"><h1>Enter access key</h1>
      <p class="muted">${esc(message)}. The key is the <b>ANALYTICS_TOKEN</b> value in the server's .env file.</p>
      <form id="keyForm"><input id="keyInput" class="key-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Access key" value="${esc(readKey())}" />
      <button class="primary-btn" type="submit">Unlock</button></form></section>`;
    document.getElementById('keyForm').addEventListener('submit', (e) => { e.preventDefault(); saveKey(document.getElementById('keyInput').value.trim()); cache.clear(); route(); });
    document.getElementById('keyInput').focus();
  }
  const loading = (msg = 'Loading from MongoDB…') => { view.innerHTML = `<div class="loading"><span class="spinner"></span>${esc(msg)}</div>`; };
  const errorBox = (e) => {
    if (e instanceof AuthError) return renderKeyPrompt(readKey() ? 'That key was not accepted' : 'This device needs an access key');
    view.innerHTML = `<div class="error-box">${esc(e.message || e)}</div>`;
  };

  // ---------- shared renderers ----------
  const tile = (label, value, delta = '', compact = false) => `<div class="tile${compact ? ' compact' : ''}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;
  const card = (title, body, sub = '', extra = '') => `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${extra}</div>${body}</section>`;
  const emptyMsg = (t = 'Nothing recorded yet') => `<div class="empty">${esc(t)}</div>`;

  function table(cols, rows) {
    if (!rows.length) return emptyMsg();
    const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function kvList(obj, opts = {}) {
    const skip = new Set(['_id', 'id', ...(opts.skip || [])]);
    const rows = [];
    const walk = (o, prefix) => {
      for (const [k, v] of Object.entries(o || {})) {
        if (skip.has(k)) continue;
        const key = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v)) { walk(v, key); continue; }
        rows.push([key, v]);
      }
    };
    walk(obj, '');
    if (!rows.length) return emptyMsg();
    return `<dl class="kv">${rows.map(([k, v]) => {
      let cls = '', val;
      if (typeof v === 'boolean') { cls = v ? 'bool-true' : 'bool-false'; val = v ? 'Yes' : 'No'; }
      else if (Array.isArray(v)) val = v.length ? esc(v.map((x) => (typeof x === 'object' ? JSON.stringify(x) : x)).join(', ')) : '<span class="muted">empty</span>';
      else if (v == null || v === '') val = '<span class="muted">—</span>';
      else if (/At$|Date$/.test(k.split('.').pop()) && !Number.isNaN(Date.parse(v)) && /\d{4}-\d{2}-\d{2}T/.test(String(v))) val = esc(fmtDTFull(v));
      else if (/^https?:\/\//.test(String(v))) val = `<a href="${esc(v)}" target="_blank" rel="noopener" style="color:var(--accent)">Open link ↗</a>`;
      else val = esc(v);
      return `<dt>${esc(humanize(k))}</dt><dd class="${cls}">${val}</dd>`;
    }).join('')}</dl>`;
  }

  function timelineList(events, opts = {}) {
    if (!events.length) return emptyMsg();
    return `<ul class="timeline">${events.map((e) => {
      const amt = e.amount != null && e.amount !== 0 ? `<div class="tl-amount ${e.amount < 0 ? 'neg' : 'pos'}">${e.amount < 0 ? '−' : '+'}${e.unit === 'inr' ? fmtINR(Math.abs(e.amount)) : fmtCredits(Math.abs(e.amount))}</div>` : '';
      const who = opts.showWho && e.name ? `<div class="tl-who">${e.userId ? `<a href="#/user/${esc(e.userId)}" style="color:var(--accent)">${esc(e.name)}</a>` : esc(e.name)}${e.phone ? ' · ' + esc(e.phone) : ''}${e.businessName ? ' · ' + esc(e.businessName) : ''}</div>` : '';
      return `<li><span class="tl-dot" style="background:${KIND_COLOR[e.kind] || 'var(--muted)'}"></span><div><div class="tl-title"><span class="tl-kind">${esc(KIND_LABEL[e.kind] || e.kind)}</span>${esc(e.title)}</div>${who}${e.detail ? `<div class="tl-detail">${esc(e.detail)}</div>` : ''}</div><div><div class="tl-time" title="${esc(fmtDTFull(e.at))}">${esc(fmtDT(e.at))}<br><span class="muted">${esc(relTime(e.at))}</span></div>${amt}</div></li>`;
    }).join('')}</ul>`;
  }

  // ---------- USERS ----------
  async function renderUsers(q = '') {
    setNav('users'); if (searchInput.value !== q) searchInput.value = q;
    loading(q ? `Searching “${q}”…` : 'Loading users…');
    let d; try { d = await api(`/api/users?q=${encodeURIComponent(q)}`); } catch (e) { return errorBox(e); }
    view.innerHTML = `
      <div class="page-head"><div><h1>${q ? 'Search results' : 'Users'}</h1><div class="sub">${fmtNum(d.count)} user${d.count === 1 ? '' : 's'}${q ? ` matching “${esc(q)}” by phone, name, login id, business or GST` : ' · latest activity first · tap a user for full history'}</div></div></div>
      ${d.users.length ? `<div class="user-list">${d.users.map(userCard).join('')}</div>` : emptyMsg(q ? `No user found for “${q}”. Try the 10-digit phone number or part of the name.` : 'No users in the database')}`;
  }
  function userCard(u) {
    const s = u.stats;
    const field = (label, value) => `<div><span>${esc(label)}</span><b>${value}</b></div>`;
    const stat = (value, label) => `<div><b>${value}</b><span>${esc(label)}</span></div>`;
    return `<a class="user-card detailed" href="#/user/${esc(u.id)}">
      <div class="ud-head"><div class="avatar" style="background:${avatarColor(u.id)}">${esc(initials(u.displayName))}</div>
        <div class="user-main"><div class="user-name">${esc(u.displayName)} ${licenseChip(u.license)}${u.isActive ? '' : '<span class="chip critical"><span class="dot"></span>Inactive</span>'}</div>
          <div class="user-sub">${esc(u.role || '')}${u.fullName && u.handle ? ` · @${esc(u.handle)}` : ''}</div></div></div>
      <div class="ud-grid">
        ${field('Phone', `<span class="mono">${esc(u.phone)}</span>${u.phoneVerified ? ' <span class="verified">✓ verified</span>' : ''}`)}
        ${field('Login ID', u.handle ? '@' + esc(u.handle) : '—')}
        ${field('Business', esc(u.businessName || '—'))}
        ${field('GST number', `<span class="mono">${esc(u.gstNumber || '—')}</span>`)}
        ${field('State', esc(u.stateName || '—'))}
        ${field('Business type', esc(u.businessType || '—'))}
        ${field('Joined', esc(fmtDate(u.createdAt)))}
        ${field('Last login', esc(relTime(u.lastLoginAt)))}
        ${field('Last scan', esc(relTime(s.lastScanAt)))}
      </div>
      <div class="ud-stats">
        ${stat(fmtNum(s.scans), 'Scans')}
        ${stat(s.creditBalance == null ? '—' : fmtDec(s.creditBalance), 'Credits left')}
        ${stat(fmtNum(s.invoices), 'Invoices')}
        ${stat(fmtINRc(s.paymentsSuccessAmount), 'Paid')}
        ${stat(fmtNum(s.wishlists), 'Wishlist')}
        ${stat(fmtNum(s.employees), 'Employees')}
      </div></a>`;
  }

  // ---------- USER DETAIL ----------
  let detailTab = 'timeline'; let detailDays = 30; let tlFilter = 'ALL';
  async function renderUser(id) {
    setNav('users'); loading('Loading user analytics…');
    let d; try { d = await api(`/api/users/${encodeURIComponent(id)}?days=${detailDays}`); } catch (e) { return errorBox(e); }
    const u = d.user, k = d.kpis, a = d.activity;
    const tabs = [
      ['timeline', 'Timeline', d.timeline.length], ['scans', 'Scans', a.scans.length], ['credits', 'Credits', a.credits.length], ['payments', 'Payments', a.payments.length + a.webhooks.length + a.licenseTx.length],
      ['invoices', 'Invoices', a.invoices.length], ['wishlist', 'Wishlist', a.wishlists.length], ['logins', 'Logins', a.otps.length], ['employees', 'Employees', a.employees.length], ['settings', 'Settings', null], ['parameters', 'All parameters', null],
    ];
    view.innerHTML = `
      <a class="back" href="#/">← All users</a>
      <section class="card"><div class="profile"><div class="avatar" style="background:${avatarColor(u.id)}">${esc(initials(u.displayName))}</div>
        <div><h1>${esc(u.displayName)} ${licenseChip(d.license)}${u.isActive ? '<span class="chip good"><span class="dot"></span>Active</span>' : '<span class="chip critical"><span class="dot"></span>Inactive</span>'}${u.phoneVerified ? '' : '<span class="chip warning"><span class="dot"></span>Phone unverified</span>'}</h1>
          <div class="profile-meta"><span>📱 <b class="mono">${esc(u.phone)}</b></span>${u.userId ? `<span>Login id <b>@${esc(u.userId)}</b></span>` : ''}<span>Role <b>${esc(u.role)}</b></span>${u.businessName ? `<span>🏪 <b>${esc(u.businessName)}</b></span>` : ''}${u.gstNumber ? `<span>GST <b class="mono">${esc(u.gstNumber)}</b></span>` : ''}${d.business?.stateName ? `<span>📍 <b>${esc(d.business.stateName)}${d.business.pincode ? ' ' + esc(d.business.pincode) : ''}</b></span>` : ''}</div>
          <div class="profile-meta"><span>Joined <b>${esc(fmtDTFull(u.createdAt))}</b> (${k.accountAgeDays} days ago)</span><span>Last login <b>${esc(fmtDTFull(k.lastLoginAt))}</b></span><span>Last seen <b>${esc(relTime(k.lastSeenAt))}</b></span>${k.referralCode ? `<span>Referral code <b class="mono">${esc(k.referralCode)}</b></span>` : ''}${k.referredBy ? `<span>Referred by <b class="mono">${esc(k.referredBy)}</b></span>` : ''}<span>User id <b class="mono muted">${esc(u.id)}</b></span></div></div></div></section>

      <div class="section-title">Usage</div>
      <div class="tiles">
        ${tile('Scans (lifetime)', fmtNum(k.scans), `${fmtNum(k.scansToday)} today · ${fmtNum(k.scansMonth)} this month`)}
        ${tile('Active scan days', fmtNum(k.activeDays), k.firstScanAt ? `first ${fmtDate(k.firstScanAt)} · last ${relTime(k.lastScanAt)}` : 'no scans yet')}
        ${tile('Credits used on scans', fmtCredits(k.creditsUsed), `avg ${fmtCredits(k.avgScanCharge)} per scan`)}
        ${tile('Credit balance', k.creditBalance == null ? '—' : fmtCredits(k.creditBalance), `${fmtCredits(k.creditsAdded)} added in total`)}
        ${tile('Tokens processed', fmtCompact(k.tokens), `avg ${fmtNum(k.avgTokens)} per scan · $${fmtDec(k.scanCostUsd)} model cost`)}
        ${tile('Wishlist items', fmtNum(k.wishlists), `${fmtINRc(k.wishlistValue)} total MRP`)}
      </div>
      <div class="section-title">Money</div>
      <div class="tiles">
        ${tile('Paid (successful)', fmtINRc(k.paymentsSuccessAmount), `${fmtNum(k.paymentsSuccess)} of ${fmtNum(k.paymentsTotal)} attempts`)}
        ${tile('Payments failed', fmtNum(k.paymentsFailed), `${fmtNum(k.paymentsPending)} pending · ${fmtNum(k.webhookEvents)} webhook events`)}
        ${tile('Invoices generated', fmtNum(k.invoices), `${fmtNum(k.eInvoiced)} e-invoiced · ${fmtNum(k.invoicePdfFailed)} PDF failed`)}
        ${tile('Invoice value', fmtINRc(k.invoiceTotal), `GST ${fmtINRc(k.invoiceGst)}`)}
        ${tile('Logins via OTP', fmtNum(k.otpVerified), `${fmtNum(k.otpSent)} OTPs sent · ${fmtNum(k.otpFailed)} failed`)}
        ${tile('Employees', fmtNum(k.employees), `${fmtNum(k.activeEmployees)} active · ${fmtNum(k.visibleGoldRates)}/${fmtNum(k.goldRatesConfigured)} gold rates visible`)}
      </div>

      <div class="section-title" style="display:flex;justify-content:space-between;align-items:center">Activity trends <span class="range" id="udRange">${[7, 30, 90].map((n) => `<button data-days="${n}" class="${n === detailDays ? 'active' : ''}">${n} d</button>`).join('')}</span></div>
      <div class="grid grid-2">
        ${card('Scans per day', '<div class="chart-box" id="uScans"></div>', `last ${detailDays} days`)}
        ${card('Credit balance over time', '<div class="chart-box" id="uBalance"></div>', 'after every credit transaction')}
        ${card('Scans by hour of day', '<div class="chart-box" id="uHours"></div>', 'IST · all time')}
        ${card('Scans by weekday', '<div class="chart-box" id="uWeekday"></div>', 'all time')}
      </div>

      <div class="tabs" id="udTabs">${tabs.map(([key, label, count]) => `<button data-tab="${key}" class="${key === detailTab ? 'active' : ''}">${esc(label)}${count != null ? `<span class="count">${fmtNum(count)}</span>` : ''}</button>`).join('')}</div>
      <div id="udTabBody"></div>`;

    view.querySelectorAll('#udRange button').forEach((b) => b.addEventListener('click', () => { detailDays = Number(b.dataset.days); renderUser(id); }));
    view.querySelectorAll('#udTabs button').forEach((b) => b.addEventListener('click', () => { detailTab = b.dataset.tab; view.querySelectorAll('#udTabs button').forEach((x) => x.classList.toggle('active', x === b)); renderTab(d); }));

    Charts.columnChart(document.getElementById('uScans'), { points: d.series.scansByDay.map((p) => ({ label: dayLabel(p.day), title: fmtDate(p.day), value: p.value })), format: (v) => `${fmtNum(v)} scans` });
    Charts.lineChart(document.getElementById('uBalance'), { points: d.series.balanceHistory.map((b) => ({ x: b.at, y: b.balance, title: fmtDTFull(b.at), sub: `${humanize(b.type)} ${b.amount >= 0 ? '' : ''}${fmtCredits(b.amount)}` })), format: fmtCredits, step: true, color: 'var(--series-2)', timeLabel: shortDate });
    Charts.columnChart(document.getElementById('uHours'), { points: d.series.hourHist.map((h) => ({ label: String(h.hour).padStart(2, '0'), title: `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour).padStart(2, '0')}:59`, value: h.value })), format: (v) => `${fmtNum(v)} scans`, color: 'var(--series-3)', labelEvery: 3, height: 180 });
    Charts.columnChart(document.getElementById('uWeekday'), { points: d.series.weekdayHist.map((w) => ({ label: w.day, value: w.value })), format: (v) => `${fmtNum(v)} scans`, color: 'var(--series-7)', height: 180 });
    renderTab(d);
  }

  function renderTab(d) {
    const el = document.getElementById('udTabBody'); const a = d.activity; const k = d.kpis;
    switch (detailTab) {
      case 'timeline': {
        const kinds = ['ALL', ...Object.keys(KIND_LABEL).filter((kk) => d.timeline.some((e) => e.kind === kk))];
        const list = tlFilter === 'ALL' ? d.timeline : d.timeline.filter((e) => e.kind === tlFilter);
        el.innerHTML = `<div class="filters" id="tlFilters">${kinds.map((kk) => `<button data-kind="${kk}" class="${kk === tlFilter ? 'active' : ''}">${kk !== 'ALL' ? `<span class="dot" style="background:${KIND_COLOR[kk]}"></span>` : ''}${kk === 'ALL' ? 'All events' : KIND_LABEL[kk]} <span class="muted">${kk === 'ALL' ? d.timeline.length : d.timeline.filter((e) => e.kind === kk).length}</span></button>`).join('')}</div>
          ${card('Every recorded touchpoint', timelineList(list.slice(0, 300)), list.length > 300 ? `showing latest 300 of ${list.length}` : `${list.length} events · newest first`)}`;
        el.querySelectorAll('#tlFilters button').forEach((b) => b.addEventListener('click', () => { tlFilter = b.dataset.kind; renderTab(d); }));
        break;
      }
      case 'scans':
        el.innerHTML = `${d.models.length ? `<div class="filters">${d.models.map((m) => `<span class="chip"><span class="dot" style="background:var(--series-1)"></span>${esc(m.model)} · ${fmtNum(m.count)} scans</span>`).join('')}</div>` : ''}
          ${card('Scan billing records', table([
            { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Model', render: (r) => esc(r.model || r.provider) },
            { label: 'Prompt tokens', key: 'promptTokens', num: true, render: (r) => fmtNum(r.promptTokens) }, { label: 'Output tokens', num: true, render: (r) => fmtNum(r.completionTokens) },
            { label: 'Model cost', num: true, render: (r) => '$' + fmtDec(r.totalUsd, 4) }, { label: 'Charge', num: true, render: (r) => fmtCredits(r.totalScanCharge) },
            { label: 'Balance before', num: true, render: (r) => fmtDec(r.balanceBefore) }, { label: 'Balance after', num: true, render: (r) => fmtDec(r.balanceAfter) },
            { label: 'Status', render: (r) => statusPill(r.billingStatus) + (r.failureReason ? ` <span class="muted">${esc(r.failureReason)}</span>` : '') }, { label: 'Scan id', render: (r) => `<span class="mono muted">${esc(r.scanId)}</span>` },
          ], a.scans), `${fmtNum(a.scans.length)} scans · ${fmtNum(k.ownScans)} by this login`)}`;
        break;
      case 'credits':
        el.innerHTML = `<div class="filters">${Object.entries(d.creditsByType).map(([t, v]) => `<span class="chip"><span class="dot" style="background:var(--series-2)"></span>${esc(humanize(t))} · ${fmtNum(v.count)} × ${fmtCredits(v.amount)}</span>`).join('')}</div>
          ${card('Credit ledger', table([
            { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => statusPill(r.type) },
            { label: 'Amount', num: true, render: (r) => (r.type === 'SCAN_DEDUCTION' || r.type === 'TRIAL_EXPIRY_RESET' ? '−' : '+') + fmtCredits(r.amount) },
            { label: 'Before', num: true, render: (r) => fmtDec(r.balanceBefore) }, { label: 'After', num: true, render: (r) => fmtDec(r.balanceAfter) },
            { label: 'Note', wrap: true, render: (r) => esc(r.note || '') }, { label: 'Metadata', wrap: true, render: (r) => esc(Object.entries(r.metadata || {}).map(([kk, vv]) => `${kk}: ${vv}`).join(' · ')) },
          ], a.credits), `${fmtNum(a.credits.length)} transactions`)}`;
        break;
      case 'payments':
        el.innerHTML = `${card('Payment attempts (Razorpay orders)', table([
            { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => esc(humanize(r.paymentType)) }, { label: 'Status', render: (r) => statusPill(r.status) },
            { label: 'Amount', num: true, render: (r) => fmtINR(r.amount) }, { label: 'Base', num: true, render: (r) => fmtINR(r.baseAmount) }, { label: 'GST', num: true, render: (r) => fmtINR(r.gstAmount) },
            { label: 'Credits', num: true, render: (r) => fmtNum(r.creditsPurchased) }, { label: 'Order id', render: (r) => `<span class="mono">${esc(r.orderId)}</span>` },
            { label: 'Wallet credited', render: (r) => (r.walletCredited ? '✓' : '—') }, { label: 'App activated', render: (r) => (r.applicationActivated ? '✓' : '—') }, { label: 'Failure', wrap: true, render: (r) => esc(r.failureReason || '') },
          ], a.payments), `${fmtNum(a.payments.length)} attempts`)}
          <div style="height:14px"></div>
          ${card('License transactions', table([
            { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => esc(humanize(r.type)) }, { label: 'Status', render: (r) => statusPill(r.status) },
            { label: 'Amount', num: true, render: (r) => fmtINR(r.amount) }, { label: 'Credits', num: true, render: (r) => fmtNum(r.credits) }, { label: 'Payment id', render: (r) => `<span class="mono">${esc(r.paymentId || '')}</span>` }, { label: 'Note', wrap: true, render: (r) => esc(r.note || '') },
          ], a.licenseTx))}
          <div style="height:14px"></div>
          ${card('Gateway webhook events', table([
            { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Event', render: (r) => esc(r.eventType) }, { label: 'Status', render: (r) => statusPill(r.status) },
            { label: 'Amount', num: true, render: (r) => fmtINR((r.payload?.payload?.payment?.entity?.amount || 0) / 100) }, { label: 'Method', render: (r) => esc(r.payload?.payload?.payment?.entity?.method || '') },
            { label: 'Contact', render: (r) => esc(r.payload?.payload?.payment?.entity?.contact || '') }, { label: 'Reason', wrap: true, render: (r) => esc(r.failureReason || r.payload?.payload?.payment?.entity?.error_description || '') },
          ], a.webhooks))}`;
        break;
      case 'invoices':
        el.innerHTML = `${d.invoiceItems.length ? card('What was invoiced', '<div id="invItems"></div>', 'line item totals') + '<div style="height:14px"></div>' : ''}
          ${card('Invoices', table([
            { label: 'Date', render: (r) => esc(r.invoiceDate || fmtDate(r.createdAt)) }, { label: 'Number', render: (r) => `<span class="mono">${esc(r.invoiceNumber)}</span>` }, { label: 'Customer', wrap: true, render: (r) => esc(r.customerName) + (r.customerPhone ? `<br><span class="muted mono">${esc(r.customerPhone)}</span>` : '') },
            { label: 'Items', wrap: true, render: (r) => esc((r.lineItems || []).map((li) => `${li.description}${li.note ? ' (' + li.note + ')' : ''} × ${li.qty}`).join('; ')) },
            { label: 'Subtotal', num: true, render: (r) => fmtINR(r.subtotal) }, { label: 'GST', num: true, render: (r) => `${fmtINR(r.gstAmount)} <span class="muted">(${r.gstRate}%)</span>` }, { label: 'Total', num: true, render: (r) => `<b>${fmtINR(r.grandTotal)}</b>` },
            { label: 'PDF', render: (r) => statusPill(r.pdfStatus) + (r.pdfUrl && r.pdfStatus === 'success' ? ` <a href="${esc(r.pdfUrl)}" target="_blank" rel="noopener" style="color:var(--accent)">open</a>` : '') },
            { label: 'e-Invoice', render: (r) => (r.irn ? `${statusPill(r.eInvoiceStatus)} <span class="muted mono">${esc(r.eInvoiceAckNo || '')}</span>` : r.eInvoiceError ? `<span class="pill critical">error</span> <span class="muted">${esc(r.eInvoiceError)}</span>` : '—') },
            { label: 'Created', render: (r) => esc(fmtDTFull(r.createdAt)) },
          ], a.invoices), `${fmtNum(a.invoices.length)} invoices · ${fmtINR(k.invoiceTotal)}`)}`;
        if (d.invoiceItems.length) Charts.hbars(document.getElementById('invItems'), { rows: d.invoiceItems.map((i) => ({ label: i.description, sub: `${fmtNum(i.count)} lines · qty ${fmtDec(i.qty, 3)}`, value: i.amount })), format: fmtINR, color: 'var(--series-4)' });
        break;
      case 'wishlist':
        el.innerHTML = card('Saved wishlist items', table([
          { label: 'Saved at', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Title', wrap: true, render: (r) => esc(r.title || '') }, { label: 'Type', render: (r) => esc(r.snapshot?.selectedType || r.snapshot?.scanData?.category || '') },
          { label: 'Karat', render: (r) => esc(r.snapshot?.scanData?.karat || '') }, { label: 'Gross wt', num: true, render: (r) => esc(r.snapshot?.scanData?.grossWt || '') }, { label: 'Net wt', num: true, render: (r) => esc(r.snapshot?.scanData?.netWt || '') },
          { label: 'Gold rate/g', num: true, render: (r) => (r.snapshot?.pricing?.goldRatePerGram ? fmtINR(r.snapshot.pricing.goldRatePerGram) : '') }, { label: 'Rate basis', render: (r) => esc(r.calculationRate || '') },
          { label: 'Diamonds', num: true, render: (r) => esc((r.snapshot?.diamonds || []).length) }, { label: 'Price badge', render: (r) => esc(r.priceBadge || '') }, { label: 'Total MRP', num: true, render: (r) => `<b>${fmtINR(r.totalMrp)}</b>` }, { label: 'Tag', render: (r) => esc(r.tagCode || '') },
        ], a.wishlists), `${fmtNum(a.wishlists.length)} items · ${fmtINR(k.wishlistValue)}`);
        break;
      case 'logins':
        el.innerHTML = `<div class="tiles" style="margin-bottom:14px">${tile('Last login', esc(fmtDTFull(k.lastLoginAt)), relTime(k.lastLoginAt), true)}${tile('OTPs verified', fmtNum(k.otpVerified), `${fmtNum(k.otpSent)} sent`, true)}${tile('OTPs failed', fmtNum(k.otpFailed), '', true)}${tile('Phone verified', d.user.phoneVerified ? 'Yes' : 'No', '', true)}</div>
          ${card('OTP / login attempts', table([
            { label: 'Requested', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Flow', render: (r) => esc(r.flow) }, { label: 'Channel', render: (r) => esc(r.otpType) }, { label: 'Destination', render: (r) => `<span class="mono">${esc(r.destination)}</span>` },
            { label: 'Status', render: (r) => statusPill(r.status) }, { label: 'Verified', render: (r) => (r.verified ? '✓' : '—') }, { label: 'Resolved', render: (r) => esc(fmtDTFull(r.updatedAt)) }, { label: 'Request id', render: (r) => `<span class="mono muted">${esc(r.requestId || '')}</span>` },
          ], a.otps), `${fmtNum(a.otps.length)} OTP requests for ${esc(d.user.phone)}`)}`;
        break;
      case 'employees':
        el.innerHTML = a.employees.length ? a.employees.map((e) => card(e.name, `<div class="profile-meta" style="margin-bottom:10px"><span>📱 <b class="mono">${esc(e.phone || '—')}</b></span><span>✉️ <b>${esc(e.email || '—')}</b></span><span>Role <b>${esc(e.designation || '—')}</b></span><span>${e.isActive ? '<span class="chip good"><span class="dot"></span>Active</span>' : '<span class="chip critical"><span class="dot"></span>Inactive</span>'}</span><span>Added <b>${esc(fmtDTFull(e.createdAt))}</b></span></div>
            <h3 style="margin-bottom:6px">Permissions</h3><div class="perm-grid">${Object.entries(e.permissions || {}).map(([p, on]) => `<span class="${on ? 'on' : ''}">${esc(humanize(p))}</span>`).join('')}</div>`)).join('<div style="height:14px"></div>') : card('Employees', emptyMsg('No employees added by this business'));
        break;
      case 'settings': {
        const s = d.settings;
        const gold = table([
          { label: 'Carat', key: 'carat' }, { label: 'Purity %', num: true, render: (r) => esc(r.purity) }, { label: 'Adjustment', num: true, render: (r) => `${esc(r.increaseByAmount)} <span class="muted">${esc(r.increaseByType)}</span>` },
          { label: 'Visible', render: (r) => (r.isHidden ? '<span class="muted">hidden</span>' : '✓ shown') }, { label: 'Updated', render: (r) => esc(fmtDTFull(r.updatedAt)) },
        ], s.gold_rates);
        const metrics = s.dashboard_metrics[0]?.metricsData;
        el.innerHTML = `<div class="two-col">
          ${card('Gold rates configured', gold, `${fmtNum(s.gold_rates.length)} carats`)}
          ${card('Home dashboard metrics shown', metrics ? `<div class="perm-grid">${Object.entries(metrics).map(([p, on]) => `<span class="${on ? 'on' : ''}">${esc(humanize(p))}</span>`).join('')}</div>` : emptyMsg(), s.dashboard_metrics[0] ? `updated ${fmtDT(s.dashboard_metrics[0].updatedAt)}` : '')}
          ${card('Gold tax & rate settings', s.gold_tax_settings[0] ? kvList(s.gold_tax_settings[0], { skip: ['businessId', 'userId'] }) : emptyMsg())}
          ${card('Formula configuration', s.formula_configs[0] ? kvList(s.formula_configs[0], { skip: ['businessId', 'userId'] }) : emptyMsg())}
          ${card('Labour rates', table([{ label: 'Charge type', key: 'chargeType' }, { label: 'Value', num: true, render: (r) => esc(r.value) }, { label: 'Unit', key: 'rupeesUnit' }, { label: 'Weight basis', key: 'weightBasis' }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.labour_rates))}
          ${card('Bullion (bhaw) sources', s.bullion_sources[0] ? kvList(s.bullion_sources[0], { skip: ['businessId', 'userId'] }) : emptyMsg())}
          ${card('Diamond rates', table([{ label: 'Packet', key: 'packetCode' }, { label: 'Shape', key: 'shape' }, { label: 'Color', key: 'color' }, { label: 'Clarity', key: 'clarity' }, { label: 'Rate', num: true, render: (r) => fmtINR(r.rate) }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.diamond_rates))}
          ${card('Colorstone rates', table([{ label: 'Color', key: 'color' }, { label: 'Clarity', key: 'clarity' }, { label: 'Rate', num: true, render: (r) => fmtINR(r.rate) }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.colorstone_rates))}
          ${card('Item codes', table([{ label: 'Code', key: 'code' }, { label: 'Description', key: 'description', wrap: true }, { label: 'Wastage', num: true, render: (r) => esc(r.wastage ?? '—') }, { label: 'Labour', num: true, render: (r) => esc(r.labour ?? '—') }], s.item_codes))}
          ${card('Wastage codes', table([{ label: 'Code', key: 'code' }, { label: 'Percent', num: true, render: (r) => esc(r.percent) + '%' }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.wastage_codes))}
          ${card('Custom charges', table([{ label: 'Name', key: 'name' }, { label: 'Active', render: (r) => (r.isActive ? '✓' : '—') }, { label: 'Created', render: (r) => esc(fmtDT(r.createdAt)) }], s.customcharges))}
          ${card('Invoice counters', table([{ label: 'Date key', key: 'dateKey' }, { label: 'Sequence', num: true, render: (r) => esc(r.seq) }], s.invoice_counters))}
        </div>`;
        break;
      }
      case 'parameters': {
        const group = (title, obj, open = false) => `<details class="param-group card" ${open ? 'open' : ''}><summary>${esc(title)}<span class="count">${obj ? (Array.isArray(obj) ? obj.length + ' records' : Object.keys(obj).length + ' fields') : 'none'}</span></summary>${obj ? (Array.isArray(obj) ? obj.map((o, i) => `<h3 style="margin:8px 0 4px">#${i + 1}</h3>${kvList(o)}`).join('') : kvList(obj)) : emptyMsg()}</details>`;
        el.innerHTML = `<p class="muted" style="margin:0 0 12px;font-size:13px">Every stored field for this user, raw from MongoDB. Password hashes, MPIN, OTP codes and gateway secrets are removed on the server.</p>
          ${group('User account (business_users)', d.user, true)}${group('Business (businesses)', d.business, true)}${group('License (organization_licenses)', d.license.raw)}${group('Wallet (organization_wallets)', d.wallet)}${group('Referral code', d.referral)}${group('Other logins on this business', d.siblings)}
          ${Object.entries(d.settings).map(([name, docs]) => group(`${humanize(name)} (${name})`, docs)).join('')}`;
        break;
      }
    }
  }

  // ---------- routing ----------
  function setNav(name) { document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name)); }
  function route() {
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/user\/([^/?]+)/);
    Charts.hideTip();
    if (m) { detailTab = detailTab || 'timeline'; return renderUser(decodeURIComponent(m[1])); }
    // Home page is the user list; "#/?q=..." (or the older "#/users?q=...") is a search.
    const q = new URLSearchParams(hash.split('?')[1] || '').get('q') || '';
    return renderUsers(q);
  }
  const searchHash = (q) => (q ? `#/?q=${encodeURIComponent(q)}` : '#/');
  searchForm.addEventListener('submit', (e) => { e.preventDefault(); location.hash = searchHash(searchInput.value.trim()); });
  let typing; searchInput.addEventListener('input', () => { clearTimeout(typing); typing = setTimeout(() => { const q = searchInput.value.trim(); if (q.length >= 2 || !q) location.hash = searchHash(q); }, 280); });
  window.addEventListener('hashchange', route);
  const shell = window.MRPscanShell || window.PrathamShell; // PrathamShell = APK v1.0
  if (shell) {
    document.documentElement.classList.add('in-app');
    const btn = document.getElementById('serverBtn');
    btn.classList.remove('hidden');
    btn.addEventListener('click', () => shell.openSettings());
  }
  route();
})();
