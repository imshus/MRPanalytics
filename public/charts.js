/* Minimal SVG chart kit: column, line (with step option), horizontal bars.
   Marks follow the dataviz specs: <=24px columns with 4px rounded data-ends,
   2px lines, >=8px markers with a 2px surface ring, hairline grid, hover tooltip. */
(function () {
  const tooltipEl = () => document.getElementById('tooltip');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function showTip(evt, html) {
    const t = tooltipEl(); if (!t) return;
    t.innerHTML = html; t.hidden = false;
    const pad = 12; const r = t.getBoundingClientRect();
    let x = evt.clientX + pad; let y = evt.clientY + pad;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - 8) y = evt.clientY - r.height - pad;
    t.style.left = x + 'px'; t.style.top = y + 'px';
  }
  function hideTip() { const t = tooltipEl(); if (t) t.hidden = true; }

  // Axis scale with round steps (1, 2 or 5 x 10^k) so count axes never show 12.5-style ticks.
  function niceScale(max, integer = false, target = 4) {
    if (!max || max <= 0) return { max: 1, step: integer ? 1 : 0.25 };
    const rough = max / target;
    const mag = Math.pow(10, Math.floor(Math.log10(rough)));
    const norm = rough / mag;
    let step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    if (integer && step < 1) step = 1;
    return { max: Math.ceil(max / step - 1e-9) * step, step };
  }

  function ticks(sc) {
    const { step, max } = sc;
    const out = [];
    for (let v = 0; v <= max + step / 2; v += step) out.push(Math.round(v * 1e6) / 1e6);
    return out;
  }
  const fmtTick = (v) => (Math.abs(v) >= 1e5 ? (v / 1e5).toFixed(v % 1e5 ? 1 : 0) + 'L' : Math.abs(v) >= 1e3 ? (v / 1e3).toFixed(v % 1e3 ? 1 : 0) + 'K' : (Number.isInteger(v) ? String(v) : v.toFixed(2)));

  function roundedTop(x, y, w, h, r) {
    r = Math.max(0, Math.min(r, h, w / 2));
    return `M${x},${y + r} a${r},${r} 0 0 1 ${r},${-r} h${w - 2 * r} a${r},${r} 0 0 1 ${r},${r} v${h - r} H${x} Z`;
  }

  // Draw with the container's width; redraw on resize.
  function mount(el, drawFn) {
    let lastW = 0;
    const render = () => {
      const w = Math.max(240, Math.floor(el.clientWidth || el.getBoundingClientRect().width || 320));
      if (w === lastW) return; lastW = w;
      const out = drawFn(w);
      el.innerHTML = out.html;
      if (out.bind) out.bind(el);
    };
    render();
    if (window.ResizeObserver) { const ro = new ResizeObserver(() => render()); ro.observe(el); el._ro = ro; }
    else window.addEventListener('resize', render);
  }

  function columnChart(el, opts) {
    const { points, format = (v) => String(v), color = 'var(--series-1)', height = 220, labelEvery } = opts;
    mount(el, (W) => {
      const H = height, padL = 44, padR = 10, padT = 12, padB = 26;
      const iw = W - padL - padR, ih = H - padT - padB;
      const sc = niceScale(Math.max(0, ...points.map((p) => p.value)), points.every((p) => Number.isInteger(p.value))); const max = sc.max;
      const slot = iw / Math.max(1, points.length);
      const bw = Math.min(24, Math.max(3, slot * 0.62));
      const y = (v) => padT + ih - (v / max) * ih;
      let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.aria || 'column chart')}">`;
      for (const t of ticks(sc)) s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="tick" x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" text-anchor="end">${fmtTick(t)}</text>`;
      s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${y(0).toFixed(1)}" y2="${y(0).toFixed(1)}"/>`;
      points.forEach((p, i) => {
        const x = padL + slot * i + (slot - bw) / 2; const top = y(p.value); const h = y(0) - top;
        if (p.value > 0) s += `<path class="bar" data-i="${i}" fill="${color}" d="${roundedTop(x, top, bw, h, 4)}"/>`;
      });
      const every = labelEvery || Math.max(1, Math.ceil(points.length / Math.floor(iw / 64)));
      points.forEach((p, i) => {
        const show = points.length <= 12 || i % every === 0 || i === points.length - 1;
        if (show && !(i === points.length - 1 && points.length > 12 && (points.length - 1) % every < Math.ceil(every / 2) && (points.length - 1) % every !== 0)) s += `<text class="tick" x="${(padL + slot * i + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
      });
      // hit areas above bars so the whole slot is hoverable
      points.forEach((_, i) => { s += `<rect class="hit" data-i="${i}" x="${(padL + slot * i).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${ih}" fill="transparent"/>`; });
      s += '</svg>';
      return {
        html: s,
        bind(root) {
          const bars = root.querySelectorAll('.bar');
          root.querySelectorAll('.hit').forEach((hit) => {
            hit.addEventListener('mousemove', (e) => {
              const i = Number(hit.dataset.i); const p = points[i];
              bars.forEach((b) => b.classList.toggle('dim', Number(b.dataset.i) !== i));
              showTip(e, `<b>${esc(p.title || p.label)}</b>${esc(format(p.value))}`);
            });
            hit.addEventListener('mouseleave', () => { bars.forEach((b) => b.classList.remove('dim')); hideTip(); });
          });
        },
      };
    });
  }

  function lineChart(el, opts) {
    const { points, format = (v) => String(v), color = 'var(--series-1)', height = 220, step = false, timeLabel } = opts;
    mount(el, (W) => {
      const H = height, padL = 44, padR = 14, padT = 14, padB = 26;
      const iw = W - padL - padR, ih = H - padT - padB;
      if (!points.length) return { html: `<div class="empty">No data</div>` };
      const xs = points.map((p) => new Date(p.x).getTime());
      const minX = Math.min(...xs), maxX = Math.max(...xs); const span = maxX - minX || 1;
      const sc = niceScale(Math.max(0, ...points.map((p) => p.y)), points.every((p) => Number.isInteger(p.y))); const max = sc.max;
      const X = (t) => padL + ((t - minX) / span) * iw; const Y = (v) => padT + ih - (v / max) * ih;
      let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(opts.aria || 'line chart')}">`;
      for (const t of ticks(sc)) s += `<line class="grid" x1="${padL}" x2="${W - padR}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/><text class="tick" x="${padL - 8}" y="${(Y(t) + 4).toFixed(1)}" text-anchor="end">${fmtTick(t)}</text>`;
      s += `<line class="axis" x1="${padL}" x2="${W - padR}" y1="${Y(0).toFixed(1)}" y2="${Y(0).toFixed(1)}"/>`;
      let d = '';
      points.forEach((p, i) => {
        const x = X(xs[i]).toFixed(1), y = Y(p.y).toFixed(1);
        if (i === 0) d += `M${x},${y}`;
        else if (step) d += ` H${x} V${y}`;
        else d += ` L${x},${y}`;
      });
      const lastX = X(xs[xs.length - 1]).toFixed(1);
      if (points.length > 1) s += `<path class="area" fill="${color}" d="${d} L${lastX},${Y(0).toFixed(1)} L${X(xs[0]).toFixed(1)},${Y(0).toFixed(1)} Z"/>`;
      s += `<path class="line" stroke="${color}" d="${d}"/>`;
      const last = points[points.length - 1];
      s += `<circle class="marker" fill="${color}" r="4.5" cx="${lastX}" cy="${Y(last.y).toFixed(1)}"/>`;
      s += `<text class="label" x="${Math.min(W - 4, Number(lastX) + 8)}" y="${(Y(last.y) - 8).toFixed(1)}" text-anchor="${Number(lastX) > W - 60 ? 'end' : 'start'}">${esc(format(last.y))}</text>`;
      const n = Math.min(points.length, Math.max(2, Math.floor(iw / 90)));
      for (let k = 0; k < n; k++) {
        const t = minX + (span * k) / (n - 1 || 1);
        s += `<text class="tick" x="${X(t).toFixed(1)}" y="${H - 8}" text-anchor="${k === 0 ? 'start' : k === n - 1 ? 'end' : 'middle'}">${esc(timeLabel ? timeLabel(new Date(t)) : new Date(t).toLocaleDateString())}</text>`;
      }
      s += `<line class="crosshair" x1="0" x2="0" y1="${padT}" y2="${padT + ih}" style="display:none"/><circle class="marker hover" fill="${color}" r="4.5" style="display:none"/>`;
      s += `<rect class="hit" x="${padL}" y="${padT}" width="${iw}" height="${ih}" fill="transparent"/></svg>`;
      return {
        html: s,
        bind(root) {
          const svg = root.querySelector('svg'); const hit = root.querySelector('.hit'); const ch = root.querySelector('.crosshair'); const hm = root.querySelector('.marker.hover');
          hit.addEventListener('mousemove', (e) => {
            const rect = svg.getBoundingClientRect(); const px = ((e.clientX - rect.left) / rect.width) * W;
            let best = 0, bd = Infinity;
            xs.forEach((t, i) => { const dd = Math.abs(X(t) - px); if (dd < bd) { bd = dd; best = i; } });
            const p = points[best]; const cx = X(xs[best]);
            ch.style.display = ''; ch.setAttribute('x1', cx); ch.setAttribute('x2', cx);
            hm.style.display = ''; hm.setAttribute('cx', cx); hm.setAttribute('cy', Y(p.y));
            showTip(e, `<b>${esc(p.title || new Date(p.x).toLocaleString())}</b>${esc(format(p.y))}${p.sub ? '<div>' + esc(p.sub) + '</div>' : ''}`);
          });
          hit.addEventListener('mouseleave', () => { ch.style.display = 'none'; hm.style.display = 'none'; hideTip(); });
        },
      };
    });
  }

  function hbars(el, opts) {
    const { rows, format = (v) => String(v), color = 'var(--series-1)', href } = opts;
    if (!rows.length) { el.innerHTML = '<div class="empty">No data</div>'; return; }
    const max = Math.max(...rows.map((r) => r.value)) || 1;
    el.innerHTML = `<div class="hbars">${rows.map((r) => {
      const label = href && r.id ? `<a href="${esc(href(r))}">${esc(r.label)}</a>` : esc(r.label);
      return `<div class="hbar-label" title="${esc(r.label)}">${label}${r.sub ? `<span class="sub">${esc(r.sub)}</span>` : ''}</div>
        <div class="hbar-track"><div class="hbar-fill" style="width:${((r.value / max) * 100).toFixed(1)}%;background:${r.color || color}"></div></div>
        <div class="hbar-value">${esc(format(r.value))}</div>`;
    }).join('')}</div>`;
  }

  window.Charts = { columnChart, lineChart, hbars, showTip, hideTip };
})();
