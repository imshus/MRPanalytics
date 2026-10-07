/* MRPanalytics backend core – all analytics queries.
   Database access goes through a tiny adapter (see mongo-adapter.js):
     adapter.aggregate(collection, pipeline)            -> [docs]
     adapter.find(collection, filter, {sort, limit, projection}) -> [docs]
     adapter.findOne(collection, filter, {sort, projection})     -> doc | null
     adapter.count(collection, filter)                  -> number
   Filters use extended JSON for ids/dates: oid(hex) => {$oid}, date(d) => {$date}.
   Documents come back normalised: ObjectId -> hex string, Date -> ISO string. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnalyticsCore = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const TZ = 'Asia/Kolkata';
  const DAY_MS = 86400000;
  const OID_RX = /^[a-f0-9]{24}$/i;

  const oid = (v) => ({ $oid: String(v) });
  const date = (d) => ({ $date: new Date(d).toISOString() });
  const str = (v) => (v == null ? '' : typeof v === 'object' && v.$oid ? v.$oid : String(v));
  const escapeRx = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rx = (pattern, options = 'i') => ({ $regex: pattern, $options: options });
  const dayKeyExpr = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: field, timezone: TZ } });
  const sum = (arr, f) => arr.reduce((a, x) => a + (Number(f(x)) || 0), 0);
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

  // Relaxed extended JSON -> plain values
  function fromEjson(v) {
    if (v === null || v === undefined) return v;
    if (Array.isArray(v)) return v.map(fromEjson);
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      if (keys.length === 1) {
        const k = keys[0];
        if (k === '$oid') return v.$oid;
        if (k === '$date') return typeof v.$date === 'string' ? v.$date : new Date(Number(v.$date.$numberLong)).toISOString();
        if (k === '$numberLong' || k === '$numberInt') return Number(v[k]);
        if (k === '$numberDouble') return Number(v[k]);
        if (k === '$numberDecimal') return v[k];
      }
      const out = {};
      for (const k of keys) out[k] = fromEjson(v[k]);
      return out;
    }
    return v;
  }

  const SENSITIVE_KEYS = new Set([
    'passwordHash', 'mpinHash', 'mpinVault', 'passwordResetNonceHash', 'passwordResetExpiresAt',
    'eInvoicePasswordEnc', 'eInvoiceUsername', 'otp', 'webhookSecret', 'signature',
    'razorpaySignature', 'payloadHash', 'msg91Response', '__v',
  ]);
  function sanitize(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) return value.map(sanitize);
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      const out = {};
      for (const [key, val] of Object.entries(value)) {
        if (SENSITIVE_KEYS.has(key)) continue;
        if (key === 'bankAccountNumber' && typeof val === 'string' && val.length > 4) { out[key] = '****' + val.slice(-4); continue; }
        out[key] = sanitize(val);
      }
      return out;
    }
    return value;
  }

  const dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function lastDays(n) {
    const keys = []; const now = Date.now();
    for (let i = n - 1; i >= 0; i--) keys.push(dayFmt.format(new Date(now - i * DAY_MS)));
    return keys;
  }
  const countBy = (arr, keyFn, keyName) => Object.entries(arr.reduce((m, x) => { const k = keyFn(x) || 'Unknown'; m[k] = (m[k] || 0) + 1; return m; }, {}))
    .map(([k, count]) => ({ [keyName]: k, count })).sort((a, b) => b.count - a.count);

  // City from the GST-registered address, which ends "…, <city/district>, <state>, <pincode>".
  // Shown with the state as "City, State" (never the pincode). Blank when the state does not match.
  function cityFromAddress(address, stateName) {
    const parts = String(address || '').split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length && /^\d{6}$/.test(parts[parts.length - 1])) parts.pop();
    const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z]/g, '');
    if (!stateName || !parts.length || norm(parts[parts.length - 1]) !== norm(stateName)) return '';
    parts.pop();
    const city = parts.length ? parts[parts.length - 1] : '';
    return /\d/.test(city) || city.length > 40 ? '' : city;
  }

  const EMPTY_STATS = () => ({
    scans: 0, scanCharge: 0, lastScanAt: null, firstScanAt: null, creditsAdded: 0, creditsUsed: 0, creditTx: 0,
    paymentsSuccess: 0, paymentsSuccessAmount: 0, paymentsFailed: 0, paymentsPending: 0,
    invoices: 0, invoiceTotal: 0, lastInvoiceAt: null, wishlists: 0, employees: 0, license: null, wallet: null,
  });

  function createAnalytics(db) {
    async function byDay(coll, match, days, valueExpr = { $sum: 1 }) {
      const since = date(Date.now() - (days + 1) * DAY_MS);
      const rows = await db.aggregate(coll, [
        { $match: { ...match, createdAt: { $gte: since } } },
        { $group: { _id: dayKeyExpr('$createdAt'), count: valueExpr } },
      ]);
      const map = new Map(rows.map((r) => [r._id, r.count]));
      return lastDays(days).map((k) => ({ day: k, value: round2(map.get(k) || 0) }));
    }

    async function businessStats(businessIds) {
      const match = businessIds ? { businessId: { $in: businessIds.map(oid) } } : {};
      const [scans, credits, payments, invoices, wishlists, employees, licenses, wallets] = await Promise.all([
        db.aggregate('scan_billing', [{ $match: match }, { $group: { _id: '$businessId', scans: { $sum: 1 }, charge: { $sum: '$totalScanCharge' }, lastScanAt: { $max: '$createdAt' }, firstScanAt: { $min: '$createdAt' } } }]),
        db.aggregate('credit_transactions', [{ $match: match }, { $group: { _id: { b: '$businessId', t: '$type' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        db.aggregate('payment_transactions', [{ $match: match }, { $group: { _id: { b: '$businessId', s: '$status' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        db.aggregate('invoices', [{ $match: match }, { $group: { _id: '$businessId', count: { $sum: 1 }, total: { $sum: '$grandTotal' }, lastAt: { $max: '$createdAt' } } }]),
        db.aggregate('wishlists', [{ $match: match }, { $group: { _id: '$businessId', count: { $sum: 1 } } }]),
        db.aggregate('employees', [{ $match: match }, { $group: { _id: '$businessId', count: { $sum: 1 } } }]),
        db.find('organization_licenses', match),
        db.find('organization_wallets', match),
      ]);
      const stats = new Map();
      const get = (b) => { const k = str(b); if (!stats.has(k)) stats.set(k, EMPTY_STATS()); return stats.get(k); };
      for (const r of scans) Object.assign(get(r._id), { scans: r.scans, scanCharge: round2(r.charge), lastScanAt: r.lastScanAt, firstScanAt: r.firstScanAt });
      for (const r of credits) {
        const s = get(r._id.b); s.creditTx += r.count;
        if (r._id.t === 'SCAN_DEDUCTION') s.creditsUsed = round2(s.creditsUsed + r.amount);
        else if (r._id.t !== 'TRIAL_EXPIRY_RESET') s.creditsAdded = round2(s.creditsAdded + r.amount);
      }
      for (const r of payments) {
        const s = get(r._id.b);
        if (r._id.s === 'PAYMENT_SUCCESS') { s.paymentsSuccess += r.count; s.paymentsSuccessAmount += r.amount; }
        else if (r._id.s === 'PAYMENT_FAILED') s.paymentsFailed += r.count;
        else s.paymentsPending += r.count;
      }
      for (const r of invoices) Object.assign(get(r._id), { invoices: r.count, invoiceTotal: round2(r.total), lastInvoiceAt: r.lastAt });
      for (const r of wishlists) get(r._id).wishlists = r.count;
      for (const r of employees) get(r._id).employees = r.count;
      for (const l of licenses) get(l.businessId).license = l;
      for (const w of wallets) get(w.businessId).wallet = w;
      return stats;
    }

    function licenseSummary(license, wallet) {
      const creditBalance = wallet ? round2(wallet.creditBalance) : null;
      if (!license) return { status: 'UNKNOWN', trialEndDate: null, daysLeft: null, creditBalance };
      const end = license.trialEndDate ? new Date(license.trialEndDate) : null;
      return {
        status: license.licenseStatus, trialStartDate: license.trialStartDate, trialEndDate: end,
        daysLeft: end ? Math.ceil((end.getTime() - Date.now()) / DAY_MS) : null,
        purchaseDate: license.purchaseDate, purchaseAmount: license.purchaseAmount, creditBalance,
      };
    }

    function userRow(u, business, s) {
      return {
        id: str(u._id), phone: u.phone, fullName: u.fullName || '', handle: u.userId || '',
        displayName: u.fullName || u.userId || u.businessName || u.phone,
        businessId: str(u.businessId), businessName: u.businessName || business?.tradeName || business?.legalName || '',
        businessType: business?.businessType || '', stateName: business?.stateName || '', city: cityFromAddress(business?.address, business?.stateName),
        gstNumber: u.gstNumber || business?.gstNumber || '',
        role: u.role, isActive: u.isActive, phoneVerified: u.phoneVerified, createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null,
        license: licenseSummary(s.license, s.wallet),
        stats: {
          scans: s.scans, scanCharge: s.scanCharge, lastScanAt: s.lastScanAt,
          creditsAdded: s.creditsAdded, creditsUsed: s.creditsUsed, creditBalance: s.wallet ? round2(s.wallet.creditBalance) : null,
          paymentsSuccess: s.paymentsSuccess, paymentsSuccessAmount: round2(s.paymentsSuccessAmount), paymentsFailed: s.paymentsFailed, paymentsPending: s.paymentsPending,
          invoices: s.invoices, invoiceTotal: s.invoiceTotal, wishlists: s.wishlists, employees: s.employees,
        },
      };
    }

    // ------------------------------------------------------------ overview
    async function overview(days = 30) {
      const todayKey = lastDays(1)[0]; const monthKey = todayKey.slice(0, 7);
      const [scansToday, scansMonth] = await Promise.all([
        db.count('scan_billing', { createdAt: { $gte: date(`${todayKey}T00:00:00+05:30`) } }),
        db.count('scan_billing', { createdAt: { $gte: date(`${monthKey}-01T00:00:00+05:30`) } }),
      ]);
      const [users, businesses, licenses, wallets, scanAgg, creditAgg, paymentAgg, invoiceAgg, wishlistCount, employeeCount, otpAgg, scansByDay, signupsByDay, creditsUsedByDay, invoicesByDay, stats] = await Promise.all([
        db.find('business_users', {}, { projection: { passwordHash: 0, mpinHash: 0, mpinVault: 0 } }),
        db.find('businesses', {}, { projection: { _id: 1, tradeName: 1, legalName: 1, businessType: 1, stateName: 1, address: 1, isRegistered: 1, createdAt: 1 } }),
        db.aggregate('organization_licenses', [{ $group: { _id: '$licenseStatus', count: { $sum: 1 } } }]),
        db.aggregate('organization_wallets', [{ $group: { _id: null, balance: { $sum: '$creditBalance' } } }]),
        db.aggregate('scan_billing', [{ $group: { _id: null, count: { $sum: 1 }, charge: { $sum: '$totalScanCharge' }, usd: { $sum: '$totalUsd' }, tokens: { $sum: { $add: ['$promptTokens', '$completionTokens'] } }, first: { $min: '$createdAt' }, last: { $max: '$createdAt' } } }]),
        db.aggregate('credit_transactions', [{ $group: { _id: '$type', amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        db.aggregate('payment_transactions', [{ $group: { _id: { s: '$status', t: '$paymentType' }, amount: { $sum: '$amount' }, count: { $sum: 1 } } }]),
        db.aggregate('invoices', [{ $group: { _id: '$pdfStatus', count: { $sum: 1 }, total: { $sum: '$grandTotal' }, gst: { $sum: '$gstAmount' } } }]),
        db.count('wishlists', {}),
        db.count('employees', {}),
        db.aggregate('otp_verifications', [{ $group: { _id: '$status', count: { $sum: 1 } } }]),
        byDay('scan_billing', {}, days),
        byDay('business_users', {}, days),
        byDay('credit_transactions', { type: 'SCAN_DEDUCTION' }, days, { $sum: '$amount' }),
        byDay('invoices', {}, days),
        businessStats(null),
      ]);
      const bizMap = new Map(businesses.map((b) => [str(b._id), b]));
      const rows = users.map((u) => userRow(u, bizMap.get(str(u.businessId)), stats.get(str(u.businessId)) || EMPTY_STATS()));
      const topUsers = [...rows].filter((r) => r.stats.scans > 0).sort((a, b) => b.stats.scans - a.stats.scans).slice(0, 8);
      const scans = scanAgg[0] || { count: 0, charge: 0, usd: 0, tokens: 0, first: null, last: null };
      const pay = { successCount: 0, successAmount: 0, failedCount: 0, pendingCount: 0, byType: {} };
      for (const p of paymentAgg) {
        if (p._id.s === 'PAYMENT_SUCCESS') { pay.successCount += p.count; pay.successAmount += p.amount; pay.byType[p._id.t] = (pay.byType[p._id.t] || 0) + p.amount; }
        else if (p._id.s === 'PAYMENT_FAILED') pay.failedCount += p.count;
        else pay.pendingCount += p.count;
      }
      const credits = Object.fromEntries(creditAgg.map((c) => [c._id, { amount: round2(c.amount), count: c.count }]));
      const now = Date.now();
      const activeUsers7d = users.filter((u) => u.lastLoginAt && now - new Date(u.lastLoginAt).getTime() < 7 * DAY_MS).length;
      const scannedUsers7d = rows.filter((r) => r.stats.lastScanAt && now - new Date(r.stats.lastScanAt).getTime() < 7 * DAY_MS).length;
      const recent = await recentActivity(rows, 15);
      return sanitize({
        generatedAt: new Date(), days,
        kpis: {
          users: users.length, activeUsers: users.filter((u) => u.isActive).length, verifiedUsers: users.filter((u) => u.phoneVerified).length,
          activeUsers7d, scannedUsers7d, businesses: businesses.length, registeredBusinesses: businesses.filter((b) => b.isRegistered).length, employees: employeeCount,
          scans: scans.count, scansToday, scansMonth, scanCharge: round2(scans.charge), scanCostUsd: round2(scans.usd), tokens: scans.tokens,
          avgScanCharge: scans.count ? round2(scans.charge / scans.count) : 0, firstScanAt: scans.first, lastScanAt: scans.last,
          creditBalanceTotal: round2(wallets[0]?.balance || 0), creditsUsed: credits.SCAN_DEDUCTION?.amount || 0,
          creditsAdded: round2((credits.CREDIT_ADD?.amount || 0) + (credits.BONUS?.amount || 0) + (credits.TRIAL_CREDIT?.amount || 0)),
          revenue: round2(pay.successAmount), paymentsSuccess: pay.successCount, paymentsFailed: pay.failedCount, paymentsPending: pay.pendingCount,
          invoices: sum(invoiceAgg, (i) => i.count), invoiceTotal: round2(sum(invoiceAgg, (i) => i.total)), invoiceGst: round2(sum(invoiceAgg, (i) => i.gst)),
          invoicePdfFailed: invoiceAgg.find((i) => i._id === 'failure')?.count || 0, wishlists: wishlistCount,
          otpSent: sum(otpAgg, (o) => o.count), otpVerified: otpAgg.find((o) => o._id === 'VERIFIED')?.count || 0, otpFailed: otpAgg.find((o) => o._id === 'FAILED')?.count || 0,
        },
        licenses: licenses.map((l) => ({ status: l._id, count: l.count })).sort((a, b) => b.count - a.count),
        credits, paymentsByType: pay.byType,
        businessTypes: countBy(businesses, (b) => b.businessType, 'type'),
        states: countBy(businesses, (b) => b.stateName, 'state'),
        series: { scansByDay, signupsByDay, creditsUsedByDay, invoicesByDay },
        topUsers, recent,
      });
    }

    async function recentActivity(rows, limit) {
      const byBiz = new Map(rows.map((r) => [r.businessId, r]));
      const who = (businessId) => { const r = byBiz.get(str(businessId)); return r ? { userId: r.id, name: r.displayName, phone: r.phone, businessName: r.businessName } : { userId: null, name: 'Unknown user', phone: '', businessName: '' }; };
      const o = { sort: { createdAt: -1 }, limit };
      const [scans, payments, invoices, users, wishlists] = await Promise.all([
        db.find('scan_billing', {}, o),
        db.find('payment_transactions', {}, o),
        db.find('invoices', {}, { ...o, projection: { businessId: 1, invoiceNumber: 1, customerName: 1, grandTotal: 1, createdAt: 1 } }),
        db.find('business_users', {}, { ...o, projection: { businessId: 1, createdAt: 1 } }),
        db.find('wishlists', {}, { ...o, projection: { businessId: 1, title: 1, totalMrp: 1, createdAt: 1 } }),
      ]);
      const events = [];
      for (const s of scans) events.push({ at: s.createdAt, kind: 'SCAN', title: 'Scan billed', detail: `${s.model || s.provider} · ${(s.promptTokens || 0) + (s.completionTokens || 0)} tokens`, amount: -s.totalScanCharge, unit: 'credits', ...who(s.businessId) });
      for (const p of payments) events.push({ at: p.createdAt, kind: 'PAYMENT', title: `${p.paymentType.replace(/_/g, ' ')} · ${p.status.replace(/_/g, ' ')}`, detail: p.orderId, amount: p.amount, unit: 'inr', ...who(p.businessId) });
      for (const i of invoices) events.push({ at: i.createdAt, kind: 'INVOICE', title: `Invoice ${i.invoiceNumber}`, detail: i.customerName, amount: i.grandTotal, unit: 'inr', ...who(i.businessId) });
      for (const u of users) events.push({ at: u.createdAt, kind: 'ACCOUNT', title: 'Account created', detail: '', ...who(u.businessId) });
      for (const w of wishlists) events.push({ at: w.createdAt, kind: 'WISHLIST', title: 'Item saved to wishlist', detail: w.title || '', amount: w.totalMrp, unit: 'inr', ...who(w.businessId) });
      return events.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, limit);
    }

    // ------------------------------------------------------------ users list / search
    async function listUsers(q = '') {
      const query = String(q || '').trim();
      let filter = {};
      if (query) {
        const r = rx(escapeRx(query));
        const bizIds = (await db.find('businesses', { $or: [{ tradeName: r }, { legalName: r }, { gstNumber: r }] }, { projection: { _id: 1 } })).map((b) => oid(b._id));
        const or = [{ phone: r }, { fullName: r }, { userId: r }, { businessName: r }, { gstNumber: r }, { businessId: { $in: bizIds } }];
        if (OID_RX.test(query)) or.push({ _id: oid(query) }, { businessId: oid(query) });
        filter = { $or: or };
      }
      const users = await db.find('business_users', filter, { sort: { createdAt: -1 } });
      const businessIds = users.map((u) => str(u.businessId)).filter(Boolean);
      const [businesses, stats] = await Promise.all([
        db.find('businesses', { _id: { $in: businessIds.map(oid) } }),
        businessStats(businessIds),
      ]);
      const bizMap = new Map(businesses.map((b) => [str(b._id), b]));
      const rows = users.map((u) => userRow(u, bizMap.get(str(u.businessId)), stats.get(str(u.businessId)) || EMPTY_STATS()));
      const lastSeen = (r) => new Date(r.stats.lastScanAt || r.lastLoginAt || r.createdAt).getTime();
      rows.sort((a, b) => lastSeen(b) - lastSeen(a));
      return sanitize({ query, count: rows.length, users: rows });
    }

    // ------------------------------------------------------------ single user, every parameter
    async function userDetail(idOrPhone, days = 30) {
      let user = null;
      if (OID_RX.test(idOrPhone)) user = await db.findOne('business_users', { _id: oid(idOrPhone) });
      if (!user) user = await db.findOne('business_users', { phone: String(idOrPhone).replace(/\D/g, '').slice(-10) });
      if (!user) { const err = new Error('User not found'); err.status = 404; throw err; }

      const businessId = str(user.businessId);
      const bizMatch = { businessId: oid(businessId) };
      const userIdStr = str(user._id);
      const desc = { sort: { createdAt: -1 } };

      const [business, license, wallet, referral, employees, licenseTx, scans, credits, payments, invoices, wishlists, otps, webhooks, settings, scansByDay, creditsUsedByDay, tokensByDay, invoicesByDay, siblings] = await Promise.all([
        db.findOne('businesses', { _id: oid(businessId) }),
        db.findOne('organization_licenses', bizMatch),
        db.findOne('organization_wallets', bizMatch),
        db.findOne('referral_codes', bizMatch),
        db.find('employees', bizMatch, desc),
        db.find('license_transactions', bizMatch, desc),
        db.find('scan_billing', bizMatch, desc),
        db.find('credit_transactions', bizMatch, desc),
        db.find('payment_transactions', bizMatch, desc),
        db.find('invoices', bizMatch, desc),
        db.find('wishlists', bizMatch, desc),
        db.find('otp_verifications', { $or: [{ mobile: user.phone }, { destination: user.phone }] }, desc),
        db.find('payment_webhook_events', { $or: [{ 'payload.payload.payment.entity.notes.businessId': businessId }, { 'payload.payload.payment.entity.contact': rx(escapeRx(user.phone) + '$', '') }] }, desc),
        loadSettings(businessId),
        byDay('scan_billing', bizMatch, days),
        byDay('credit_transactions', { ...bizMatch, type: 'SCAN_DEDUCTION' }, days, { $sum: '$amount' }),
        byDay('scan_billing', bizMatch, days, { $sum: { $add: ['$promptTokens', '$completionTokens'] } }),
        byDay('invoices', bizMatch, days),
        db.find('business_users', { businessId: oid(businessId), _id: { $ne: oid(userIdStr) } }, { projection: { fullName: 1, phone: 1, userId: 1, role: 1, lastLoginAt: 1 } }),
      ]);

      const ownScans = scans.filter((s) => str(s.userId) === userIdStr);
      const succeededPayments = payments.filter((p) => p.status === 'PAYMENT_SUCCESS');
      const creditsByType = {};
      for (const c of credits) { const t = creditsByType[c.type] || (creditsByType[c.type] = { amount: 0, count: 0 }); t.amount = round2(t.amount + c.amount); t.count++; }
      const tokens = sum(scans, (s) => (s.promptTokens || 0) + (s.completionTokens || 0));
      const scanCharge = round2(sum(scans, (s) => s.totalScanCharge));
      const lastScanAt = scans[0]?.createdAt || null;
      const firstScanAt = scans.length ? scans[scans.length - 1].createdAt : null;
      const activeDays = new Set(scans.map((s) => dayFmt.format(new Date(s.createdAt)))).size;
      const models = countBy(scans, (s) => s.model || s.provider, 'model');

      const hourHist = Array.from({ length: 24 }, (_, h) => ({ hour: h, value: 0 }));
      const hourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', hour12: false });
      for (const s of scans) { const h = Number(hourFmt.format(new Date(s.createdAt)).slice(0, 2)) % 24; hourHist[h].value++; }
      const weekdayHist = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({ day: d, value: 0 }));
      const wdFmt = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' });
      for (const s of scans) { const w = weekdayHist.find((x) => x.day === wdFmt.format(new Date(s.createdAt))); if (w) w.value++; }

      const balanceHistory = [...credits].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
        .map((c) => ({ at: c.createdAt, balance: round2(c.balanceAfter), type: c.type, amount: round2(c.amount) }));
      const wishlistCategories = countBy(wishlists, (w) => w.snapshot?.selectedType || w.snapshot?.scanData?.category, 'category');
      const invoiceItems = Object.entries(invoices.flatMap((i) => i.lineItems || []).reduce((m, li) => {
        const k = li.description || 'Other'; m[k] = m[k] || { qty: 0, amount: 0, count: 0 };
        m[k].qty += Number(li.qty) || 0; m[k].amount += Number(li.amount) || 0; m[k].count++; return m;
      }, {})).map(([description, v]) => ({ description, qty: round2(v.qty), amount: round2(v.amount), count: v.count })).sort((a, b) => b.amount - a.amount);

      const todayKey = lastDays(1)[0];
      const seenDates = [user.lastLoginAt, lastScanAt, invoices[0]?.createdAt, wishlists[0]?.createdAt, otps[0]?.createdAt, payments[0]?.createdAt].filter(Boolean).map((d) => new Date(d).getTime());
      const kpis = {
        accountAgeDays: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / DAY_MS),
        lastLoginAt: user.lastLoginAt || null,
        lastSeenAt: seenDates.length ? new Date(Math.max(...seenDates)) : null,
        scans: scans.length, ownScans: ownScans.length,
        scansToday: scans.filter((s) => dayFmt.format(new Date(s.createdAt)) === todayKey).length,
        scansMonth: scans.filter((s) => dayFmt.format(new Date(s.createdAt)).startsWith(todayKey.slice(0, 7))).length,
        lifetimeScans: wallet?.lifetimeScans ?? scans.length,
        scanCharge, avgScanCharge: scans.length ? round2(scanCharge / scans.length) : 0, scanCostUsd: round2(sum(scans, (s) => s.totalUsd)),
        tokens, avgTokens: scans.length ? Math.round(tokens / scans.length) : 0, firstScanAt, lastScanAt, activeDays,
        creditBalance: wallet ? round2(wallet.creditBalance) : null,
        creditsAdded: round2((creditsByType.CREDIT_ADD?.amount || 0) + (creditsByType.BONUS?.amount || 0) + (creditsByType.TRIAL_CREDIT?.amount || 0)),
        creditsUsed: creditsByType.SCAN_DEDUCTION?.amount || 0, creditTx: credits.length,
        paymentsTotal: payments.length, paymentsSuccess: succeededPayments.length, paymentsSuccessAmount: round2(sum(succeededPayments, (p) => p.amount)),
        paymentsFailed: payments.filter((p) => p.status === 'PAYMENT_FAILED').length,
        paymentsPending: payments.filter((p) => !['PAYMENT_SUCCESS', 'PAYMENT_FAILED'].includes(p.status)).length,
        creditsPurchased: sum(succeededPayments, (p) => p.creditsPurchased),
        invoices: invoices.length, invoiceTotal: round2(sum(invoices, (i) => i.grandTotal)), invoiceGst: round2(sum(invoices, (i) => i.gstAmount)),
        invoicePdfFailed: invoices.filter((i) => i.pdfStatus !== 'success').length, eInvoiced: invoices.filter((i) => i.irn).length,
        wishlists: wishlists.length, wishlistValue: round2(sum(wishlists, (w) => w.totalMrp)),
        employees: employees.length, activeEmployees: employees.filter((e) => e.isActive).length,
        otpSent: otps.length, otpVerified: otps.filter((o) => o.status === 'VERIFIED').length, otpFailed: otps.filter((o) => o.status === 'FAILED').length,
        webhookEvents: webhooks.length, goldRatesConfigured: settings.gold_rates.length, visibleGoldRates: settings.gold_rates.filter((g) => !g.isHidden).length,
        referralCode: referral?.code || null, referredBy: business?.referredByCode || null,
      };
      const timeline = buildTimeline({ user, business, license, licenseTx, employees, scans, credits, payments, invoices, wishlists, otps, webhooks, settings, referral });
      return sanitize({
        generatedAt: new Date(), days,
        user: { ...user, id: userIdStr, displayName: user.fullName || user.userId || user.businessName || user.phone },
        business: business ? { ...business, city: cityFromAddress(business.address, business.stateName) } : business,
        license: { ...licenseSummary(license, wallet), raw: license }, wallet, referral, siblings,
        kpis, creditsByType, models, wishlistCategories, invoiceItems,
        series: { scansByDay, creditsUsedByDay, tokensByDay, invoicesByDay, balanceHistory, hourHist, weekdayHist },
        activity: { scans, credits, payments, licenseTx, invoices, wishlists, otps, webhooks, employees },
        settings, timeline,
      });
    }

    const SETTINGS_COLLECTIONS = ['dashboard_metrics', 'gold_rates', 'labour_rates', 'gold_tax_settings', 'formula_configs', 'bullion_sources', 'item_codes', 'wastage_codes', 'diamond_rates', 'colorstone_rates', 'customcharges', 'invoice_counters'];
    async function loadSettings(businessId) {
      const results = await Promise.all(SETTINGS_COLLECTIONS.map((n) => db.find(n, { businessId: oid(businessId) }, { sort: { updatedAt: -1 } })));
      const out = {};
      SETTINGS_COLLECTIONS.forEach((n, i) => { out[n] = results[i]; });
      out.gold_rates.sort((a, b) => (parseInt(b.carat, 10) || 0) - (parseInt(a.carat, 10) || 0));
      return out;
    }

    const SETTING_LABELS = {
      dashboard_metrics: 'Dashboard metrics', gold_rates: 'Gold rate', labour_rates: 'Labour rate', gold_tax_settings: 'Gold tax settings',
      formula_configs: 'Formula config', bullion_sources: 'Bullion source', item_codes: 'Item code', wastage_codes: 'Wastage code',
      diamond_rates: 'Diamond rate', colorstone_rates: 'Colorstone rate', customcharges: 'Custom charge',
    };
    function buildTimeline(d) {
      const ev = [];
      const push = (at, kind, title, detail = '', extra = {}) => { if (at) ev.push({ at, kind, title, detail, ...extra }); };
      push(d.user.createdAt, 'ACCOUNT', 'Account created', `${d.user.role} · ${d.user.phone}`);
      if (d.user.lastLoginAt) push(d.user.lastLoginAt, 'LOGIN', 'Last login', 'Session login recorded');
      if (d.business) push(d.business.createdAt, 'ACCOUNT', 'Business registered', `${d.business.tradeName || d.business.legalName} · ${d.business.gstNumber || 'no GST'}`);
      if (d.license) {
        push(d.license.trialStartDate || d.license.createdAt, 'LICENSE', 'Free trial started', `${d.license.trialDays} days · ${d.license.trialCredits} credits`);
        push(d.license.trialExpiredAt, 'LICENSE', 'Trial expired');
        push(d.license.permanentActivatedAt, 'LICENSE', 'Permanent license activated', d.license.purchaseInvoiceNumber || '');
      }
      for (const t of d.licenseTx) push(t.createdAt, 'LICENSE', `License ${String(t.type).toLowerCase()} · ${t.status}`, t.note || '', { amount: t.credits, unit: 'credits' });
      if (d.referral) push(d.referral.createdAt, 'ACCOUNT', 'Referral code generated', d.referral.code);
      for (const e of d.employees) push(e.createdAt, 'EMPLOYEE', `Employee added · ${e.name}`, `${e.designation || ''} · ${e.phone || ''}`);
      for (const s of d.scans) push(s.createdAt, 'SCAN', 'Scan billed', `${s.model || s.provider} · ${(s.promptTokens || 0) + (s.completionTokens || 0)} tokens · balance ${round2(s.balanceAfter)}`, { amount: -s.totalScanCharge, unit: 'credits', ref: s.scanId });
      for (const c of d.credits) if (c.type !== 'SCAN_DEDUCTION') push(c.createdAt, 'CREDIT', c.type.replace(/_/g, ' '), `${c.note || ''} · balance ${round2(c.balanceAfter)}`, { amount: c.type === 'TRIAL_EXPIRY_RESET' ? -c.amount : c.amount, unit: 'credits' });
      for (const p of d.payments) push(p.createdAt, 'PAYMENT', `${p.paymentType.replace(/_/g, ' ')} · ${p.status.replace(/_/g, ' ')}`, `${p.orderId}${p.failureReason ? ' · ' + p.failureReason : ''}`, { amount: p.amount, unit: 'inr' });
      for (const w of d.webhooks) push(w.createdAt, 'PAYMENT', `Webhook ${w.eventType} · ${w.status}`, w.failureReason || w.payload?.payload?.payment?.entity?.error_description || '');
      for (const i of d.invoices) push(i.createdAt, 'INVOICE', `Invoice ${i.invoiceNumber}`, `${i.customerName || 'customer'} · PDF ${i.pdfStatus}${i.irn ? ' · e-invoiced' : ''}`, { amount: i.grandTotal, unit: 'inr' });
      for (const w of d.wishlists) {
        const sd = w.snapshot?.scanData || {};
        push(w.createdAt, 'WISHLIST', `Saved · ${w.title || w.snapshot?.selectedType || 'item'}`, [sd.karat, sd.netWt ? sd.netWt + ' g' : '', w.calculationRate].filter(Boolean).join(' · '), { amount: w.totalMrp, unit: 'inr' });
      }
      for (const o of d.otps) push(o.createdAt, 'LOGIN', `OTP ${String(o.status).toLowerCase()} · ${o.flow}`, `${o.otpType} · ${o.destination}`);
      for (const [name, label] of Object.entries(SETTING_LABELS)) {
        for (const doc of d.settings[name] || []) {
          const what = doc.carat || doc.code || doc.name || doc.packetCode || doc.selected || doc.activeFormula || doc.chargeType || '';
          push(doc.createdAt, 'SETTINGS', `${label} created${what ? ' · ' + what : ''}`);
          if (doc.updatedAt && doc.createdAt && new Date(doc.updatedAt) - new Date(doc.createdAt) > 1000) push(doc.updatedAt, 'SETTINGS', `${label} updated${what ? ' · ' + what : ''}`);
        }
      }
      return ev.sort((a, b) => new Date(b.at) - new Date(a.at));
    }

    return { overview, listUsers, userDetail };
  }

  return { createAnalytics, fromEjson, sanitize };
});
