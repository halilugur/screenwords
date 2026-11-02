/* ==========================================================================
   Stylised characters: SWDraw.character(ctx, { style: 'flat' | 'cartoon' |
   'geo', ... }). Same options and return value as the detailed rig, drawn
   as illustration instead of anatomy:
     flat     modern editorial illustration: ~4.5 heads tall, dot-oval eyes,
              smooth rubber-hose limbs, mitten hands, one soft shade tone.
     cartoon  big head (~2.7 heads tall), large eyes with highlights, chubby
              limbs, four-finger hands, strong blush.
     geo      geometric minimal: circle head, two dot eyes, pill limbs with
              round ends, no nose or ears.
   The stance is a relaxed contrapposto: the weight leg straight under the
   hip, the free leg slightly bent and forward, hips and shoulders tilted
   against each other, breathing and a slow weight shift.
   ========================================================================== */

const SW_TOON = {
  flat: { head: [30, 33], headGap: 8, sh: -64, shW: 31, hipY: 30, hipW: 19, arm: [52, 48], armW: 15, legW: 19, hand: 1, shoe: 1, eye: 'oval', curve: true, shade: 0.14, ears: true, nose: true },
  cartoon: { head: [52, 47], headGap: 2, sh: -16, shW: 30, hipY: 66, hipW: 21, arm: [40, 37], armW: 18, legW: 22, hand: 1.2, shoe: 1.2, eye: 'big', curve: true, shade: 0.12, ears: true, nose: true },
  geo: { head: [36, 36], headGap: 9, sh: -52, shW: 28, hipY: 38, hipW: 19, arm: [50, 46], armW: 14, legW: 16, hand: 0.9, shoe: 0.9, eye: 'dot', curve: false, shade: 0, ears: false, nose: false }
};

/* Arms per pose, posed like a figure drawing rather than solved: u is the
   upper arm's angle and f the forearm's, in degrees from hanging straight
   down (+ away from the body, 180 = straight up, - across the body). Both
   respect the anatomy: the elbow only bends forward, a relaxed elbow stays
   beside the waist. r = the gesturing arm, l = the other; 'chin' reaches for
   the chin. rh/lh are hand shapes, ra/la hand angles (null follows the
   forearm), rd/ld how far the forearm comes toward the viewer (0..1) — seen
   from the front it shortens and the hand, nearer the camera, grows. */
const SW_TOON_POSES = {
  idle: { r: { u: 5, f: 3 }, l: { u: 5, f: 3 }, rh: 'relaxed', lh: 'relaxed' },
  present: { r: { u: 26, f: 74 }, l: { u: 5, f: 3 }, rh: 'open', lh: 'relaxed', ra: -0.35, rd: 0.3 },
  point: { r: { u: 75, f: 82 }, l: { u: 5, f: 3 }, rh: 'point', lh: 'relaxed', ra: -0.1 },
  wave: { r: { u: 78, f: 172 }, l: { u: 5, f: 3 }, rh: 'open', lh: 'relaxed', ra: -1.55, wave: true },
  celebrate: { r: { u: 145, f: 168 }, l: { u: 145, f: 168 }, rh: 'fist', lh: 'fist', ra: -1.5, la: -1.64 },
  think: { r: { u: 8, f: -72 }, l: 'chin', rh: 'relaxed', lh: 'point', la: -1.6, rd: 0.5 },
  explain: { r: { u: 14, f: 70 }, l: { u: 14, f: 70 }, rh: 'open', lh: 'open', ra: -0.5, la: Math.PI + 0.5, rd: 0.55, ld: 0.55 },
  shrug: { r: { u: 18, f: 94 }, l: { u: 18, f: 94 }, rh: 'open', lh: 'open', ra: -0.3, la: Math.PI + 0.3, shrug: true, rd: 0.45, ld: 0.45 },
  thumbsup: { r: { u: 16, f: 62 }, l: { u: 5, f: 3 }, rh: 'thumbsup', lh: 'relaxed', ra: 0, rd: 0.65 },
  hold: { r: { u: 10, f: -55 }, l: { u: 10, f: -55 }, rh: 'relaxed', lh: 'relaxed', ra: -0.2, la: Math.PI + 0.2, rd: 0.65, ld: 0.65 },
  walk: { r: { u: 5, f: 3 }, l: { u: 5, f: 3 }, rh: 'relaxed', lh: 'relaxed' }
};

/* Elbow or knee of a two-bone chain; `pick` scores the two solutions. */
function swToonIK(S, T, L1, L2, pick) {
  let dx = T.x - S.x, dy = T.y - S.y, d = Math.hypot(dx, dy) || 1e-6;
  const ux = dx / d, uy = dy / d;
  d = ecClamp(d, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-3);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const px = S.x + ux * a, py = S.y + uy * a;
  const j1 = { x: px - uy * h, y: py + ux * h }, j2 = { x: px + uy * h, y: py - ux * h };
  const J = pick(j1) >= pick(j2) ? j1 : j2;
  return { J, E: { x: S.x + ux * d, y: S.y + uy * d } };
}

/* A limb as a polyline: straight bones, or one smooth curve through the
   joint (rubber hose). */
function swToonLimb(S, J, E, curve) {
  if (!curve) return [[S.x, S.y], [J.x, J.y], [E.x, E.y]];
  /* A control point between the joint and its mirror keeps the bend soft
     (curve = 1 passes exactly through the joint). */
  const mx = (S.x + E.x) / 2, my = (S.y + E.y) / 2;
  const cx = J.x + (J.x - mx) * curve, cy = J.y + (J.y - my) * curve;
  const pts = [];
  for (let i = 0; i <= 14; i++) {
    const t = i / 14, u = 1 - t;
    pts.push([u * u * S.x + 2 * u * t * cx + t * t * E.x, u * u * S.y + 2 * u * t * cy + t * t * E.y]);
  }
  return pts;
}
/* Stroke the polyline from its start up to fraction f of its length. */
function swToonStroke(ctx, pts, width, color, f) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  const stop = total * ecClamp(f == null ? 1 : f, 0, 1);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  let run = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (run + seg >= stop) {
      const q = seg ? (stop - run) / seg : 0;
      ctx.lineTo(pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * q, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * q);
      break;
    }
    ctx.lineTo(pts[i][0], pts[i][1]);
    run += seg;
  }
  ctx.stroke();
}
function swToonEllipse(ctx, x, y, rx, ry, rot, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, Math.PI * 2);
  ctx.fill();
}
function swToonCapsule(ctx, x1, y1, x2, y2, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
}

/* A hand at the wrist (0, 0) pointing along +x, drawn as one silhouette:
   a rounded palm, packed fingers and a thumb from the palm's edge. `u` is
   the size unit; `thumbSide` (+1 / -1) puts the thumb on the side that
   faces the viewer. Returns the fingertip in hand space. */
const SW_TOON_HANDS = {
  /* fingers: [baseY, angle, length] index → little finger; thumb: [angle, length] */
  open: { f: [[-0.42, -0.1, 0.95], [-0.14, -0.03, 1.08], [0.14, 0.03, 1.02], [0.4, 0.1, 0.82]], th: [1.0, 0.8] },
  wave: { f: [[-0.44, -0.3, 0.95], [-0.15, -0.1, 1.08], [0.15, 0.1, 1.02], [0.42, 0.3, 0.82]], th: [1.15, 0.82] },
  relaxed: { f: [[-0.4, 0.45, 0.62], [-0.13, 0.5, 0.66], [0.13, 0.55, 0.62], [0.38, 0.6, 0.52]], th: [0.45, 0.7], curl: true },
  hold: { f: [[-0.4, 0.9, 0.58], [-0.13, 0.95, 0.6], [0.13, 1.0, 0.56], [0.38, 1.05, 0.48]], th: [0.3, 0.72], curl: true },
  point: { f: [[-0.4, -0.02, 1.2], [-0.12, 1.25, 0.34], [0.14, 1.3, 0.32], [0.38, 1.35, 0.28]], th: [0.55, 0.62], tip: 0 },
  fist: { f: [[-0.4, 1.3, 0.3], [-0.13, 1.3, 0.32], [0.13, 1.3, 0.3], [0.38, 1.3, 0.26]], th: [-0.45, 0.62], fist: true },
  thumbsup: { f: [[-0.4, 1.3, 0.3], [-0.13, 1.3, 0.32], [0.13, 1.3, 0.3], [0.38, 1.3, 0.26]], th: [1.62, 1.0], fist: true }
};
function swToonHand(ctx, shape, u, skin, shade, style, thumbSide) {
  const ts = thumbSide || -1;
  const k = String(shape || 'relaxed').toLowerCase().replace(/[^a-z]/g, '');
  const H = SW_TOON_HANDS[k] || SW_TOON_HANDS.relaxed;
  if (style === 'geo') {
    swToonEllipse(ctx, u * 0.6, 0, u * 0.95, u * 0.95, 0, skin);
    if (k === 'point') { swToonCapsule(ctx, u * 0.9, 0, u * 2.4, 0, u * 0.62, skin); return { x: u * 2.7, y: 0 }; }
    if (k === 'thumbsup') { swToonCapsule(ctx, u * 0.6, 0, u * 0.6, ts * u * 1.7, u * 0.62, skin); }
    return { x: u * 1.55, y: 0 };
  }
  const cartoon = style === 'cartoon';
  const fw = cartoon ? 0.44 : 0.36;
  const fingers = cartoon ? [H.f[0], [(H.f[1][0] + H.f[2][0]) / 2, (H.f[1][1] + H.f[2][1]) / 2, H.f[1][2]], H.f[3]] : H.f;
  ctx.save();
  ctx.scale(u, u * ts);
  ctx.fillStyle = skin;
  ctx.strokeStyle = skin;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  /* Palm: a soft rounded block, a touch wider at the knuckles. */
  const end = H.fist ? 1.12 : 1.25;
  ctx.beginPath();
  ctx.moveTo(-0.05, -0.5);
  ctx.bezierCurveTo(0.4, -0.62, 0.9, -0.66, end, -0.58);
  ctx.quadraticCurveTo(end + 0.16, 0, end, 0.56);
  ctx.bezierCurveTo(0.9, 0.66, 0.4, 0.64, -0.05, 0.52);
  ctx.closePath();
  ctx.fill();
  /* Fingers */
  const tips = [];
  ctx.lineWidth = fw;
  for (const [by, a, len] of fingers) {
    const sx = end - 0.12, ex = sx + Math.cos(a) * len, ey = by + Math.sin(a) * len;
    ctx.beginPath(); ctx.moveTo(sx, by); ctx.lineTo(ex, ey); ctx.stroke();
    tips.push([ex, ey]);
  }
  /* Thumb: from the palm's lower edge near the wrist. */
  const [ta, tl] = H.th;
  const tx0 = 0.42, ty0 = 0.4;
  ctx.lineWidth = fw * 1.12;
  ctx.beginPath(); ctx.moveTo(tx0, ty0); ctx.lineTo(tx0 + Math.cos(ta) * tl, ty0 + Math.sin(ta) * tl); ctx.stroke();
  /* A few soft lines: knuckle gaps on packed fingers, the thumb's edge on a
     fist. */
  ctx.strokeStyle = shade;
  ctx.lineWidth = 0.07;
  if (H.curl || H.fist) {
    for (let j = 0; j < fingers.length - 1; j++) {
      const y = (fingers[j][0] + fingers[j + 1][0]) / 2;
      ctx.beginPath(); ctx.moveTo(end - 0.05, y); ctx.lineTo(end + 0.28, y + 0.05); ctx.stroke();
    }
  }
  if (H.fist && ta < 0) {
    ctx.beginPath(); ctx.moveTo(tx0 + 0.15, ty0 - 0.05); ctx.quadraticCurveTo(0.8, -0.05, tx0 + Math.cos(ta) * tl, ty0 + Math.sin(ta) * tl); ctx.stroke();
  }
  ctx.restore();
  const t = H.tip != null ? tips[H.tip] : (tips[1] || tips[0]);
  const reach = fw * 0.5;
  const a0 = H.tip != null ? fingers[H.tip][1] : 0;
  return { x: (t[0] + Math.cos(a0) * reach) * u, y: (t[1] + Math.sin(a0) * reach) * u * ts };
}

/* Hair: the back layer (long styles, buns) and the front cap with its
   fringe, around a head ellipse rx × ry centred at the origin. */
function swToonHairBack(ctx, style, rx, ry, color, lagX, geo) {
  if (style === 'wavy' || style === 'long') {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-rx * 1.08, -ry * 0.2);
    ctx.quadraticCurveTo(-rx * 1.2 + lagX * 0.3, ry * 0.9, -rx * 0.9 + lagX, ry * 1.55);
    ctx.lineTo(rx * 0.9 + lagX, ry * 1.55);
    ctx.quadraticCurveTo(rx * 1.2 + lagX * 0.3, ry * 0.9, rx * 1.08, -ry * 0.2);
    ctx.closePath();
    ctx.fill();
    if (!geo) {
      ctx.strokeStyle = swShade(color, 0.12); ctx.lineWidth = 2; ctx.lineCap = 'round';
      for (const s of [-0.55, 0.55]) {
        ctx.beginPath(); ctx.moveTo(rx * s, ry * 0.3);
        ctx.quadraticCurveTo(rx * s * 1.3 + lagX * 0.5, ry * 0.9, rx * s * 1.05 + lagX, ry * 1.4); ctx.stroke();
      }
    }
  } else if (style === 'bun') {
    swToonEllipse(ctx, lagX * 0.2, -ry * 1.08, rx * 0.4, rx * 0.38, 0, color);
  }
}
function swToonHairFront(ctx, style, rx, ry, color, fx, geo) {
  if (style === 'bald' || style === 'none') return;
  ctx.fillStyle = color;
  ctx.globalAlpha *= style === 'buzz' ? 0.55 : 1;
  const cap = fringe => {
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * 1.05, ry * 1.07, 0, Math.PI * 1.03, Math.PI * 1.97);
    fringe();
    ctx.closePath();
    ctx.fill();
  };
  if (style === 'curly') {
    cap(() => ctx.quadraticCurveTo(0, -ry * 0.3, -rx * 1.02, -ry * 0.12));
    const n = geo ? 7 : 11;
    for (let i = 0; i < n; i++) {
      const a = Math.PI * (1.0 + i / (n - 1));
      swToonEllipse(ctx, Math.cos(a) * rx * 0.98, Math.sin(a) * ry * 0.98, rx * 0.27, rx * 0.27, 0, color);
    }
  } else if (style === 'wavy' || style === 'long') {
    cap(() => {
      ctx.quadraticCurveTo(rx * 0.55 + fx, -ry * 0.62, fx * 0.6, -ry * 0.72);
      ctx.quadraticCurveTo(-rx * 0.55 + fx, -ry * 0.62, -rx * 1.03, -ry * 0.08);
    });
  } else if (style === 'short' || style === 'buzz' || style === 'bun') {
    cap(() => ctx.quadraticCurveTo(fx, -ry * 0.72, -rx * 1.03, -ry * 0.2));
  } else {
    /* modern: a side-swept fringe toward the facing side */
    cap(() => {
      ctx.quadraticCurveTo(rx * 0.75, -ry * 0.28, rx * 0.15 + fx, -ry * 0.42);
      ctx.quadraticCurveTo(-rx * 0.5 + fx, -ry * 0.55, -rx * 1.03, -ry * 0.05);
    });
    if (!geo) {
      ctx.strokeStyle = swShade(color, 0.14); ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-rx * 0.5, -ry * 0.82); ctx.quadraticCurveTo(rx * 0.1, -ry * 0.7, rx * 0.55, -ry * 0.45); ctx.stroke();
    }
  }
  ctx.globalAlpha /= style === 'buzz' ? 0.55 : 1;
}

/* The face: eyes, brows, nose, mouth and blush for one style. */
function swToonFace(ctx, S, st, o) {
  const { rx, ry, ht, gx, gy, emo, vis, blink, skin, ink, eyeColor } = o;
  const fx = ht * rx * 0.24;
  const big = S.eye === 'big', dot = S.eye === 'dot';
  const eyeY = big ? ry * 0.08 : -ry * 0.04;
  const sep = rx * (big ? 0.4 : dot ? 0.36 : 0.37);
  const lid = ecClamp(emo.lid * blink * (1 - emo.squint * 0.45), 0.05, 1.4);
  for (const side of [-1, 1]) {
    const comp = 1 - 0.28 * Math.max(0, side * ht);
    const ex = fx + side * sep * comp, ey = eyeY;
    if (dot) {
      if (lid < 0.3) { ctx.strokeStyle = ink; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - 3.6, ey); ctx.lineTo(ex + 3.6, ey); ctx.stroke(); }
      else swToonEllipse(ctx, ex + gx * 1.4, ey + gy * 1.2, 3.6 * comp, 3.6 * Math.min(1.15, lid), 0, ink);
    } else if (big) {
      const w = 10.5 * comp, h = 13 * lid;
      if (h < 2.2) { ctx.strokeStyle = ink; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - w, ey + 1); ctx.quadraticCurveTo(ex, ey + 4, ex + w, ey + 1); ctx.stroke(); continue; }
      swToonEllipse(ctx, ex, ey, w, h, 0, '#FFFFFF');
      ctx.save();
      ctx.beginPath(); ctx.ellipse(ex, ey, w, h, 0, 0, Math.PI * 2); ctx.clip();
      const ix = ex + gx * w * 0.38, iy = ey + gy * h * 0.3 + 1;
      swToonEllipse(ctx, ix, iy, 7 * comp, 7.6, 0, eyeColor);
      swToonEllipse(ctx, ix, iy, 4 * comp, 4.4, 0, ink);
      swToonEllipse(ctx, ix - 2.4, iy - 3, 2.4, 2.4, 0, '#FFFFFF');
      swToonEllipse(ctx, ix + 2.2, iy + 2.4, 1.1, 1.1, 0, '#FFFFFF');
      ctx.restore();
      ctx.strokeStyle = ink; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.ellipse(ex, ey, w, h, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
    } else {
      const h = 4.2 * lid;
      if (h < 1.3) { ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ex - 3.2, ey + 0.5); ctx.quadraticCurveTo(ex, ey + 2, ex + 3.2, ey + 0.5); ctx.stroke(); continue; }
      swToonEllipse(ctx, ex + gx * 1.2, ey + gy * 1, 3.1 * comp, h, 0, ink);
      swToonEllipse(ctx, ex + gx * 1.2 - 0.9, ey + gy * 1 - h * 0.4, 0.9, 0.9, 0, 'rgba(255,255,255,0.85)');
    }
    /* Brow */
    if (!dot || Math.abs(emo.brow) > 0.3 || Math.abs(emo.browTilt) > 0.3) {
      const bw = big ? 10 : dot ? 5 : 6.5, by = ey - (big ? 18 : dot ? 9 : 9.5) - emo.brow * (big ? 4 : 3) + (side < 0 ? -emo.asym * 1.5 : emo.asym * 1.5);
      const tilt = emo.browTilt * (big ? 4 : 2.6);
      ctx.strokeStyle = o.browColor; ctx.lineWidth = big ? 3.6 : dot ? 2 : 2.6; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ex - side * bw * 0.9 * comp, by + tilt);
      ctx.quadraticCurveTo(ex, by - 1.6 - tilt * 0.2, ex + side * bw * comp, by - tilt * 0.4);
      ctx.stroke();
    }
  }
  /* Blush */
  if (!dot && emo.blush > 0.02) {
    ctx.save();
    ctx.globalAlpha *= ecClamp(emo.blush * (big ? 0.9 : 0.6), 0, 0.6);
    for (const side of [-1, 1]) swToonEllipse(ctx, fx + side * sep * 1.18, eyeY + (big ? 17 : 10), big ? 9 : 5.5, big ? 5 : 3.2, 0, '#F06C82');
    ctx.restore();
  }
  /* Nose */
  if (S.nose) {
    const nx = fx + ht * (big ? 5 : 4), ny = eyeY + (big ? 12 : 9);
    ctx.strokeStyle = swShade(skin, -0.22); ctx.lineWidth = big ? 2.2 : 1.8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(nx - 2, ny); ctx.quadraticCurveTo(nx + 1.5, ny + 2.4, nx + 3, ny - 0.5); ctx.stroke();
  }
  /* Mouth: a smile line when closed, an open shape when speaking. */
  const ms = big ? 1.55 : dot ? 0.75 : 1;
  const mx = fx + ht * 3 * ms, my = eyeY + (big ? 25 : dot ? 13 : 18);
  const open = Math.max(vis.open, emo.mouthO * 0.6);
  const w = (7 + 2.5 * Math.max(0, emo.smile)) * ms * ecN(vis.width, 1) * (1 - 0.35 * ecN(vis.round, 0));
  if (open < 0.08) {
    ctx.strokeStyle = ink; ctx.lineWidth = (dot ? 2 : 2.3) * Math.max(1, ms * 0.8); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(mx - w, my - emo.smile * 1.5 * ms); ctx.quadraticCurveTo(mx, my + emo.smile * 5.5 * ms, mx + w, my - emo.smile * 1.5 * ms); ctx.stroke();
    return;
  }
  const h = (2 + open * 7.5) * ms;
  ctx.save();
  ctx.beginPath();
  if (ecN(vis.round, 0) > 0.5) {
    /* Rounded lips: an upright oval. */
    ctx.ellipse(mx, my + h * 0.35, Math.max(2.5, w * 0.75), h * 0.62, 0, 0, Math.PI * 2);
  } else {
    /* A "D": a nearly flat top lip and a round lower lip. */
    ctx.moveTo(mx - w, my - 1);
    ctx.quadraticCurveTo(mx, my - 1 + Math.max(0, emo.smile) * 1.5 * ms, mx + w, my - 1);
    ctx.ellipse(mx, my - 1, w, h, 0, 0, Math.PI);
  }
  ctx.closePath();
  ctx.fillStyle = '#5B1E2B';
  ctx.fill();
  ctx.clip();
  if (vis.teeth > 0.3 && !dot) { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(mx - w, my - 4, w * 2, 2.6 * ms + 2); }
  if (vis.tongue > 0.3 || open > 0.5) swToonEllipse(ctx, mx, my + h, w * 0.6, h * 0.45, 0, '#E86A7E');
  ctx.restore();
}

/* --- Illustrated parts ---------------------------------------------------
   A cast member may bring its own art as `parts`: each part is an SVG
   drawing in its own coordinates, { layers | d + fill, pivot: [x, y],
   tip: [x, y] }, mapped so pivot → tip lands on a bone of the rig (uniform
   scale; `stretch: true` scales along the bone only). Fill and stroke values
   such as "$skin", "$skinShade", "$hair", "$hairLight", "$shirt",
   "$shirtDark", "$jacket", "$jacketDark", "$pants", "$pantsDark", "$shoe",
   "$accent", "$ink", "$eye" take the member's colours, so one drawing serves
   every palette. Parts: torso, neck, head (+ mouthAt, eyesAt, browsAt),
   hairBack, hairFront, upperArm, forearm, hands.{open, wave, relaxed, point,
   fist, thumbsup, hold}, thigh, shin, foot, mouth.{rest, A, E, O, U, M, F,
   S, L, smile, sad}, eyes.{open, closed, squint}, brows. Anything missing
   is drawn by the style. */
const swPartCache = new WeakMap();
function swPartLayers(pt, tokens) {
  const sig = JSON.stringify(tokens);
  const hit = swPartCache.get(pt);
  if (hit && hit.sig === sig) return hit.layers;
  const base = Array.isArray(pt.layers) ? pt.layers
    : pt.d ? [{ d: pt.d, fill: pt.fill, stroke: pt.stroke, lineWidth: pt.lineWidth }] : [];
  const tint = v => {
    if (typeof v === 'string' && v[0] === '$') {
      const t = tokens[v.slice(1)];
      return typeof t === 'string' ? t : v;
    }
    if (Array.isArray(v)) return v.map(tint);
    if (v && typeof v === 'object') { const o = {}; for (const key in v) o[key] = tint(v[key]); return o; }
    return v;
  };
  const layers = base.map(tint);
  swPartCache.set(pt, { sig, layers });
  return layers;
}
function swPartDraw(ctx, pt, A, B, tokens, lt, o) {
  o = o || {};
  const piv = Array.isArray(pt.pivot) ? [ecN(pt.pivot[0], 0), ecN(pt.pivot[1], 0)] : [0, 0];
  const tip = Array.isArray(pt.tip) ? [ecN(pt.tip[0], 0), ecN(pt.tip[1], 0)] : null;
  const dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy);
  let artAngle = 0, k = ecN(pt.scale, 1), ky = k;
  if (tip) {
    const tx = tip[0] - piv[0], ty = tip[1] - piv[1], tl = Math.hypot(tx, ty) || 1;
    artAngle = Math.atan2(ty, tx);
    k = len / tl;
    /* A foreshortened bone keeps the part's full-length width. */
    ky = pt.stretch ? ecN(pt.scale, 1) : k / ecClamp(ecN(o.foreshorten, 1), 0.2, 1);
  }
  ctx.save();
  ctx.translate(A.x, A.y);
  ctx.rotate(Math.atan2(dy, dx));
  ctx.scale(k, ky * (o.flipY ? -1 : 1));
  ctx.rotate(-artAngle);
  ctx.translate(-piv[0], -piv[1]);
  SWDraw.svgLayers(ctx, swPartLayers(pt, tokens), { localTime: lt });
  if (o.inner) o.inner();
  ctx.restore();
}
/* A face part at an anchor of the head art: translated, never rotated. */
function swPartAt(ctx, pt, at, dx, dy, tokens, lt) {
  if (!pt || typeof pt !== 'object') return;
  const piv = Array.isArray(pt.pivot) ? pt.pivot : [0, 0];
  const a = Array.isArray(at) ? at : [0, 0];
  ctx.save();
  ctx.translate(ecN(a[0], 0) + dx - ecN(piv[0], 0), ecN(a[1], 0) + dy - ecN(piv[1], 0));
  SWDraw.svgLayers(ctx, swPartLayers(pt, tokens), { localTime: lt });
  ctx.restore();
}

/* How far a seated figure's hips drop (local units) for a style's skeleton. */
function swSeatDrop(S) {
  const legLen = (170 - 8 - S.hipY) / 2;
  return 170 - 8 - legLen * 1.3 - S.hipY;
}
SWDraw.seatDrop = style => swSeatDrop(SW_TOON[style] || SW_TOON.flat);

/* Something held in the gesturing hand, in the hand's palm. */
function swToonProp(ctx, prop, hand, accent, ink) {
  const a = ecN(hand.angle, 0), L = ecN(hand.len, 30);
  const px = hand.wrist.x + Math.cos(a) * L * 0.5, py = hand.wrist.y + Math.sin(a) * L * 0.5;
  ctx.save();
  ctx.translate(px, py);
  if (prop === 'mug') {
    /* Mugs stay upright whatever the wrist does. */
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.roundRect(-8, -12, 16, 19, 3); ctx.fill();
    ctx.strokeStyle = accent; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.arc(9, -3, 4.5, -Math.PI / 2, Math.PI / 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(-5, -10, 3, 14);
    ctx.strokeStyle = 'rgba(248,250,252,0.35)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-2, -16); ctx.quadraticCurveTo(-5, -20, -1, -24); ctx.stroke();
  } else if (prop === 'book') {
    /* A closed sketchbook held upright: a cloth cover, an elastic band and
       the page edges along one side. */
    const w = 20, h = 26;
    ctx.translate(0, -h * 0.3);
    ctx.rotate(Math.cos(a) >= 0 ? -0.1 : 0.1);
    ctx.fillStyle = '#F1E9DA';
    ctx.beginPath(); ctx.roundRect(-w / 2 + 2, -h / 2 + 1.5, w, h - 3, 2); ctx.fill();
    ctx.fillStyle = swMix(accent, '#7A2E2E', 0.5);
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 2.5); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(w / 2 - 6, -h / 2, 2, h);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.roundRect(-w / 2 + 4, -h / 2 + 5, w - 10, 6, 1.5); ctx.fill();
  } else if (prop === 'phone' || prop === 'tablet') {
    /* Held upright in the palm, screen to the viewer: a dark body, a lit
       screen and a camera notch read as a phone at any size. */
    const w = prop === 'phone' ? 13 : 30, h = prop === 'phone' ? 24 : 22;
    ctx.translate(0, -h * 0.28);
    ctx.rotate(Math.cos(a) >= 0 ? -0.12 : 0.12);
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 3.2); ctx.fill();
    const g = ctx.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#BFDBFE');
    g.addColorStop(1, swMix(accent, '#E0F2FE', 0.55));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.roundRect(-w / 2 + 1.5, -h / 2 + 2.2, w - 3, h - 4.4, 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-w / 2 + 3, -h / 2 + 5, w * 0.35, 2);
    ctx.fillRect(-w / 2 + 3, -h / 2 + 9, w * 0.55, 2);
    ctx.fillStyle = '#111827';
    ctx.beginPath(); ctx.arc(0, -h / 2 + 1.6, 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/* The whole figure in a given style; called by SWDraw.character. */
function swToonCharacter(ctx, opts, styleName) {
  /* `rig` overrides proportions (head, sh, shW, hipY, hipW, arm, armW, ...)
     so a skeleton can match an illustrated member's art. */
  const S = Object.assign({}, SW_TOON[styleName], opts && opts.rig && typeof opts.rig === 'object' ? opts.rig : {});
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
  const x = nrmX(ecN(opts.x, 0.22)), y = nrmY(ecN(opts.y, 0.62));
  const sc = ecClamp(ecN(opts.scale, 1), 0.05, 20);
  const GROUND = 170;
  const geo = styleName === 'geo';

  /* Pose / emotion tracks (same rules as the detailed rig). */
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
  const poseT = track(opts.pose, 'idle');
  /* How much the person is laughing now (from the emotion track): the
     shoulders shake, the head tips back, the mouth opens in bursts. */
  const laughT = opts.emotion ? track(opts.emotion, 'neutral') : { a: '', b: '', q: 1 };
  const laughW = (norm(laughT.a) === 'laugh' ? 1 - laughT.q : 0) + (norm(laughT.b) === 'laugh' ? laughT.q : 0);
  const known = n => (SW_TOON_POSES[norm(n)] ? norm(n) : 'idle');
  const poseA = known(poseT.a), poseB = known(poseT.b), pq = poseT.q;
  const pose = pq < 0.5 ? poseA : poseB;
  const pw = name => (poseA === name ? 1 - pq : 0) + (poseB === name ? pq : 0);

  /* Colours */
  const outfit = norm(opts.outfit) || 'tshirt';
  const skin = opts.skinColor || '#F2C4A2';
  const skinSh = swShade(skin, -0.16);
  const hairC = opts.hairColor || '#2B2233';
  const shirt = opts.shirtColor || opts.color || '#38BDF8';
  const jacket = opts.jacketColor || '#1E293B';
  const pants = opts.pantsColor || '#273449';
  const shoe = opts.shoeColor || '#F1F5F9';
  const accent = opts.accentColor || '#F59E0B';
  const ink = opts.inkColor || '#1B1B2F';
  const eyeColor = opts.eyeColor || '#5A3B26';
  const hairStyle = norm(opts.hairStyle || (opts.hair && opts.hair.style)) || 'modern';
  const k = ecClamp(ecN(opts.bodyWidth, 1), 0.75, 1.3);
  const P = opts.parts && typeof opts.parts === 'object' ? opts.parts : null;
  const part = name => (P && P[name] && typeof P[name] === 'object' ? P[name] : null);
  const tokensFront = {
    skin, skinShade: skinSh, hair: hairC, hairLight: swShade(hairC, 0.18), shirt, shirtDark: swShade(shirt, -0.2),
    jacket, jacketDark: swShade(jacket, -0.25), pants, pantsDark: swShade(pants, -0.2), shoe, accent, ink, eye: eyeColor
  };
  const tokensBack = {};
  for (const key in tokensFront) tokensBack[key] = swShade(tokensFront[key], -0.09);
  const drawPart = (pt, A, B, back, o) => swPartDraw(ctx, pt, A, B, back ? tokensBack : tokensFront, lt, o);

  /* Pointing target */
  let box = null, aim = null;
  const pa = opts.pointAt || opts.target;
  if (typeof pa === 'string') { if (typeof opts.boxOf === 'function') box = opts.boxOf(pa); }
  else if (pa && typeof pa === 'object') {
    if (pa.w != null || pa.width != null) box = pa;
    else if (typeof pa.x === 'number' && typeof pa.y === 'number') {
      aim = { x: nrmX(pa.x), y: nrmY(pa.y) };
      if (opts.dock !== false && Array.isArray(opts.boxes)) {
        for (const b of opts.boxes) if (b && Math.abs(aim.x - b.cx) <= b.w / 2 && Math.abs(aim.y - b.cy) <= b.h / 2) { box = b; break; }
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

  /* Motion */
  const walkAmt = ecClamp(ecN(opts.walkAmount, pw('walk')), 0, 1);
  const cad = ecN(opts.cadence, 1.6) * Math.PI;
  const celeW = pw('celebrate');
  const beats = opts.speaking !== false && opts.gestures !== false && Array.isArray(opts.words) && opts.words.length > 0;
  /* Each person keeps their own rhythm: blink, breath and sway phases come
     from their name, so a cast never blinks or breathes in unison. */
  const who = String(opts.cast || opts.speaker || opts.label || '');
  let seedH = 7;
  for (let i = 0; i < who.length; i++) seedH = (seedH * 31 + who.charCodeAt(i)) >>> 0;
  const rnd = k => ((Math.imul(seedH ^ (k * 2654435761), 2246822519) >>> 0) % 10000) / 10000;
  const tp = time + rnd(1) * 10;
  /* Listening: a small delayed nod on the speaker's stressed words. */
  const others = opts.listening !== false && Array.isArray(opts.otherWords) ? opts.otherWords : null;
  const listenBeat = t => (others ? swBeat(others, t - 0.18 - rnd(2) * 0.12) : 0);
  const motion = t => ({
    shift: (1 - walkAmt) * Math.sin((t + rnd(1) * 10) * 0.55) * 0.8,
    bob: walkAmt * (Math.abs(Math.sin(t * cad)) * 4 - 2) - celeW * Math.abs(Math.sin(t * 5.2)) * 7 - laughW * Math.abs(Math.sin(t * 13)) * 2.4,
    nod: Math.sin((t + rnd(1) * 10) * 1.3 + 0.6) * 0.025 + celeW * Math.sin(t * 5.2) * 0.05 + (beats ? swBeat(opts.words, t) * 0.06 : 0) + listenBeat(t) * 0.04
  });
  const m = motion(time);
  const beat = beats ? swBeat(opts.words, time) : 0;
  const breathe = Math.sin(tp * (1.9 + rnd(3) * 0.4));
  const lagX = SWDraw.lag(t => { const q = motion(t); return q.shift * 2 + q.nod * 40; }, time, { freq: 2.2, damping: 0.25 })
    - (walkAmt * 0.6 + ecClamp(vx0 / 400, -1, 1) * facing) * 6;

  /* Skeleton (local frame, +x = facing direction). */
  const shrug = 7 * pw('shrug');
  /* Seated: the hips drop onto a chair so the shins stand on the floor and
     the thighs come toward the viewer. */
  const seated = !!opts.seated;
  const seatDrop = seated ? swSeatDrop(S) : 0;
  const hipX = m.shift, hipY = S.hipY + m.bob + seatDrop;
  const tiltHip = m.shift * 0.012;
  const shY = S.sh + m.bob + seatDrop - breathe * 0.8 - shrug;
  const shW = S.shW * k, hipW = S.hipW * k;
  const chestX = hipX * 0.35;
  /* The shoulder joints sit under the deltoids at the outer edge of the
     shoulders; the ribcage below is narrower, so hanging arms run beside
     the body, not over it. */
  const SR = { x: chestX + shW - 5, y: shY + 8 - tiltHip * 20 }, SL = { x: chestX - shW + 5, y: shY + 8 + tiltHip * 20 };
  const HR = { x: hipX + hipW * 0.55, y: hipY - tiltHip * 18 }, HL = { x: hipX - hipW * 0.55, y: hipY + tiltHip * 18 };
  const [hrx, hry] = S.head;
  const headC = { x: chestX + 1, y: shY - S.headGap - hry * (styleName === 'cartoon' ? 0.92 : 0.96) + breathe * 0.3 };
  const armL = S.arm[0] + S.arm[1];

  /* Emotion */
  const EMO_OF = { celebrate: 'excited', think: 'thinking', wave: 'happy', thumbsup: 'happy', present: 'happy', explain: 'happy', shrug: 'neutral', point: 'focused' };
  const emoRec = n => Object.assign({ asym: 0, mouthO: 0 }, SW_EMOTIONS.neutral, SW_EMOTIONS[norm(n)] || {});
  const emoT = opts.emotion ? track(opts.emotion, 'neutral') : { a: EMO_OF[poseA] || 'neutral', b: EMO_OF[poseB] || 'neutral', q: pq };
  const eA = emoRec(emoT.a), eB = emoRec(emoT.b), emo = {};
  for (const key in eA) emo[key] = eA[key] + (ecN(eB[key], 0) - eA[key]) * emoT.q;
  emo.brow += beat * 0.3;
  /* A listener warms up while someone talks. */
  if (others && SWDraw.speakerAt(others, time)) emo.smile = Math.min(1, emo.smile + 0.12);

  /* Arm targets for a pose. */
  const osc = (f, a, ph) => Math.sin(time * f + (ph || 0)) * a;
  const chin = { x: headC.x + hrx * 0.3, y: headC.y + hry * 0.9 };
  const legPh = time * cad;
  const elbowPick = side => J => J.y + 0.3 * side * J.x;
  const rig = name => {
    const P = SW_TOON_POSES[name];
    const dir = (deg, side) => { const r = deg * Math.PI / 180; return { x: side * Math.sin(r), y: Math.cos(r) }; };
    const arm = (Sh, spec, side, depth) => {
      const L2 = S.arm[1] * (1 - 0.5 * depth);
      if (spec === 'chin') {
        const T = { x: chin.x - 2, y: chin.y + armL * 0.12 };
        return { T, E: swToonIK(Sh, T, S.arm[0], L2, elbowPick(side)).J };
      }
      let u = spec.u, f = spec.f;
      /* A walking arm swings from the shoulder, against its leg. */
      /* Seen nearly from the front, a walking arm swings mostly in depth:
         only a few degrees show across the body. */
      if (u < 20 && walkAmt > 0) { const sw = walkAmt * Math.sin(legPh) * 7; u += sw; f = Math.max(f + sw * 1.2, 0); }
      if (name === 'explain') f += osc(2.6, 7, side > 0 ? 0 : Math.PI);
      if (name === 'present' && side > 0) f += osc(2.2, 5);
      if (P.wave && side > 0) f += osc(8, 9);
      const a = dir(u, side), E = { x: Sh.x + a.x * S.arm[0], y: Sh.y + a.y * S.arm[0] };
      const b = dir(f, side);
      return { T: { x: E.x + b.x * L2, y: E.y + b.y * L2 }, E };
    };
    const dR = ecN(P.rd, 0), dL = ecN(P.ld, 0);
    const R = arm(SR, P.r, 1, dR), L = arm(SL, P.l, -1, dL);
    let aR = P.ra != null ? P.ra : null;
    if (P.wave) aR = P.ra + osc(8, 0.35);
    return { tR: R.T, tL: L.T, eR: R.E, eL: L.E, hR: P.rh, hL: P.lh, aR, aL: P.la != null ? P.la : null, dR, dL };
  };
  const RA = rig(poseA), RB = poseB === poseA ? RA : rig(poseB);
  const lp = (a, b) => ({ x: a.x + (b.x - a.x) * pq, y: a.y + (b.y - a.y) * pq });
  let tR = lp(RA.tR, RB.tR), tL = lp(RA.tL, RB.tL);
  let eR = lp(RA.eR, RB.eR), eL = lp(RA.eL, RB.eL);
  let hR = pq < 0.5 ? RA.hR : RB.hR, hL = pq < 0.5 ? RA.hL : RB.hL;
  let aR = { a: RA.aR, b: RB.aR, q: pq }, aL = { a: RA.aL, b: RB.aL, q: pq };
  let dR = RA.dR + (RB.dR - RA.dR) * pq;
  const dL = RA.dL + (RB.dL - RA.dL) * pq;
  /* Word beats lift the forearms of an open gesture a few degrees. */
  const lift = beat * 6 * (pw('present') + pw('explain'));
  tR.y -= lift; tL.y -= lift * 0.6;
  const ptLocal = pt => (pt && typeof pt.x === 'number' && typeof pt.y === 'number') ? toLocal(nrmX(pt.x), nrmY(pt.y)) : null;
  const oL = ptLocal(opts.leftHand), oR = ptLocal(opts.rightHand);
  if (oL) { tL = oL; eL = null; }
  if (oR) { tR = oR; eR = null; }
  if (opts.leftHandPose) hL = opts.leftHandPose;
  if (opts.rightHandPose || opts.handPose) hR = opts.rightHandPose || opts.handPose;

  /* Pointing */
  const u = S.armW * (geo ? 0.62 : 0.8) * S.hand;
  const tipLen = geo ? u * 2.7 : u * 2.51;
  let pointL = null;
  if (aim) {
    const amt = ecClamp(ecN(opts.pointAmount, 1), 0, 1), e = smooth(amt);
    const SRw = toWorld(SR);
    const F = box ? ecDockRayToBox(SRw.x, SRw.y, aim.x, aim.y, box, ecN(opts.pointGap, 26)) : aim;
    const Fl = toLocal(F.x, F.y), Al = toLocal(aim.x, aim.y);
    let dx = Al.x - Fl.x, dy = Al.y - Fl.y, dl = Math.hypot(dx, dy);
    if (dl < 1) { dx = Al.x - SR.x; dy = Al.y - SR.y; dl = Math.hypot(dx, dy) || 1; }
    dx /= dl; dy /= dl;
    const wT = { x: Fl.x - dx * tipLen, y: Fl.y - dy * tipLen };
    /* The pointing arm reaches by IK. Raising it turns the upper arm and the
       forearm from the pose's angles to the reach's along the short way —
       blending positions instead would whip the forearm round whenever the
       target passes near the elbow. */
    const reach = swToonIK(SR, wT, S.arm[0], S.arm[1], elbowPick(1));
    if (eR && e < 1) {
      const turn = (a0, a1) => { const d = a1 - a0; return a0 + Math.atan2(Math.sin(d), Math.cos(d)) * e; };
      const u = turn(Math.atan2(eR.y - SR.y, eR.x - SR.x), Math.atan2(reach.J.y - SR.y, reach.J.x - SR.x));
      const f = turn(Math.atan2(tR.y - eR.y, tR.x - eR.x), Math.atan2(reach.E.y - reach.J.y, reach.E.x - reach.J.x));
      eR = { x: SR.x + Math.cos(u) * S.arm[0], y: SR.y + Math.sin(u) * S.arm[0] };
      tR = { x: eR.x + Math.cos(f) * S.arm[1], y: eR.y + Math.sin(f) * S.arm[1] };
    } else {
      eR = reach.J;
      tR = reach.E;
    }
    if (amt > 0.5) hR = 'point';
    /* The hand turns toward the target over most of the raise, not in a flick. */
    aR = { a: aR, b: Math.atan2(dy, dx), q: smooth(ecClamp((amt - 0.15) / 0.65, 0, 1)) };
    dR *= 1 - e;
    pointL = { Fl, Al, amt };
  }

  /* Head turn and gaze */
  const ht = ecClamp(opts.headTurn != null ? ecN(opts.headTurn, 0.25) : (aim ? 0.45 : 0.25) + Math.sin(time * 0.9) * 0.05, -1, 1);
  let headRot = -ecN(opts.headTilt, 0) * 0.2 + m.nod - 0.12 * pw('think') + 0.12 * pw('shrug') - 0.07 * laughW;
  let gx = ht * 0.6, gy = 0;
  if (pointL && pointL.amt > 0.3) {
    const vx = pointL.Al.x - headC.x, vy = pointL.Al.y - headC.y, vl = Math.hypot(vx, vy) || 1;
    gx = vx / vl; gy = vy / vl;
    headRot += ecClamp(Math.atan2(vy, Math.abs(vx)) * 0.25, -0.18, 0.18) * pointL.amt;
  }
  const thinkW = pw('think');
  gx += (0.5 - gx) * thinkW; gy += (-0.85 - gy) * thinkW;
  let look = null;
  if (opts.lookAt === 'viewer' || opts.lookAt === 'camera') { gx = 0; gy = 0; }
  else if (typeof opts.lookAt === 'string' && typeof opts.boxOf === 'function') {
    const lb = opts.boxOf(opts.lookAt);
    if (lb && lb.cx != null) look = { x: lb.cx, y: lb.cy };
  } else if (opts.lookAt && typeof opts.lookAt.x === 'number' && typeof opts.lookAt.y === 'number') {
    look = { x: nrmX(opts.lookAt.x), y: nrmY(opts.lookAt.y) };
  }
  if (look) {
    const L = toLocal(look.x, look.y);
    const vx = L.x - headC.x, vy = L.y - headC.y, vl = Math.hypot(vx, vy) || 1;
    gx = vx / vl; gy = vy / vl;
    headRot += ecClamp(Math.atan2(vy, Math.abs(vx)) * 0.2, -0.15, 0.15);
  }
  if (opts.gaze && typeof opts.gaze === 'object') { gx = ecN(opts.gaze.x, gx); gy = ecN(opts.gaze.y, gy); }

  /* Visemes and blinking */
  let vis = Object.assign({}, SW_VIS.rest);
  const speaking = opts.speaking !== false && Array.isArray(opts.words) && opts.words.length;
  if (typeof opts.mouth === 'number') vis = swVisBlend(SW_VIS.rest, SW_VIS.A, ecClamp(opts.mouth, 0, 1) * 0.85);
  else if (speaking) vis = SWDraw.viseme(opts.words, time);
  if (laughW > 0.05 && vis.open < 0.1) vis = Object.assign(swVisBlend(SW_VIS.rest, SW_VIS.A, laughW * (0.3 + 0.4 * Math.abs(Math.sin(time * 13)))), { key: 'A' });
  const bp = 3.2 + rnd(4) * 1.6, ph = (time + rnd(5) * bp) % bp;
  const blink = ph > bp - 0.16 ? Math.abs((ph - (bp - 0.08)) / 0.08) : 1;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc * facing, sc);

  /* Ground shadow */
  ctx.fillStyle = 'rgba(2,6,23,0.32)';
  ctx.beginPath(); ctx.ellipse(hipX * 0.5, GROUND + 1, 46 * S.shoe, 8, 0, 0, Math.PI * 2); ctx.fill();

  /* The chair, behind everyone else. */
  if (seated && opts.chair !== false) {
    const chair = opts.chairColor || '#334155';
    ctx.fillStyle = swShade(chair, -0.2);
    for (const sx of [-1, 1]) ctx.fillRect(hipX + sx * (hipW + 8) - 2.5, hipY + 6, 5, GROUND - hipY - 6);
    ctx.fillStyle = chair;
    ctx.beginPath(); ctx.roundRect(chestX - shW - 7, shY - 2, 2 * shW + 14, hipY - shY + 8, 12); ctx.fill();
    ctx.beginPath(); ctx.roundRect(hipX - hipW - 16, hipY - 4, 2 * hipW + 32, 13, 6); ctx.fill();
  }

  /* Legs: the weight leg (the back one) straight, the free leg relaxed and
     a little forward; walking swings both. */
  const ankleY = GROUND - 8;
  const foot = side => {
    const phs = legPh + (side < 0 ? 0 : Math.PI);
    /* Standing, each foot sits right under its hip joint so the leg is
       straight; only the walk cycle bends the knees. */
    const rest = side * hipW * 0.55;
    /* Feet stay hip-width apart; the stride shows as a short swing. */
    const fx = rest + hipX + walkAmt * Math.sin(phs) * 14;
    const lift = walkAmt * Math.max(0, Math.cos(phs)) * 14;
    return { x: fx, y: ankleY - lift };
  };
  const knee = J => J.x;
  const legs = [[HL, foot(-1), true], [HR, foot(1), false]];
  const legLen = (ankleY - S.hipY) / 2;
  /* The skeleton as drawn, in the figure's local frame (for checks). */
  const joints = { ground: GROUND, ankleY, legLen, upper: S.arm[0], fore: S.arm[1], chestX, shW, hipY, seated, legs: [], arms: {} };
  for (const [Hj, F, back] of legs) {
    /* Seated, the thigh points at the viewer (foreshortened) and the shin
       drops to the floor. */
    const ik = seated
      ? { J: { x: Hj.x + (back ? -2 : 2), y: Hj.y + legLen * 0.3 }, E: { x: Hj.x + (back ? -2 : 2), y: ankleY } }
      : walkAmt > 0.01
        ? swToonIK(Hj, F, legLen, legLen, knee)
        /* Standing, the leg spans exactly hip to ankle, so it stays straight
           however the hips tilt with breathing. */
        : (() => { const d = Math.hypot(F.x - Hj.x, F.y - Hj.y) / 2; return swToonIK(Hj, F, Math.max(d, 1), Math.max(d, 1) + 1e-3, knee); })();
    joints.legs.push({ hip: Hj, knee: ik.J, ankle: ik.E, back });
    const pts = swToonLimb(Hj, ik.J, ik.E, S.curve ? 0.35 : 0);
    const col = back ? swShade(pants, -0.1) : pants;
    if (part('thigh') && part('shin')) {
      if (!seated) drawPart(part('thigh'), Hj, ik.J, back);
      drawPart(part('shin'), ik.J, ik.E, back);
    } else swToonStroke(ctx, pts, S.legW, col);
    /* Shoe */
    const sx = ik.E.x, sy = ik.E.y;
    const sh = back ? swShade(shoe, -0.08) : shoe;
    const z = S.shoe;
    if (part('foot')) {
      drawPart(part('foot'), ik.E, { x: ik.E.x + 20 * z, y: ik.E.y }, back);
    } else if (geo) {
      ctx.fillStyle = sh;
      ctx.beginPath(); ctx.roundRect(sx - 9 * z, sy - 4 * z, 26 * z, 12 * z, 6 * z); ctx.fill();
    } else {
      ctx.fillStyle = sh;
      ctx.beginPath();
      ctx.moveTo(sx - 9 * z, sy + 7 * z);
      ctx.lineTo(sx - 9 * z, sy - 3 * z);
      ctx.quadraticCurveTo(sx - 6 * z, sy - 7 * z, sx + 2 * z, sy - 5 * z);
      ctx.quadraticCurveTo(sx + 20 * z, sy - 2 * z, sx + 20 * z, sy + 4 * z);
      ctx.quadraticCurveTo(sx + 20 * z, sy + 8 * z, sx + 14 * z, sy + 8 * z);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = swShade(sh, -0.25);
      ctx.fillRect(sx - 9 * z, sy + 5.6 * z, 28 * z, 2.4 * z);
    }
  }
  /* Seated: the lap. Thighs toward the viewer read as one rounded block,
     lit on top, with the knees forward at its lower edge. */
  if (seated) {
    const lapY = hipY - 8, kneeY = hipY + legLen * 0.3;
    ctx.fillStyle = pants;
    ctx.beginPath(); ctx.roundRect(hipX - hipW - 5, lapY, 2 * hipW + 10, kneeY - lapY + 12, 12); ctx.fill();
    ctx.fillStyle = swShade(pants, 0.12);
    ctx.beginPath(); ctx.roundRect(hipX - hipW - 3, lapY + 2, 2 * hipW + 6, (kneeY - lapY) * 0.45, 9); ctx.fill();
    ctx.strokeStyle = swShade(pants, -0.3); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(hipX, lapY + 8); ctx.lineTo(hipX, kneeY + 10); ctx.stroke();
    for (const kx of [-1, 1]) {
      ctx.fillStyle = swShade(pants, 0.06);
      ctx.beginPath(); ctx.ellipse(hipX + kx * hipW * 0.55, kneeY + 4, hipW * 0.5, 7, 0, 0, Math.PI * 2); ctx.fill();
    }
  }
  /* Pelvis */
  if (!part('torso')) {
    ctx.fillStyle = pants;
    ctx.beginPath(); ctx.roundRect(hipX - hipW - 2, hipY - 14, hipW * 2 + 4, 24, 9); ctx.fill();
  }

  /* Back hair and hood. Head-frame parts map neck (0, ry) → crown (0, -ry). */
  const headA = { x: 0, y: hry }, headB = { x: 0, y: -hry };
  ctx.save();
  ctx.translate(headC.x, headC.y);
  ctx.rotate(headRot);
  if (part('hairBack')) {
    ctx.save(); ctx.translate(lagX * 0.5, 0); drawPart(part('hairBack'), headA, headB); ctx.restore();
  } else if (!part('head')) swToonHairBack(ctx, hairStyle, hrx, hry, hairC, lagX, geo);
  ctx.restore();
  if (outfit === 'hoodie' && !part('torso')) swToonEllipse(ctx, chestX, shY - 2, shW * 0.62, 13, 0, swShade(shirt, -0.2));

  /* Torso */
  const top = shY, bot = hipY + (outfit === 'hoodie' ? 10 : outfit === 'tshirt' ? 3 : 12);
  const bw = hipW + 3, r = shW * 0.45;
  const torso = new Path2D();
  torso.moveTo(chestX - shW, top + r);
  torso.quadraticCurveTo(chestX - shW, top, chestX - shW + r, top);
  torso.lineTo(chestX + shW - r, top);
  torso.quadraticCurveTo(chestX + shW, top, chestX + shW, top + r);
  /* Shoulder cap, then in to the ribcage under the arm, then down. */
  torso.quadraticCurveTo(chestX + shW, top + r + 9, chestX + shW - 7, top + r + 14);
  torso.quadraticCurveTo(chestX + shW - 8, (top + bot) / 2, hipX + bw, bot - 5);
  torso.quadraticCurveTo(hipX + bw, bot, hipX + bw - 5, bot);
  torso.lineTo(hipX - bw + 5, bot);
  torso.quadraticCurveTo(hipX - bw, bot, hipX - bw, bot - 5);
  torso.quadraticCurveTo(chestX - shW + 8, (top + bot) / 2, chestX - shW + 7, top + r + 14);
  torso.quadraticCurveTo(chestX - shW, top + r + 9, chestX - shW, top + r);
  torso.closePath();
  const coat = outfit === 'jacket' || outfit === 'suit';
  const sleeve = coat ? jacket : shirt;
  if (part('torso')) drawPart(part('torso'), { x: chestX, y: top }, { x: hipX, y: hipY });
  else {
  ctx.fillStyle = sleeve;
  ctx.fill(torso);
  ctx.save();
  ctx.clip(torso);
  if (S.shade) {
    ctx.fillStyle = `rgba(2,6,23,${S.shade})`;
    ctx.fillRect(chestX + shW * 0.45, top - 5, shW, bot - top + 10);
  }
  if (coat) {
    const inner = outfit === 'suit' ? (opts.shirtColor || '#F8FAFC') : shirt;
    ctx.fillStyle = inner;
    ctx.beginPath();
    ctx.moveTo(chestX - 10, top - 2); ctx.lineTo(chestX + 10, top - 2);
    ctx.lineTo(hipX + 7, bot + 2); ctx.lineTo(hipX - 7, bot + 2); ctx.closePath(); ctx.fill();
    if (outfit === 'suit') {
      ctx.fillStyle = accent;
      ctx.beginPath(); ctx.moveTo(chestX - 3, top + 2); ctx.lineTo(chestX + 3, top + 2);
      ctx.lineTo(chestX + 4.5, top + 40); ctx.lineTo(chestX, top + 46); ctx.lineTo(chestX - 4.5, top + 40); ctx.closePath(); ctx.fill();
    }
    if (!geo) {
      ctx.fillStyle = swShade(jacket, -0.25);
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(chestX + s * 10, top - 2); ctx.lineTo(chestX + s * 17, top + 4);
        ctx.lineTo(chestX + s * 6, top + 38); ctx.closePath(); ctx.fill();
      }
    }
  } else if (outfit === 'hoodie') {
    ctx.fillStyle = swShade(shirt, -0.12);
    ctx.beginPath(); ctx.roundRect(hipX - bw * 0.62, bot - 26, bw * 1.24, 18, 7); ctx.fill();
    ctx.strokeStyle = swShade(shirt, 0.35); ctx.lineWidth = 2; ctx.lineCap = 'round';
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(chestX + s * 5, top + 4); ctx.lineTo(chestX + s * 6, top + 22); ctx.stroke(); }
  } else {
    ctx.strokeStyle = swShade(shirt, -0.22); ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.ellipse(chestX, top - 1, 9, 6, 0, 0, Math.PI); ctx.stroke();
  }
  ctx.restore();
  }

  /* Neck and head */
  const hx = headC.x, hy = headC.y;
  ctx.fillStyle = skinSh;
  if (part('neck')) drawPart(part('neck'), { x: chestX, y: top + 4 }, { x: hx, y: hy + hry * 0.6 });
  else if (styleName !== 'cartoon') {
    ctx.beginPath(); ctx.roundRect(chestX - 6.5, hy + hry * 0.6, 13, top - (hy + hry * 0.6) + 4, 5); ctx.fill();
  }
  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(headRot);
  const headPart = part('head');
  if (headPart) {
    /* Illustrated head: face parts sit at its anchors; the eyes follow the
       gaze, the brows lift with the emotion, the mouth takes the viseme. */
    drawPart(headPart, headA, headB, false, {
      inner: () => {
        const eyes = part('eyes'), mouth = part('mouth'), brows = part('brows');
        if (eyes) {
          /* Eyes stay open through a smile; only a real laugh squints them
             shut, and a blink closes them for a beat. */
          const pick = blink < 0.4 && eyes.closed ? eyes.closed : emo.squint > 0.6 && eyes.squint ? eyes.squint : eyes.open;
          const g = ecN(eyes.gaze, 2);
          swPartAt(ctx, pick, headPart.eyesAt, pick === eyes.open ? gx * g : 0, pick === eyes.open ? gy * g * 0.7 : 0, tokensFront, lt);
        }
        if (brows) swPartAt(ctx, brows, headPart.browsAt, 0, -emo.brow * ecN(brows.lift, 3), tokensFront, lt);
        if (part('glasses')) swPartAt(ctx, part('glasses'), headPart.eyesAt, 0, 0, tokensFront, lt);
        if (mouth) {
          let key = vis.open > 0.06 || vis.press > 0.5 ? vis.key : 'rest';
          if (key === 'rest' && emo.smile > 0.5 && mouth.smile) key = 'smile';
          if (key === 'rest' && emo.smile < -0.2 && mouth.sad) key = 'sad';
          swPartAt(ctx, mouth[key] || mouth.rest, headPart.mouthAt, 0, 0, tokensFront, lt);
        }
      }
    });
    if (!part('eyes') && !part('mouth')) {
      swToonFace(ctx, S, styleName, { rx: hrx, ry: hry, ht, gx, gy, emo, vis, blink, skin, ink, eyeColor, browColor: swMix(hairC, ink, 0.3) });
    }
    if (part('hairFront')) drawPart(part('hairFront'), headA, headB);
  }
  if (!headPart) {
  if (S.ears) {
    for (const side of [-1, 1]) {
      if (side * ht > 0.6) continue;
      const ex = side * hrx * (0.97 - 0.12 * Math.max(0, side * ht)) + ht * hrx * 0.08;
      swToonEllipse(ctx, ex, hry * 0.1, hrx * 0.14, hry * 0.18, 0, swShade(skin, -0.06));
    }
  }
  ctx.fillStyle = skin;
  ctx.beginPath();
  if (geo) ctx.arc(0, 0, hrx, 0, Math.PI * 2);
  else {
    /* A soft egg: fuller at the cheeks, a gentle chin. */
    ctx.moveTo(-hrx, -hry * 0.05);
    ctx.bezierCurveTo(-hrx, -hry * 0.75, -hrx * 0.55, -hry, 0, -hry);
    ctx.bezierCurveTo(hrx * 0.55, -hry, hrx, -hry * 0.75, hrx, -hry * 0.05);
    ctx.bezierCurveTo(hrx, hry * 0.6, hrx * 0.5, hry, 0, hry);
    ctx.bezierCurveTo(-hrx * 0.5, hry, -hrx, hry * 0.6, -hrx, -hry * 0.05);
    ctx.closePath();
  }
  ctx.fill();
  if (S.shade) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = `rgba(150,60,50,${S.shade * 0.5})`;
    ctx.beginPath(); ctx.ellipse(hrx * 1.15, hry * 0.2, hrx * 0.45, hry * 1.2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  swToonFace(ctx, S, styleName, {
    rx: hrx, ry: hry, ht, gx, gy, emo, vis, blink, skin, ink, eyeColor,
    browColor: swMix(hairC, ink, 0.3)
  });
  if (opts.glasses) {
    ctx.strokeStyle = ink; ctx.lineWidth = 2;
    const gy0 = styleName === 'cartoon' ? hry * 0.08 : -hry * 0.04, sep = hrx * 0.37, fx = ht * hrx * 0.24, gr = styleName === 'cartoon' ? 14 : 8;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(fx + s * sep, gy0, gr, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(fx - sep + gr, gy0); ctx.lineTo(fx + sep - gr, gy0); ctx.stroke();
  }
  swToonHairFront(ctx, hairStyle, hrx, hry, hairC, ht * hrx * 0.3, geo);
  }
  ctx.restore();

  /* Arms: elbows bend outward and down; the hand's thumb faces the viewer. */
  const drawArm = (Sh, T, side, shape, ang, depth, elbow) => {
    /* A forearm reaching toward the viewer is foreshortened. */
    const fs = 1 - 0.5 * ecClamp(ecN(depth, 0), 0, 1), grow = 1 + 0.3 * (1 - fs);
    /* The posed elbow, kept at the upper arm's length; the forearm then
       aims at the hand target. Without a posed elbow, IK chooses one that
       hangs down first, then outward. */
    let ik;
    if (elbow) {
      const ux = elbow.x - Sh.x, uy = elbow.y - Sh.y, ul = Math.hypot(ux, uy) || 1;
      const J = { x: Sh.x + ux / ul * S.arm[0], y: Sh.y + uy / ul * S.arm[0] };
      const fx = T.x - J.x, fy = T.y - J.y, fl = Math.hypot(fx, fy) || 1, L2 = S.arm[1] * fs;
      ik = { J, E: { x: J.x + fx / fl * L2, y: J.y + fy / fl * L2 } };
    } else ik = swToonIK(Sh, T, S.arm[0], S.arm[1] * fs, elbowPick(side));
    const pts = swToonLimb(Sh, ik.J, ik.E, S.curve ? 0.5 : 0);
    const short = outfit === 'tshirt';
    if (part('upperArm') && part('forearm')) {
      drawPart(part('upperArm'), Sh, ik.J, side < 0);
      drawPart(part('forearm'), ik.J, ik.E, side < 0, { foreshorten: fs });
    } else {
      swToonStroke(ctx, pts, S.armW * 0.84, skin);
      swToonStroke(ctx, pts, S.armW, side > 0 ? sleeve : swShade(sleeve, -0.06), short ? 0.36 : 0.9);
    }
    const last = pts[pts.length - 1], prev = pts[pts.length - 3] || pts[0];
    const resolve = v => {
      if (v && typeof v === 'object') {
        const a = resolve(v.a), b = resolve(v.b), d = b - a;
        return a + Math.atan2(Math.sin(d), Math.cos(d)) * ecClamp(ecN(v.q, 1), 0, 1);
      }
      return typeof v === 'number' && isFinite(v) ? v : Math.atan2(last[1] - prev[1], last[0] - prev[0]);
    };
    const a = resolve(ang);
    /* Which side the thumb goes (hand-space +y or -y): palms face the
       viewer, so a level hand shows its thumb on top and an upright or
       hanging hand turns its thumb toward the body. Both arms mirror. */
    const want = Math.abs(Math.cos(a)) >= 0.5 ? [0, -1] : [-side, 0];
    const ts = -Math.sin(a) * want[0] + Math.cos(a) * want[1] >= 0 ? 1 : -1;
    const handKey = String(shape || 'relaxed').toLowerCase().replace(/[^a-z]/g, '');
    const hands = part('hands');
    const handPart = hands && (hands[handKey] || hands.relaxed);
    const c = Math.cos(a), s = Math.sin(a);
    if (handPart && typeof handPart === 'object') {
      /* Illustrated hands: thumb drawn on +y; length maps to the rig's reach. */
      const L = ecN(handPart.length, tipLen) * grow;
      const B = { x: last[0] + c * L, y: last[1] + s * L };
      drawPart(handPart, { x: last[0], y: last[1] }, B, side < 0, { flipY: ts < 0 });
      joints.arms[side < 0 ? 'l' : 'r'] = { shoulder: Sh, elbow: ik.J, wrist: { x: last[0], y: last[1] }, depth: ecN(depth, 0) };
      return { x: B.x, y: B.y, wrist: { x: last[0], y: last[1] }, angle: a, len: L };
    }
    ctx.save();
    ctx.translate(last[0], last[1]);
    ctx.rotate(a);
    const tip = swToonHand(ctx, shape, u * grow, skin, skinSh, styleName, ts);
    ctx.restore();
    joints.arms[side < 0 ? 'l' : 'r'] = { shoulder: Sh, elbow: ik.J, wrist: { x: last[0], y: last[1] }, depth: ecN(depth, 0) };
    return { x: last[0] + tip.x * c - tip.y * s, y: last[1] + tip.x * s + tip.y * c, wrist: { x: last[0], y: last[1] }, angle: a, len: Math.hypot(tip.x, tip.y) };
  };
  const prop = typeof opts.prop === 'string' ? opts.prop.toLowerCase() : null;
  if (prop && !opts.rightHandPose && !opts.handPose && hR !== 'point') hR = 'hold';
  const nearTip = drawArm(SL, tL, -1, hL, aL, dL, eL);
  const farTip = drawArm(SR, tR, 1, hR, aR, dR, eR);
  if (prop) swToonProp(ctx, prop, farTip, accent, ink);

  if (pointL && opts.showPointerRay !== false) {
    const gap = Math.hypot(pointL.Fl.x - farTip.x, pointL.Fl.y - farTip.y) * sc;
    if (gap > 36 && pointL.amt > 0.9) {
      ctx.save();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5 / sc;
      ctx.setLineDash([8 / sc, 8 / sc]);
      ctx.lineDashOffset = -time * 40 / sc;
      ctx.globalAlpha *= 0.7;
      ctx.beginPath(); ctx.moveTo(farTip.x, farTip.y); ctx.lineTo(pointL.Fl.x, pointL.Fl.y); ctx.stroke();
      ctx.restore();
    }
  }
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
    facing, style: styleName, joints,
    fingertip: toWorld(farTip),
    nearHand: toWorld(nearTip),
    head: toWorld(headC),
    aim, box, pose
  };
}

/* style: 'flat' | 'cartoon' | 'geo' draws the stylised figure, 'detailed'
   the anatomical rig; with no style (or parts / kit) the editorial kit. */
/* A cast member's look under the call's own options: `cast` names a member
   of the project's cast (settings.cast, handed in as castTable). */
function swCastResolve(opts) {
  if (!opts || typeof opts.cast !== 'string') return opts;
  const table = opts.castTable && typeof opts.castTable === 'object' ? opts.castTable : {};
  const member = table[opts.cast];
  if (!member || typeof member !== 'object') return opts;
  const out = Object.assign({}, member);
  for (const key in opts) if (opts[key] !== undefined) out[key] = opts[key];
  return out;
}
/* In a conversation each word carries its speaker; a character only lip-
   syncs and gestures on its own words. The speaker id defaults to the cast
   name, so turns written for 'ada' drive cast member 'ada'. */
function swOwnWords(opts) {
  if (!opts || !Array.isArray(opts.words) || !opts.words.some(w => w && w.speaker)) return opts;
  const who = opts.speaker || (typeof opts.cast === 'string' ? opts.cast : null);
  if (!who) return opts;
  return Object.assign({}, opts, {
    words: opts.words.filter(w => w && w.speaker === who),
    otherWords: opts.words.filter(w => w && w.speaker && w.speaker !== who)
  });
}
/* Who is speaking at time t (holding 0.3 s past a word's end), or null. */
function swSpeakerAt(words, t) {
  if (!Array.isArray(words)) return null;
  let lo = 0, hi = words.length - 1, k = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1, w = words[mid];
    if (w && ecN(w.start, Infinity) <= t) { k = mid; lo = mid + 1; } else hi = mid - 1;
  }
  const w = k >= 0 ? words[k] : null;
  return w && w.speaker && t <= ecN(w.end, -Infinity) + 0.3 ? w.speaker : null;
}
SWDraw.speakerAt = swSpeakerAt;
(() => {
  const detailed = SWDraw.character;
  SWDraw.character = (ctx, opts) => {
    opts = swCastResolve(opts);
    /* A kit member: the kit's illustrated parts under the flat skeleton. */
    if (opts && opts.kit && !opts.parts && typeof swKitParts === 'function') {
      opts = Object.assign({}, opts, { parts: swKitParts(opts), style: opts.style || 'flat' });
    }
    if (typeof swAutoDirect === 'function') opts = swAutoDirect(opts);
    opts = swOwnWords(opts);
    const st = String((opts && opts.style) || '').toLowerCase();
    if (SW_TOON[st]) return swToonCharacter(ctx, opts, st);
    if (opts && opts.parts && typeof opts.parts === 'object') return swToonCharacter(ctx, opts, 'flat');
    if (st === 'detailed' || typeof swKitParts !== 'function') return detailed(ctx, opts);
    /* No style: the editorial kit, the engine's finished character. The
       older hairStyle names map onto the kit's hair. */
    const HAIR = { modern: 'short', buzz: 'short', wavy: 'long', none: 'bald' };
    const o = Object.assign({}, opts || {});
    const hs = String(o.hair || o.hairStyle || '').toLowerCase();
    if (hs) o.hair = HAIR[hs] || hs;
    return swToonCharacter(ctx, Object.assign(o, { parts: swKitParts(o) }), 'flat');
  };
  SWDraw.characterStyles = ['detailed', ...Object.keys(SW_TOON)];
})();
