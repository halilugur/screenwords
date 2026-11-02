
/* --- Figure engine: skinned limbs, 2.5D head, visemes, articulated hands --
   A generic vector-illustration rig drawn entirely with Path2D Bézier
   outlines and cel shading. Every look (skin, hair, outfit, pose, emotion)
   comes from the caller's params; nothing here is specific to a video. */

/* Light falls from the upper left of the stage. The figure draws in a
   mirrored frame when it faces left, so shading flips with it. */
let swLightX = 1;

/* Cel fill: base colour, a soft highlight crescent toward the light and a
   shade crescent away from it, all clipped to the shape (works on unions). */
function swCel(ctx, path, base, o) {
  o = o || {};
  const sh = o.shade || swShade(base, -0.2);
  const hl = o.light === false ? null : (o.light || swShade(base, 0.1));
  const k = ecN(o.depth, 1), lx = swLightX;
  ctx.save();
  ctx.fillStyle = hl || base;
  ctx.fill(path);
  ctx.clip(path);
  if (hl) {
    ctx.translate(1.1 * k * lx, 1.0 * k);
    ctx.clip(path);
    ctx.translate(-1.1 * k * lx, -1.0 * k);
  }
  ctx.fillStyle = sh;
  ctx.fill(path);
  ctx.translate(-2.4 * k * lx, -2.1 * k);
  ctx.fillStyle = base;
  ctx.fill(path);
  ctx.restore();
}

/* Smooth curve through points (Catmull-Rom as cubic Béziers). */
function swCatmull(path, pts, move) {
  const n = pts.length;
  if (!n) return;
  if (move) path.moveTo(pts[0][0], pts[0][1]); else path.lineTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    path.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
                       p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1]);
  }
}
/* Dense spline samples through a few control points. */
function swSpline(pts, per) {
  const n = pts.length, m = per || 6, out = [];
  if (n < 3) {
    for (let k = 0; k <= m; k++) {
      const t = k / m, a = pts[0], b = pts[n - 1];
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
    return out;
  }
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n - 1, i + 2)];
    for (let k = 0; k < m; k++) {
      const t = k / m, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map(j => 0.5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t +
        (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[n - 1].slice());
  return out;
}
/* Variable-width envelope around a spine: a closed Bézier outline with
   round (or butt) caps. All envelopes wind the same way, so several added
   to one Path2D fill as a union under the nonzero rule. The concave side
   is clamped to the local radius of curvature so tight bends never fold. */
function swEnvelope(pts, widths, o) {
  o = o || {};
  const path = o.path || new Path2D();
  const n = pts.length;
  if (n < 2) return path;
  const A = [], B = [], T = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    T.push([tx, ty]);
    let ha = Math.max(0, widths[i]) / 2, hb = ha;
    if (i > 0 && i < n - 1) {
      const cr = (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]);
      if (Math.abs(cr) > 1e-6) {
        const R = Math.hypot(p[0] - a[0], p[1] - a[1]) * Math.hypot(b[0] - p[0], b[1] - p[1]) *
                  Math.hypot(b[0] - a[0], b[1] - a[1]) / (2 * Math.abs(cr));
        const ddx = a[0] + b[0] - 2 * p[0], ddy = a[1] + b[1] - 2 * p[1];
        if (ty * ddx - tx * ddy > 0) ha = Math.min(ha, R * 0.9); else hb = Math.min(hb, R * 0.9);
      }
    }
    A.push([p[0] + ty * ha, p[1] - tx * ha]);
    B.push([p[0] - ty * hb, p[1] + tx * hb]);
  }
  const k = 1.33;
  swCatmull(path, A, true);
  const te = T[n - 1], he = Math.max(0, widths[n - 1]) / 2;
  if (o.capEnd !== false && he > 0.05) {
    path.bezierCurveTo(A[n - 1][0] + te[0] * he * k, A[n - 1][1] + te[1] * he * k,
                       B[n - 1][0] + te[0] * he * k, B[n - 1][1] + te[1] * he * k, B[n - 1][0], B[n - 1][1]);
  } else path.lineTo(B[n - 1][0], B[n - 1][1]);
  swCatmull(path, B.slice().reverse(), false);
  const ts = T[0], hs = Math.max(0, widths[0]) / 2;
  if (o.capStart !== false && hs > 0.05) {
    path.bezierCurveTo(B[0][0] - ts[0] * hs * k, B[0][1] - ts[1] * hs * k,
                       A[0][0] - ts[0] * hs * k, A[0][1] - ts[1] * hs * k, A[0][0], A[0][1]);
  }
  path.closePath();
  return path;
}
/* Width profile keyed over the limb parameter s (0..1 upper bone, 1..2
   lower bone), smoothstepped between keys. */
function swProfile(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (s <= b[0]) {
      const t = (s - a[0]) / ((b[0] - a[0]) || 1), e = t * t * (3 - 2 * t);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return keys[keys.length - 1][1];
}
const SW_ARM = [[0, 19], [0.42, 18.4], [0.92, 13.6], [1.0, 13.2], [1.28, 14.4], [1.72, 11.4], [2.0, 10.2]];
const SW_LEG = [[0, 29], [0.32, 27], [0.94, 18.6], [1.0, 18.2], [1.3, 19], [1.78, 12.8], [2.0, 12]];
/* One bone of a limb, from param s0 to s1, added to `path`. Round caps at
   the joints make the union of the two bones a continuous outer contour
   (the cap radius equals the half-width there) with a natural inner crease. */
function swBone(path, P, Q, s0, s1, prof, extra, capS, capE) {
  const pts = [], ws = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    pts.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]);
    ws.push(swProfile(prof, s0 + (s1 - s0) * t) + (extra || 0));
  }
  return swEnvelope(pts, ws, { path, capStart: capS !== false, capEnd: capE !== false });
}
/* Limb outline (skin or sleeve) over param range [0, sEnd] of S-E-W. */
function swLimbPath(S, E, Wr, prof, sEnd, extra, path) {
  path = path || new Path2D();
  const e = ecClamp(sEnd == null ? 2 : sEnd, 0, 2);
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  if (e <= 1) {
    swBone(path, S, lerp(S, E, e), 0, e, prof, extra, true, e >= 0.999);
  } else {
    swBone(path, S, E, 0, 1, prof, extra, true, true);
    swBone(path, E, lerp(E, Wr, e - 1), 1, e, prof, extra, true, e >= 1.999);
  }
  return path;
}
/* Two-bone IK choosing the elbow/knee that sits lower and further out. */
function swIK(S, T, L1, L2, side) {
  const a = SWDraw.ik2(S.x, S.y, T.x, T.y, L1, L2, 1);
  const b = SWDraw.ik2(S.x, S.y, T.x, T.y, L1, L2, -1);
  const score = r => r.jy + side * r.jx * 0.6;
  return score(a) >= score(b) ? a : b;
}

/* --- Visemes ------------------------------------------------------------ */
const SW_VIS = {
  rest: { open: 0, width: 1, round: 0, teeth: 0, tongue: 0, press: 0 },
  A: { open: 1, width: 1, round: 0, teeth: 0.7, tongue: 0.6, press: 0 },
  E: { open: 0.5, width: 1.18, round: 0, teeth: 1, tongue: 0.3, press: 0 },
  O: { open: 0.8, width: 0.66, round: 1, teeth: 0.2, tongue: 0.3, press: 0 },
  U: { open: 0.42, width: 0.5, round: 1, teeth: 0, tongue: 0, press: 0 },
  M: { open: 0, width: 0.92, round: 0, teeth: 0, tongue: 0, press: 1 },
  F: { open: 0.17, width: 0.98, round: 0, teeth: 1, tongue: 0, press: 0.4 },
  S: { open: 0.22, width: 1.08, round: 0, teeth: 1, tongue: 0.1, press: 0 },
  L: { open: 0.45, width: 0.95, round: 0, teeth: 0.6, tongue: 1, press: 0 }
};
function swVisClass(ch) {
  if ('aâáàäã'.includes(ch)) return 'A';
  if ('eéèêëiíìîïıy'.includes(ch)) return 'E';
  if ('oóòôöõ'.includes(ch)) return 'O';
  if ('uúùûüwq'.includes(ch)) return 'U';
  if ('mbp'.includes(ch)) return 'M';
  if ('fv'.includes(ch)) return 'F';
  if ('lr'.includes(ch)) return 'L';
  if (/[a-zçğşñß]/.test(ch)) return 'S';
  if (/\d/.test(ch)) return 'E';
  return null;
}
function swVisBlend(a, b, t) {
  const o = {};
  for (const key in SW_VIS.rest) o[key] = a[key] + (b[key] - a[key]) * t;
  return o;
}

/* Options of SWDraw.character that may be keyframed as [[t, v], ...]. */
const SW_CHAR_KEYED = ['x', 'y', 'scale', 'facing', 'headTurn', 'headTilt', 'pointAmount', 'pointGap',
  'walkAmount', 'cadence', 'bodyTurn', 'bodyWidth', 'vx', 'mouth'];

/* Stress beat of the word under the playhead: rises and falls over 0.4 s
   from the word's start, stronger for long words and emphasised ones (a
   trailing ! or ?, ALL CAPS, or word.emphasis). Words are sorted by start. */
function swBeat(words, t) {
  if (!Array.isArray(words) || !words.length) return 0;
  let lo = 0, hi = words.length - 1, k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, w = words[mid];
    if (w && ecN(w.start, Infinity) <= t) { k = mid; lo = mid + 1; } else hi = mid - 1;
  }
  if (k < 0) return 0;
  const w = words[k], dt = t - w.start;
  if (dt > 0.4) return 0;
  const text = String(w.text || '');
  const letters = text.replace(/[^\p{L}\p{N}]/gu, '');
  let stress = ecClamp(letters.length / 7, 0.3, 1);
  if (w.emphasis || /[!?]/.test(text) || (letters.length > 1 && letters === letters.toUpperCase() && letters !== letters.toLowerCase())) stress *= 1.5;
  return Math.sin(Math.PI * dt / 0.4) * stress;
}

/* --- Hands -------------------------------------------------------------- */
/* Per pose: fingers index..pinky as [spreadDeg, curl], thumb [angleDeg,
   curl, lengthScale]. Hand-local frame: +x runs from the wrist to the
   knuckles, the thumb is on the -y side. */
const SW_HANDS = {
  open: { f: [[-14, 0], [-4, 0], [5, 0], [14, 0]], th: [-62, 0, 1] },
  wave: { f: [[-22, 0], [-7, 0], [7, 0], [21, 0]], th: [-76, 0, 1] },
  relaxed: { f: [[-6, 0.32], [-2, 0.38], [2, 0.42], [6, 0.48]], th: [-34, 0.2, 0.95] },
  point: { f: [[-3, 0], [0, 1], [3, 1], [6, 1]], th: [-22, 0.1, 0.85] },
  fist: { f: [[-2, 1], [0, 1], [2, 1], [4, 1]], th: [14, 0.3, 0.8], over: true },
  thumbsup: { f: [[-2, 1], [0, 1], [2, 1], [4, 1]], th: [-92, 0, 1.05] },
  hold: { f: [[-6, 0.55], [-2, 0.55], [2, 0.6], [6, 0.65]], th: [-38, 0.25, 0.9] }
};
const SW_FINGER_BASE = [[11.6, -4.4], [12.1, -1.4], [11.7, 1.6], [10.6, 4.3]];
const SW_FINGER_LEN = [9.6, 10.6, 9.9, 7.8];
const SW_FINGER_W = [3.3, 3.4, 3.2, 2.8];
/* A hand pose by name, or an already blended pose object. */
function swHandCfg(pose) {
  if (pose && typeof pose === 'object' && Array.isArray(pose.f)) return pose;
  return SW_HANDS[String(pose || 'relaxed').toLowerCase().replace(/[^a-z]/g, '')] || SW_HANDS.relaxed;
}
/* Blend two hand poses finger by finger, so gestures change without a snap. */
function swHandMix(a, b, q) {
  const A = swHandCfg(a), B = swHandCfg(b);
  if (q <= 0) return A;
  if (q >= 1) return B;
  const l = (u, v) => u + (v - u) * q;
  return {
    f: A.f.map((fa, j) => [l(fa[0], B.f[j][0]), l(fa[1], B.f[j][1])]),
    th: A.th.map((v, j) => l(v, B.th[j])),
    over: q < 0.5 ? !!A.over : !!B.over
  };
}
function swHandGeom(pose) {
  const cfg = swHandCfg(pose);
  const base = new Path2D();
  base.moveTo(-1.5, -4.5);
  base.bezierCurveTo(3, -5.6, 8, -6.4, 11.8, -5.8);
  base.bezierCurveTo(13.4, -3, 13.4, 2.8, 11.6, 5.6);
  base.bezierCurveTo(8, 6.9, 3, 6.0, -1.5, 4.6);
  base.bezierCurveTo(-3, 1.5, -3, -1.5, -1.5, -4.5);
  base.closePath();
  const tips = [], stubs = [];
  for (let j = 0; j < 4; j++) {
    const ad = cfg.f[j][0], c = cfg.f[j][1];
    let a = ad * Math.PI / 180;
    const L = SW_FINGER_LEN[j] * (1 - 0.6 * c), w = SW_FINGER_W[j];
    const bend = c < 0.85 ? c * 0.45 : 0.1;
    const p0 = SW_FINGER_BASE[j].slice();
    const pts = [p0];
    const segs = [0.45, 0.32, 0.23];
    let p = p0;
    for (let s = 0; s < 3; s++) {
      p = [p[0] + Math.cos(a) * L * segs[s], p[1] + Math.sin(a) * L * segs[s]];
      pts.push(p);
      a += bend;
    }
    const ws = c >= 0.85 ? [w * 1.08, w * 1.1, w * 1.08, w * 1.02] : [w, w * 0.97, w * 0.9, w * 0.82];
    swEnvelope(pts, ws, { path: base });
    tips.push({ p, a: a - bend, w, c });
    if (c >= 0.85) stubs.push({ p, a: a - bend, w });
  }
  const tc = cfg.th;
  const ta = tc[0] * Math.PI / 180, tl = 8.6 * tc[2] * (1 - 0.45 * tc[1]);
  const t0 = [3.6, -4.0], t1 = [t0[0] + Math.cos(ta) * tl * 0.55, t0[1] + Math.sin(ta) * tl * 0.55];
  const ta2 = ta + tc[1] * 0.6;
  const t2 = [t1[0] + Math.cos(ta2) * tl * 0.45, t1[1] + Math.sin(ta2) * tl * 0.45];
  let over = null;
  if (cfg.over) {
    over = swEnvelope([[4.5, -4.6], [8.5, -2.6], [12.5, -0.6]], [4.2, 3.9, 3.3]);
  } else {
    swEnvelope([t0, t1, t2], [4.4, 3.9, 3.2], { path: base });
  }
  return { base, over, tips, stubs, thumbTip: t2, thumbAngle: ta2 };
}
function swHandDetails(ctx, g, skin, shade) {
  ctx.save();
  ctx.lineCap = 'round';
  /* Finger separations at the knuckles where neighbours are extended. */
  ctx.strokeStyle = swMix(shade, skin, 0.25);
  ctx.lineWidth = 0.7;
  for (let j = 0; j < 3; j++) {
    const a = g.tips[j], b = g.tips[j + 1];
    if (a.c > 0.6 || b.c > 0.6) continue;
    const y = (SW_FINGER_BASE[j][1] + SW_FINGER_BASE[j + 1][1]) / 2;
    ctx.beginPath(); ctx.moveTo(11.4, y); ctx.lineTo(13.6, y); ctx.stroke();
  }
  /* Folded fingers: a crease across each knuckle stub. */
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = shade;
  for (const s of g.stubs) {
    const cx = s.p[0] - Math.cos(s.a) * 1.2, cy = s.p[1] - Math.sin(s.a) * 1.2;
    const nx = -Math.sin(s.a), ny = Math.cos(s.a);
    ctx.beginPath();
    ctx.moveTo(cx - nx * s.w * 0.42, cy - ny * s.w * 0.42);
    ctx.quadraticCurveTo(cx + Math.cos(s.a) * 1.1, cy + Math.sin(s.a) * 1.1, cx + nx * s.w * 0.42, cy + ny * s.w * 0.42);
    ctx.stroke();
  }
  /* Nails on extended fingers. */
  ctx.fillStyle = swMix(skin, '#FFFFFF', 0.35);
  ctx.globalAlpha *= 0.75;
  for (const t of g.tips) {
    if (t.c > 0.3) continue;
    ctx.save();
    ctx.translate(t.p[0] - Math.cos(t.a) * 1.6, t.p[1] - Math.sin(t.a) * 1.6);
    ctx.rotate(t.a);
    ctx.beginPath(); ctx.ellipse(0, 0, 1.4, t.w * 0.26, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  ctx.restore();
}
function swHandMatrix(x, y, ang, s, flip) {
  return new DOMMatrix().translate(x, y).rotate(ang * 180 / Math.PI).scale(s, s * (flip ? -1 : 1));
}

/* --- Head --------------------------------------------------------------- */
function swHeadDims(turn) {
  return { rxL: 26 + turn * 1.5, rxR: 26 - turn * 2.5, chinX: turn * 5, topX: turn * 1.5 };
}
function swHeadPath(d) {
  const { rxL, rxR, chinX, topX } = d;
  const p = new Path2D();
  p.moveTo(topX, -35);
  p.bezierCurveTo(topX + 15, -35, rxR, -25, rxR, -7);
  p.bezierCurveTo(rxR, 5, rxR - 2, 13, rxR - 7, 20);
  p.bezierCurveTo(rxR - 12, 27, chinX + 8, 31, chinX, 31);
  p.bezierCurveTo(chinX - 8, 31, -rxL + 12, 27, -rxL + 7, 20);
  p.bezierCurveTo(-rxL + 2, 13, -rxL, 5, -rxL, -7);
  p.bezierCurveTo(-rxL, -25, topX - 15, -35, topX, -35);
  p.closePath();
  return p;
}
function swEar(ctx, x, y, side, skin, shade) {
  const p = new Path2D();
  p.moveTo(x + side * 1, y - 7);
  p.bezierCurveTo(x + side * 6.5, y - 9.5, x + side * 8.5, y + 1, x + side * 5, y + 6.5);
  p.bezierCurveTo(x + side * 3.2, y + 9.5, x + side * 0.5, y + 8.5, x - side * 0.5, y + 6);
  p.closePath();
  swCel(ctx, p, skin, { shade, depth: 0.6 });
  ctx.save();
  ctx.strokeStyle = shade;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x + side * 2.2, y - 4);
  ctx.bezierCurveTo(x + side * 5.6, y - 4.6, x + side * 5.8, y + 2, x + side * 3.2, y + 4.2);
  ctx.stroke();
  ctx.restore();
}
function swEye(ctx, cx, cy, ew, eh, open, gx, gy, iris, lash, skin, squint, outer) {
  const o = ecClamp(open, 0, 1.4);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (o < 0.14) {
    ctx.strokeStyle = lash;
    ctx.lineWidth = 1.9;
    ctx.beginPath();
    ctx.moveTo(cx - ew, cy);
    ctx.quadraticCurveTo(cx, cy + eh * 0.55, cx + ew, cy);
    ctx.stroke();
    ctx.restore();
    return;
  }
  const up = eh * 1.3 * o, dn = eh * Math.min(1, o);
  const p = new Path2D();
  p.moveTo(cx - ew, cy);
  p.bezierCurveTo(cx - ew * 0.5, cy - up, cx + ew * 0.5, cy - up, cx + ew, cy);
  p.bezierCurveTo(cx + ew * 0.5, cy + dn, cx - ew * 0.5, cy + dn, cx - ew, cy);
  p.closePath();
  ctx.fillStyle = '#FBFBFE';
  ctx.fill(p);
  ctx.save();
  ctx.clip(p);
  const ir = eh * 0.98;
  const ix = cx + ecClamp(gx, -1, 1) * ew * 0.42, iy = cy + ecClamp(gy, -1, 1) * eh * 0.38 + 0.3;
  const g = ctx.createRadialGradient(ix, iy - ir * 0.25, ir * 0.1, ix, iy, ir);
  g.addColorStop(0, swShade(iris, 0.35));
  g.addColorStop(1, swShade(iris, -0.2));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(ix, iy, ir, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#0A0A12';
  ctx.beginPath(); ctx.arc(ix, iy, ir * 0.48, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(ix - ir * 0.34 * swLightX, iy - ir * 0.36, ir * 0.27, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha *= 0.8;
  ctx.beginPath(); ctx.arc(ix + ir * 0.3 * swLightX, iy + ir * 0.32, ir * 0.12, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha /= 0.8;
  /* The upper lid casts a soft shadow on the eyeball. */
  ctx.fillStyle = 'rgba(60,30,40,0.16)';
  ctx.fillRect(cx - ew, cy - up - 1, ew * 2, up * 0.5 + 1);
  if (squint > 0.01) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.ellipse(cx, cy + dn + eh * 1.5 - squint * eh * 1.9, ew * 1.3, eh * 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = lash;
  ctx.lineWidth = 2.1;
  ctx.beginPath();
  ctx.moveTo(cx - ew, cy + 0.2);
  ctx.bezierCurveTo(cx - ew * 0.5, cy - up, cx + ew * 0.5, cy - up, cx + ew, cy + 0.2);
  ctx.moveTo(cx + outer * ew, cy + 0.2);
  ctx.lineTo(cx + outer * (ew + 1.2), cy - 0.9);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90,40,40,0.28)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - ew * 0.7, cy + dn * 0.72);
  ctx.quadraticCurveTo(cx, cy + dn * 1.05, cx + ew * 0.7, cy + dn * 0.72);
  ctx.stroke();
  ctx.restore();
}
function swBrow(ctx, cx, cy, ew, raise, tilt, outer, color) {
  const inner = cx - outer * ew * 0.95, out = cx + outer * ew * 1.2;
  const base = cy - 9.6 - raise * 3.4;
  const pts = swSpline([[inner, base + tilt * 3], [cx + outer * ew * 0.15, base - 1.8 - raise * 0.7], [out, base - tilt * 0.8 + 0.8]], 5);
  const ws = pts.map((_, i) => { const t = i / (pts.length - 1); return 3.3 - 2.0 * t * t; });
  const p = swEnvelope(pts, ws);
  ctx.fillStyle = color;
  ctx.fill(p);
}

/* Front hair styles share a crown cap; each adds its own hairline. */
function swHairCap(p, d, vol, lean, tl, tr) {
  p.moveTo(-d.rxL - tl, 1);
  p.bezierCurveTo(-d.rxL - 2.5 - vol * 0.2, -24 - vol * 0.6, lean - 15, -37 - vol, lean, -37 - vol);
  p.bezierCurveTo(lean + 15, -37 - vol, d.rxR + 2.5 + vol * 0.2, -24 - vol * 0.6, d.rxR + tr, 1);
}
function swHairBack(ctx, style, d, turn, color, lagX, lagY) {
  const c = swShade(color, -0.18);
  ctx.save();
  if (style === 'wavy' || style === 'long') {
    const p = new Path2D();
    const L = -d.rxL - 3, R = d.rxR + 3;
    p.moveTo(L, -12);
    p.bezierCurveTo(L - 6, 10, L - 4 + lagX * 0.5, 38, L + 1 + lagX, 60 + lagY);
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x0 = L + 1 + (R - 1 - L - 1) * (i / n) + lagX, x1 = L + 1 + (R - 1 - L - 1) * ((i + 1) / n) + lagX;
      p.quadraticCurveTo((x0 + x1) / 2, 68 + lagY + (i % 2 ? -3 : 4), x1, 60 + lagY + (i % 2 ? 3 : -2));
    }
    p.bezierCurveTo(R + 5 + lagX * 0.6, 38, R + 6, 10, R, -12);
    p.bezierCurveTo(R, -44, L, -44, L, -12);
    p.closePath();
    swCel(ctx, p, c, { depth: 1.2 });
  } else if (style === 'curly') {
    const p = new Path2D();
    p.ellipse(0, -8, 29, 31, 0, 0, Math.PI * 2);
    for (let i = 0; i <= 11; i++) {
      const a = Math.PI * (0.92 + i * 1.16 / 11);
      p.moveTo(Math.cos(a) * 31 + 7.5 + lagX * 0.2, Math.sin(a) * 33 - 8);
      p.arc(Math.cos(a) * 31 + lagX * 0.2, Math.sin(a) * 33 - 8, 7.5, 0, Math.PI * 2);
    }
    swCel(ctx, p, c, { depth: 1.4 });
  } else if (style === 'bun') {
    const p = new Path2D();
    const bx = -7 - turn * 7 + lagX * 0.4, by = -39 + lagY * 0.4;
    p.arc(bx, by, 12, 0, Math.PI * 2);
    swCel(ctx, p, color, { depth: 1.3 });
  } else if (style !== 'bald' && style !== 'none') {
    const p = new Path2D();
    p.ellipse(-turn * 4, -9, (d.rxL + d.rxR) / 2 + 2.5, 29.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = c;
    ctx.fill(p);
  }
  ctx.restore();
}
function swHairFront(ctx, style, d, fx, turn, color, lagX, lagY) {
  if (style === 'bald' || style === 'none') return;
  const p = new Path2D();
  const sheen = [];
  if (style === 'curly') {
    swHairCap(p, d, 6, 0, 2.5, 2.5);
    p.lineTo(d.rxR - 2, -9);
    p.bezierCurveTo(d.rxR - 8, -14, -d.rxL + 8, -14, -d.rxL + 2, -9);
    p.closePath();
    for (let i = 0; i < 7; i++) {
      const t = i / 6, cx = -d.rxL + 4 + (d.rxL + d.rxR - 8) * t + lagX * 0.25;
      const cy = -10 - Math.sin(t * Math.PI) * 7 + lagY * 0.2;
      p.moveTo(cx + 5.4, cy);
      p.arc(cx, cy, 5.4, 0, Math.PI * 2);
      sheen.push([cx - 2, cy - 2.5, cx + 2, cy - 1.5]);
    }
  } else if (style === 'bun') {
    swHairCap(p, d, 1.5, 0, 1.2, 1.2);
    p.bezierCurveTo(d.rxR - 2, -14, fx + 8, -21, fx + 1, -20);
    p.bezierCurveTo(fx - 6, -21, -d.rxL + 4, -16, -d.rxL + 1, -4);
    p.lineTo(-d.rxL - 1.2, 1);
    p.closePath();
    sheen.push([fx - 10, -33, fx + 4, -36]);
  } else if (style === 'wavy' || style === 'long') {
    swHairCap(p, d, 4.5, turn * 2, 2.5, 2.5);
    p.bezierCurveTo(d.rxR + 2, -8, d.rxR - 2, -18, fx + 12, -20);
    p.bezierCurveTo(fx, -24, fx - 14, -18, -d.rxL + 6, -8);
    p.lineTo(-d.rxL - 2.5, 1);
    p.closePath();
    const lock = (x0, side) => {
      const pts = swSpline([[x0, -6], [x0 + side * 2 + lagX * 0.3, 8], [x0 - side * 1 + lagX * 0.6, 20 + lagY * 0.3], [x0 + side * 1.5 + lagX, 33 + lagY * 0.5]], 4);
      swEnvelope(pts, pts.map((_, i) => 8.5 - 6.5 * (i / (pts.length - 1)) ** 1.4), { path: p });
    };
    lock(-d.rxL - 0.5, -1);
    if (turn < 0.6) lock(d.rxR + 0.5, 1);
    sheen.push([fx - 14, -32, fx + 6, -36]);
  } else if (style === 'short' || style === 'buzz') {
    const vol = style === 'buzz' ? 0.5 : 2.5;
    swHairCap(p, d, vol, turn * 2, 1, 1);
    p.bezierCurveTo(d.rxR - 1, -12, fx + 8 + lagX * 0.2, -17, fx, -16);
    p.bezierCurveTo(fx - 8, -15, -d.rxL + 6, -13, -d.rxL + 1, -5);
    p.lineTo(-d.rxL - 1, 1);
    p.closePath();
    sheen.push([fx - 10, -32, fx + 6, -34]);
  } else {
    /* modern: a swept quiff with volume over the face side. */
    const lean = 3 + turn * 3 + lagX * 0.5;
    swHairCap(p, d, 7, lean, 1.5, 1.2);
    p.bezierCurveTo(d.rxR - 1, -10, d.rxR - 5, -18, fx + 10 + lagX * 0.6, -21 + lagY * 0.3);
    p.bezierCurveTo(fx + 2, -23, fx - 10, -18, fx - 14, -14);
    p.bezierCurveTo(fx - 18, -11, -d.rxL + 6, -13, -d.rxL + 2, -6);
    p.lineTo(-d.rxL - 1.5, 1);
    p.closePath();
    sheen.push([lean - 12, -38, lean + 8, -42], [lean - 2, -33, lean + 14, -32]);
  }
  swCel(ctx, p, color, { shade: swShade(color, -0.28), light: swShade(color, 0.16), depth: 1.4 });
  ctx.save();
  ctx.clip(p);
  ctx.strokeStyle = swShade(color, 0.3);
  ctx.globalAlpha *= 0.55;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  for (const s of sheen) {
    ctx.beginPath();
    ctx.moveTo(s[0], s[1]);
    ctx.quadraticCurveTo((s[0] + s[2]) / 2, Math.min(s[1], s[3]) - 2.5, s[2], s[3]);
    ctx.stroke();
  }
  ctx.restore();
}

const SW_EMOTIONS = {
  neutral: { lid: 1, brow: 0, browTilt: 0, smile: 0.25, blush: 0.12, squint: 0 },
  happy: { lid: 0.92, brow: 0.35, browTilt: -0.1, smile: 0.85, blush: 0.4, squint: 0.32 },
  excited: { lid: 1.12, brow: 0.9, browTilt: -0.2, smile: 1, blush: 0.5, squint: 0.08 },
  thinking: { lid: 0.84, brow: 0.3, browTilt: 0.1, smile: -0.05, blush: 0.06, squint: 0.1, asym: 0.9 },
  surprised: { lid: 1.28, brow: 1.25, browTilt: -0.35, smile: 0, blush: 0.15, squint: 0, mouthO: 0.6 },
  focused: { lid: 0.8, brow: -0.35, browTilt: 0.5, smile: 0.05, blush: 0, squint: 0.2 },
  sad: { lid: 0.86, brow: 0.25, browTilt: -0.6, smile: -0.55, blush: 0, squint: 0 },
  confident: { lid: 0.9, brow: 0.1, browTilt: 0.1, smile: 0.6, blush: 0.15, squint: 0.2, asym: 0.4 }
};

Object.assign(SWDraw, {
  cel: swCel,
  envelope: (pts, widths, o) => swEnvelope(pts, widths, o),
  spline: swSpline,
  /* Variable-width (tapered) stroke through control points. */
  taper: (ctx, pts, w0, w1, color, o) => {
    if (!Array.isArray(pts) || pts.length < 2) return;
    const sp = swSpline(pts.map(p => Array.isArray(p) ? p : [p.x, p.y]), 8);
    const ws = sp.map((_, i) => { const t = i / (sp.length - 1); return w0 + (w1 - w0) * t; });
    const p = swEnvelope(sp, ws, o);
    ctx.save();
    ctx.fillStyle = color || '#F8FAFC';
    ctx.fill(p);
    ctx.restore();
    return p;
  },
  /* Anatomical two-bone limb: closed Bézier envelope with muscle profile,
     optional sleeve over [0, sleeve.end], cel shaded. S, E, Wr are points. */
  anatomicalLimb: (ctx, S, E, Wr, o) => {
    o = o || {};
    const prof = Array.isArray(o.profile) ? o.profile : (o.profile === 'leg' ? SW_LEG : SW_ARM);
    const P = q => Array.isArray(q) ? q : [q.x, q.y];
    const s = P(S), e = P(E), w = P(Wr);
    const skin = swLimbPath(s, e, w, prof, 2, 0);
    swCel(ctx, skin, o.color || '#F2C4A2', { shade: o.shade });
    if (o.sleeve) {
      const sl = swLimbPath(s, e, w, prof, ecN(o.sleeve.end, 1.9), ecN(o.sleeve.extra, 3.5));
      swCel(ctx, sl, o.sleeve.color || '#1E293B', { shade: o.sleeve.shade });
    }
    return skin;
  },
  /* An articulated hand at wrist (x, y) pointing along `angle` (radians).
     pose: open | wave | relaxed | point | fist | thumbsUp | hold. */
  hand: (ctx, x, y, angle, pose, o) => {
    o = o || {};
    const skin = o.skin || o.color || '#F2C4A2', shade = o.shade || swMix(skin, '#8A3B32', 0.3);
    const g = swHandGeom(pose);
    const s = ecN(o.size, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle || 0);
    ctx.scale(s, s * (o.flip ? -1 : 1));
    swCel(ctx, g.base, skin, { shade, depth: 0.5 });
    if (g.over) swCel(ctx, g.over, skin, { shade, depth: 0.5 });
    swHandDetails(ctx, g, skin, shade);
    ctx.restore();
    return g;
  },
  /* Viseme for the spoken word at `time`: the letter under the playhead
     picks a mouth shape (A/E/O/U/M/F/S/L), blended into the next one and
     eased open/closed at the word's edges. */
  viseme: (words, time) => {
    const w = SWDraw.activeWord(words, time);
    if (!w) return Object.assign({ key: 'rest' }, SW_VIS.rest);
    const cls = [];
    for (const ch of Array.from(String(w.text || '').toLowerCase())) {
      const c = swVisClass(ch);
      if (c && cls[cls.length - 1] !== c) cls.push(c);
    }
    if (!cls.length) return Object.assign({ key: 'rest' }, SW_VIS.rest);
    const n = cls.length, f = ecClamp(w.prog, 0, 0.9999) * n, i = Math.floor(f), q = f - i;
    const bq = q > 0.55 ? (q - 0.55) / 0.45 : 0;
    const out = swVisBlend(SW_VIS[cls[i]], SW_VIS[cls[Math.min(n - 1, i + 1)]], bq * bq * (3 - 2 * bq));
    const env = ecClamp(Math.min(w.prog / 0.12, (1 - w.prog) / 0.12), 0, 1);
    out.open *= Math.sqrt(env);
    out.key = cls[i];
    return out;
  },
  /* A mouth at (cx, cy) from viseme params plus a smile (-1..1). */
  mouth: (ctx, cx, cy, vis, o) => {
    o = o || {};
    const v = Object.assign({}, SW_VIS.rest, vis || {});
    const sc = ecN(o.scale, 1), skin = o.skin || '#F2C4A2';
    const lip = o.lip || swMix(skin, '#B4485A', 0.55);
    const sm = ecClamp(ecN(o.smile, 0.2), -1, 1);
    const mw = 9.5 * v.width * sc * (1 - 0.15 * v.round), oh = 12 * v.open;
    const cy0 = cy - sm * 3.2 * (1 - v.round);
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (oh < 0.9) {
      const w = mw * (1 - 0.2 * v.press);
      ctx.strokeStyle = swMix(lip, '#2A0E16', 0.35);
      ctx.lineWidth = 2.1 + v.press * 1.1;
      ctx.beginPath();
      ctx.moveTo(cx - w, cy0);
      ctx.quadraticCurveTo(cx, cy + sm * 3.6, cx + w, cy0);
      ctx.stroke();
      if (sm > 0.45) {
        ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(cx - w - 1.2, cy0 - 1.4); ctx.lineTo(cx - w + 0.4, cy0 + 0.6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx + w + 1.2, cy0 - 1.4); ctx.lineTo(cx + w - 0.4, cy0 + 0.6); ctx.stroke();
      }
      ctx.strokeStyle = swMix(skin, '#FFFFFF', 0.25);
      ctx.globalAlpha *= 0.6;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx - w * 0.35, cy + 3.6 + sm * 2);
      ctx.quadraticCurveTo(cx, cy + 4.6 + sm * 2.2, cx + w * 0.35, cy + 3.6 + sm * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }
    const kx = 0.55 + 0.25 * v.round;
    const top = cy - oh * 0.42 - sm * 0.8, bot = cy + oh * 0.9 + sm * 1.4;
    const p = new Path2D();
    p.moveTo(cx - mw, cy0);
    p.bezierCurveTo(cx - mw * kx, top, cx + mw * kx, top, cx + mw, cy0);
    p.bezierCurveTo(cx + mw * (kx + 0.05), bot, cx - mw * (kx + 0.05), bot, cx - mw, cy0);
    p.closePath();
    ctx.fillStyle = '#3E0E1C';
    ctx.fill(p);
    ctx.save();
    ctx.clip(p);
    if (v.tongue > 0.05) {
      ctx.fillStyle = '#D9576E';
      const ty = v.key === 'L' ? top + oh * 0.45 : bot - oh * 0.18;
      ctx.beginPath();
      ctx.ellipse(cx, ty, mw * 0.62, Math.max(1.5, oh * 0.32 * (0.5 + v.tongue * 0.5)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    if (v.teeth > 0.05) {
      ctx.fillStyle = '#FFFDF7';
      const th = Math.min(oh * 0.55, 1.4 + 2.6 * v.teeth);
      ctx.beginPath();
      ctx.moveTo(cx - mw, top - 2);
      ctx.lineTo(cx + mw, top - 2);
      ctx.lineTo(cx + mw, top + th + 1);
      ctx.quadraticCurveTo(cx, top + th + 2.2, cx - mw, top + th + 1);
      ctx.closePath();
      ctx.fill();
      if (v.teeth > 0.8 && v.open < 0.6) {
        ctx.beginPath();
        ctx.ellipse(cx, bot + 0.6, mw * 0.7, Math.min(2.4, oh * 0.3), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    ctx.strokeStyle = lip;
    ctx.lineWidth = 1.5;
    ctx.stroke(p);
    ctx.strokeStyle = swMix(skin, '#FFFFFF', 0.3);
    ctx.globalAlpha *= 0.55;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - mw * 0.38, bot + 2.6);
    ctx.quadraticCurveTo(cx, bot + 3.8, cx + mw * 0.38, bot + 2.6);
    ctx.stroke();
    ctx.restore();
  },
  emotions: SW_EMOTIONS,

  /* Vector illustration character: anatomical skinned limbs, 3/4 head with
     headTurn/headTilt parallax, hair styles, outfits, visemes, emotions,
     articulated hands, IK pointing that docks beside a target box, and
     spring follow-through on hair and coat. Returns the world positions of
     the fingertip and head so a scene can attach callouts to them.
     Common opts: x, y (px or 0..1), scale, facing, pose (present | idle |
     point | wave | celebrate | think | explain | shrug | thumbsUp | hold |
     walk), walkAmount, pointAt ({x, y} | box | component id), pointAmount,
     pointGap, emotion, headTurn, headTilt, gaze {x, y}, hairStyle (modern |
     short | curly | bun | wavy | buzz | bald), outfit (jacket | suit |
     tshirt | hoodie), skinColor, hairColor, eyeColor, shirtColor,
     jacketColor, pantsColor, shoeColor, accentColor, glasses, bodyWidth,
     handPose / leftHandPose / rightHandPose, leftHand / rightHand, lookAt
     ({x, y} | component id), gestures (false stops the word-stress beats),
     label.
     Over time: pose and emotion take [[t, name], ...] and crossfade over
     poseBlend seconds (default 0.45) from each stop; the numeric options in
     SW_CHAR_KEYED take [[t, v], ...]. Stops are in the component's local
     time. A keyframed x also drives facing and the hair/coat drag. */
  character: (ctx, opts) => {
    opts = Object.assign({}, opts || {});
    const time = ecN(opts.time, 0);
    const lt = ecN(opts.localTime, time);
    const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920);
    const nrmX = v => (v <= 1.5 && v >= -0.5 ? v * W : v), nrmY = v => (v <= 1.5 && v >= -0.5 ? v * H : v);
    const xKeys = Array.isArray(opts.x) ? opts.x : null;
    for (const key of SW_CHAR_KEYED) if (Array.isArray(opts[key])) opts[key] = swAnim(opts[key], lt, undefined);
    if (xKeys && opts.vx == null) {
      const xa = nrmX(ecN(swAnim(xKeys, lt - 0.05, 0), 0)), xb = nrmX(ecN(swAnim(xKeys, lt + 0.05, 0), 0));
      opts.vx = (xb - xa) / 0.1;
    }
    const x = nrmX(ecN(opts.x, 0.22));
    const y = nrmY(ecN(opts.y, 0.62));
    const sc = ecClamp(ecN(opts.scale, 1), 0.05, 20);

    /* Pose and emotion tracks: the two neighbouring stops and the blend. */
    const blendDur = Math.max(0.01, ecN(opts.poseBlend, 0.45));
    const smooth = q => q * q * (3 - 2 * q);
    const norm = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
    const track = (v, d) => {
      if (!Array.isArray(v)) return { a: v || d, b: v || d, q: 1 };
      const st = v.filter(e => Array.isArray(e) && e.length > 1).sort((p, q) => ecN(p[0], 0) - ecN(q[0], 0));
      if (!st.length) return { a: d, b: d, q: 1 };
      let i = 0;
      while (i + 1 < st.length && lt >= ecN(st[i + 1][0], 0)) i++;
      const b = st[i][1] || d;
      if (i === 0) return { a: b, b, q: 1 };
      return { a: st[i - 1][1] || d, b, q: smooth(ecClamp((lt - ecN(st[i][0], 0)) / blendDur, 0, 1)) };
    };
    const poseT = track(opts.pose, 'present');
    const poseA = norm(poseT.a), poseB = norm(poseT.b), pq = poseT.q;
    const pose = pq < 0.5 ? poseA : poseB;
    const pw = name => (poseA === name ? 1 - pq : 0) + (poseB === name ? pq : 0);
    const outfit = String(opts.outfit || 'jacket').toLowerCase();
    const skin = opts.skinColor || '#F2C4A2';
    const skinSh = opts.skinShade || swMix(skin, '#8A3B32', 0.3);
    const hairC = opts.hairColor || '#2B2233';
    const shirt = opts.shirtColor || opts.color || '#38BDF8';
    const jacket = opts.jacketColor || '#1E293B';
    const pants = opts.pantsColor || '#273449';
    const shoe = opts.shoeColor || '#F1F5F9';
    const accent = opts.accentColor || '#F59E0B';
    const suitShirt = outfit === 'suit' ? (opts.shirtColor || '#F8FAFC') : shirt;
    const irisC = opts.eyeColor || '#4A3424';
    const lash = swMix(hairC, '#0B0B14', 0.5);
    const hairStyle = String(opts.hairStyle || (opts.hair && opts.hair.style) || 'modern').toLowerCase();
    const k = ecClamp(ecN(opts.bodyWidth, 1), 0.75, 1.3);

    /* Pointing target: a point, a box, or a component id resolved by boxOf. */
    let box = null, aim = null;
    const pa = opts.pointAt || opts.target;
    if (typeof pa === 'string') {
      if (typeof opts.boxOf === 'function') box = opts.boxOf(pa);
    } else if (pa && typeof pa === 'object') {
      if (pa.w != null || pa.width != null) box = pa;
      else if (typeof pa.x === 'number' && typeof pa.y === 'number') {
        aim = { x: nrmX(pa.x), y: nrmY(pa.y) };
        if (opts.dock !== false && Array.isArray(opts.boxes)) {
          for (const b of opts.boxes) {
            if (b && Math.abs(aim.x - b.cx) <= b.w / 2 && Math.abs(aim.y - b.cy) <= b.h / 2) { box = b; break; }
          }
        }
      }
    }
    if (box && box.cx == null) box = swBox(box, W, H);
    if (box && !aim) aim = { x: box.cx, y: opts.aim === 'title' ? box.cy - box.h * 0.22 : box.cy };

    const vx0 = ecN(opts.vx, 0);
    const facing = aim ? (aim.x >= x ? 1 : -1)
      : opts.facing != null ? (ecN(opts.facing, 1) >= 0 ? 1 : -1)
      : (Math.abs(vx0) > 30 ? Math.sign(vx0) : 1);
    const toLocal = (px, py) => ({ x: (px - x) / sc * facing, y: (py - y) / sc });
    const toWorld = p => ({ x: x + p.x * sc * facing, y: y + p.y * sc });
    const ptLocal = pt => (pt && typeof pt.x === 'number' && typeof pt.y === 'number') ? toLocal(nrmX(pt.x), nrmY(pt.y)) : null;

    /* Procedural motion as a pure function of time (springs integrate it). */
    const walkAmt = ecClamp(ecN(opts.walkAmount, pw('walk')), 0, 1);
    const cad = ecN(opts.cadence, 1.6) * Math.PI;
    const celeW = pw('celebrate'), waveW = pw('wave');
    /* Word-stress beats: a head dip and a hand lift on each spoken word. */
    const beats = opts.speaking !== false && opts.gestures !== false && Array.isArray(opts.words) && opts.words.length > 0;
    const motion = t => ({
      sway: Math.sin(t * 1.25) * 0.016 + walkAmt * Math.sin(t * cad) * 0.025 + waveW * Math.sin(t * 8) * 0.01,
      bob: walkAmt * (Math.abs(Math.sin(t * cad)) * 4 - 2) - celeW * Math.abs(Math.sin(t * 5.2)) * 9,
      nod: Math.sin(t * 1.7 + 0.6) * 0.03 + celeW * Math.sin(t * 5.2) * 0.04 + (beats ? swBeat(opts.words, t) * 0.045 : 0)
    });
    const m = motion(time);
    const beat = beats ? swBeat(opts.words, time) : 0;
    const drag = walkAmt * 0.6 + ecClamp(vx0 / 400, -1, 1) * facing;
    const lagHairX = SWDraw.lag(t => { const q = motion(t); return q.sway * 140 + q.nod * 18; }, time, { freq: 2.3, damping: 0.24 }) - drag * 5;
    const lagHairY = SWDraw.lag(t => motion(t).bob, time, { freq: 2.7, damping: 0.28 });
    const lagHem = SWDraw.lag(t => motion(t).sway * 110 + walkAmt * Math.sin(t * cad) * 3, time, { freq: 1.9, damping: 0.3 }) - drag * 3;

    const breathe = Math.sin(time * 2.1) * 1.5;
    const shrug = 6 * pw('shrug');
    const GROUND = 170;
    const hipY = 22 + m.bob;
    const waistY = hipY - 26;
    const shY = -86 + m.bob - breathe * 0.5 - shrug;
    const bt = ecClamp(ecN(opts.bodyTurn, 0.3), -0.8, 0.8);
    const cxl = 7 * bt;
    const shL = -41 * k * (1 + 0.04 * bt), shR = 41 * k * (1 - 0.22 * bt);
    const wL = -27 * k * (1 + 0.03 * bt), wR = 27 * k * (1 - 0.2 * bt);
    const hL = -30 * k * (1 + 0.03 * bt), hR = 30 * k * (1 - 0.2 * bt);
    const SL = { x: shL + 10, y: shY + 10 }, SR = { x: shR - 10, y: shY + 10 };
    const HL = { x: hL + 13, y: hipY + 2 }, HR = { x: hR - 12, y: hipY + 2 };
    const lean = m.sway + walkAmt * 0.04;
    const piv = { x: cxl, y: hipY };
    const rotAbout = (p, a) => {
      const c = Math.cos(a), s = Math.sin(a), dx = p.x - piv.x, dy = p.y - piv.y;
      return { x: piv.x + dx * c - dy * s, y: piv.y + dx * s + dy * c };
    };
    const toUpper = p => rotAbout(p, -lean);
    const fromUpper = p => rotAbout(p, lean);
    const headC = { x: cxl + 2 + bt * 2, y: shY - 46 + breathe * 0.3 };

    /* Emotion and pose defaults. */
    const EMO_OF = { celebrate: 'excited', think: 'thinking', wave: 'happy', thumbsup: 'happy', present: 'happy', explain: 'happy', shrug: 'neutral' };
    const emoRec = n => Object.assign({ asym: 0, mouthO: 0 }, SW_EMOTIONS.neutral, SW_EMOTIONS[norm(n)] || {});
    const emoT = opts.emotion ? track(opts.emotion, 'neutral') : { a: EMO_OF[poseA] || 'neutral', b: EMO_OF[poseB] || 'neutral', q: pq };
    const eA = emoRec(emoT.a), eB = emoRec(emoT.b), emo = {};
    for (const key in eA) emo[key] = eA[key] + (ecN(eB[key], 0) - eA[key]) * emoT.q;
    emo.brow += beat * 0.22;

    /* Hand targets (wrist) in the upper-body frame. */
    const osc = (f, a, ph) => Math.sin(time * f + (ph || 0)) * a;
    const legPh = time * cad;
    const chin = { x: headC.x + 4, y: headC.y + 31 };
    const rig = name => {
      let tN = { x: SL.x - 5 + osc(1.3, 2) - walkAmt * Math.sin(legPh) * 30, y: SL.y + 106 - walkAmt * Math.abs(Math.sin(legPh)) * 4 };
      let tF = { x: SR.x + 7 + osc(1.3, 2, 1) + walkAmt * Math.sin(legPh) * 28, y: SR.y + 104 - walkAmt * Math.abs(Math.sin(legPh)) * 4 };
      let pN = 'relaxed', pF = 'relaxed', angN = null, angF = null;
      if (name === 'present') {
        tF = { x: SR.x + 46, y: SR.y + 56 + osc(2.2, 4) }; pF = 'open'; angF = -0.35 + osc(2.2, 0.08);
        tN = { x: SL.x + 16, y: SL.y + 88 }; pN = 'relaxed';
      } else if (name === 'point') {
        tF = { x: SR.x + 72, y: SR.y + 16 }; pF = 'point'; angF = -0.12;
      } else if (name === 'wave') {
        tF = { x: SR.x + 36, y: SR.y - 64 + osc(9, 2) }; pF = 'wave'; angF = -1.38 + Math.sin(time * 9) * 0.32;
      } else if (name === 'celebrate') {
        tN = { x: SL.x - 26, y: SL.y - 98 }; tF = { x: SR.x + 26, y: SR.y - 98 };
        pN = pF = 'fist'; angN = -1.75; angF = -1.4;
      } else if (name === 'think') {
        tN = { x: chin.x - 5, y: chin.y + 21 }; pN = 'point'; angN = -1.45;
        tF = { x: cxl - 4, y: waistY - 14 }; pF = 'relaxed'; angF = Math.PI * 0.95;
      } else if (name === 'explain') {
        tN = { x: SL.x + 24, y: SL.y + 66 + osc(2.6, 6) }; tF = { x: SR.x + 32, y: SR.y + 60 - osc(2.6, 6) };
        pN = pF = 'open'; angN = -0.55; angF = -0.4;
      } else if (name === 'shrug') {
        tN = { x: SL.x - 30, y: SL.y + 60 }; tF = { x: SR.x + 30, y: SR.y + 60 };
        pN = pF = 'open'; angN = Math.PI + 0.35; angF = -0.35;
      } else if (name === 'thumbsup') {
        tF = { x: SR.x + 30, y: SR.y + 40 }; pF = 'thumbsup'; angF = 0;
      } else if (name === 'hold') {
        tN = { x: cxl + 2, y: waistY - 8 }; tF = { x: SR.x + 18, y: waistY - 12 };
        pN = pF = 'hold'; angN = -0.2; angF = -0.45;
      }
      return { tN, tF, pN, pF, angN, angF };
    };
    const RA = rig(poseA), RB = poseB === poseA ? RA : rig(poseB);
    const lp = (a, b) => ({ x: a.x + (b.x - a.x) * pq, y: a.y + (b.y - a.y) * pq });
    let tN = lp(RA.tN, RB.tN), tF = lp(RA.tF, RB.tF);
    let pN = swHandMix(RA.pN, RB.pN, pq), pF = swHandMix(RA.pF, RB.pF, pq);
    let angN = { a: RA.angN, b: RB.angN, q: pq }, angF = { a: RA.angF, b: RB.angF, q: pq };
    const lift = beat * 7 * (pw('present') + pw('explain'));
    tF.y -= lift; tN.y -= lift * 0.6;
    const oN = ptLocal(opts.leftHand), oF = ptLocal(opts.rightHand);
    if (oN) tN = toUpper(oN);
    if (oF) tF = toUpper(oF);
    if (opts.leftHandPose) pN = opts.leftHandPose;
    if (opts.rightHandPose || opts.handPose) pF = opts.rightHandPose || opts.handPose;

    /* Pointing: the fingertip docks `pointGap` px outside the target box on
       the ray from the shoulder, and the index finger aims at the target. */
    const HS = 1.12, REACH = 23 * HS;
    let pointL = null;
    if (aim) {
      const amt = ecClamp(ecN(opts.pointAmount, 1), 0, 1), e = amt * amt * (3 - 2 * amt);
      const SRw = toWorld(fromUpper(SR));
      const F = box ? ecDockRayToBox(SRw.x, SRw.y, aim.x, aim.y, box, ecN(opts.pointGap, 26)) : aim;
      const Fl = toUpper(toLocal(F.x, F.y)), Al = toUpper(toLocal(aim.x, aim.y));
      let dx = Al.x - Fl.x, dy = Al.y - Fl.y, dl = Math.hypot(dx, dy);
      if (dl < 1) { dx = Al.x - SR.x; dy = Al.y - SR.y; dl = Math.hypot(dx, dy) || 1; }
      dx /= dl; dy /= dl;
      const wT = { x: Fl.x - dx * REACH, y: Fl.y - dy * REACH };
      tF = { x: tF.x + (wT.x - tF.x) * e, y: tF.y + (wT.y - tF.y) * e };
      const pe = smooth(ecClamp((amt - 0.3) / 0.35, 0, 1));
      pF = swHandMix(pF, 'point', pe);
      angF = { a: angF, b: 'aim', q: pe };
      pointL = { Fl, Al, amt };
    }

    /* Head turn, tilt and gaze. */
    const ht = ecClamp(opts.headTurn != null ? ecN(opts.headTurn, 0.3) : (aim ? 0.55 : 0.3) + Math.sin(time * 0.9) * 0.05, -1, 1);
    let headRot = -ecN(opts.headTilt, 0) * 0.22 + m.nod * 0.6 - 0.12 * pw('think') + 0.14 * pw('shrug');
    let gx = -ht * 0.55, gy = 0;
    if (pointL && pointL.amt > 0.3) {
      const vx = pointL.Al.x - headC.x, vy = pointL.Al.y - headC.y, vl = Math.hypot(vx, vy) || 1;
      gx = vx / vl; gy = vy / vl * 0.9;
      headRot += ecClamp(Math.atan2(vy, Math.abs(vx)) * 0.28, -0.2, 0.2) * pointL.amt;
    }
    const thinkW = pw('think');
    gx += (0.45 - gx) * thinkW; gy += (-0.8 - gy) * thinkW;
    /* lookAt: a point or a component id the eyes (and a little of the head)
       turn toward; 'viewer' looks straight out of the frame. */
    let look = null;
    if (opts.lookAt === 'viewer' || opts.lookAt === 'camera') { gx = 0; gy = 0; }
    else if (typeof opts.lookAt === 'string' && typeof opts.boxOf === 'function') {
      const lb = opts.boxOf(opts.lookAt);
      if (lb && lb.cx != null) look = { x: lb.cx, y: lb.cy };
    } else if (opts.lookAt && typeof opts.lookAt.x === 'number' && typeof opts.lookAt.y === 'number') {
      look = { x: nrmX(opts.lookAt.x), y: nrmY(opts.lookAt.y) };
    }
    if (look) {
      const L = toUpper(toLocal(look.x, look.y));
      const vx = L.x - headC.x, vy = L.y - headC.y, vl = Math.hypot(vx, vy) || 1;
      gx = vx / vl; gy = vy / vl * 0.9;
      headRot += ecClamp(Math.atan2(vy, Math.abs(vx)) * 0.2, -0.15, 0.15);
    }
    if (opts.gaze && typeof opts.gaze === 'object') { gx = ecN(opts.gaze.x, gx); gy = ecN(opts.gaze.y, gy); }
    const fyTilt = -ecN(opts.headTilt, 0) * 4;

    /* Visemes and blinking. */
    let vis = Object.assign({}, SW_VIS.rest);
    const speaking = opts.speaking !== false && Array.isArray(opts.words) && opts.words.length;
    if (typeof opts.mouth === 'number') vis = swVisBlend(SW_VIS.rest, SW_VIS.A, ecClamp(opts.mouth, 0, 1) * 0.85);
    else if (speaking) vis = SWDraw.viseme(opts.words, time);
    if (emo.mouthO && vis.open < 0.05) vis = Object.assign(swVisBlend(SW_VIS.rest, SW_VIS.O, emo.mouthO), { key: 'O' });
    const bp = 3.8, ph = (time + 0.37) % bp;
    const blink = ph > bp - 0.16 ? Math.abs((ph - (bp - 0.08)) / 0.08) : 1;

    swLightX = facing;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc * facing, sc);
    ctx.lineJoin = 'round';

    /* Ground contact shadow. */
    const gs = ctx.createRadialGradient(cxl * 0.4, GROUND + 1, 4, cxl * 0.4, GROUND + 1, 64);
    gs.addColorStop(0, 'rgba(2,6,23,0.45)');
    gs.addColorStop(1, 'rgba(2,6,23,0)');
    ctx.fillStyle = gs;
    ctx.beginPath(); ctx.ellipse(cxl * 0.4, GROUND + 1, 64, 11, 0, 0, Math.PI * 2); ctx.fill();

    /* Legs: far leg first (darker), then pelvis + near leg as one union. */
    const ankleY = GROUND - 9;
    const foot = side => {
      const phs = legPh + (side < 0 ? 0 : Math.PI);
      const fx = (side < 0 ? -14 : 13) * k + cxl * 0.3 + walkAmt * Math.sin(phs) * 34;
      const lift = walkAmt * Math.max(0, Math.cos(phs)) * 16;
      return { x: fx, y: ankleY - lift, rot: walkAmt * Math.cos(phs) * 0.18 * (Math.cos(phs) > 0 ? 1 : 0.4) };
    };
    const fN = foot(-1), fF = foot(1);
    const legN = swIK(HL, fN, 70, 70, 1), legF = swIK(HR, fF, 70, 70, 1);
    const kneeFwd = (leg, Hj, f) => {
      /* Knees bend forward (+x) whichever IK branch scored higher. */
      const alt = SWDraw.ik2(Hj.x, Hj.y, f.x, f.y, 70, 70, -1);
      return alt.jx >= leg.jx ? alt : leg;
    };
    const lN = kneeFwd(legN, HL, fN), lF = kneeFwd(legF, HR, fF);
    const shoePath = (f) => {
      const p = new Path2D();
      const c = Math.cos(f.rot), s = Math.sin(f.rot);
      const P = (px, py) => [f.x + px * c - py * s, f.y + px * s + py * c];
      const mv = (px, py) => { const q = P(px, py); p.moveTo(q[0], q[1]); };
      const bz = (a, b, d, e, g, h) => { const q1 = P(a, b), q2 = P(d, e), q3 = P(g, h); p.bezierCurveTo(q1[0], q1[1], q2[0], q2[1], q3[0], q3[1]); };
      mv(-8, -6);
      bz(3, -8, 10, -3.5, 19, -0.5);
      bz(30, 1.5, 30, 10, 23, 10);
      p.lineTo(...P(-7, 10));
      bz(-12, 10, -12, -3.5, -8, -6);
      p.closePath();
      return { p, P };
    };
    const drawShoe = (f, dim) => {
      const s = shoePath(f);
      const base = dim ? swShade(shoe, -0.12) : shoe;
      swCel(ctx, s.p, base, { depth: 0.8 });
      ctx.save();
      ctx.clip(s.p);
      ctx.strokeStyle = swShade(shoe, -0.35);
      ctx.lineWidth = 3;
      const a = s.P(-10, 9.2), b = s.P(26, 9.2);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.6;
      const c1 = s.P(-2, 2), c2 = s.P(9, 0.5);
      ctx.beginPath(); ctx.moveTo(c1[0], c1[1]); ctx.lineTo(c2[0], c2[1]); ctx.stroke();
      ctx.restore();
    };
    const pantsFar = swShade(pants, -0.12);
    const legFarPath = swLimbPath([HR.x, HR.y], [lF.jx, lF.jy], [lF.ex, lF.ey], SW_LEG, 2, 0);
    swCel(ctx, legFarPath, pantsFar, { depth: 1.2 });
    drawShoe(fF, true);
    const pelvis = new Path2D();
    pelvis.moveTo(hL + 1, hipY - 14);
    pelvis.lineTo(hR - 1, hipY - 14);
    pelvis.bezierCurveTo(hR + 1, hipY + 4, hR - 2, hipY + 18, hR - 9, hipY + 22);
    pelvis.lineTo(cxl + 2, hipY + 24);
    pelvis.lineTo(hL + 9, hipY + 22);
    pelvis.bezierCurveTo(hL + 1, hipY + 18, hL - 1, hipY + 4, hL + 1, hipY - 14);
    pelvis.closePath();
    swLimbPath([HL.x, HL.y], [lN.jx, lN.jy], [lN.ex, lN.ey], SW_LEG, 2, 0, pelvis);
    swCel(ctx, pelvis, pants, { depth: 1.2 });
    drawShoe(fN, false);

    /* Upper body (torso, arms, head) leans about the hips. */
    ctx.save();
    ctx.translate(piv.x, piv.y);
    ctx.rotate(lean);
    ctx.translate(-piv.x, -piv.y);

    const drawArm = (S, T, side, handPose, handAng, sleeveCol, dim) => {
      const arm = swIK(S, T, 60, 56, side);
      const s = [S.x, S.y], e = [arm.jx, arm.jy], w = [arm.ex, arm.ey];
      /* A hand angle: radians, 'aim' (toward the pointing target), null
         (follow the forearm) or a blend {a, b, q} of two of those. */
      const resolve = v => {
        if (v && typeof v === 'object') {
          const a = resolve(v.a), b = resolve(v.b), d = b - a;
          return a + Math.atan2(Math.sin(d), Math.cos(d)) * ecClamp(ecN(v.q, 1), 0, 1);
        }
        if (v === 'aim' && pointL) return Math.atan2(pointL.Al.y - arm.ey, pointL.Al.x - arm.ex);
        return typeof v === 'number' && isFinite(v) ? v : arm.a2 + 0.08 * side;
      };
      const ang = resolve(handAng);
      /* Never mirror: a mirrored hand would wind against the arm and punch
         a hole in the skin union. */
      const flip = false;
      const g = swHandGeom(handPose);
      const skinBase = dim ? swShade(skin, -0.08) : skin;
      const skinPath = swLimbPath(s, e, w, SW_ARM, 2, 0);
      skinPath.addPath(g.base, swHandMatrix(w[0], w[1], ang, HS, flip));
      swCel(ctx, skinPath, skinBase, { shade: skinSh });
      ctx.save();
      ctx.translate(w[0], w[1]);
      ctx.rotate(ang);
      ctx.scale(HS, HS * (flip ? -1 : 1));
      if (g.over) swCel(ctx, g.over, skinBase, { shade: skinSh, depth: 0.5 });
      swHandDetails(ctx, g, skinBase, skinSh);
      ctx.restore();
      /* Sleeve over the arm, with a cuff and elbow folds when bent. */
      const sEnd = outfit === 'tshirt' ? 0.55 : 1.86;
      const extra = outfit === 'tshirt' ? 4.5 : 3.6;
      const slv = swLimbPath(s, e, w, SW_ARM, sEnd, extra);
      const slvCol = dim ? swShade(sleeveCol, -0.1) : sleeveCol;
      swCel(ctx, slv, slvCol, { depth: 1.1 });
      const ux = e[0] - s[0], uy = e[1] - s[1], lx = w[0] - e[0], ly = w[1] - e[1];
      const bend = Math.abs(Math.atan2(ux * ly - uy * lx, ux * lx + uy * ly));
      ctx.save();
      ctx.clip(slv);
      if (sEnd > 1 && bend > 0.3) {
        const mx = (s[0] + w[0]) / 2 - e[0], my = (s[1] + w[1]) / 2 - e[1], ml = Math.hypot(mx, my) || 1;
        const ix = e[0] + mx / ml * 4, iy = e[1] + my / ml * 4;
        const ao = ctx.createRadialGradient(ix, iy, 0, ix, iy, 8);
        ao.addColorStop(0, swShade(slvCol, -0.3));
        ao.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.globalAlpha *= ecClamp(bend / 1.4, 0, 1) * 0.5;
        ctx.fillStyle = ao;
        ctx.fillRect(ix - 14, iy - 14, 28, 28);
        ctx.strokeStyle = swShade(slvCol, -0.4);
        ctx.lineWidth = 1.3;
        ctx.lineCap = 'round';
        const nx = -my / ml, ny = mx / ml;
        for (let f = -1; f <= 1; f += 2) {
          const ox = ix + nx * f * 3.5 - mx / ml * 2, oy = iy + ny * f * 3.5 - my / ml * 2;
          ctx.beginPath();
          ctx.moveTo(ox - mx / ml * 5, oy - my / ml * 5);
          ctx.quadraticCurveTo(ox + nx * f * 2, oy + ny * f * 2, ox + mx / ml * 1, oy + my / ml * 1);
          ctx.stroke();
        }
      }
      ctx.restore();
      /* Cuff / hem band at the sleeve end. */
      const se = sEnd <= 1 ? [s[0] + ux * sEnd, s[1] + uy * sEnd] : [e[0] + lx * (sEnd - 1), e[1] + ly * (sEnd - 1)];
      const da = sEnd <= 1 ? Math.atan2(uy, ux) : Math.atan2(ly, lx);
      const hw = (swProfile(SW_ARM, sEnd) + extra) / 2;
      ctx.save();
      ctx.strokeStyle = outfit === 'suit' ? suitShirt : outfit === 'jacket' ? shirt : swShade(slvCol, -0.3);
      ctx.lineWidth = outfit === 'jacket' || outfit === 'suit' ? 2.6 : 1.6;
      ctx.lineCap = 'round';
      const cx2 = se[0] + Math.cos(da) * 0.6, cy2 = se[1] + Math.sin(da) * 0.6;
      ctx.beginPath();
      ctx.moveTo(cx2 - Math.sin(da) * (hw - 1.2), cy2 + Math.cos(da) * (hw - 1.2));
      ctx.lineTo(cx2 + Math.sin(da) * (hw - 1.2), cy2 - Math.cos(da) * (hw - 1.2));
      ctx.stroke();
      ctx.restore();
      const tipLocal = { x: w[0] + Math.cos(ang) * REACH, y: w[1] + Math.sin(ang) * REACH };
      return { arm, tip: tipLocal, ang };
    };

    const sleeveColor = outfit === 'tshirt' || outfit === 'hoodie' ? shirt : jacket;
    const torsoColor = sleeveColor;
    const hd = swHeadDims(ht);

    /* Long hair and buns sit behind the body. */
    if (hairStyle === 'wavy' || hairStyle === 'long' || hairStyle === 'curly') {
      ctx.save();
      ctx.translate(headC.x, headC.y);
      ctx.rotate(headRot);
      swHairBack(ctx, hairStyle, hd, ht, hairC, lagHairX, lagHairY);
      ctx.restore();
    }

    /* Far arm behind the torso (it is the pointing arm). */
    const farArm = drawArm(SR, tF, 1, pF, angF, sleeveColor, true);

    /* Hood rests behind the neck. */
    const nY = shY - 3, nL = cxl - 8.5, nR = cxl + 8.5;
    if (outfit === 'hoodie') {
      const hood = new Path2D();
      hood.moveTo(nL - 15, nY + 8);
      hood.bezierCurveTo(nL - 17, nY - 12, nR + 15, nY - 12, nR + 14, nY + 8);
      hood.bezierCurveTo(nR + 4, nY + 13, nL - 4, nY + 13, nL - 15, nY + 8);
      hood.closePath();
      swCel(ctx, hood, swShade(shirt, -0.14), { depth: 1.2 });
    }

    /* Torso with a hem that trails the sway (follow-through). */
    const hem = outfit === 'tshirt' ? 6 : outfit === 'hoodie' ? 9 : 14;
    const hb = hipY + hem;
    const torso = new Path2D();
    torso.moveTo(nL, nY);
    torso.bezierCurveTo(nL - 10, nY + 2, shL + 12, shY - 1, shL + 5, shY + 2);
    torso.bezierCurveTo(shL - 3, shY + 5, shL - 4, shY + 20, shL + 1, shY + 34);
    torso.bezierCurveTo(shL + 4, shY + 52, wL - 1, waistY - 22, wL, waistY);
    torso.bezierCurveTo(wL + 0.5, waistY + 10, hL + lagHem * 0.3, hipY - 8, hL - 1 + lagHem * 0.7, hb);
    if (outfit === 'jacket' || outfit === 'suit') {
      torso.lineTo(cxl - 2 + lagHem, hb + 3);
      torso.lineTo(cxl + 3 + lagHem, hb + 3);
    } else {
      torso.quadraticCurveTo(cxl + lagHem * 0.8, hb + 2, hR + 1 + lagHem * 0.7, hb);
    }
    torso.lineTo(hR + 1 + lagHem * 0.7, hb);
    torso.bezierCurveTo(hR + lagHem * 0.3, hipY - 8, wR - 0.5, waistY + 10, wR, waistY);
    torso.bezierCurveTo(wR + 1, waistY - 22, shR - 4, shY + 52, shR - 1, shY + 34);
    torso.bezierCurveTo(shR + 4, shY + 20, shR + 3, shY + 5, shR - 5, shY + 2);
    torso.bezierCurveTo(shR - 12, shY - 1, nR + 10, nY + 2, nR, nY);
    torso.closePath();
    swCel(ctx, torso, torsoColor, { depth: 1.8 });

    /* Neck with the jaw's contact shadow. */
    const neck = swEnvelope([[headC.x - 1 + ht * 2, headC.y + 16], [cxl, nY + 5]], [17, 19.5]);
    swCel(ctx, neck, skin, { shade: skinSh });
    ctx.save();
    ctx.clip(neck);
    ctx.fillStyle = swMix(skinSh, skin, 0.25);
    ctx.beginPath();
    ctx.ellipse(headC.x + ht * 3, headC.y + 26.5, 19, 8.5, headRot, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    /* Outfit details. */
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    if (outfit === 'jacket' || outfit === 'suit') {
      const suit = outfit === 'suit';
      const vEnd = suit ? shY + 50 : hb + 1;
      const v = new Path2D();
      v.moveTo(nL - 2, nY + 1);
      v.lineTo(nR + 2, nY + 1);
      v.lineTo(cxl + 10, shY + 40);
      if (suit) v.lineTo(cxl + 1, vEnd);
      else { v.lineTo(cxl + 5 + lagHem, vEnd); v.lineTo(cxl - 4 + lagHem, vEnd); }
      v.lineTo(cxl - 10, shY + 40);
      v.closePath();
      swCel(ctx, v, suitShirt, { depth: 0.9 });
      if (suit) {
        const tie = new Path2D();
        tie.moveTo(cxl - 3, nY + 3); tie.lineTo(cxl + 3, nY + 3); tie.lineTo(cxl + 2.2, nY + 8); tie.lineTo(cxl - 2.2, nY + 8); tie.closePath();
        tie.moveTo(cxl - 2.2, nY + 8); tie.lineTo(cxl + 2.2, nY + 8); tie.lineTo(cxl + 4.6, shY + 42); tie.lineTo(cxl + 0.5, shY + 49); tie.lineTo(cxl - 3.8, shY + 42); tie.closePath();
        swCel(ctx, tie, accent, { depth: 0.6 });
      } else {
        ctx.strokeStyle = swShade(shirt, -0.3);
        ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.moveTo(nL - 1, nY + 1); ctx.quadraticCurveTo(cxl, nY + 8, nR + 1, nY + 1); ctx.stroke();
      }
      const lapCol = swShade(jacket, 0.1);
      const lap = new Path2D();
      lap.moveTo(nL - 2.5, nY); lap.lineTo(cxl - 10.5, shY + 41); lap.lineTo(cxl - 17, shY + 23); lap.lineTo(nL - 10, nY + 4); lap.closePath();
      lap.moveTo(nR + 2.5, nY); lap.lineTo(cxl + 10.5, shY + 41); lap.lineTo(cxl + 15, shY + 23); lap.lineTo(nR + 8, nY + 4); lap.closePath();
      ctx.fillStyle = lapCol;
      ctx.fill(lap);
      ctx.strokeStyle = swShade(jacket, -0.35);
      ctx.lineWidth = 1.1;
      ctx.stroke(lap);
      if (suit) {
        ctx.fillStyle = swShade(jacket, -0.4);
        ctx.beginPath(); ctx.arc(cxl + 1, shY + 58, 1.6, 0, Math.PI * 2); ctx.arc(cxl + 1, shY + 72, 1.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(cxl - 30, shY + 33); ctx.lineTo(cxl - 22, shY + 33); ctx.lineTo(cxl - 25, shY + 28); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = swShade(jacket, -0.3);
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cxl - 32, shY + 33.5); ctx.lineTo(cxl - 19, shY + 33.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxl - 29, waistY + 10); ctx.lineTo(cxl - 16, waistY + 10); ctx.stroke();
    } else if (outfit === 'hoodie') {
      ctx.strokeStyle = swShade(shirt, -0.32);
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(nL - 3, nY + 2); ctx.quadraticCurveTo(cxl, nY + 10, nR + 3, nY + 2); ctx.stroke();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      const swing = lagHem * 0.25;
      ctx.beginPath(); ctx.moveTo(cxl - 4.5, nY + 7); ctx.quadraticCurveTo(cxl - 5 + swing, nY + 20, cxl - 5.5 + swing * 1.4, nY + 30); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cxl + 4.5, nY + 7); ctx.quadraticCurveTo(cxl + 4 + swing, nY + 18, cxl + 3.5 + swing * 1.4, nY + 27); ctx.stroke();
      ctx.strokeStyle = swShade(shirt, -0.28);
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cxl - 20, hb - 2); ctx.lineTo(cxl - 17, waistY + 2); ctx.lineTo(cxl + 17, waistY + 2); ctx.lineTo(cxl + 20, hb - 2);
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(hL + 1, hb - 3); ctx.quadraticCurveTo(cxl, hb - 1, hR, hb - 3); ctx.stroke();
    } else {
      ctx.strokeStyle = swShade(shirt, -0.3);
      ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(nL - 1.5, nY + 1); ctx.quadraticCurveTo(cxl, nY + 9, nR + 1.5, nY + 1); ctx.stroke();
      ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(hL + 1, hb - 2.5); ctx.quadraticCurveTo(cxl, hb, hR, hb - 2.5); ctx.stroke();
    }
    ctx.restore();

    /* Head: silhouette, ears, face, hair. */
    ctx.save();
    ctx.translate(headC.x, headC.y);
    ctx.rotate(headRot);
    if (!(hairStyle === 'wavy' || hairStyle === 'long' || hairStyle === 'curly')) {
      swHairBack(ctx, hairStyle, hd, ht, hairC, lagHairX, lagHairY);
    }
    const headPath = swHeadPath(hd);
    swCel(ctx, headPath, skin, { shade: skinSh, light: swMix(skin, '#FFFFFF', 0.12), depth: 1.7 });
    if (ht > -0.45) swEar(ctx, -hd.rxL + 1.5 + Math.max(0, ht) * 8, 1 + fyTilt * 0.5, -1, skin, skinSh);
    if (ht < 0.45) swEar(ctx, hd.rxR - 1.5 - Math.max(0, -ht) * 8, 1 + fyTilt * 0.5, 1, skin, skinSh);
    const fx = ht * 8, fy = fyTilt;
    const kL = 1 - 0.38 * Math.max(0, -ht) + 0.06 * Math.max(0, ht);
    const kR = 1 - 0.38 * Math.max(0, ht) + 0.06 * Math.max(0, -ht);
    const eyY = -1 + fy, exL = fx - 10.5 * kL, exR = fx + 10.5 * kR;
    if (emo.blush > 0.01) {
      for (const [bx, kk] of [[exL - 1, kL], [exR + 1, kR]]) {
        const g = ctx.createRadialGradient(bx, eyY + 10, 0, bx, eyY + 10, 7 * kk);
        g.addColorStop(0, `rgba(240,104,120,${(emo.blush * 0.5).toFixed(3)})`);
        g.addColorStop(1, 'rgba(240,104,120,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(bx, eyY + 10, 7.5 * kk, 5, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    const lid = emo.lid * blink;
    swEye(ctx, exL, eyY, 6.2 * kL, 4.6, lid, gx, gy, irisC, lash, skin, emo.squint, -1);
    swEye(ctx, exR, eyY, 6.2 * kR, 4.6, lid, gx, gy, irisC, lash, skin, emo.squint, 1);
    const browC = swMix(hairC, '#0B0B14', 0.2);
    const asym = ecN(emo.asym, 0);
    swBrow(ctx, exL, eyY, 6.2 * kL, emo.brow - asym * 0.4, emo.browTilt, -1, browC);
    swBrow(ctx, exR, eyY, 6.2 * kR, emo.brow + asym * 0.6, emo.browTilt, 1, browC);
    ctx.save();
    ctx.strokeStyle = skinSh;
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    const nx = fx + ht * 4.5, ny = 9 + fy;
    ctx.beginPath(); ctx.moveTo(nx - 0.5, ny - 7); ctx.quadraticCurveTo(nx + 3.4, ny + 0.5, nx + 0.6, ny + 2.4); ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(nx - 3, ny + 2.2); ctx.quadraticCurveTo(nx - 1, ny + 3.4, nx + 0.8, ny + 2.6); ctx.stroke();
    ctx.restore();
    SWDraw.mouth(ctx, fx + ht * 3.5, 18.5 + fy, vis, { smile: emo.smile, scale: 1 - 0.2 * Math.abs(ht), skin });
    swHairFront(ctx, hairStyle, hd, fx, ht, hairC, lagHairX, lagHairY);
    if (opts.glasses) {
      ctx.save();
      ctx.strokeStyle = typeof opts.glasses === 'string' ? opts.glasses : '#111827';
      ctx.lineWidth = 1.8;
      const fr = (cx, kk) => { ctx.beginPath(); ctx.roundRect(cx - 8.6 * kk, eyY - 6, 17.2 * kk, 12, 4); ctx.stroke(); };
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      fr(exL, kL); fr(exR, kR);
      ctx.beginPath(); ctx.moveTo(exL + 8.6 * kL, eyY - 1); ctx.quadraticCurveTo(fx, eyY - 3, exR - 8.6 * kR, eyY - 1); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(exL - 4 * kL, eyY + 3); ctx.lineTo(exL - 1 * kL, eyY - 4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(exR - 4 * kR, eyY + 3); ctx.lineTo(exR - 1 * kR, eyY - 4); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    /* Near arm in front of the body. */
    const nearArm = drawArm(SL, tN, -1, pN, angN, sleeveColor, false);

    /* When the target is out of reach, a dashed ray finishes the gesture. */
    let tipW = toWorld(fromUpper(farArm.tip));
    if (pointL && opts.showPointerRay !== false) {
      const gap = Math.hypot(pointL.Fl.x - farArm.tip.x, pointL.Fl.y - farArm.tip.y) * sc;
      if (gap > 36 && pointL.amt > 0.9) {
        ctx.save();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2.5 / sc;
        ctx.setLineDash([8 / sc, 8 / sc]);
        ctx.lineDashOffset = -time * 40 / sc;
        ctx.globalAlpha *= 0.7;
        ctx.beginPath();
        ctx.moveTo(farArm.tip.x, farArm.tip.y);
        ctx.lineTo(pointL.Fl.x, pointL.Fl.y);
        ctx.stroke();
        ctx.restore();
      }
    }
    ctx.restore();
    ctx.restore();

    if (opts.label) {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(sc, sc);
      ctx.font = '700 22px "Space Grotesk", sans-serif';
      const lw = ctx.measureText(opts.label).width + 32;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = opts.labelColor || shirt;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.roundRect(-lw / 2, GROUND + 16, lw, 38, 19); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#F8FAFC';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(opts.label, 0, GROUND + 35.5);
      ctx.restore();
    }
    return {
      facing,
      fingertip: tipW,
      nearHand: toWorld(fromUpper(nearArm.tip)),
      head: toWorld(fromUpper(headC)),
      aim, box, pose
    };
  }
});

/* The legacy two-segment limb now draws an anatomical envelope too. */
SWDraw.limb = (ctx, x1, y1, jx, jy, x2, y2, w1, w2, color, cuffColor) => {
  const a = ecN(w1, 16), b = ecN(w2, a * 0.82);
  const prof = [[0, a], [0.45, a * 0.98], [1, (a + b) / 2 * 0.86], [1.3, b * 1.05], [2, b * 0.82]];
  const p = swLimbPath([x1, y1], [jx, jy], [x2, y2], prof, 2, 0);
  swCel(ctx, p, color || '#38BDF8');
  if (cuffColor) SWDraw.hand(ctx, x2, y2, Math.atan2(y2 - jy, x2 - jx), 'relaxed', { skin: cuffColor, size: b / 10 });
};
