/* ==========================================================================
   Profile view: SWDraw.character(ctx, { view: 'side', ... }) draws the
   figure turned side-on — the view a story needs for walking, facing one
   another, handing things over and embracing. Same options and look as the
   kit (colours, hair, beard, outfit, hat, shoes, age, glasses, bag, prop,
   pose, emotion, words) in the same flat style; facing 1 looks right.

   Local frame as the front view: feet at y + 170·scale, +x is the way the
   figure faces. The far arm and leg are drawn behind the body, darker.
   ========================================================================== */

/* Arm targets per pose in the profile frame, relative to the shoulder:
   [elbow, wrist] for the near and the far arm, and hand shapes. The elbow
   points back and down; the forearm only ever folds forward. */
const SW_SIDE_POSES = {
  idle: { n: [[2, 52], [8, 98]], f: [[-2, 52], [-4, 98]], nh: 'relaxed', fh: 'relaxed' },
  walk: { n: [[2, 52], [8, 98]], f: [[-2, 52], [-4, 98]], nh: 'relaxed', fh: 'relaxed' },
  present: { n: [[4, 52], [50, 34]], f: [[-2, 52], [-4, 98]], nh: 'open', fh: 'relaxed' },
  explain: { n: [[4, 52], [48, 30]], f: [[2, 52], [40, 40]], nh: 'open', fh: 'open' },
  point: { n: [[46, 12], [96, 2]], f: [[-2, 52], [-4, 98]], nh: 'point', fh: 'relaxed' },
  wave: { n: [[30, 20], [26, -62]], f: [[-2, 52], [-4, 98]], nh: 'open', fh: 'relaxed' },
  hold: { n: [[6, 52], [42, 54]], f: [[4, 52], [38, 58]], nh: 'hold', fh: 'hold' },
  think: { n: [[10, 50], ['chin']], f: [[4, 52], [30, 62]], nh: 'point', fh: 'relaxed' },
  celebrate: { n: [[16, -40], [24, -94]], f: [[10, -42], [16, -96]], nh: 'fist', fh: 'fist' },
  thumbsup: { n: [[6, 52], [44, 30]], f: [[-2, 52], [-4, 98]], nh: 'thumbsup', fh: 'relaxed' },
  shrug: { n: [[4, 50], [40, 36]], f: [[2, 50], [34, 40]], nh: 'open', fh: 'open' }
};

function swSideLimb(ctx, pts, width, color) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
}

function swSideShoe(ctx, a, kind, color, dim) {
  const c = dim ? swShade(color, -0.12) : color;
  ctx.save();
  ctx.translate(a.x, a.y);
  if (kind === 'slipper') {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-9, -4); ctx.quadraticCurveTo(4, -9, 16, -4); ctx.quadraticCurveTo(26, -3, 30, -9); ctx.quadraticCurveTo(30, 2, 22, 7); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
  } else if (kind === 'boot') {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-9, -20); ctx.lineTo(7, -20); ctx.lineTo(8, -4); ctx.quadraticCurveTo(22, -3, 24, 4); ctx.lineTo(24, 8); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
  } else {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.moveTo(-9, -6); ctx.quadraticCurveTo(2, -10, 12, -5); ctx.quadraticCurveTo(24, -2, 25, 4); ctx.lineTo(25, 8); ctx.lineTo(-10, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = swShade(c, -0.28); ctx.fillRect(-10, 5.5, 35, 2.5);
  }
  ctx.restore();
}

/* The head in profile, facing +x, centred on (0, 0) with radius ~30. */
function swSideHead(ctx, o) {
  const { skin, skinSh, hairC, hair, beard, hat, ink, emo, vis, blink, eyeColor, glasses, hatC, accent, lagX } = o;
  const P = new Path2D();
  P.moveTo(-12, 26);
  P.bezierCurveTo(-30, 18, -32, -12, -22, -26);
  P.bezierCurveTo(-12, -36, 10, -36, 20, -22);
  P.bezierCurveTo(24, -15, 24, -9, 25, -5);
  P.bezierCurveTo(27, -1, 32, 4, 32, 7);
  P.bezierCurveTo(32, 9, 28, 10, 25, 10);
  P.bezierCurveTo(26, 13, 26, 15, 25, 16);
  P.bezierCurveTo(26, 18, 25, 20, 24, 21);
  P.bezierCurveTo(24, 26, 21, 30, 15, 31);
  P.bezierCurveTo(8, 32, 2, 30, -2, 27);
  P.closePath();
  /* under a fez or a cap hair is cut to the region below the rim, which
     behind the head runs down along the skull, so nothing shows above or
     around the hat */
  const rim = hair === 'hijab' ? null : hat === 'fez'
    ? 'M-90 40 L-37 20 C-34 6 -31 -2 -28 -8 Q-3 -20 20 -14 L90 -14 L90 140 L-90 140 Z'
    : hat === 'cap' ? 'M-90 40 L-38 20 C-36 8 -33 1 -31 -4 C-16 -14 6 -17 22 -12 L90 -12 L90 140 L-90 140 Z' : null;
  const underRim = draw => {
    if (!rim) { draw(); return; }
    ctx.save(); ctx.clip(new Path2D(rim)); draw(); ctx.restore();
  };
  /* hair behind the head (long hair falls behind the shoulders) */
  ctx.fillStyle = hairC;
  if (hair === 'long' || hair === 'bob') underRim(() => {
    ctx.beginPath();
    ctx.moveTo(4, -32); ctx.bezierCurveTo(-26, -40, -40, -14, -32, hair === 'long' ? 40 + lagX * 0.3 : 20);
    ctx.lineTo(hair === 'long' ? -10 + lagX * 0.3 : -14, hair === 'long' ? 60 : 26);
    ctx.bezierCurveTo(-20, 20, -14, 0, 4, -20); ctx.closePath(); ctx.fill();
  });
  if (hair === 'hijab') {
    ctx.beginPath();
    ctx.moveTo(22, -24); ctx.bezierCurveTo(14, -44, -34, -44, -36, -6); ctx.bezierCurveTo(-38, 24, -30, 46, -16, 56);
    ctx.lineTo(16, 50); ctx.bezierCurveTo(20, 40, 18, 32, 12, 30); ctx.bezierCurveTo(2, 30, -2, 24, -4, 10);
    ctx.bezierCurveTo(-4, -8, 6, -18, 22, -24); ctx.closePath(); ctx.fill();
  }
  ctx.fillStyle = skin; ctx.fill(P);
  ctx.save(); ctx.clip(P);
  ctx.fillStyle = 'rgba(150,60,50,0.08)'; ctx.beginPath(); ctx.ellipse(-20, 4, 16, 34, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  /* ear */
  if (hair !== 'hijab') {
    ctx.fillStyle = skinSh; ctx.beginPath(); ctx.ellipse(-4, 3, 5, 7.5, 0.15, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = swShade(skin, -0.3); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(-4, 3, 3, -1.2, 1.4); ctx.stroke();
  }
  /* blush */
  if (!beard && emo.blush > 0.02) { ctx.fillStyle = 'rgba(240,108,130,' + (emo.blush * 0.5).toFixed(3) + ')'; ctx.beginPath(); ctx.ellipse(12, 10, 5, 3.4, 0, 0, Math.PI * 2); ctx.fill(); }
  /* eye, lash and brow */
  const lid = ecClamp(emo.lid * blink * (1 - emo.squint * 0.4), 0.05, 1.3);
  if (lid < 0.3 || emo.squint > 0.6) {
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(11, -3); ctx.quadraticCurveTo(15, emo.squint > 0.6 ? -6 : -1, 18, -3); ctx.stroke();
  } else {
    ctx.fillStyle = ink; ctx.beginPath(); ctx.ellipse(15.5, -3, 2.6, 3.6 * lid, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(16.3, -4.2, 0.9, 0, Math.PI * 2); ctx.fill();
  }
  ctx.strokeStyle = swMix(hairC, ink, 0.3); ctx.lineWidth = 2.6; ctx.lineCap = 'round';
  const by = -12 - emo.brow * 3;
  ctx.beginPath(); ctx.moveTo(9, by + emo.browTilt * 2); ctx.quadraticCurveTo(15, by - 2, 21, by + 0.5 - emo.browTilt * 1.5); ctx.stroke();
  /* nose line */
  ctx.strokeStyle = swShade(skin, -0.2); ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(29, 8); ctx.quadraticCurveTo(27, 10, 25, 9.5); ctx.stroke();
  /* mouth: a line with the smile, or an opening at the front for a viseme */
  const open = Math.max(ecN(vis.open, 0), ecN(emo.mouthO, 0) * 0.6);
  if (open < 0.08) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(18, 16 + emo.smile * 0.5); ctx.quadraticCurveTo(21.5, 17 + emo.smile * 1.5, 25, 15.5 - emo.smile * 1.2); ctx.stroke();
  } else {
    const h = 1.5 + open * 6;
    ctx.fillStyle = '#5B1E2B';
    ctx.beginPath(); ctx.moveTo(18, 15.5); ctx.quadraticCurveTo(22, 15, 25.5, 14.5); ctx.quadraticCurveTo(26, 15.5 + h, 21, 15.5 + h); ctx.quadraticCurveTo(18, 15.5 + h * 0.6, 18, 15.5); ctx.fill();
  }
  /* beard */
  if (beard) {
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.moveTo(-3, 8); ctx.bezierCurveTo(0, 20, 8, 20, 14, 19); ctx.lineTo(18, 21); ctx.lineTo(25, 21);
    if (beard === 'long') { ctx.bezierCurveTo(26, 40, 20, 58, 10, 66); ctx.bezierCurveTo(4, 50, 0, 36, -4, 26); }
    else { ctx.bezierCurveTo(25, 28, 20, 33, 12, 33); ctx.bezierCurveTo(4, 33, -2, 28, -4, 20); }
    ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(16, 13); ctx.quadraticCurveTo(22, 11, 27, 13); ctx.lineTo(26, 14.5); ctx.quadraticCurveTo(21, 13.5, 16, 15); ctx.fill();
  }
  /* a headscarf covers the crown, the back of the head, the ear and the
     neck, leaving the face open from the brow to the chin */
  if (hair === 'hijab') {
    ctx.fillStyle = hairC;
    ctx.beginPath();
    ctx.moveTo(25, -24);
    ctx.bezierCurveTo(16, -48, -36, -48, -39, -6);
    ctx.bezierCurveTo(-41, 24, -33, 46, -16, 56);
    ctx.lineTo(18, 50);
    ctx.bezierCurveTo(22, 42, 20, 35, 14, 32);
    ctx.bezierCurveTo(4, 27, 1, 12, 2, -2);
    ctx.bezierCurveTo(3, -14, 11, -21, 25, -24);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = swShade(hairC, 0.25); ctx.globalAlpha = 0.45; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(4, 6); ctx.bezierCurveTo(4, -10, 10, -19, 24, -23); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  /* hair over the head (under a hat only what shows below its rim) */
  ctx.fillStyle = hairC;
  underRim(() => {
    if (rim && hair !== 'bald') {
      /* under a fez or a cap only the hair below the rim shows, at the back;
         curls are small bumps along its edge, never a clump behind the head */
      ctx.beginPath(); ctx.moveTo(-28, -9); ctx.bezierCurveTo(-32, 0, -29, 10, -23, 14); ctx.bezierCurveTo(-21, 6, -19, -1, -16, -7); ctx.closePath(); ctx.fill();
      if (hair === 'curly') for (const [cx, cy] of [[-27.5, -4], [-28, 2.5], [-26.5, 8.5], [-23.5, 12.5]]) { ctx.beginPath(); ctx.arc(cx, cy, 3.6, 0, Math.PI * 2); ctx.fill(); }
    } else if (hair === 'short' || hair === 'bob' || hair === 'long' || hair === 'bun') {
      ctx.beginPath();
      ctx.moveTo(20, -21); ctx.bezierCurveTo(12, -40, -24, -40, -30, -12); ctx.bezierCurveTo(-32, 0, -28, 10, -22, 14);
      ctx.bezierCurveTo(-20, 4, -14, -4, -8, -8); ctx.bezierCurveTo(0, -14, 10, -16, 20, -21); ctx.closePath(); ctx.fill();
      if (hair === 'bun') { ctx.beginPath(); ctx.arc(-22, -28, 9, 0, Math.PI * 2); ctx.fill(); }
    } else if (hair === 'curly') {
      for (const [cx, cy, r] of [[14, -28, 8], [2, -34, 9], [-11, -33, 9], [-22, -24, 9], [-28, -11, 8], [-26, 2, 7], [-8, -24, 8]]) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); }
    }
  });
  /* headwear */
  if (hat === 'turban') {
    ctx.fillStyle = hatC;
    ctx.beginPath(); ctx.moveTo(-32, -8); ctx.bezierCurveTo(-38, -46, 6, -64, 24, -32); ctx.bezierCurveTo(26, -24, 25, -18, 22, -16); ctx.bezierCurveTo(6, -22, -18, -18, -32, -8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = swShade(hatC, -0.2); ctx.lineWidth = 2;
    for (const k of [0, 1, 2]) { ctx.beginPath(); ctx.moveTo(-30 + k * 4, -16 - k * 10); ctx.quadraticCurveTo(0, -30 - k * 12, 22 - k * 3, -22 - k * 8); ctx.stroke(); }
    ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(16, -30, 4, 0, Math.PI * 2); ctx.fill();
  } else if (hat === 'fez') {
    ctx.fillStyle = hatC;
    ctx.beginPath(); ctx.moveTo(-28, -8); ctx.lineTo(-20, -50); ctx.lineTo(12, -50); ctx.lineTo(20, -14); ctx.quadraticCurveTo(-3, -20, -28, -8); ctx.fill();
    ctx.fillStyle = swShade(hatC, -0.22);
    ctx.beginPath(); ctx.moveTo(-28, -8); ctx.quadraticCurveTo(-3, -20, 20, -14); ctx.lineTo(19, -20); ctx.quadraticCurveTo(-3, -26, -27, -14); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -50); ctx.quadraticCurveTo(-20, -49, -24, -32); ctx.stroke();
  } else if (hat === 'cap') {
    ctx.fillStyle = hatC;
    ctx.beginPath(); ctx.moveTo(-31, -8); ctx.bezierCurveTo(-36, -50, 16, -58, 22, -16); ctx.bezierCurveTo(6, -21, -16, -18, -31, -8); ctx.fill();
    ctx.fillStyle = swShade(hatC, -0.22);
    ctx.beginPath(); ctx.moveTo(-31, -8); ctx.bezierCurveTo(-16, -18, 6, -21, 22, -16); ctx.lineTo(22, -12); ctx.bezierCurveTo(6, -17, -16, -14, -31, -4); ctx.closePath(); ctx.fill();
  }
  if (glasses) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(16, -3, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, -4); ctx.lineTo(-2, -2); ctx.stroke();
  }
}

function swProfileCharacter(ctx, opts) {
  opts = Object.assign({}, opts || {});
  const time = ecN(opts.time, 0), lt = ecN(opts.localTime, time);
  const W = ecN(opts.W, 1080), H = ecN(opts.H, 1920);
  const nrmX = v => (v <= 1.5 && v >= -0.5 ? v * W : v), nrmY = v => (v <= 1.5 && v >= -0.5 ? v * H : v);
  for (const key of SW_CHAR_KEYED) if (Array.isArray(opts[key])) opts[key] = swAnim(opts[key], lt, undefined);
  const x = nrmX(ecN(opts.x, 0.22)), y0 = nrmY(ecN(opts.y, 0.62));
  const sc0 = ecClamp(ecN(opts.scale, 1), 0.05, 20), sc = sc0 * ecClamp(ecN(opts.heightScale, 1), 0.3, 1.5);
  const y = y0 + 170 * (sc0 - sc);
  const norm = n => String(n || '').toLowerCase().replace(/[^a-z]/g, '');
  /* pose and emotion tracks, as the front view */
  const blendDur = Math.max(0.01, ecN(opts.poseBlend, 0.45));
  const smooth = q => q * q * (3 - 2 * q);
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
  const pT = track(opts.pose, 'idle');
  const known = n => (SW_SIDE_POSES[norm(n)] ? norm(n) : 'idle');
  const poseA = known(pT.a), poseB = known(pT.b), pq = pT.q;
  const pose = pq < 0.5 ? poseA : poseB;
  const pw = n => (poseA === n ? 1 - pq : 0) + (poseB === n ? pq : 0);
  const eT = opts.emotion ? track(opts.emotion, 'neutral') : { a: 'happy', b: 'happy', q: 1 };
  const eRec = n => Object.assign({ asym: 0, mouthO: 0 }, SW_EMOTIONS.neutral, SW_EMOTIONS[norm(n)] || {});
  const eA = eRec(eT.a), eB = eRec(eT.b), emo = {};
  for (const k in eA) emo[k] = eA[k] + (ecN(eB[k], 0) - eA[k]) * eT.q;

  /* look */
  const outfit = ({ jacket: 'blazer', suit: 'blazer', kaftan: 'robe', caftan: 'robe', gown: 'dress', tee: 'tshirt' })[norm(opts.outfit)] || norm(opts.outfit) || 'blazer';
  const skin = opts.skinColor || '#F2C4A2', skinSh = swShade(skin, -0.16);
  const hairC = opts.hairColor || '#2B2233', shirt = opts.shirtColor || '#38BDF8', jacket = opts.jacketColor || '#1E293B';
  const pants = opts.pantsColor || '#273449', accent = opts.accentColor || '#F59E0B', ink = '#1B1B2F';
  const hatC = opts.hatColor || (norm(opts.hat) === 'fez' ? '#B3261E' : norm(opts.hat) === 'cap' ? '#334155' : '#F5F0E6');
  const shoesAsked = norm(opts.shoes);
  const shoeKind = shoesAsked || ((outfit === 'robe' || outfit === 'dress') ? 'slipper' : 'sneaker');
  const shoeC = opts.shoeColor || (shoeKind === 'sneaker' ? '#F1F5F9' : '#6D4C41');
  const hair = norm(opts.hair || opts.hairStyle) || 'short';
  const beard = ({ full: 'full', long: 'long' })[norm(opts.beard)] || '';
  const hat = ({ turban: 'turban', fez: 'fez', cap: 'cap' })[norm(opts.hat)] || '';
  const garment = outfit === 'robe' || outfit === 'blazer' ? jacket : shirt;

  /* facing: a pointing target, an explicit facing, or the way of travel */
  const vx0 = ecN(opts.vx, 0);
  let aim = null;
  if (opts.pointAt && typeof opts.pointAt === 'object' && typeof opts.pointAt.x === 'number') aim = { x: nrmX(opts.pointAt.x), y: nrmY(opts.pointAt.y) };
  const facing = aim ? (aim.x >= x ? 1 : -1) : opts.facing != null ? (ecN(opts.facing, 1) >= 0 ? 1 : -1) : (Math.abs(vx0) > 30 ? Math.sign(vx0) : 1);
  const toLocal = (px, py) => ({ x: (px - x) / sc * facing, y: (py - y) / sc });
  const toWorld = p => ({ x: x + p.x * sc * facing, y: y + p.y * sc });

  /* motion */
  const walkAmt = ecClamp(ecN(opts.walkAmount, pw('walk')), 0, 1);
  const cad = ecN(opts.cadence, 1.6) * Math.PI, ph = time * cad;
  const breathe = Math.sin(time * 2.1);
  const seated = !!opts.seated;
  const crouch = seated ? 0 : ecClamp(ecN(opts.crouch, 0), 0, 1);
  const stoop = ecClamp(ecN(opts.stoop, 0), 0, 1);
  const S = SW_TOON.flat, GROUND = 170, ankleY = GROUND - 8;
  const legLen = (ankleY - S.hipY) / 2;
  const seatDrop = seated ? swSeatDrop(S) : 0, crouchDrop = crouch * legLen * 1.0;
  const bob = walkAmt * (Math.abs(Math.sin(ph)) * 4 - 2);
  const hipX = -crouch * 14, hipY = S.hipY + bob + seatDrop + crouchDrop;
  const shY = S.sh + bob + seatDrop + crouchDrop * 1.25 + stoop * 4 - breathe * 0.8 - 6 * pw('shrug');
  const chestX = crouch * 14 + stoop * 6 + walkAmt * 3;
  const headC = { x: chestX + 5 + stoop * 6, y: shY - S.headGap - 33 * 0.96 + breathe * 0.3 };
  const SH = { x: chestX - 1, y: shY + 9 };

  /* visemes, blink */
  let vis = Object.assign({}, SW_VIS.rest);
  if (typeof opts.mouth === 'number') vis = swVisBlend(SW_VIS.rest, SW_VIS.A, ecClamp(opts.mouth, 0, 1) * 0.85);
  else if (opts.speaking !== false && Array.isArray(opts.words) && opts.words.length) vis = SWDraw.viseme(opts.words, time);
  const who = String(opts.cast || opts.speaker || opts.label || '');
  let seedH = 7; for (let i = 0; i < who.length; i++) seedH = (seedH * 31 + who.charCodeAt(i)) >>> 0;
  const bp = 3.2 + (seedH % 100) / 62, bph = (time + (seedH % 37) / 10) % bp;
  const blink = bph > bp - 0.16 ? Math.abs((bph - (bp - 0.08)) / 0.08) : 1;
  const beat = opts.speaking !== false && opts.gestures !== false && Array.isArray(opts.words) && opts.words.length ? swBeat(opts.words, time) : 0;
  /* a tilt bows the head forward (toward whoever the figure faces) */
  let headRot = ecN(opts.headTilt, 0) * 0.45 + Math.sin(time * 1.3 + (seedH % 7)) * 0.02 + beat * 0.05;
  if (opts.lookAt && typeof opts.lookAt === 'object' && typeof opts.lookAt.y === 'number') {
    const L = toLocal(opts.lookAt.x, opts.lookAt.y);
    headRot += ecClamp(Math.atan2(L.y - headC.y, Math.abs(L.x - headC.x) + 1) * 0.35, -0.2, 0.2);
  }

  /* arms: targets from the pose (or the call), solved with the elbow
     bending forward */
  const L1 = S.arm[0], L2 = S.arm[1];
  const chin = { x: headC.x + 20, y: headC.y + 30 };
  const armTarget = (spec, side) => {
    const P = SW_SIDE_POSES[spec] || SW_SIDE_POSES.idle;
    const pair = side > 0 ? P.n : P.f;
    if (pair[1][0] === 'chin') return { x: chin.x - 12, y: chin.y - 2 };
    let tx = SH.x + pair[1][0], ty = SH.y + pair[1][1];
    if ((spec === 'walk' || walkAmt > 0) && pair[1][1] > 90) {
      /* the swing: the upper arm rocks about the shoulder; the forearm
         folds forward more as the arm comes forward, and the arm hangs
         nearly straight as it goes back */
      const sw = Math.sin(ph + (side > 0 ? Math.PI : 0)) * walkAmt;
      const a = sw * 0.42, bend = 0.1 + Math.max(0, sw) * 0.42;
      const ex = SH.x + Math.sin(a) * L1, ey = SH.y + Math.cos(a) * L1;
      tx = ex + Math.sin(a + bend) * L2; ty = ey + Math.cos(a + bend) * L2;
    }
    if (spec === 'wave' && side > 0) tx += Math.sin(time * 8) * 6;
    if (spec === 'explain') ty += Math.sin(time * 2.6 + (side > 0 ? 0 : Math.PI)) * 5;
    return { x: tx, y: ty };
  };
  const lerpP = (A, B) => ({ x: A.x + (B.x - A.x) * pq, y: A.y + (B.y - A.y) * pq });
  let tN = lerpP(armTarget(poseA, 1), armTarget(poseB, 1)), tF = lerpP(armTarget(poseA, -1), armTarget(poseB, -1));
  tN.y -= beat * 6 * (pw('present') + pw('explain'));
  let hN = (SW_SIDE_POSES[pose] || SW_SIDE_POSES.idle).nh, hF = (SW_SIDE_POSES[pose] || SW_SIDE_POSES.idle).fh;
  const ptL = pt => (pt && typeof pt.x === 'number' && typeof pt.y === 'number') ? toLocal(nrmX(pt.x), nrmY(pt.y)) : null;
  const oR = ptL(opts.rightHand), oL = ptL(opts.leftHand);
  if (oR) tN = oR;
  if (oL) tF = oL;
  if (aim) { const A = toLocal(aim.x, aim.y), d = Math.hypot(A.x - SH.x, A.y - SH.y) || 1, k = ecClamp(ecN(opts.pointAmount, 1), 0, 1); tN = { x: tN.x + ((SH.x + (A.x - SH.x) / d * 96) - tN.x) * k, y: tN.y + ((SH.y + (A.y - SH.y) / d * 96) - tN.y) * k }; if (k > 0.5) hN = 'point'; }
  if (opts.rightHandPose || opts.handPose) hN = opts.rightHandPose || opts.handPose;
  if (opts.leftHandPose) hF = opts.leftHandPose;
  if (opts.prop && !opts.rightHandPose && !opts.handPose && hN !== 'point') hN = 'hold';
  const solve = T => swToonIK(SH, T, L1, L2, J => (T.x - SH.x) * (J.y - SH.y) - (T.y - SH.y) * (J.x - SH.x));

  const joints = { ground: GROUND, ankleY, legLen, upper: L1, fore: L2, chestX, hipY, seated, view: 'side', legs: [], arms: {} };
  const sleeveShort = outfit === 'tshirt';
  const drawArm = (side, T, shape) => {
    const ik = solve(T);
    const pts = [SH, ik.J, ik.E];
    const dim = side < 0;
    const sl = dim ? swShade(garment, -0.14) : garment, sk = dim ? swShade(skin, -0.1) : skin;
    swSideLimb(ctx, pts, 12.5, sk);
    if (sleeveShort) swSideLimb(ctx, [SH, { x: SH.x + (ik.J.x - SH.x) * 0.45, y: SH.y + (ik.J.y - SH.y) * 0.45 }], 16, sl);
    else {
      const cuff = { x: ik.J.x + (ik.E.x - ik.J.x) * 0.86, y: ik.J.y + (ik.E.y - ik.J.y) * 0.86 };
      swSideLimb(ctx, [SH, ik.J, cuff], outfit === 'robe' ? 17 : 15, sl);
      if (outfit === 'robe') { ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(cuff.x, cuff.y, 8.5, 0, Math.PI * 2); ctx.fill(); }
    }
    const a = Math.atan2(ik.E.y - ik.J.y, ik.E.x - ik.J.x);
    const handA = shape === 'open' && (pose === 'present' || pose === 'explain' || pose === 'shrug') ? a - 0.35 : a;
    ctx.save(); ctx.translate(ik.E.x, ik.E.y); ctx.rotate(handA);
    const tip = swToonHand(ctx, shape, 15 * 0.8, sk, skinSh, 'flat', shape === 'thumbsup' ? -1 : (Math.cos(handA) > 0 ? -1 : 1));
    ctx.restore();
    joints.arms[side > 0 ? 'r' : 'l'] = { shoulder: SH, elbow: ik.J, wrist: ik.E, depth: 0 };
    const c = Math.cos(handA), s = Math.sin(handA);
    return { x: ik.E.x + tip.x * c - tip.y * s, y: ik.E.y + tip.x * s + tip.y * c, wrist: ik.E, angle: handA, len: 30 };
  };
  const hidden = side => opts.hideArm === true || opts.hideArm === (side > 0 ? 'right' : 'left');
  const armMaybe = (side, T, shape) => {
    if (!hidden(side)) return drawArm(side, T, shape);
    ctx.save(); ctx.globalAlpha = 0; const r = drawArm(side, T, shape); ctx.restore(); return r;
  };

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(sc * facing, sc);
  ctx.lineJoin = 'round';
  /* shadow */
  ctx.fillStyle = 'rgba(2,6,23,0.3)';
  ctx.beginPath(); ctx.ellipse(hipX + 4, GROUND + 1, 42, 7, 0, 0, Math.PI * 2); ctx.fill();
  if (seated && opts.chair !== false) {
    const ch = opts.chairColor || '#5D4037';
    ctx.fillStyle = swShade(ch, -0.15);
    ctx.fillRect(hipX - 26, hipY + 6, 6, GROUND - hipY - 6); ctx.fillRect(hipX + 34, hipY + 6, 6, GROUND - hipY - 6);
    ctx.fillStyle = ch;
    ctx.beginPath(); ctx.roundRect(hipX - 30, hipY - 2, 74, 10, 4); ctx.fill();
    ctx.beginPath(); ctx.roundRect(hipX - 32, shY - 4, 9, hipY - shY + 10, 4); ctx.fill();
  }
  /* legs: far then near; a stride front to back, knees forward */
  const footAt = side => {
    if (seated) return null;
    const phs = ph + (side > 0 ? 0 : Math.PI);
    const fx = hipX + (side > 0 ? 4 : -4) * (1 - walkAmt) + walkAmt * Math.sin(phs) * 32 + crouch * 10;
    return { x: fx, y: ankleY - walkAmt * Math.max(0, Math.cos(phs)) * 14 };
  };
  const leg = side => {
    const Hj = { x: hipX, y: hipY };
    let ik;
    if (seated) { const K = { x: hipX + legLen * 0.95, y: hipY + 2 }; ik = { J: K, E: { x: K.x, y: ankleY } }; }
    else {
      const F = footAt(side), d = Math.hypot(F.x - Hj.x, F.y - Hj.y);
      ik = walkAmt > 0.01 || crouch > 0.01 || d < legLen * 1.98 ? swToonIK(Hj, F, legLen, legLen, J => J.x) : { J: { x: (Hj.x + F.x) / 2, y: (Hj.y + F.y) / 2 }, E: F };
    }
    joints.legs.push({ hip: Hj, knee: ik.J, ankle: ik.E, back: side < 0 });
    swSideLimb(ctx, [Hj, ik.J, ik.E], side < 0 ? 17 : 18, side < 0 ? swShade(pants, -0.12) : pants);
    swSideShoe(ctx, ik.E, shoeKind === 'sneaker' ? 'sneaker' : shoeKind, shoeC, side < 0);
  };
  const lagX = SWDraw.lag(t => Math.sin(t * 1.25) * 2 + walkAmt * Math.sin(t * cad) * 3, time, { freq: 2.2, damping: 0.25 }) - (walkAmt * 0.6 + ecClamp(vx0 / 400, -1, 1) * facing) * 6;
  /* long hair behind */
  ctx.save(); ctx.translate(headC.x, headC.y); ctx.rotate(headRot);
  if (hair === 'long') { ctx.fillStyle = hairC; ctx.beginPath(); ctx.moveTo(-20, -10); ctx.bezierCurveTo(-36, 10, -34 + lagX * 0.3, 50, -22 + lagX * 0.5, 74); ctx.lineTo(-6 + lagX * 0.5, 72); ctx.bezierCurveTo(-14, 40, -10, 10, -4, -6); ctx.closePath(); ctx.fill(); }
  ctx.restore();
  leg(-1);
  const farTip = armMaybe(-1, tF, hF);
  leg(1);
  /* torso, side-on: chest forward, back behind; long garments to the
     ankles with a little flare and sway */
  const long = outfit === 'robe' || outfit === 'dress';
  const top = shY - 2, bot = long ? ankleY - 12 : hipY + (outfit === 'blazer' ? 14 : outfit === 'hoodie' ? 10 : 4);
  const flare = long ? 14 + walkAmt * Math.sin(ph) * 4 : 0;
  ctx.fillStyle = garment;
  ctx.beginPath();
  ctx.moveTo(chestX - 14, top + 4);
  ctx.quadraticCurveTo(chestX - 12, top - 2, chestX - 2, top - 2);
  ctx.quadraticCurveTo(chestX + 14, top, chestX + 16, top + 22);
  ctx.quadraticCurveTo(chestX + 16, hipY - 34, hipX + 12, hipY - 14);
  ctx.lineTo(hipX + 13 + flare, bot);
  ctx.lineTo(hipX - 15 - flare * 0.6, bot);
  ctx.lineTo(hipX - 15, hipY - 10);
  ctx.quadraticCurveTo(chestX - 20, hipY - 40, chestX - 14, top + 4);
  ctx.closePath();
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(2,6,23,0.12)'; ctx.fillRect(chestX - 30, top - 10, 14, bot - top + 20);
  if (outfit === 'blazer' || outfit === 'robe') {
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.moveTo(chestX + 6, top); ctx.lineTo(chestX + 16, top + 4); ctx.lineTo(chestX + 16, outfit === 'robe' ? bot : hipY - 18); ctx.lineTo(chestX + 10, outfit === 'robe' ? bot : hipY - 18); ctx.fill();
  }
  if (outfit === 'robe') { ctx.fillStyle = accent; ctx.fillRect(hipX - 30, hipY - 44, 60, 10); }
  if (outfit === 'dress') { ctx.fillStyle = swShade(shirt, -0.18); ctx.fillRect(hipX - 30, hipY - 42, 60, 6); }
  if (outfit === 'hoodie') { ctx.fillStyle = swShade(shirt, -0.15); ctx.beginPath(); ctx.ellipse(chestX - 10, top + 2, 10, 7, 0, 0, Math.PI * 2); ctx.fill(); }
  ctx.restore();
  /* bag on the hip behind, strap across */
  if (opts.bag) {
    const bagC = typeof opts.bag === 'string' && /^#/.test(opts.bag) ? opts.bag : '#8D6E63';
    ctx.strokeStyle = swShade(bagC, -0.25); ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(chestX + 4, top + 2); ctx.lineTo(hipX - 14, hipY - 16); ctx.stroke();
    ctx.fillStyle = bagC; ctx.beginPath(); ctx.roundRect(hipX - 28, hipY - 26, 22, 20, 5); ctx.fill();
    ctx.fillStyle = swShade(bagC, -0.18); ctx.beginPath(); ctx.roundRect(hipX - 28, hipY - 26, 22, 10, 5); ctx.fill();
  }
  /* neck and head */
  ctx.fillStyle = skinSh;
  ctx.beginPath(); ctx.roundRect(chestX - 4, headC.y + 20, 12, top - headC.y - 16, 4); ctx.fill();
  ctx.save(); ctx.translate(headC.x, headC.y); ctx.rotate(headRot);
  swSideHead(ctx, { skin, skinSh, hairC, hair, beard, hat, ink, emo, vis, blink, eyeColor: opts.eyeColor, glasses: !!opts.glasses, hatC, accent, lagX });
  ctx.restore();
  const nearTip = armMaybe(1, tN, hN);
  if (opts.prop) swToonProp(ctx, String(opts.prop).toLowerCase(), nearTip, accent, ink);
  ctx.restore();
  if (opts.label) {
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.font = '700 22px "Space Grotesk", sans-serif';
    const lw = ctx.measureText(opts.label).width + 32;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)'; ctx.strokeStyle = opts.labelColor || garment; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(-lw / 2, GROUND + 16, lw, 38, 19); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F8FAFC'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(opts.label, 0, GROUND + 35.5);
    ctx.restore();
  }
  return { facing, style: 'side', view: 'side', joints, fingertip: toWorld(nearTip), nearHand: toWorld(farTip), head: toWorld(headC), pose };
}
