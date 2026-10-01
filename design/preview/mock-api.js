// Mock of the MRPanalytics backend /api so the UI can be previewed without MongoDB.
// Shapes mirror what frontend/src/app.js reads. All data is fake.
const http = require('http');
const PORT = 4555;

let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const int = (a, b) => a + Math.floor(rnd() * (b - a + 1));
const DAY = 86400000;
const now = Date.now();
const iso = (t) => new Date(t).toISOString();
const ago = (d) => iso(now - d * DAY - int(0, 86399) * 1000);

const PEOPLE = [
  ['Rakesh Soni', 'Soni Jewellers', 'Rajasthan', 'PERMANENT_LICENSE'],
  ['Meera Agarwal', 'Shree Krishna Gold', 'Uttar Pradesh', 'FREE_TRIAL_LICENSE'],
  ['Vikram Chauhan', 'Chauhan & Sons Ornaments', 'Delhi', 'PERMANENT_LICENSE'],
  ['Pooja Mehta', 'Mehta Diamond House', 'Gujarat', 'FREE_TRIAL_LICENSE'],
  ['Arjun Verma', '', 'Maharashtra', 'NO_LICENSE'],
  ['Sunita Jain', 'Jain Bullion Traders', 'Madhya Pradesh', 'PERMANENT_LICENSE'],
  ['Imran Qureshi', 'Noor Jewels', 'Telangana', 'EXPIRED'],
  ['Harpreet Kaur', 'Kaur Gold Palace', 'Punjab', 'FREE_TRIAL_LICENSE'],
];

const users = PEOPLE.map(([name, biz, state, lic], i) => {
  const id = '64f0a1b2c3d4e5f6a7b8c9' + String(i).padStart(2, '0');
  const handle = name.split(' ')[0].toLowerCase() + int(10, 99);
  const phone = '9' + String(int(100000000, 999999999));
  const scans = lic === 'NO_LICENSE' ? 0 : int(4, 900);
  return {
    id, displayName: name, fullName: name, handle, phone, phoneVerified: i !== 4,
    role: 'OWNER', isActive: i !== 6, businessName: biz, gstNumber: biz ? `0${int(1, 9)}ABCDE${int(1000, 9999)}F1Z${int(1, 9)}` : '',
    stateName: state, businessType: biz ? pick(['Retailer', 'Wholesaler', 'Manufacturer']) : '',
    createdAt: ago(int(20, 300)), lastLoginAt: ago(int(0, 12)),
    license: { status: lic, daysLeft: lic === 'FREE_TRIAL_LICENSE' ? int(-2, 14) : null },
    stats: { scans, creditBalance: +(rnd() * 400).toFixed(2), invoices: int(0, 120), paymentsSuccessAmount: pick([0, 1180, 5900, 23600, 118000]), wishlists: int(0, 40), employees: int(0, 6), lastScanAt: scans ? ago(int(0, 20)) : null },
  };
});

function detail(u, days) {
  const scansByDay = []; for (let d = days - 1; d >= 0; d--) { const t = new Date(now - d * DAY); scansByDay.push({ day: t.toISOString().slice(0, 10), value: rnd() < 0.25 ? 0 : int(0, 40) }); }
  const scans = Array.from({ length: 25 }, () => { const before = +(rnd() * 400).toFixed(2); const ch = +(0.5 + rnd()).toFixed(2); return { createdAt: ago(int(0, 30)), model: pick(['gemini-2.5-flash', 'gpt-4o-mini']), promptTokens: int(800, 2400), completionTokens: int(120, 600), totalUsd: rnd() / 100, totalScanCharge: ch, balanceBefore: before, balanceAfter: before - ch, billingStatus: pick(['SUCCESS', 'SUCCESS', 'SUCCESS', 'FAILED']), scanId: 'scn_' + int(1e6, 9e6) }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  let bal = 50; const balanceHistory = Array.from({ length: 30 }, (_, i) => { const add = rnd() < 0.15; const amount = add ? 200 : -(+(rnd() * 6).toFixed(2)); bal = Math.max(0, bal + amount); return { at: iso(now - (30 - i) * DAY), balance: +bal.toFixed(2), type: add ? 'PURCHASE' : 'SCAN_DEDUCTION', amount }; });
  const credits = balanceHistory.slice().reverse().map((b) => ({ createdAt: b.at, type: b.type, amount: Math.abs(b.amount), balanceBefore: b.balance - b.amount, balanceAfter: b.balance, note: b.type === 'PURCHASE' ? 'Razorpay top-up' : '', metadata: b.type === 'PURCHASE' ? { orderId: 'order_' + int(1e6, 9e6) } : {} }));
  const payments = Array.from({ length: 6 }, () => ({ createdAt: ago(int(0, 90)), paymentType: pick(['CREDIT_PURCHASE', 'LICENSE_PURCHASE']), status: pick(['SUCCESS', 'SUCCESS', 'FAILED', 'CREATED']), amount: 1180, baseAmount: 1000, gstAmount: 180, creditsPurchased: 200, orderId: 'order_' + int(1e6, 9e6), walletCredited: true, applicationActivated: rnd() < 0.5, failureReason: '' }));
  const invoices = Array.from({ length: 12 }, (_, i) => { const sub = int(20000, 250000); return { createdAt: ago(int(0, 60)), invoiceDate: '', invoiceNumber: `INV-2609-${String(i + 1).padStart(3, '0')}`, customerName: pick(['Anita Sharma', 'Rohit Gupta', 'Kavya Iyer', 'Deepak Yadav']), customerPhone: '98' + int(10000000, 99999999), lineItems: [{ description: pick(['22K Gold Chain', '18K Diamond Ring', 'Gold Bangles (pair)', 'Silver Anklet']), qty: 1 }], subtotal: sub, gstAmount: sub * 0.03, gstRate: 3, grandTotal: sub * 1.03, pdfStatus: pick(['success', 'success', 'failure']), pdfUrl: 'https://example.com/inv.pdf', irn: rnd() < 0.4 ? 'irn' : '', eInvoiceStatus: 'SUCCESS', eInvoiceAckNo: String(int(1e9, 9e9)) }; });
  const wishlists = Array.from({ length: 8 }, () => ({ createdAt: ago(int(0, 60)), title: pick(['Temple necklace', 'Solitaire ring', 'Jhumka earrings', 'Kada']), snapshot: { selectedType: 'Gold', scanData: { karat: pick(['22K', '18K']), grossWt: (rnd() * 40 + 2).toFixed(3), netWt: (rnd() * 38 + 2).toFixed(3) }, pricing: { goldRatePerGram: 7250 }, diamonds: [] }, calculationRate: 'TODAY', priceBadge: '', totalMrp: int(15000, 350000), tagCode: 'TAG' + int(1000, 9999) }));
  const otps = Array.from({ length: 10 }, () => { const t = ago(int(0, 60)); const ok = rnd() < 0.8; return { createdAt: t, updatedAt: t, flow: pick(['LOGIN', 'SIGNUP', 'FORGOT_PASSWORD']), otpType: 'SMS', destination: u.phone, status: ok ? 'VERIFIED' : 'FAILED', verified: ok, requestId: 'req_' + int(1e6, 9e6) }; });
  const employees = Array.from({ length: Math.min(3, u.stats.employees) }, (_, i) => ({ name: pick(['Sanjay', 'Neha', 'Ravi', 'Priya']) + ' ' + pick(['Kumar', 'Singh', 'Patel']), phone: '97' + int(10000000, 99999999), email: `staff${i}@example.com`, designation: pick(['Sales', 'Manager', 'Cashier']), isActive: rnd() < 0.8, createdAt: ago(int(5, 90)), permissions: { scan: true, createInvoice: rnd() < 0.5, viewReports: rnd() < 0.5, editRates: false, manageWishlist: true } }));
  const timeline = [
    ...scans.map((s) => ({ kind: 'SCAN', title: `Scanned a tag (${s.model})`, detail: `${s.promptTokens + s.completionTokens} tokens`, at: s.createdAt, amount: -s.totalScanCharge, unit: 'credits' })),
    ...payments.map((p) => ({ kind: 'PAYMENT', title: `Payment ${p.status.toLowerCase()}`, detail: p.orderId, at: p.createdAt, amount: p.status === 'SUCCESS' ? p.amount : 0, unit: 'inr' })),
    ...invoices.map((v) => ({ kind: 'INVOICE', title: `Invoice ${v.invoiceNumber}`, detail: v.customerName, at: v.createdAt })),
    ...otps.map((o) => ({ kind: 'LOGIN', title: `OTP ${o.status.toLowerCase()}`, detail: o.flow, at: o.createdAt })),
    ...wishlists.map((w) => ({ kind: 'WISHLIST', title: `Saved ${w.title}`, at: w.createdAt })),
    { kind: 'ACCOUNT', title: 'Account created', at: u.createdAt },
  ].sort((a, b) => b.at.localeCompare(a.at));
  return {
    user: { ...u, userId: u.handle, stats: undefined, license: undefined },
    business: u.businessName ? { businessName: u.businessName, stateName: u.stateName, pincode: String(int(110001, 799999)), gstNumber: u.gstNumber } : null,
    license: { ...u.license, raw: { status: u.license.status, createdAt: u.createdAt } },
    wallet: { balance: u.stats.creditBalance }, referral: { code: 'MRP' + int(1000, 9999) }, siblings: [],
    kpis: {
      scans: u.stats.scans, scansToday: int(0, 30), scansMonth: int(10, 300), ownScans: u.stats.scans, activeDays: int(1, 60), firstScanAt: u.stats.scans ? u.createdAt : null, lastScanAt: u.stats.lastScanAt,
      creditsUsed: u.stats.scans * 0.9, avgScanCharge: 0.9, creditBalance: u.stats.creditBalance, creditsAdded: 1200, tokens: u.stats.scans * 1800, avgTokens: 1800, scanCostUsd: u.stats.scans * 0.004,
      wishlists: u.stats.wishlists, wishlistValue: 1245000, paymentsSuccessAmount: u.stats.paymentsSuccessAmount, paymentsSuccess: 3, paymentsTotal: 6, paymentsFailed: 2, paymentsPending: 1, webhookEvents: 9,
      invoices: u.stats.invoices, eInvoiced: 4, invoicePdfFailed: 1, invoiceTotal: 1834000, invoiceGst: 55020, otpVerified: 8, otpSent: 10, otpFailed: 2,
      employees: u.stats.employees, activeEmployees: Math.max(0, u.stats.employees - 1), visibleGoldRates: 3, goldRatesConfigured: 4,
      accountAgeDays: Math.round((now - Date.parse(u.createdAt)) / DAY), lastLoginAt: u.lastLoginAt, lastSeenAt: u.lastLoginAt, referralCode: 'MRP4821', referredBy: '',
    },
    series: {
      scansByDay, balanceHistory,
      hourHist: Array.from({ length: 24 }, (_, h) => ({ hour: h, value: h < 9 || h > 21 ? int(0, 3) : int(5, 60) })),
      weekdayHist: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => ({ day: d, value: int(20, 140) })),
    },
    models: [{ model: 'gemini-2.5-flash', count: 612 }, { model: 'gpt-4o-mini', count: 88 }],
    creditsByType: { PURCHASE: { count: 6, amount: 1200 }, SCAN_DEDUCTION: { count: 700, amount: 630 }, TRIAL_BONUS: { count: 1, amount: 50 } },
    invoiceItems: [{ description: '22K Gold Chain', count: 18, qty: 18, amount: 812000 }, { description: '18K Diamond Ring', count: 9, qty: 9, amount: 604000 }, { description: 'Gold Bangles (pair)', count: 5, qty: 5, amount: 318000 }, { description: 'Silver Anklet', count: 12, qty: 12, amount: 100000 }],
    activity: { scans, credits, payments, webhooks: [], licenseTx: [], invoices, wishlists, otps, employees },
    timeline,
    settings: {
      gold_rates: [{ carat: '24K', purity: 99.9, increaseByAmount: 0, increaseByType: 'FLAT', isHidden: false, updatedAt: ago(1) }, { carat: '22K', purity: 91.6, increaseByAmount: 150, increaseByType: 'FLAT', isHidden: false, updatedAt: ago(1) }, { carat: '18K', purity: 75, increaseByAmount: 2, increaseByType: 'PERCENT', isHidden: false, updatedAt: ago(2) }, { carat: '14K', purity: 58.5, increaseByAmount: 0, increaseByType: 'FLAT', isHidden: true, updatedAt: ago(9) }],
      dashboard_metrics: [{ updatedAt: ago(3), metricsData: { totalScans: true, todaySales: true, goldRate: true, wishlist: false, invoices: true } }],
      gold_tax_settings: [{ gstPercent: 3, roundOff: true, updatedAt: ago(4) }], formula_configs: [{ makingOn: 'NET_WEIGHT', wastageOn: 'GROSS_WEIGHT' }],
      labour_rates: [{ chargeType: 'PER_GRAM', value: 450, rupeesUnit: '₹/g', weightBasis: 'NET', updatedAt: ago(5) }], bullion_sources: [{ source: 'MCX', autoUpdate: true }],
      diamond_rates: [{ packetCode: 'D1', shape: 'Round', color: 'EF', clarity: 'VVS', rate: 65000, updatedAt: ago(8) }], colorstone_rates: [], item_codes: [{ code: 'CH22', description: '22K Chain', wastage: 8, labour: 450 }], wastage_codes: [{ code: 'W8', percent: 8, updatedAt: ago(8) }], customcharges: [{ name: 'Hallmark', isActive: true, createdAt: ago(40) }], invoice_counters: [{ dateKey: '2609', seq: 12 }],
    },
  };
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/api/health') return send(200, { ok: true, authRequired: false });
  if (url.pathname === '/api/users') {
    const q = (url.searchParams.get('q') || '').toLowerCase();
    const list = users.filter((u) => !q || [u.displayName, u.phone, u.businessName, u.handle, u.gstNumber].some((f) => String(f).toLowerCase().includes(q)));
    return setTimeout(() => send(200, { count: list.length, users: list }), 250);
  }
  const m = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (m) { const u = users.find((x) => x.id === m[1] || x.phone === m[1]); return u ? setTimeout(() => send(200, detail(u, Number(url.searchParams.get('days')) || 30)), 300) : send(404, { error: 'User not found' }); }
  send(404, { error: 'Not found' });
}).listen(PORT, () => console.log(`mock api on http://localhost:${PORT}`));
