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
  const dtfFull = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
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
      <p class="muted">${esc(message)}. Ask your admin for the key.</p>
      <form id="keyForm"><input id="keyInput" class="key-input" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="Access key" value="${esc(readKey())}" />
      <button class="primary-btn" type="submit">Unlock</button></form></section>`;
    document.getElementById('keyForm').addEventListener('submit', (e) => { e.preventDefault(); saveKey(document.getElementById('keyInput').value.trim()); cache.clear(); route(); });
    document.getElementById('keyInput').focus();
  }
  const loading = (msg = 'Loading…') => { view.innerHTML = `<div class="loading"><span class="spinner"></span>${esc(msg)}</div>`; };
  const errorBox = (e) => {
    if (e instanceof AuthError) return renderKeyPrompt(readKey() ? 'That key was not accepted' : 'This device needs an access key');
    view.innerHTML = `<div class="error-box"><b>Couldn’t load this page</b><p>${esc(e.message || e)}</p><button type="button" class="retry" id="retryBtn">Try again</button></div>`;
    document.getElementById('retryBtn').addEventListener('click', () => { cache.clear(); route(); });
  };

  // ---------- shared renderers ----------
  const tile = (label, value, delta = '', compact = false) => `<div class="tile${compact ? ' compact' : ''}"><div class="label">${esc(label)}</div><div class="value">${value}</div>${delta ? `<div class="delta">${delta}</div>` : ''}</div>`;
  const card = (title, body, sub = '', extra = '') => `<section class="card"><div class="card-head"><h2>${esc(title)}</h2>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}${extra}</div>${body}</section>`;
  const emptyMsg = (t = 'Nothing recorded yet') => `<div class="empty">${esc(t)}</div>`;

  const cell = (c, r) => { const v = c.render ? c.render(r) : esc(r[c.key]); return v === '' || v == null ? '' : `<span class="v">${v}</span>`; };
  function table(cols, rows) {
    if (!rows.length) return emptyMsg();
    const head = cols.map((c) => `<th class="${c.num ? 'num' : ''}${c.extra ? ' x' : ''}">${esc(c.label)}</th>`).join('');
    const body = rows.map((r) => `<tr>${cols.map((c) => `<td data-label="${esc(c.label)}" class="${c.num ? 'num' : ''}${c.wrap ? ' wrap' : ''}${c.extra ? ' x' : ''}">${cell(c, r)}</td>`).join('')}</tr>`).join('');
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

  // ---------- USER CATEGORIES (saved on this device) ----------
  const CAT_STORE = 'mrp-analytics-cats';
  // Prebuilt categories. Purchased / Free trial / Inactive fill themselves from each user's tags
  // every time the list loads (so a user moves on their own when their status changes);
  // a choice made from the card menu always wins until it is reset to automatic.
  const DEFAULT_CATS = [['fav', 'Favorite'], ['all', 'All'], ['purchased', 'Purchased'], ['trial', 'Free trial'], ['inactive', 'Inactive']];
  const PREBUILT = DEFAULT_CATS.map(([id]) => id);
  const KEEP_CATS = ['fav', 'all']; // renamable, never deletable
  const AUTO_HINT = {
    purchased: 'Users with a permanent (paid) license are added here automatically.',
    trial: 'Users on a free trial are added here automatically.',
    inactive: 'Inactive users, and users whose license or trial has expired, are added here automatically.',
  };
  const autoCat = (u) => {
    const status = String((u.license && u.license.status) || '');
    const trialOver = status === 'FREE_TRIAL_LICENSE' && u.license.daysLeft != null && u.license.daysLeft <= 0;
    if (u.isActive === false || status === 'EXPIRED' || trialOver) return 'inactive';
    if (status === 'PERMANENT_LICENSE' || status === 'ACTIVE') return 'purchased';
    if (status === 'FREE_TRIAL_LICENSE') return 'trial';
    return 'all';
  };
  const MAX_CAT_NAME = 20;
  const loadCats = () => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CAT_STORE) || '{}') || {}; } catch { /* storage unavailable */ }
    const byId = new Map((Array.isArray(saved.cats) ? saved.cats : []).filter((c) => c && c.id && c.name).map((c) => [c.id, c]));
    const removed = (Array.isArray(saved.removed) ? saved.removed : []).filter((id) => PREBUILT.includes(id) && !KEEP_CATS.includes(id));
    const cats = DEFAULT_CATS.filter(([id]) => !removed.includes(id)).map(([id, name]) => ({ id, name: (byId.get(id) || {}).name || name }));
    for (const c of byId.values()) if (!PREBUILT.includes(c.id)) cats.push({ id: String(c.id), name: String(c.name) });
    const ids = new Set(cats.map((c) => c.id));
    const assign = {};
    for (const [uid, cid] of Object.entries(saved.assign || {})) if (ids.has(cid)) assign[uid] = cid;
    return { cats, assign, removed };
  };
  const catState = loadCats();
  const saveCats = () => { try { localStorage.setItem(CAT_STORE, JSON.stringify(catState)); } catch { /* storage unavailable */ } };
  const catById = (id) => catState.cats.find((c) => c.id === id) || catState.cats[1];
  const catOf = (u) => { const id = catState.assign[u.id] || autoCat(u); return catState.cats.some((c) => c.id === id) ? id : 'all'; };
  // Put the prebuilt categories back in their usual order (after one was deleted or restored); custom ones follow.
  const rebuildCats = () => {
    const byId = new Map(catState.cats.map((c) => [c.id, c]));
    const custom = catState.cats.filter((c) => !PREBUILT.includes(c.id));
    catState.cats = [...DEFAULT_CATS.filter(([id]) => !catState.removed.includes(id)).map(([id, name]) => byId.get(id) || { id, name }), ...custom];
  };
  let activeCat = 'all'; // the list always opens on All
  let usersData = null; let usersQuery = '';

  const IC_STAR = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>';
  const IC_TAG = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12V4h8l10 10-8 8z"/><path d="M7.5 8h.01"/></svg>';
  const IC_CHEV = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const IC_EDIT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
  const IC_CHECK = '<svg class="ck" viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const IC_AUTO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.4-5.7"/><path d="M20 4v4h-4"/></svg>';
  const IC_PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';

  const catsEl = document.getElementById('cats');
  const catCount = (id) => (!usersData ? null : id === 'all' ? usersData.users.length : usersData.users.filter((u) => catOf(u) === id).length);
  function renderCats() {
    catsEl.innerHTML = catState.cats.map((c) => {
      const on = c.id === activeCat; const n = catCount(c.id);
      return `<button type="button" class="cat${on ? ' active' : ''}" data-cat="${esc(c.id)}" aria-pressed="${on}"${on ? ` aria-label="${esc(c.name)}, tap to rename"` : ''}>${esc(c.name)}${n != null ? `<span class="n">${n}</span>` : ''}${on ? IC_EDIT : ''}</button>`;
    }).join('') + `<button type="button" class="cat add" data-add="1">${IC_PLUS}Category</button>`;
  }
  catsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.cat'); if (!b) return;
    if (b.dataset.add) return openCatSheet();
    if (b.dataset.cat === activeCat) return openCatSheet(activeCat);
    activeCat = b.dataset.cat; renderCats(); if (usersData) drawUsers();
  });

  let toastTimer;
  function toast(msg) {
    let t = document.getElementById('toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 1900);
  }

  // Bottom sheet to add a category, or rename / delete one.
  function openCatSheet(id) {
    const cat = id ? catById(id) : null; const removable = cat && !KEEP_CATS.includes(cat.id);
    const gone = cat ? [] : DEFAULT_CATS.filter(([cid]) => catState.removed.includes(cid));
    const wrap = document.createElement('div'); wrap.className = 'sheet-backdrop';
    wrap.innerHTML = `<form class="sheet" role="dialog" aria-modal="true" aria-label="${cat ? 'Rename category' : 'New category'}">
      <h2>${cat ? 'Rename category' : 'New category'}</h2>
      <input class="field" name="name" maxlength="${MAX_CAT_NAME}" autocomplete="off" placeholder="e.g. Follow up" aria-label="Category name" value="${esc(cat ? cat.name : '')}" />
      ${cat && AUTO_HINT[cat.id] ? `<p class="hint">${esc(AUTO_HINT[cat.id])}</p>` : ''}
      ${cat && !removable ? '<p class="hint">You can rename this one, but it always stays.</p>' : ''}
      ${gone.length ? `<div class="restore"><span>Bring back</span>${gone.map(([cid, name]) => `<button type="button" class="chip-btn" data-restore="${esc(cid)}">${esc(name)}</button>`).join('')}</div>` : ''}
      <div class="field-err" role="alert"></div>
      <button class="primary-btn" type="submit">${cat ? 'Save' : 'Add category'}</button>
      <div class="sheet-row"><button type="button" class="ghost-btn" data-close>Cancel</button>${removable ? '<button type="button" class="danger-btn" data-del>Delete category</button>' : ''}</div></form>`;
    wrap.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', () => {
      catState.removed = catState.removed.filter((x) => x !== b.dataset.restore); rebuildCats();
      saveCats(); close(); renderCats(); if (usersData) drawUsers(); toast(`${b.textContent} is back`);
    }));
    const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); };
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
    const input = wrap.querySelector('input'); const err = wrap.querySelector('.field-err');
    wrap.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const name = input.value.trim().replace(/\s+/g, ' ');
      if (!name) { err.textContent = 'Enter a name'; return; }
      if (catState.cats.some((c) => c.id !== (cat && cat.id) && c.name.toLowerCase() === name.toLowerCase())) { err.textContent = 'A category with this name already exists'; return; }
      if (cat) cat.name = name;
      else catState.cats.push({ id: 'c' + Date.now().toString(36), name });
      saveCats(); close(); renderCats(); if (usersData) drawUsers();
      const addBtn = catsEl.querySelector('.cat.add'); if (!cat && addBtn) addBtn.scrollIntoView({ inline: 'end', block: 'nearest', behavior: 'smooth' });
      toast(cat ? 'Renamed' : `“${name}” added. Pick it from a card’s menu`);
    });
    const del = wrap.querySelector('[data-del]');
    if (del) del.addEventListener('click', () => {
      if (!del.dataset.sure) { del.dataset.sure = '1'; del.textContent = 'Tap again to delete'; return; }
      catState.cats = catState.cats.filter((c) => c.id !== cat.id);
      if (PREBUILT.includes(cat.id)) catState.removed.push(cat.id);
      for (const uid of Object.keys(catState.assign)) if (catState.assign[uid] === cat.id) delete catState.assign[uid];
      if (activeCat === cat.id) activeCat = 'all';
      saveCats(); close(); renderCats(); if (usersData) drawUsers(); toast('Category deleted');
    });
    document.body.appendChild(wrap); input.focus(); input.select();
  }

  function setUserCat(userId, catId) {
    if (catId === 'auto') delete catState.assign[userId]; else catState.assign[userId] = catId;
    saveCats(); renderCats(); drawUsers(); toast(catId === 'auto' ? 'Back to automatic' : `Moved to ${catById(catId).name}`);
  }
  // Dropdown that opens under a card's category chip.
  let menuEl = null; let menuBtn = null;
  const onMenuOutside = (e) => { if (menuEl && !menuEl.contains(e.target) && !e.target.closest('.cat-pick')) closeMenu(); };
  const onMenuScroll = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const onMenuResize = () => closeMenu();
  const onMenuKey = (e) => {
    if (!menuEl) return;
    if (e.key === 'Escape') { e.preventDefault(); closeMenu(true); return; }
    if (e.key === 'Tab') { closeMenu(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...menuEl.querySelectorAll('.menu-item')]; const at = items.indexOf(document.activeElement);
    items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
  };
  function closeMenu(focusBack) {
    if (!menuEl) return;
    menuEl.remove(); menuEl = null;
    document.removeEventListener('pointerdown', onMenuOutside, true); document.removeEventListener('keydown', onMenuKey, true);
    window.removeEventListener('scroll', onMenuScroll, true); window.removeEventListener('resize', onMenuResize);
    if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); if (focusBack === true) menuBtn.focus(); }
    menuBtn = null;
  }
  function openMenu(btn) {
    const same = menuBtn === btn; closeMenu(); if (same) return;
    const uid = btn.dataset.id; const user = usersData && usersData.users.find((x) => x.id === uid); if (!user) return;
    const cur = catOf(user); const manual = Boolean(catState.assign[uid]);
    const m = document.createElement('div'); m.className = 'menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', 'Move to category');
    m.innerHTML = '<div class="menu-title">Move to</div>' + catState.cats.map((c) => `<button type="button" role="menuitemradio" aria-checked="${c.id === cur}" class="menu-item${c.id === cur ? ' on' : ''}" data-cat="${esc(c.id)}">${c.id === 'fav' ? IC_STAR : IC_TAG}<span>${esc(c.name)}</span>${c.id === cur ? IC_CHECK : ''}</button>`).join('')
      + (manual ? `<div class="menu-sep"></div><button type="button" role="menuitem" class="menu-item" data-cat="auto">${IC_AUTO}<span>Automatic · ${esc(catById(autoCat(user)).name)}</span></button>` : '');
    m.addEventListener('click', (e) => { const it = e.target.closest('.menu-item'); if (!it) return; closeMenu(); if (it.dataset.cat !== cur) setUserCat(uid, it.dataset.cat); });
    document.body.appendChild(m);
    const r = btn.getBoundingClientRect(); const w = m.offsetWidth; const h = m.offsetHeight;
    const left = Math.max(8, Math.min(r.right - w, window.innerWidth - w - 8));
    const below = r.bottom + 6 + h <= window.innerHeight - 8; const top = below ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
    m.style.left = left + 'px'; m.style.top = top + 'px'; m.style.transformOrigin = `${Math.round(r.right - left)}px ${below ? '0' : '100%'}`;
    menuEl = m; menuBtn = btn; btn.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', onMenuOutside, true); document.addEventListener('keydown', onMenuKey, true);
    window.addEventListener('scroll', onMenuScroll, true); window.addEventListener('resize', onMenuResize);
    (m.querySelector('.on') || m.querySelector('.menu-item')).focus({ preventScroll: true });
  }
  view.addEventListener('click', (e) => {
    const pick = e.target.closest('.cat-pick'); if (pick) return openMenu(pick);
    const card = e.target.closest('.uc'); if (card) location.hash = '#/user/' + card.dataset.id;
  });
  view.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.classList.contains('uc')) location.hash = '#/user/' + e.target.dataset.id; });

  // ---------- USERS ----------
  async function renderUsers(q = '') {
    setNav('users'); document.body.classList.remove('is-detail'); if (searchInput.value !== q) searchInput.value = q;
    usersQuery = q; renderCats();
    loading(q ? `Searching “${q}”…` : 'Loading users…');
    let d; try { d = await api(`/api/users?q=${encodeURIComponent(q)}`); } catch (e) { return errorBox(e); }
    usersData = d; renderCats(); drawUsers();
  }
  function drawUsers() {
    closeMenu();
    const q = usersQuery; const cat = catById(activeCat); const inAll = activeCat === 'all';
    const list = inAll ? usersData.users : usersData.users.filter((u) => catOf(u) === activeCat);
    const n = list.length; const plural = n === 1 ? '' : 's';
    const sub = q ? `${fmtNum(n)} result${plural} for “${esc(q)}”${inAll ? '' : ` in ${esc(cat.name)}`}`
      : inAll ? `${fmtNum(n)} user${plural} · latest activity first` : `${fmtNum(n)} in ${esc(cat.name)}`;
    const empty = q ? `No user found for “${q}”${inAll ? '. Try the 10-digit phone number or part of the name.' : ` in ${cat.name}. Try the All tab.`}`
      : inAll ? 'No users in the database' : AUTO_HINT[activeCat] ? `No users here right now. ${AUTO_HINT[activeCat]}` : `No users in ${cat.name} yet. Use the menu on a card to add one.`;
    view.innerHTML = `
      <div class="page-head"><div><h1>${q ? 'Search results' : inAll ? 'Users' : esc(cat.name)}</h1><div class="sub">${sub}</div></div></div>
      ${n ? `<div class="user-list">${list.map(userCard).join('')}</div>` : emptyMsg(empty)}`;
  }
  const IC_PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
  // When the person was last around: the later of their last scan and last login.
  const lastSeenOf = (u) => {
    const t = [u.stats && u.stats.lastScanAt, u.lastLoginAt].filter(Boolean).map((x) => new Date(x).getTime());
    return t.length ? new Date(Math.max(...t)) : null;
  };
  // Home card = company, person, mobile, last seen, city, state. Everything else is inside (tap the card).
  function userCard(u) {
    const cid = catOf(u); const cat = catById(cid);
    const company = u.businessName || ''; const person = u.fullName || '';
    const title = company || person || u.displayName || u.phone;
    const who = company && person && person !== company ? person : '';
    const place = [u.city, u.stateName].filter(Boolean).map(esc).join(', ');
    return `<article class="uc" data-id="${esc(u.id)}" tabindex="0" role="link" aria-label="Open ${esc(title)}">
      <div class="uc-head"><div class="avatar sm" style="background:${avatarColor(u.id)}">${esc(initials(title))}</div>
        <div class="uc-id"><div class="uc-name">${esc(title)}</div>${who ? `<div class="uc-person">${esc(who)}</div>` : ''}</div>
        <button type="button" class="cat-pick${cid === 'fav' ? ' fav' : ''}" data-id="${esc(u.id)}" aria-haspopup="menu" aria-expanded="false" aria-label="Category: ${esc(cat.name)}. Change category for ${esc(title)}">${cid === 'fav' ? IC_STAR : IC_TAG}<span>${esc(cat.name)}</span>${IC_CHEV}</button></div>
      <div class="uc-meta"><span class="uc-phone">${esc(u.phone)}${u.phoneVerified ? ' <i class="verified">✓</i>' : ''}</span><span class="uc-seen">Last seen ${esc(relTime(lastSeenOf(u)))}</span></div>
      ${place ? `<div class="uc-place">${IC_PIN}<span>${place}</span></div>` : ''}</article>`;
  }

  // ---------- USER DETAIL ----------
  let detailTab = 'overview'; let detailDays = 30;
  const fold = (title, body, count = '', cls = '') => `<details class="fold${cls ? ' ' + cls : ''}"><summary><span>${esc(title)}</span>${count !== '' ? `<span class="count">${esc(count)}</span>` : ''}</summary><div class="fold-body">${body}</div></details>`;
  const sec = (title, body, sub = '') => `<div class="sec"><div class="sec-head"><h3>${esc(title)}</h3>${sub ? `<span class="sub">${esc(sub)}</span>` : ''}</div>${body}</div>`;
  const info = (label, value, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${esc(label)}</dt><dd>${value}</dd></div>`;

  async function renderUser(id) {
    setNav('users'); document.body.classList.add('is-detail'); loading();
    let d; try { d = await api(`/api/users/${encodeURIComponent(id)}?days=${detailDays}`); } catch (e) { return errorBox(e); }
    const u = d.user, k = d.kpis, a = d.activity;
    const tabs = [['overview', 'Overview'], ['timeline', 'Timeline'], ['scans', 'Scans'], ['payments', 'Payments'], ['invoices', 'Invoices'], ['wishlist', 'Wishlist'], ['team', 'Team'], ['more', 'More']];
    const chip = (tone, text) => `<span class="chip ${tone}"><span class="dot"></span>${text}</span>`;
    const biz = d.business || {};
    const company = u.businessName || ''; const person = u.fullName || u.displayName || '';
    const title = company || person || u.phone;
    const place = [biz.city || u.city, biz.stateName || u.stateName].filter(Boolean).map(esc).join(', ') + (biz.pincode ? ` · ${esc(biz.pincode)}` : '');
    view.innerHTML = `
      <section class="card pc">
        <div class="pc-top"><div class="avatar" style="background:${avatarColor(u.id)}">${esc(initials(title))}</div>
          <div class="pc-id"><h1>${esc(title)}</h1>${company && person && person !== company ? `<p class="pc-person">${esc(person)}</p>` : ''}
            <div class="pc-chips">${licenseChip(d.license)}${u.isActive ? chip('good', 'Active') : chip('critical', 'Inactive')}${u.phoneVerified ? '' : chip('warning', 'Phone unverified')}</div></div></div>
        <dl class="pc-info">
          ${info('Mobile', `<span class="mono">${esc(u.phone)}</span>`)}
          ${info('Last seen', esc(relTime(k.lastSeenAt)))}
          ${place ? info('Location', place, 'wide') : ''}
        </dl>
        <details class="pc-more">
          <summary>More details</summary>
          <dl class="pc-info inner">
            ${u.gstNumber ? info('GST', `<span class="mono">${esc(u.gstNumber)}</span>`, 'wide') : ''}
            ${u.userId ? info('Login ID', '@' + esc(u.userId)) : ''}
            ${biz.businessType ? info('Business type', esc(biz.businessType)) : ''}
            ${info('Role', esc(u.role || '—'))}
            ${info('Joined', esc(fmtDate(u.createdAt)))}
            ${k.referralCode ? info('Referral code', `<span class="mono">${esc(k.referralCode)}</span>`) : ''}
          </dl>
        </details>
      </section>

      <div class="tiles summary">
        ${tile('Scans', fmtNum(k.scans), `${fmtNum(k.scansToday)} today · ${fmtNum(k.scansMonth)} this month`)}
        ${tile('Credits left', k.creditBalance == null ? '—' : fmtDec(k.creditBalance), `${fmtCredits(k.creditsUsed)} used`)}
        ${tile('Paid', fmtINRc(k.paymentsSuccessAmount), `${fmtNum(k.paymentsSuccess)} of ${fmtNum(k.paymentsTotal)} payments`)}
        ${tile('Invoices', fmtNum(k.invoices), `${fmtINRc(k.invoiceTotal)} billed`)}
      </div>

      <div class="tabs" id="udTabs" role="tablist">${tabs.map(([key, label]) => `<button type="button" role="tab" data-tab="${key}" class="${key === detailTab ? 'active' : ''}">${esc(label)}</button>`).join('')}</div>
      <div id="udTabBody"></div>`;

    view.querySelectorAll('#udTabs button').forEach((b) => b.addEventListener('click', () => { detailTab = b.dataset.tab; view.querySelectorAll('#udTabs button').forEach((x) => x.classList.toggle('active', x === b)); renderTab(d); }));
    renderTab(d);
  }

  // ---- tables used by the tabs (extra:true columns are technical ids, hidden on phones) ----
  const tblScans = (a) => table([
    { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Model', render: (r) => esc(r.model || r.provider) },
    { label: 'Charge', num: true, render: (r) => fmtCredits(r.totalScanCharge) }, { label: 'Status', render: (r) => statusPill(r.billingStatus) + (r.failureReason ? ` <span class="muted">${esc(r.failureReason)}</span>` : '') },
    { label: 'Prompt tokens', extra: true, num: true, render: (r) => fmtNum(r.promptTokens) }, { label: 'Output tokens', extra: true, num: true, render: (r) => fmtNum(r.completionTokens) },
    { label: 'Model cost', num: true, render: (r) => '$' + fmtDec(r.totalUsd, 4) },
    { label: 'Balance before', extra: true, num: true, render: (r) => fmtDec(r.balanceBefore) }, { label: 'Balance after', num: true, render: (r) => fmtDec(r.balanceAfter) },
    { label: 'Scan id', extra: true, render: (r) => `<span class="mono muted">${esc(r.scanId)}</span>` },
  ], a.scans);
  const tblCredits = (a) => table([
    { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => statusPill(r.type) },
    { label: 'Amount', num: true, render: (r) => (r.type === 'SCAN_DEDUCTION' || r.type === 'TRIAL_EXPIRY_RESET' ? '−' : '+') + fmtCredits(r.amount) },
    { label: 'Before', extra: true, num: true, render: (r) => fmtDec(r.balanceBefore) }, { label: 'After', num: true, render: (r) => fmtDec(r.balanceAfter) },
    { label: 'Note', wrap: true, render: (r) => esc(r.note || '') }, { label: 'Metadata', wrap: true, extra: true, render: (r) => esc(Object.entries(r.metadata || {}).map(([kk, vv]) => `${kk}: ${vv}`).join(' · ')) },
  ], a.credits);
  const tblPayments = (a) => table([
    { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => esc(humanize(r.paymentType)) }, { label: 'Status', render: (r) => statusPill(r.status) },
    { label: 'Amount', num: true, render: (r) => fmtINR(r.amount) }, { label: 'Base', extra: true, num: true, render: (r) => fmtINR(r.baseAmount) }, { label: 'GST', num: true, extra: true, render: (r) => fmtINR(r.gstAmount) },
    { label: 'Credits', num: true, render: (r) => fmtNum(r.creditsPurchased) }, { label: 'Order id', extra: true, render: (r) => `<span class="mono">${esc(r.orderId)}</span>` },
    { label: 'Wallet credited', extra: true, render: (r) => (r.walletCredited ? '✓' : '—') }, { label: 'App activated', extra: true, render: (r) => (r.applicationActivated ? '✓' : '—') }, { label: 'Failure', wrap: true, render: (r) => esc(r.failureReason || '') },
  ], a.payments);
  const tblLicenseTx = (a) => table([
    { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Type', render: (r) => esc(humanize(r.type)) }, { label: 'Status', render: (r) => statusPill(r.status) },
    { label: 'Amount', num: true, render: (r) => fmtINR(r.amount) }, { label: 'Credits', num: true, render: (r) => fmtNum(r.credits) }, { label: 'Payment id', render: (r) => `<span class="mono">${esc(r.paymentId || '')}</span>` }, { label: 'Note', wrap: true, render: (r) => esc(r.note || '') },
  ], a.licenseTx);
  const tblWebhooks = (a) => table([
    { label: 'Time', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Event', render: (r) => esc(r.eventType) }, { label: 'Status', render: (r) => statusPill(r.status) },
    { label: 'Amount', num: true, render: (r) => fmtINR((r.payload?.payload?.payment?.entity?.amount || 0) / 100) }, { label: 'Method', render: (r) => esc(r.payload?.payload?.payment?.entity?.method || '') },
    { label: 'Contact', render: (r) => esc(r.payload?.payload?.payment?.entity?.contact || '') }, { label: 'Reason', wrap: true, render: (r) => esc(r.failureReason || r.payload?.payload?.payment?.entity?.error_description || '') },
  ], a.webhooks);
  const tblOtps = (a) => table([
    { label: 'Requested', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Flow', render: (r) => esc(r.flow) }, { label: 'Status', render: (r) => statusPill(r.status) },
    { label: 'Channel', extra: true, render: (r) => esc(r.otpType) }, { label: 'Destination', extra: true, render: (r) => `<span class="mono">${esc(r.destination)}</span>` }, { label: 'Verified', extra: true, render: (r) => (r.verified ? '✓' : '—') },
    { label: 'Resolved', extra: true, render: (r) => esc(fmtDTFull(r.updatedAt)) }, { label: 'Request id', extra: true, render: (r) => `<span class="mono muted">${esc(r.requestId || '')}</span>` },
  ], a.otps);

  function settingsHtml(d) {
    const s = d.settings;
    const gold = table([
      { label: 'Carat', key: 'carat' }, { label: 'Purity %', num: true, render: (r) => esc(r.purity) }, { label: 'Adjustment', num: true, render: (r) => `${esc(r.increaseByAmount)} <span class="muted">${esc(r.increaseByType)}</span>` },
      { label: 'Visible', render: (r) => (r.isHidden ? '<span class="muted">hidden</span>' : '✓ shown') }, { label: 'Updated', render: (r) => esc(fmtDTFull(r.updatedAt)) },
    ], s.gold_rates);
    const metrics = s.dashboard_metrics[0]?.metricsData;
    return [
      sec('Gold rates', gold, `${fmtNum(s.gold_rates.length)} carats`),
      sec('Home dashboard metrics shown', metrics ? `<div class="perm-grid">${Object.entries(metrics).map(([p, on]) => `<span class="${on ? 'on' : ''}">${esc(humanize(p))}</span>`).join('')}</div>` : emptyMsg(), s.dashboard_metrics[0] ? `updated ${fmtDT(s.dashboard_metrics[0].updatedAt)}` : ''),
      sec('Gold tax and rate', s.gold_tax_settings[0] ? kvList(s.gold_tax_settings[0], { skip: ['businessId', 'userId'] }) : emptyMsg()),
      sec('Formula configuration', s.formula_configs[0] ? kvList(s.formula_configs[0], { skip: ['businessId', 'userId'] }) : emptyMsg()),
      sec('Labour rates', table([{ label: 'Charge type', key: 'chargeType' }, { label: 'Value', num: true, render: (r) => esc(r.value) }, { label: 'Unit', key: 'rupeesUnit' }, { label: 'Weight basis', key: 'weightBasis' }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.labour_rates)),
      sec('Bullion (bhaw) sources', s.bullion_sources[0] ? kvList(s.bullion_sources[0], { skip: ['businessId', 'userId'] }) : emptyMsg()),
      sec('Diamond rates', table([{ label: 'Packet', key: 'packetCode' }, { label: 'Shape', key: 'shape' }, { label: 'Color', key: 'color' }, { label: 'Clarity', key: 'clarity' }, { label: 'Rate', num: true, render: (r) => fmtINR(r.rate) }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.diamond_rates)),
      sec('Colorstone rates', table([{ label: 'Color', key: 'color' }, { label: 'Clarity', key: 'clarity' }, { label: 'Rate', num: true, render: (r) => fmtINR(r.rate) }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.colorstone_rates)),
      sec('Item codes', table([{ label: 'Code', key: 'code' }, { label: 'Description', key: 'description', wrap: true }, { label: 'Wastage', num: true, render: (r) => esc(r.wastage ?? '—') }, { label: 'Labour', num: true, render: (r) => esc(r.labour ?? '—') }], s.item_codes)),
      sec('Wastage codes', table([{ label: 'Code', key: 'code' }, { label: 'Percent', num: true, render: (r) => esc(r.percent) + '%' }, { label: 'Updated', render: (r) => esc(fmtDT(r.updatedAt)) }], s.wastage_codes)),
      sec('Custom charges', table([{ label: 'Name', key: 'name' }, { label: 'Active', render: (r) => (r.isActive ? '✓' : '—') }, { label: 'Created', render: (r) => esc(fmtDT(r.createdAt)) }], s.customcharges)),
      sec('Invoice counters', table([{ label: 'Date key', key: 'dateKey' }, { label: 'Sequence', num: true, render: (r) => esc(r.seq) }], s.invoice_counters)),
    ].join('');
  }

  function rawHtml(d) {
    const group = (title, obj) => fold(title, obj ? (Array.isArray(obj) ? obj.map((o, i) => `<h3 class="rec">#${i + 1}</h3>${kvList(o)}`).join('') : kvList(obj)) : emptyMsg(), obj ? (Array.isArray(obj) ? obj.length + ' records' : Object.keys(obj).length + ' fields') : 'none', 'nested');
    return `<p class="muted note">Every stored field for this user, as saved in the database. Passwords, MPIN, OTP codes and gateway secrets are removed on the server.</p>
      ${group('User account', d.user)}${group('Business', d.business)}${group('License', d.license.raw)}${group('Wallet', d.wallet)}${group('Referral code', d.referral)}${group('Other logins on this business', d.siblings)}
      ${Object.entries(d.settings).map(([name, docs]) => group(humanize(name), docs)).join('')}`;
  }

  function renderTab(d) {
    const el = document.getElementById('udTabBody'); const a = d.activity; const k = d.kpis;
    switch (detailTab) {
      case 'overview': {
        el.innerHTML = `<div class="stack">
          ${card('Scans per day', '<div class="chart-box" id="uScans"></div>', '', `<span class="range" id="udRange">${[7, 30, 90].map((n) => `<button type="button" data-days="${n}" class="${n === detailDays ? 'active' : ''}">${n}d</button>`).join('')}</span>`)}
          <div class="tiles compact-tiles">
            ${tile('Active scan days', fmtNum(k.activeDays), k.firstScanAt ? `first scan ${fmtDate(k.firstScanAt)}` : 'no scans yet', true)}
            ${tile('Avg credits per scan', fmtCredits(k.avgScanCharge), `${fmtCredits(k.creditsAdded)} added in total`, true)}
            ${tile('Tokens processed', fmtCompact(k.tokens), `$${fmtDec(k.scanCostUsd)} model cost`, true)}
            ${tile('Wishlist', fmtNum(k.wishlists), `${fmtINRc(k.wishlistValue)} total MRP`, true)}
            ${tile('Payments failed', fmtNum(k.paymentsFailed), `${fmtNum(k.paymentsPending)} pending`, true)}
            ${tile('e-Invoices', fmtNum(k.eInvoiced), `${fmtNum(k.invoicePdfFailed)} PDF failed`, true)}
            ${tile('OTP logins', fmtNum(k.otpVerified), `${fmtNum(k.otpSent)} sent · ${fmtNum(k.otpFailed)} failed`, true)}
            ${tile('Employees', fmtNum(k.employees), `${fmtNum(k.activeEmployees)} active`, true)}
          </div>
          ${card('Credit balance over time', '<div class="chart-box" id="uBalance"></div>', 'after every credit change')}
          ${card('Scans by hour of day', '<div class="chart-box" id="uHours"></div>', 'IST · all time')}
          ${card('Scans by weekday', '<div class="chart-box" id="uWeekday"></div>', 'all time')}
        </div>`;
        el.querySelectorAll('#udRange button').forEach((b) => b.addEventListener('click', () => { detailDays = Number(b.dataset.days); renderUser(d.user.id); }));
        Charts.columnChart(document.getElementById('uScans'), { points: d.series.scansByDay.map((p) => ({ label: dayLabel(p.day), title: fmtDate(p.day), value: p.value })), format: (v) => `${fmtNum(v)} scans`, height: 190 });
        Charts.lineChart(document.getElementById('uBalance'), { points: d.series.balanceHistory.map((b) => ({ x: b.at, y: b.balance, title: fmtDTFull(b.at), sub: `${humanize(b.type)} ${fmtCredits(b.amount)}` })), format: fmtCredits, step: true, color: 'var(--series-2)', timeLabel: shortDate, height: 190 });
        Charts.columnChart(document.getElementById('uHours'), { points: d.series.hourHist.map((h) => ({ label: String(h.hour).padStart(2, '0'), title: `${String(h.hour).padStart(2, '0')}:00 – ${String(h.hour).padStart(2, '0')}:59`, value: h.value })), format: (v) => `${fmtNum(v)} scans`, color: 'var(--series-3)', labelEvery: 3, height: 170 });
        Charts.columnChart(document.getElementById('uWeekday'), { points: d.series.weekdayHist.map((w) => ({ label: w.day, value: w.value })), format: (v) => `${fmtNum(v)} scans`, color: 'var(--series-7)', height: 170 });
        break;
      }
      case 'timeline': {
        const list = d.timeline.slice(0, 100);
        el.innerHTML = card('Recent activity', timelineList(list), d.timeline.length > list.length ? `latest ${list.length} of ${d.timeline.length}` : `${list.length} events`);
        break;
      }
      case 'scans':
        el.innerHTML = `${d.models.length ? `<div class="filters">${d.models.map((m) => `<span class="chip"><span class="dot" style="background:var(--series-1)"></span>${esc(m.model)} · ${fmtNum(m.count)} scans</span>`).join('')}</div>` : ''}
          ${card('Scans', tblScans(a), `${fmtNum(a.scans.length)} recent · ${fmtNum(k.ownScans)} by this login`)}`;
        break;
      case 'payments':
        el.innerHTML = `<div class="stack">${card('Payments', tblPayments(a), `${fmtNum(a.payments.length)} attempts`)}
          ${card('Credit history', `<div class="filters">${Object.entries(d.creditsByType).map(([t, v]) => `<span class="chip"><span class="dot" style="background:var(--series-2)"></span>${esc(humanize(t))} · ${fmtNum(v.count)} × ${fmtCredits(v.amount)}</span>`).join('')}</div>${tblCredits(a)}`, `${fmtNum(a.credits.length)} entries`)}</div>`;
        break;
      case 'invoices':
        el.innerHTML = `<div class="stack">${d.invoiceItems.length ? card('What was invoiced', '<div id="invItems"></div>', 'line item totals') : ''}
          ${card('Invoices', table([
            { label: 'Date', render: (r) => esc(r.invoiceDate || fmtDate(r.createdAt)) }, { label: 'Number', render: (r) => `<span class="mono">${esc(r.invoiceNumber)}</span>` }, { label: 'Customer', wrap: true, render: (r) => esc(r.customerName) + (r.customerPhone ? `<br><span class="muted mono">${esc(r.customerPhone)}</span>` : '') },
            { label: 'Items', wrap: true, render: (r) => esc((r.lineItems || []).map((li) => `${li.description}${li.note ? ' (' + li.note + ')' : ''} × ${li.qty}`).join('; ')) },
            { label: 'Subtotal', extra: true, num: true, render: (r) => fmtINR(r.subtotal) }, { label: 'GST', num: true, extra: true, render: (r) => `${fmtINR(r.gstAmount)} <span class="muted">(${r.gstRate}%)</span>` }, { label: 'Total', num: true, render: (r) => `<b>${fmtINR(r.grandTotal)}</b>` },
            { label: 'PDF', render: (r) => statusPill(r.pdfStatus) + (r.pdfUrl && r.pdfStatus === 'success' ? ` <a href="${esc(r.pdfUrl)}" target="_blank" rel="noopener" class="link">open</a>` : '') },
            { label: 'e-Invoice', render: (r) => (r.irn ? `${statusPill(r.eInvoiceStatus)} <span class="muted mono">${esc(r.eInvoiceAckNo || '')}</span>` : r.eInvoiceError ? `<span class="pill critical">error</span> <span class="muted">${esc(r.eInvoiceError)}</span>` : '—') },
          ], a.invoices), `${fmtNum(a.invoices.length)} invoices · ${fmtINR(k.invoiceTotal)}`)}</div>`;
        if (d.invoiceItems.length) Charts.hbars(document.getElementById('invItems'), { rows: d.invoiceItems.map((i) => ({ label: i.description, sub: `${fmtNum(i.count)} lines · qty ${fmtDec(i.qty, 3)}`, value: i.amount })), format: fmtINR, color: 'var(--series-4)' });
        break;
      case 'wishlist':
        el.innerHTML = card('Saved wishlist items', table([
          { label: 'Saved at', render: (r) => esc(fmtDTFull(r.createdAt)) }, { label: 'Title', wrap: true, render: (r) => esc(r.title || '') }, { label: 'Total MRP', num: true, render: (r) => `<b>${fmtINR(r.totalMrp)}</b>` },
          { label: 'Type', render: (r) => esc(r.snapshot?.selectedType || r.snapshot?.scanData?.category || '') }, { label: 'Karat', render: (r) => esc(r.snapshot?.scanData?.karat || '') },
          { label: 'Gross wt', num: true, render: (r) => esc(r.snapshot?.scanData?.grossWt || '') }, { label: 'Net wt', num: true, render: (r) => esc(r.snapshot?.scanData?.netWt || '') },
          { label: 'Gold rate/g', extra: true, num: true, render: (r) => (r.snapshot?.pricing?.goldRatePerGram ? fmtINR(r.snapshot.pricing.goldRatePerGram) : '') }, { label: 'Rate basis', extra: true, render: (r) => esc(r.calculationRate || '') },
          { label: 'Diamonds', extra: true, num: true, render: (r) => esc((r.snapshot?.diamonds || []).length) }, { label: 'Price badge', extra: true, render: (r) => esc(r.priceBadge || '') }, { label: 'Tag', extra: true, render: (r) => esc(r.tagCode || '') },
        ], a.wishlists), `${fmtNum(a.wishlists.length)} items · ${fmtINR(k.wishlistValue)}`);
        break;
      case 'team':
        el.innerHTML = a.employees.length ? `<div class="stack">${a.employees.map((e) => card(e.name, `<div class="profile-meta"><span>Phone <b class="mono">${esc(e.phone || '—')}</b></span><span>Email <b>${esc(e.email || '—')}</b></span><span>Role <b>${esc(e.designation || '—')}</b></span><span>${e.isActive ? '<span class="chip good"><span class="dot"></span>Active</span>' : '<span class="chip critical"><span class="dot"></span>Inactive</span>'}</span><span>Added <b>${esc(fmtDate(e.createdAt))}</b></span></div>
            <h3 class="rec">Can access</h3><div class="perm-grid">${Object.entries(e.permissions || {}).map(([p, on]) => `<span class="${on ? 'on' : ''}">${esc(humanize(p))}</span>`).join('')}</div>`)).join('')}</div>` : card('Team', emptyMsg('No employees added by this business'));
        break;
      case 'more':
        el.innerHTML = `<div class="stack">
          ${fold('Login history', tblOtps(a), `${fmtNum(a.otps.length)} OTPs`)}
          ${fold('Settings', settingsHtml(d))}
          ${fold('License payments', tblLicenseTx(a), `${fmtNum(a.licenseTx.length)}`)}
          ${fold('Payment gateway events', tblWebhooks(a), `${fmtNum(a.webhooks.length)}`)}
          ${fold('All stored fields', rawHtml(d))}</div>`;
        break;
    }
  }

  // ---------- routing ----------
  function setNav(name) { document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === name)); }
  function route() {
    const hash = location.hash || '#/';
    const m = hash.match(/^#\/user\/([^/?]+)/);
    Charts.hideTip(); closeMenu();
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
