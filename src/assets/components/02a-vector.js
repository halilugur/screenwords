
/* --- Vector toolkit: SVG paths, trim/morph, viewBox fit, layout, springs --
   Generic drawing capability for `sw` (code overlays) and the declarative
   `params.svgLayers` / `params.scene` stages. Nothing here knows about any
   particular video: content lives in project params only. */

/* Colour parsing and mixing for shading (#rgb, #rrggbb, #rrggbbaa, rgb(a)). */
function swRgb(c) {
  if (typeof c !== 'string') return [128, 128, 128, 1];
  const s = c.trim();
  if (s[0] === '#') {
    let h = s.slice(1);
    if (h.length === 3 || h.length === 4) h = h.split('').map(ch => ch + ch).join('');
    const n = parseInt(h.slice(0, 6), 16);
    if (!isFinite(n)) return [128, 128, 128, 1];
    const a = h.length >= 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
  }
  const m = s.match(/rgba?\(([^)]+)\)/i);
  if (m) {
    const v = m[1].split(/[\s,\/]+/).filter(Boolean).map(Number);
    return [v[0] || 0, v[1] || 0, v[2] || 0, v.length > 3 ? v[3] : 1];
  }
  return [128, 128, 128, 1];
}
function swMix(a, b, q) {
  const x = swRgb(a), y = swRgb(b), t = ecClamp(q, 0, 1);
  const r = Math.round(x[0] + (y[0] - x[0]) * t), g = Math.round(x[1] + (y[1] - x[1]) * t);
  const bl = Math.round(x[2] + (y[2] - x[2]) * t), al = x[3] + (y[3] - x[3]) * t;
  return al >= 0.999 ? `rgb(${r},${g},${bl})` : `rgba(${r},${g},${bl},${al.toFixed(3)})`;
}
/* amt < 0 darkens toward a cool shadow, amt > 0 lightens toward white. */
function swShade(c, amt) {
  return amt < 0 ? swMix(c, '#0B1023', -amt) : swMix(c, '#FFFFFF', amt);
}

/* SVG path data -> flattened subpaths [{pts: [[x, y], ...], closed}].
   Supports M L H V C S Q T A Z in absolute and relative form. */
function swParsePath(d) {
  const toks = String(d).match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || [];
  const subs = [];
  let cur = null, i = 0, cmd = '', x = 0, y = 0, sx = 0, sy = 0, lcx = 0, lcy = 0, lq = null;
  const num = () => parseFloat(toks[i++]);
  const isNum = () => i < toks.length && !/^[a-zA-Z]$/.test(toks[i]);
  const start = (px, py) => {
    /* A moveto that is immediately followed by another moveto draws nothing. */
    if (cur && cur.pts.length < 2 && subs[subs.length - 1] === cur) subs.pop();
    cur = { pts: [[px, py]], closed: false };
    subs.push(cur);
  };
  const push = (px, py) => { if (!cur) start(x, y); cur.pts.push([px, py]); };
  const steps = (len) => ecClamp(Math.ceil(len / 3), 4, 64);
  const cubic = (x1, y1, x2, y2, ex, ey) => {
    const n = steps(Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(ex - x2, ey - y2));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * ex,
           u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * ey);
    }
  };
  const quad = (qx, qy, ex, ey) => {
    const n = steps(Math.hypot(qx - x, qy - y) + Math.hypot(ex - qx, ey - qy));
    for (let k = 1; k <= n; k++) {
      const t = k / n, u = 1 - t;
      push(u * u * x + 2 * u * t * qx + t * t * ex, u * u * y + 2 * u * t * qy + t * t * ey);
    }
  };
  const arc = (rx, ry, rot, large, sweep, ex, ey) => {
    /* Endpoint -> centre parameterisation (SVG implementation notes F.6). */
    if (!rx || !ry) { push(ex, ey); return; }
    rx = Math.abs(rx); ry = Math.abs(ry);
    const phi = rot * Math.PI / 180, cp = Math.cos(phi), sp = Math.sin(phi);
    const dx = (x - ex) / 2, dy = (y - ey) / 2;
    const x1 = cp * dx + sp * dy, y1 = -sp * dx + cp * dy;
    const lam = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lam > 1) { rx *= Math.sqrt(lam); ry *= Math.sqrt(lam); }
    const num2 = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let co = Math.sqrt(Math.max(0, num2 / (den || 1)));
    if (large === sweep) co = -co;
    const cxp = co * rx * y1 / ry, cyp = -co * ry * x1 / rx;
    const cx = cp * cxp - sp * cyp + (x + ex) / 2, cy = sp * cxp + cp * cyp + (y + ey) / 2;
    const ang = (ux, uy, vx, vy) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (x1 - cxp) / rx, (y1 - cyp) / ry);
    let dt = ang((x1 - cxp) / rx, (y1 - cyp) / ry, (-x1 - cxp) / rx, (-y1 - cyp) / ry);
    if (!sweep && dt > 0) dt -= Math.PI * 2;
    if (sweep && dt < 0) dt += Math.PI * 2;
    const n = ecClamp(Math.ceil(Math.abs(dt) * Math.max(rx, ry) / 3), 4, 96);
    for (let k = 1; k <= n; k++) {
      const a = t1 + dt * k / n, ca = Math.cos(a) * rx, sa = Math.sin(a) * ry;
      push(cx + cp * ca - sp * sa, cy + sp * ca + cp * sa);
    }
  };
  while (i < toks.length) {
    if (!isNum()) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    const ox = rel ? x : 0, oy = rel ? y : 0;
    if (C === 'Z') {
      if (cur) { cur.closed = true; x = sx; y = sy; cur = null; }
      lq = null; lcx = x; lcy = y;
      continue;
    }
    if (!isNum()) continue;
    if (C === 'M') {
      x = ox + num(); y = oy + num(); sx = x; sy = y; start(x, y);
      cmd = rel ? 'l' : 'L';
      lcx = x; lcy = y; lq = null;
    } else if (C === 'L') {
      x = ox + num(); y = oy + num(); push(x, y); lcx = x; lcy = y; lq = null;
    } else if (C === 'H') {
      x = ox + num(); push(x, y); lcx = x; lcy = y; lq = null;
    } else if (C === 'V') {
      y = oy + num(); push(x, y); lcx = x; lcy = y; lq = null;
    } else if (C === 'C') {
      const x1 = ox + num(), y1 = oy + num(), x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
      cubic(x1, y1, x2, y2, ex, ey); lcx = x2; lcy = y2; x = ex; y = ey; lq = null;
    } else if (C === 'S') {
      const x1 = 2 * x - lcx, y1 = 2 * y - lcy;
      const x2 = ox + num(), y2 = oy + num(), ex = ox + num(), ey = oy + num();
      cubic(x1, y1, x2, y2, ex, ey); lcx = x2; lcy = y2; x = ex; y = ey; lq = null;
    } else if (C === 'Q') {
      const qx = ox + num(), qy = oy + num(), ex = ox + num(), ey = oy + num();
      quad(qx, qy, ex, ey); lq = [qx, qy]; x = ex; y = ey; lcx = x; lcy = y;
    } else if (C === 'T') {
      const qx = lq ? 2 * x - lq[0] : x, qy = lq ? 2 * y - lq[1] : y;
      const ex = ox + num(), ey = oy + num();
      quad(qx, qy, ex, ey); lq = [qx, qy]; x = ex; y = ey; lcx = x; lcy = y;
    } else if (C === 'A') {
      const rx = num(), ry = num(), rot = num(), large = num() ? 1 : 0, sweep = num() ? 1 : 0;
      const ex = ox + num(), ey = oy + num();
      arc(rx, ry, rot, large, sweep, ex, ey); x = ex; y = ey; lcx = x; lcy = y; lq = null;
    } else {
      i++;
    }
  }
  for (let q = subs.length - 1; q >= 0; q--) if (subs[q].pts.length < 2) subs.splice(q, 1);
  for (const s of subs) {
    const cum = [0];
    for (let k = 1; k < s.pts.length; k++) {
      cum.push(cum[k - 1] + Math.hypot(s.pts[k][0] - s.pts[k - 1][0], s.pts[k][1] - s.pts[k - 1][1]));
    }
    if (s.closed && s.pts.length > 1) {
      const a = s.pts[s.pts.length - 1], b = s.pts[0];
      const gap = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (gap > 1e-6) { s.pts.push([b[0], b[1]]); cum.push(cum[cum.length - 1] + gap); }
    }
    s.cum = cum;
    s.len = cum[cum.length - 1];
  }
  return subs;
}
const swPathCache = new Map();
function swPath(d) {
  let v = swPathCache.get(d);
  if (!v) {
    v = swParsePath(d);
    if (swPathCache.size > 512) swPathCache.clear();
    swPathCache.set(d, v);
  }
  return v;
}
/* Point at arc length s along a flattened subpath. */
function swAt(sub, s) {
  const c = sub.cum, p = sub.pts;
  if (s <= 0) return p[0];
  if (s >= sub.len) return p[p.length - 1];
  let lo = 0, hi = c.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (c[m] < s) lo = m; else hi = m; }
  const t = (s - c[lo]) / ((c[hi] - c[lo]) || 1);
  return [p[lo][0] + (p[hi][0] - p[lo][0]) * t, p[lo][1] + (p[hi][1] - p[lo][1]) * t];
}
/* Even arc-length resampling to n points (morph correspondence). */
function swResample(sub, n) {
  const out = [];
  const m = sub.closed ? n : n - 1;
  for (let k = 0; k < n; k++) out.push(swAt(sub, sub.len * k / Math.max(1, m)));
  return out;
}
/* The portion [t0, t1] of the whole path, measured over its total length. */
function swTrim(subs, t0, t1) {
  const total = subs.reduce((a, s) => a + s.len, 0);
  const a = ecClamp(Math.min(t0, t1), 0, 1) * total, b = ecClamp(Math.max(t0, t1), 0, 1) * total;
  const out = [];
  let base = 0;
  for (const s of subs) {
    const s0 = Math.max(a, base), s1 = Math.min(b, base + s.len);
    if (s1 > s0) {
      const pts = [swAt(s, s0 - base)];
      for (let k = 0; k < s.pts.length; k++) {
        const ck = s.cum[k] + base;
        if (ck > s0 && ck < s1) pts.push(s.pts[k]);
      }
      pts.push(swAt(s, s1 - base));
      out.push({ pts, closed: s.closed && s0 <= base && s1 >= base + s.len });
    }
    base += s.len;
  }
  return out;
}
function swTrace(ctx, subs) {
  ctx.beginPath();
  for (const s of subs) {
    if (!s.pts.length) continue;
    ctx.moveTo(s.pts[0][0], s.pts[0][1]);
    for (let k = 1; k < s.pts.length; k++) ctx.lineTo(s.pts[k][0], s.pts[k][1]);
    if (s.closed) ctx.closePath();
  }
}
/* Interpolate a numeric param that may be keyframed: [[t, v], [t, v], ...]
   (t in seconds of the component's local time), eased in-out between stops. */
function swAnim(v, t, d) {
  if (typeof v === 'number') return isFinite(v) ? v : d;
  if (Array.isArray(v) && v.length && Array.isArray(v[0])) {
    /* Stops with a non-numeric time or value are ignored. */
    if (!v.every(k => Array.isArray(k) && isFinite(k[0]) && typeof k[0] === 'number' && typeof k[1] === 'number' && isFinite(k[1]))) {
      v = v.filter(k => Array.isArray(k) && typeof k[0] === 'number' && isFinite(k[0]) && typeof k[1] === 'number' && isFinite(k[1]));
      if (!v.length) return d;
    }
    if (!(typeof t === 'number' && isFinite(t))) t = 0;
    if (t <= v[0][0]) return v[0][1];
    for (let k = 0; k < v.length - 1; k++) {
      const a = v[k], b = v[k + 1];
      if (t <= b[0]) {
        const q = (t - a[0]) / ((b[0] - a[0]) || 1);
        const e = q < 0.5 ? 4 * q * q * q : 1 - Math.pow(-2 * q + 2, 3) / 2;
        return a[1] + (b[1] - a[1]) * e;
      }
    }
    return v[v.length - 1][1];
  }
  return d;
}
/* Box normalisation: {x, y, width, height} (px or 0..1 of the stage) or
   {cx, cy, w, h} -> {x, y, width, height, cx, cy, w, h} in pixels. */
function swBox(b, W, H) {
  if (!b) return { x: 0, y: 0, width: W, height: H, cx: W / 2, cy: H / 2, w: W, h: H };
  const nx = v => (Math.abs(v) <= 1.5 ? v * W : v), ny = v => (Math.abs(v) <= 1.5 ? v * H : v);
  let x, y, w, h;
  if (b.cx != null && b.w != null) { w = b.w; h = b.h; x = b.cx - w / 2; y = b.cy - h / 2; }
  else {
    w = ecN(b.width, ecN(b.w, W)); h = ecN(b.height, ecN(b.h, H));
    w = w <= 1.5 ? w * W : w; h = h <= 1.5 ? h * H : h;
    x = nx(ecN(b.x, 0)); y = ny(ecN(b.y, 0));
  }
  return { x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2, w, h };
}
function swPx(x, y, w, h) { return { x, y, width: w, height: h, cx: x + w / 2, cy: y + h / 2, w, h }; }
/* preserveAspectRatio fit of a viewBox [minX, minY, w, h] into a box. */
function swFit(vb, box, par) {
  const raw = Array.isArray(vb) ? vb : String(vb || '0 0 100 100').trim().split(/[\s,]+/).map(Number);
  const v = [0, 1, 2, 3].map(j => ecN(raw[j], 0));
  const vw = v[2] > 0 ? v[2] : 100, vh = v[3] > 0 ? v[3] : 100;
  const mode = String(par || 'xMidYMid meet');
  let sx = box.width / vw, sy = box.height / vh;
  if (mode !== 'none') {
    const s = /slice/.test(mode) ? Math.max(sx, sy) : Math.min(sx, sy);
    sx = sy = s;
  }
  const ax = /xMin/.test(mode) ? 0 : /xMax/.test(mode) ? 1 : 0.5;
  const ay = /YMin/.test(mode) ? 0 : /YMax/.test(mode) ? 1 : 0.5;
  return {
    sx, sy,
    tx: box.x + (box.width - vw * sx) * ax - v[0] * sx,
    ty: box.y + (box.height - vh * sy) * ay - v[1] * sy
  };
}
function swGradient(ctx, g) {
  if (!g || !Array.isArray(g.stops)) return null;
  const gr = g.type === 'radial'
    ? ctx.createRadialGradient(ecN(g.fx, ecN(g.cx, 50)), ecN(g.fy, ecN(g.cy, 50)), ecN(g.r0, 0), ecN(g.cx, 50), ecN(g.cy, 50), ecN(g.r, 50))
    : ctx.createLinearGradient(ecN(g.x0, 0), ecN(g.y0, 0), ecN(g.x1, 100), ecN(g.y1, 0));
  for (const s of g.stops) {
    if (Array.isArray(s)) gr.addColorStop(ecClamp(ecN(s[0], 0), 0, 1), s[1]);
    else if (s && s.color) gr.addColorStop(ecClamp(ecN(s.offset, 0), 0, 1), s.color);
  }
  return gr;
}

Object.assign(SWDraw, {
  mix: swMix,
  shade: swShade,
  parsePath: swPath,
  pathLength: d => swPath(d).reduce((a, s) => a + s.len, 0),
  /* Point and unit tangent at fraction t of a path: motion along a path. */
  pointOnPath: (d, t) => {
    const subs = swPath(d), total = subs.reduce((a, s) => a + s.len, 0);
    let s = ecClamp(t, 0, 1) * total;
    for (const sub of subs) {
      if (s <= sub.len) {
        const p = swAt(sub, s), q = swAt(sub, Math.min(sub.len, s + 0.5)), r = swAt(sub, Math.max(0, s - 0.5));
        const a = Math.atan2(q[1] - r[1], q[0] - r[0]);
        return { x: p[0], y: p[1], angle: a };
      }
      s -= sub.len;
    }
    return { x: 0, y: 0, angle: 0 };
  },
  /* Morph between two paths: every subpath is resampled to n points by arc
     length and blended pairwise (missing partners collapse to a centroid). */
  morph: (dA, dB, t, n) => {
    const A = swPath(dA), B = swPath(dB), N = n || 96, q = ecClamp(t, 0, 1);
    const out = [];
    const cnt = Math.max(A.length, B.length);
    for (let k = 0; k < cnt; k++) {
      const a = A[k], b = B[k];
      const pa = a ? swResample(a, N) : null, pb = b ? swResample(b, N) : null;
      const cen = pts => pts.reduce((m, p) => [m[0] + p[0] / pts.length, m[1] + p[1] / pts.length], [0, 0]);
      const ra = pa || Array(N).fill(cen(pb)), rb = pb || Array(N).fill(cen(pa));
      const shut = sb => sb.closed || Math.hypot(sb.pts[0][0] - sb.pts[sb.pts.length - 1][0], sb.pts[0][1] - sb.pts[sb.pts.length - 1][1]) < 1e-3 * (sb.len || 1) + 1e-6;
      if (a && b && shut(a) && shut(b)) {
        /* Match winding, then align start points, so the blend never twists
           or collapses through itself. */
        const area = pts => pts.reduce((m, p, j) => { const q = pts[(j + 1) % pts.length]; return m + p[0] * q[1] - q[0] * p[1]; }, 0);
        if (area(ra) * area(rb) < 0) rb.reverse();
        let best = 0, bestD = Infinity;
        for (let o = 0; o < N; o += 2) {
          let dsum = 0;
          for (let j = 0; j < N; j += 4) { const p = ra[j], r = rb[(j + o) % N]; dsum += (p[0] - r[0]) ** 2 + (p[1] - r[1]) ** 2; }
          if (dsum < bestD) { bestD = dsum; best = o; }
        }
        if (best) for (let j = 0, tmp = rb.slice(); j < N; j++) rb[j] = tmp[(j + best) % N];
      }
      out.push({ pts: ra.map((p, j) => [p[0] + (rb[j][0] - p[0]) * q, p[1] + (rb[j][1] - p[1]) * q]), closed: (a || b).closed });
    }
    return out;
  },
  fitViewBox: (viewBox, box, par) => swFit(viewBox, box, par),
  anim: swAnim,
  /* Multi-layer vector artwork authored in its own viewBox units:
     layers: [{ d, fill, stroke, lineWidth, gradient, strokeGradient, shadow,
                transform: {x, y, scale, scaleX, scaleY, rotate, origin},
                opacity, trimStart, trimEnd, morphTo, morph, dash, lineCap,
                lineJoin, fillRule, blend, nonScalingStroke, layers: [...],
                clip }]  (clip: a path the group's children are cut to)
     opts: { viewBox, box: {x, y, width, height}, preserveAspectRatio,
             W, H, localTime }. Any numeric field may be keyframed as
     [[t, v], ...] over localTime. */
  svgLayers: (ctx, layers, opts) => {
    if (!Array.isArray(layers) || typeof Path2D === 'undefined') return;
    opts = opts || {};
    const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920), lt = ecN(opts.localTime, 0);
    ctx.save();
    let scale = 1;
    if (opts.viewBox) {
      const f = swFit(opts.viewBox, swBox(opts.box, W, H), opts.preserveAspectRatio);
      ctx.translate(f.tx, f.ty);
      ctx.scale(f.sx, f.sy);
      scale = Math.max(1e-6, (f.sx + f.sy) / 2);
    }
    const drawLayer = (L, sc) => {
      if (!L || typeof L !== 'object') return;
      const op = swAnim(L.opacity, lt, 1);
      if (op <= 0.001) return;
      ctx.save();
      ctx.globalAlpha *= ecClamp(op, 0, 1);
      if (L.blend) ctx.globalCompositeOperation = L.blend;
      let s = sc;
      const tf = L.transform;
      if (tf) {
        const o = Array.isArray(tf.origin) ? [ecN(tf.origin[0], 0), ecN(tf.origin[1], 0)] : [0, 0];
        ctx.translate(swAnim(tf.x, lt, 0) + o[0], swAnim(tf.y, lt, 0) + o[1]);
        const r = swAnim(tf.rotate, lt, 0);
        if (r) ctx.rotate(r * Math.PI / 180);
        const k = swAnim(tf.scale, lt, 1), kx = swAnim(tf.scaleX, lt, 1) * k, ky = swAnim(tf.scaleY, lt, 1) * k;
        if (kx !== 1 || ky !== 1) ctx.scale(kx, ky);
        s *= Math.abs((kx + ky) / 2) || 1;
        ctx.translate(-o[0], -o[1]);
      }
      if (Array.isArray(L.layers)) {
        if (typeof L.clip === 'string' && L.clip) ctx.clip(new Path2D(L.clip));
        for (const child of L.layers) drawLayer(child, s);
        ctx.restore();
        return;
      }
      const d = L.d || L.path;
      if (!d) { ctx.restore(); return; }
      const t0 = swAnim(L.trimStart, lt, 0), t1 = swAnim(L.trimEnd, lt, 1);
      const mq = L.morphTo ? swAnim(L.morph, lt, 0) : 0;
      const trimmed = t0 > 0.0005 || t1 < 0.9995;
      let path = null;
      if (!trimmed && mq <= 0.0005) path = new Path2D(d);
      else {
        let subs = mq > 0.0005 ? SWDraw.morph(d, L.morphTo, mq, L.morphPoints) : swPath(d);
        if (trimmed) {
          if (mq > 0.0005) {
            for (const sb of subs) {
              sb.cum = [0];
              for (let k = 1; k < sb.pts.length; k++) sb.cum.push(sb.cum[k - 1] + Math.hypot(sb.pts[k][0] - sb.pts[k - 1][0], sb.pts[k][1] - sb.pts[k - 1][1]));
              sb.len = sb.cum[sb.cum.length - 1];
            }
          }
          subs = swTrim(subs, t0, t1);
        }
        path = new Path2D();
        for (const sb of subs) {
          if (!sb.pts.length) continue;
          path.moveTo(sb.pts[0][0], sb.pts[0][1]);
          for (let k = 1; k < sb.pts.length; k++) path.lineTo(sb.pts[k][0], sb.pts[k][1]);
          if (sb.closed) path.closePath();
        }
      }
      if (L.shadow) {
        ctx.shadowColor = L.shadow.color || 'rgba(0,0,0,0.35)';
        ctx.shadowBlur = ecN(L.shadow.blur, 12);
        ctx.shadowOffsetX = ecN(L.shadow.x, 0);
        ctx.shadowOffsetY = ecN(L.shadow.y, 6);
      }
      const fill = L.gradient ? swGradient(ctx, L.gradient) : L.fill;
      /* A trimmed open outline is a drawing-on stroke: filling it would show
         a chord, so the fill only appears once the trim has completed. */
      if (fill && fill !== 'none' && (!trimmed || L.fillWhileTrimmed)) {
        ctx.fillStyle = fill;
        ctx.fill(path, L.fillRule === 'evenodd' ? 'evenodd' : 'nonzero');
        ctx.shadowColor = 'transparent';
      }
      const stroke = L.strokeGradient ? swGradient(ctx, L.strokeGradient) : L.stroke;
      if (stroke && stroke !== 'none') {
        ctx.strokeStyle = stroke;
        const lw = swAnim(L.lineWidth, lt, 2);
        ctx.lineWidth = L.nonScalingStroke ? lw / s : lw;
        ctx.lineCap = L.lineCap || 'round';
        ctx.lineJoin = L.lineJoin || 'round';
        if (Array.isArray(L.dash)) ctx.setLineDash(L.dash);
        if (L.dashOffset != null) ctx.lineDashOffset = swAnim(L.dashOffset, lt, 0);
        ctx.stroke(path);
      }
      ctx.restore();
    };
    for (const L of layers) drawLayer(L, scale);
    ctx.restore();
  },
  /* Damped harmonic follower (follow-through / overlapping action). The
     response to `signal(t)` is integrated from rest over a fixed trailing
     window, so it is a pure function of time: frames render independently
     and in any order with identical results. */
  follow: (signal, time, o) => {
    o = o || {};
    const f = ecN(o.freq, 2.2), z = ecN(o.damping, 0.32), win = ecN(o.window, 1.4), n = ecN(o.steps, 56);
    const w = Math.PI * 2 * f, k = w * w, c = 2 * z * w, dt = win / n;
    /* The spring runs on a time grid fixed to multiples of dt, not one that
       slides with the frame time: a sliding grid samples a sudden change
       (a cut to a new shot) at a different phase every frame, and the
       result wobbles. Between grid points the two runs are blended. */
    const run = end => {
      let t = end - win, x = signal(t), v = 0;
      for (let i = 0; i < n; i++) {
        t += dt;
        const a = k * (signal(t) - x) - c * v;
        v += a * dt;
        x += v * dt;
      }
      return x;
    };
    const g = Math.floor(time / dt), q = time / dt - g;
    if (q < 1e-9) return run(g * dt);
    const x0 = run(g * dt), x1 = run((g + 1) * dt);
    return x0 + (x1 - x0) * q;
  },
  /* The follower's lag behind the signal: the overshoot that drives hair
     tips, coat hems and antennae. */
  lag: (signal, time, o) => SWDraw.follow(signal, time, o) - signal(time),
  /* Layout: safe area, rows/columns/grids, anchoring and overlap resolution.
     Boxes are {x, y, width, height} in pixels (cx/cy/w/h are filled in). */
  layout: {
    box: (b, W, H) => swBox(b, ecN(W, 1080), ecN(H, 1920)),
    safe: (W, H, m) => {
      const mm = m == null ? { x: 0.05, top: 0.06, bottom: 0.06 } : (typeof m === 'number' ? { x: m, top: m, bottom: m } : m);
      const x = ecN(mm.x, 0.05) * W, top = ecN(mm.top, 0.06) * H, bot = ecN(mm.bottom, 0.06) * H;
      return swPx(x, top, W - 2 * x, H - top - bot);
    },
    row: (n, area, gap) => {
      const g = ecN(gap, 24), w = (area.width - g * (n - 1)) / n, out = [];
      for (let i = 0; i < n; i++) out.push(swPx(area.x + i * (w + g), area.y, w, area.height));
      return out;
    },
    column: (n, area, gap) => {
      const g = ecN(gap, 24), h = (area.height - g * (n - 1)) / n, out = [];
      for (let i = 0; i < n; i++) out.push(swPx(area.x, area.y + i * (h + g), area.width, h));
      return out;
    },
    grid: (n, cols, area, gap) => {
      const c = Math.max(1, cols | 0), r = Math.ceil(n / c), g = ecN(gap, 24);
      const w = (area.width - g * (c - 1)) / c, h = (area.height - g * (r - 1)) / r, out = [];
      for (let i = 0; i < n; i++) {
        const cx = i % c, ry = Math.floor(i / c);
        out.push(swPx(area.x + cx * (w + g), area.y + ry * (h + g), w, h));
      }
      return out;
    },
    /* A box of `size` placed outside `box` on `side`, `gap` px away. */
    anchorTo: (box, side, gap, size) => {
      const b = box.width != null ? swPx(box.x, box.y, box.width, box.height) : swPx(box.cx - box.w / 2, box.cy - box.h / 2, box.w, box.h), g = ecN(gap, 24);
      const w = ecN(size && size.width, b.width), h = ecN(size && size.height, b.height);
      const s = String(side || 'right');
      const x = s === 'left' ? b.x - g - w : s === 'right' ? b.x + b.width + g : b.cx - w / 2;
      const y = s === 'top' ? b.y - g - h : s === 'bottom' ? b.y + b.height + g : b.cy - h / 2;
      return swPx(x, y, w, h);
    },
    /* Move (and if needed shrink) a box so it sits inside `area`. */
    fitInside: (box, area) => {
      const w = Math.min(box.width, area.width), h = Math.min(box.height, area.height);
      const x = ecClamp(box.x, area.x, area.x + area.width - w), y = ecClamp(box.y, area.y, area.y + area.height - h);
      return swPx(x, y, w, h);
    },
    /* Push overlapping boxes apart along their least-penetration axis, keeping
       every box inside `area`. Boxes flagged `fixed` never move. */
    resolve: (boxes, area, gap) => {
      const g = ecN(gap, 16);
      const bs = boxes.map(b => Object.assign({}, b));
      for (let it = 0; it < 32; it++) {
        let moved = false;
        for (let i = 0; i < bs.length; i++) {
          for (let j = i + 1; j < bs.length; j++) {
            const a = bs[i], b = bs[j];
            const ox = Math.min(a.x + a.width, b.x + b.width) + g - Math.max(a.x, b.x);
            const oy = Math.min(a.y + a.height, b.y + b.height) + g - Math.max(a.y, b.y);
            if (ox <= 0 || oy <= 0) continue;
            moved = true;
            const wa = a.fixed ? 0 : (b.fixed ? 1 : 0.5), wb = 1 - wa;
            if (a.fixed && b.fixed) continue;
            if (ox < oy) {
              const dir = (a.x + a.width / 2) <= (b.x + b.width / 2) ? -1 : 1;
              a.x += dir * ox * wa; b.x -= dir * ox * wb;
            } else {
              const dir = (a.y + a.height / 2) <= (b.y + b.height / 2) ? -1 : 1;
              a.y += dir * oy * wa; b.y -= dir * oy * wb;
            }
          }
        }
        if (area) for (const b of bs) if (!b.fixed) {
          b.x = ecClamp(b.x, area.x, area.x + area.width - b.width);
          b.y = ecClamp(b.y, area.y, area.y + area.height - b.height);
        }
        if (!moved) break;
      }
      return bs.map(b => Object.assign(b, { cx: b.x + b.width / 2, cy: b.y + b.height / 2, w: b.width, h: b.height }));
    }
  }
});
