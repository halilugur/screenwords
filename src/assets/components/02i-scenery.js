/* ==========================================================================
   Scenery from parts: a place described as data instead of a ready-made
   set, so an agent can stage any setting — a walled town, a market, a
   hall with arched windows, a hillside — from generic pieces in one
   consistent flat style.

     SWDraw.scenery(ctx, spec, { W, H, time, night, camX, layer })
     spec: {
       theme:  sand | verdant | stone | modern   (or colors: {...} overrides)
       inside: false (sky, hills, ground) | true (wall, tile band, floor)
       floor:  0..1 of H where feet stand (default 0.8)
       sun / moon / clouds / hills: true | false
       frame:  true for an ornamental border round the picture
       pieces: [{ part, x, w, h, layer: 'far' | 'mid' | 'front', color }]
     }
   Pieces (x is the centre 0..1 across, w and h are 0..1 of the short side):
     outside — wall, gate, tower, dome, minaret, house, stall, tree,
               cypress, palm, flowers, well, banner
     inside  — arch (window), column, divan, rug, lamp, shelf, table,
               curtain
   ========================================================================== */

const SW_SCENERY_THEMES = {
  sand: { sky: '#BFE0F0', sky2: '#F4EBD6', hill: '#C9B48A', hill2: '#A9946B', ground: '#E6D3A8', ground2: '#D4BE8D', path: '#EFE2C2',
    stone: '#D8B98A', stone2: '#B9935F', roof: '#3E6FB0', roof2: '#2D5590', accent: '#B23A2E', accent2: '#E0A43A', wood: '#7A5233',
    leaf: '#4F8A4A', leaf2: '#3E6E3A', wall: '#EDE2C8', wall2: '#D9C9A3', tile1: '#2F5D9B', tile2: '#F2EBDD', floor: '#9C3B32', ink: '#2B2222', frame: '#1F3A6B' },
  verdant: { sky: '#A9DCF5', sky2: '#EAF6FC', hill: '#8FC27A', hill2: '#6FA65C', ground: '#86BD67', ground2: '#6EA352', path: '#E1CB9B',
    stone: '#CFC6B4', stone2: '#A99F8B', roof: '#B5533C', roof2: '#8F3E2C', accent: '#D96C4A', accent2: '#F2C14E', wood: '#7A5233',
    leaf: '#3E8E41', leaf2: '#2F6E33', wall: '#F3EBDD', wall2: '#E2D5BE', tile1: '#3A7D6B', tile2: '#F4EFE4', floor: '#8C5A3C', ink: '#263026', frame: '#3E5A3A' },
  stone: { sky: '#B7C7D6', sky2: '#E8EDF2', hill: '#8E9AA6', hill2: '#717D8A', ground: '#A3A39C', ground2: '#8C8C84', path: '#C9C6BC',
    stone: '#9DA3A8', stone2: '#7B8187', roof: '#4E5D6C', roof2: '#3B4856', accent: '#8C2F39', accent2: '#C9A227', wood: '#5D4632',
    leaf: '#4D7A4E', leaf2: '#3B5F3C', wall: '#D9D6CE', wall2: '#C2BEB4', tile1: '#4E5D6C', tile2: '#E8E5DE', floor: '#5C4A3D', ink: '#1F2328', frame: '#3B4856' },
  modern: { sky: '#9AD4F5', sky2: '#E9F6FD', hill: '#9FC5A4', hill2: '#7FAF88', ground: '#A7ADB5', ground2: '#8B929B', path: '#CFD4DA',
    stone: '#E9C46A', stone2: '#F4A261', roof: '#8AB6D6', roof2: '#6A98BC', accent: '#E76F51', accent2: '#2A9D8F', wood: '#7B4F35',
    leaf: '#4C9A52', leaf2: '#3A7D40', wall: '#EEF1F5', wall2: '#DCE2E9', tile1: '#3A86FF', tile2: '#F8FAFC', floor: '#8E9AAF', ink: '#1F2937', frame: '#1F2937' }
};

function swSceneryPalette(spec, night) {
  let c = Object.assign({}, SW_SCENERY_THEMES[String(spec.theme || 'sand').toLowerCase()] || SW_SCENERY_THEMES.sand,
    spec.colors && typeof spec.colors === 'object' ? spec.colors : {});
  if (night) {
    const o = {};
    for (const k in c) o[k] = spec.inside ? swMix(c[k], '#2A1A1A', 0.25) : swMix(c[k], '#0B1530', 0.6);
    if (!spec.inside) { o.sky = '#0F1B3D'; o.sky2 = '#25345F'; }
    c = Object.assign(o, spec.colors && typeof spec.colors === 'object' ? spec.colors : {});
  }
  return c;
}

const swR = (ctx, x, y, w, h, col, r) => { ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(x, y, w, h, r || 0); ctx.fill(); };

/* An arched opening (doors and windows): a rectangle under a pointed or
   round arch. */
function swArchPath(ctx, x, y, w, h, pointed) {
  const r = w / 2;
  ctx.beginPath();
  ctx.moveTo(x, y + h);
  ctx.lineTo(x, y + r);
  if (pointed) { ctx.quadraticCurveTo(x, y + r * 0.1, x + r, y - r * 0.35); ctx.quadraticCurveTo(x + w, y + r * 0.1, x + w, y + r); }
  else ctx.arc(x + r, y + r, r, Math.PI, 0);
  ctx.lineTo(x + w, y + h);
  ctx.closePath();
}

/* The pieces. Each draws with its base on the floor line (fy) unless it
   hangs or lies flat. p: { cx, w, h } in px; c the palette; o the frame. */
const SW_SCENERY_PIECES = {
  wall(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x, y, p.w, p.h, c.stone);
    const m = p.h * 0.12;
    for (let k = x; k < x + p.w - 1; k += m * 1.6) swR(ctx, k, y - m, m, m, c.stone);
    ctx.fillStyle = c.stone2;
    for (let r = 0; r < 6; r++) for (let k = 0; k < p.w / (p.h * 0.3); k++) {
      const bx = x + k * p.h * 0.3 + (r % 2 ? p.h * 0.15 : 0), by = y + r * p.h * 0.17 + p.h * 0.05;
      if (bx + p.h * 0.26 < x + p.w) ctx.fillRect(bx, by, p.h * 0.26, 1.5);
    }
  },
  gate(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x, y, p.w, p.h, c.stone);
    swR(ctx, x, y, p.w, p.h * 0.08, c.stone2);
    ctx.fillStyle = c.roof2; swArchPath(ctx, x + p.w * 0.2, y + p.h * 0.22, p.w * 0.6, p.h * 0.78, true); ctx.fill();
    ctx.fillStyle = c.wood; swArchPath(ctx, x + p.w * 0.27, y + p.h * 0.32, p.w * 0.46, p.h * 0.68, true); ctx.fill();
    ctx.strokeStyle = swShade(c.wood, -0.3); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.cx, y + p.h * 0.36); ctx.lineTo(p.cx, fy); ctx.stroke();
    ctx.strokeStyle = c.accent2; ctx.lineWidth = Math.max(2, p.w * 0.015);
    ctx.beginPath(); ctx.moveTo(x + p.w * 0.1, y + p.h * 0.14); ctx.lineTo(x + p.w * 0.9, y + p.h * 0.14); ctx.stroke();
  },
  tower(ctx, p, c, fy, o) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x, y, p.w, p.h, c.stone);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + p.w * 0.62, y, p.w * 0.38, p.h);
    const m = p.w * 0.2;
    for (let k = 0; k < 3; k++) swR(ctx, x + k * m * 2, y - m, m * 1.1, m, c.stone);
    swR(ctx, p.cx - p.w * 0.1, y + p.h * 0.25, p.w * 0.2, p.h * 0.12, c.ink, p.w * 0.1);
    /* a flag on a pole */
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
    /* the pole scales with the tower's width, so the flag stays in frame */
    const pole = p.w * 1.1, top = y - m - pole;
    ctx.beginPath(); ctx.moveTo(p.cx, y - m); ctx.lineTo(p.cx, top); ctx.stroke();
    const fw = p.w * 0.55, wave = Math.sin(o.time * 3) * p.w * 0.05;
    ctx.fillStyle = p.color || c.accent;
    ctx.beginPath(); ctx.moveTo(p.cx, top); ctx.quadraticCurveTo(p.cx + fw * 0.5, top + wave, p.cx + fw, top + pole * 0.14); ctx.lineTo(p.cx, top + pole * 0.32); ctx.fill();
  },
  dome(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, bh = p.h * 0.5, y = fy - bh;
    swR(ctx, x, y, p.w, bh, c.wall2);
    for (let k = 0; k < 3; k++) { ctx.fillStyle = c.roof2; swArchPath(ctx, x + p.w * (0.12 + k * 0.29), y + bh * 0.25, p.w * 0.18, bh * 0.75, true); ctx.fill(); }
    swR(ctx, x + p.w * 0.12, y - p.h * 0.08, p.w * 0.76, p.h * 0.08, c.wall);
    const r = p.w * 0.38, dy = y - p.h * 0.08;
    const g = ctx.createLinearGradient(p.cx - r, 0, p.cx + r, 0);
    g.addColorStop(0, swShade(p.color || c.roof, 0.15)); g.addColorStop(1, swShade(p.color || c.roof, -0.2));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(p.cx - r, dy); ctx.quadraticCurveTo(p.cx - r, dy - r * 1.25, p.cx, dy - r * 1.35); ctx.quadraticCurveTo(p.cx + r, dy - r * 1.25, p.cx + r, dy); ctx.fill();
    ctx.strokeStyle = c.accent2; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.cx, dy - r * 1.35); ctx.lineTo(p.cx, dy - r * 1.6); ctx.stroke();
    ctx.fillStyle = c.accent2; ctx.beginPath(); ctx.arc(p.cx, dy - r * 1.62, r * 0.06, 0, Math.PI * 2); ctx.fill();
  },
  minaret(ctx, p, c, fy) {
    const w = p.w, x = p.cx - w / 2, y = fy - p.h;
    swR(ctx, x, y + p.h * 0.12, w, p.h * 0.88, c.wall);
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(x + w * 0.6, y + p.h * 0.12, w * 0.4, p.h * 0.88);
    swR(ctx, x - w * 0.3, y + p.h * 0.32, w * 1.6, p.h * 0.03, c.stone2);
    swR(ctx, x - w * 0.3, y + p.h * 0.62, w * 1.6, p.h * 0.03, c.stone2);
    ctx.fillStyle = p.color || c.roof;
    ctx.beginPath(); ctx.moveTo(x - w * 0.1, y + p.h * 0.12); ctx.lineTo(p.cx, y - p.h * 0.06); ctx.lineTo(x + w * 1.1, y + p.h * 0.12); ctx.fill();
    ctx.fillStyle = c.roof2;
    for (let k = 0; k < 3; k++) { swArchPath(ctx, p.cx - w * 0.14, y + p.h * (0.18 + k * 0.3), w * 0.28, p.h * 0.09, true); ctx.fill(); }
  },
  house(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x, y, p.w, p.h, p.color || c.wall2);
    swR(ctx, x - p.w * 0.03, y - p.h * 0.05, p.w * 1.06, p.h * 0.07, c.stone2, 3);
    const n = Math.max(1, Math.round(p.w / (p.h * 0.45)));
    for (let k = 0; k < n; k++) {
      const wx = x + (k + 0.5) * p.w / n - p.h * 0.09;
      ctx.fillStyle = c.roof2; swArchPath(ctx, wx, y + p.h * 0.18, p.h * 0.18, p.h * 0.26, false); ctx.fill();
    }
    ctx.fillStyle = c.wood; swArchPath(ctx, p.cx - p.h * 0.13, y + p.h * 0.55, p.h * 0.26, p.h * 0.45, false); ctx.fill();
  },
  stall(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x + p.w * 0.04, y + p.h * 0.2, p.w * 0.04, p.h * 0.8, c.wood);
    swR(ctx, x + p.w * 0.92, y + p.h * 0.2, p.w * 0.04, p.h * 0.8, c.wood);
    const stripes = 7, sw = p.w * 1.04 / stripes;
    for (let k = 0; k < stripes; k++) {
      ctx.fillStyle = k % 2 ? '#F7F1E3' : (p.color || c.roof);
      ctx.beginPath(); ctx.moveTo(x - p.w * 0.02 + k * sw, y + p.h * 0.05); ctx.lineTo(x - p.w * 0.02 + (k + 1) * sw, y + p.h * 0.05);
      ctx.lineTo(x - p.w * 0.02 + (k + 1) * sw, y + p.h * 0.24); ctx.quadraticCurveTo(x - p.w * 0.02 + (k + 0.5) * sw, y + p.h * 0.3, x - p.w * 0.02 + k * sw, y + p.h * 0.24); ctx.fill();
    }
    swR(ctx, x, y + p.h * 0.6, p.w, p.h * 0.4, c.wood, 3);
    swR(ctx, x, y + p.h * 0.6, p.w, p.h * 0.05, swShade(c.wood, 0.25));
    const goods = [c.accent, c.accent2, c.leaf, '#E8D9B5', c.roof];
    for (let k = 0; k < 6; k++) {
      ctx.fillStyle = goods[k % goods.length];
      ctx.beginPath(); ctx.ellipse(x + p.w * (0.12 + k * 0.15), y + p.h * 0.58, p.w * 0.06, p.h * 0.05, 0, Math.PI, 0); ctx.fill();
    }
  },
  tree(ctx, p, c, fy, o) {
    swR(ctx, p.cx - p.w * 0.06, fy - p.h * 0.5, p.w * 0.12, p.h * 0.5, c.wood, 3);
    const sway = Math.sin(o.time * 0.9 + p.cx * 0.01) * p.w * 0.02;
    ctx.fillStyle = c.leaf2; ctx.beginPath(); ctx.arc(p.cx - p.w * 0.2 + sway, fy - p.h * 0.62, p.w * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = c.leaf; ctx.beginPath(); ctx.arc(p.cx + p.w * 0.15 + sway, fy - p.h * 0.7, p.w * 0.36, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = swShade(c.leaf, 0.12); ctx.beginPath(); ctx.arc(p.cx + sway, fy - p.h * 0.86, p.w * 0.28, 0, Math.PI * 2); ctx.fill();
  },
  cypress(ctx, p, c, fy, o) {
    const sway = Math.sin(o.time * 0.8 + p.cx * 0.02) * p.w * 0.05;
    ctx.fillStyle = c.leaf2;
    ctx.beginPath(); ctx.moveTo(p.cx - p.w / 2, fy); ctx.quadraticCurveTo(p.cx - p.w * 0.6, fy - p.h * 0.6, p.cx + sway, fy - p.h);
    ctx.quadraticCurveTo(p.cx + p.w * 0.6, fy - p.h * 0.6, p.cx + p.w / 2, fy); ctx.fill();
    ctx.fillStyle = swShade(c.leaf2, 0.15);
    ctx.beginPath(); ctx.moveTo(p.cx - p.w * 0.25, fy - p.h * 0.05); ctx.quadraticCurveTo(p.cx - p.w * 0.35, fy - p.h * 0.6, p.cx + sway, fy - p.h * 0.96); ctx.quadraticCurveTo(p.cx - p.w * 0.05, fy - p.h * 0.5, p.cx - p.w * 0.05, fy - p.h * 0.05); ctx.fill();
  },
  palm(ctx, p, c, fy, o) {
    ctx.strokeStyle = c.wood; ctx.lineWidth = p.w * 0.1; ctx.lineCap = 'round';
    const tx = p.cx + p.w * 0.15, ty = fy - p.h;
    ctx.beginPath(); ctx.moveTo(p.cx, fy); ctx.quadraticCurveTo(p.cx - p.w * 0.1, fy - p.h * 0.5, tx, ty); ctx.stroke();
    ctx.fillStyle = c.leaf;
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI / 2 + (k - 3) * 0.55 + Math.sin(o.time + k) * 0.04, L = p.w * 0.75;
      ctx.beginPath(); ctx.moveTo(tx, ty);
      ctx.quadraticCurveTo(tx + Math.cos(a - 0.3) * L * 0.6, ty + Math.sin(a - 0.3) * L * 0.6, tx + Math.cos(a) * L, ty + Math.sin(a) * L + L * 0.25);
      ctx.quadraticCurveTo(tx + Math.cos(a + 0.3) * L * 0.6, ty + Math.sin(a + 0.3) * L * 0.6, tx, ty); ctx.fill();
    }
  },
  flowers(ctx, p, c, fy) {
    const n = Math.max(3, Math.round(p.w / (p.h * 0.8)));
    for (let k = 0; k < n; k++) {
      const fx = p.cx - p.w / 2 + (k + 0.5) * p.w / n, h = p.h * (0.6 + 0.4 * ecHash(k + p.cx));
      ctx.strokeStyle = c.leaf2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - h); ctx.stroke();
      ctx.fillStyle = [c.accent, c.accent2, '#F2EBDD', c.roof][k % 4];
      for (let q = 0; q < 5; q++) { const a = q * 1.256; ctx.beginPath(); ctx.arc(fx + Math.cos(a) * p.h * 0.12, fy - h + Math.sin(a) * p.h * 0.12, p.h * 0.09, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  well(ctx, p, c, fy) {
    const x = p.cx - p.w / 2;
    swR(ctx, x, fy - p.h * 0.45, p.w, p.h * 0.45, c.stone, 4);
    swR(ctx, x - p.w * 0.05, fy - p.h * 0.5, p.w * 1.1, p.h * 0.08, c.stone2, 3);
    swR(ctx, x + p.w * 0.05, fy - p.h, p.w * 0.06, p.h * 0.5, c.wood);
    swR(ctx, x + p.w * 0.89, fy - p.h, p.w * 0.06, p.h * 0.5, c.wood);
    ctx.fillStyle = p.color || c.roof;
    ctx.beginPath(); ctx.moveTo(x - p.w * 0.1, fy - p.h * 0.95); ctx.lineTo(p.cx, fy - p.h * 1.25); ctx.lineTo(x + p.w * 1.1, fy - p.h * 0.95); ctx.fill();
  },
  banner(ctx, p, c, fy, o) {
    const y = fy - p.h, wave = Math.sin(o.time * 2) * p.w * 0.04;
    ctx.strokeStyle = c.ink; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.cx - p.w / 2, y); ctx.quadraticCurveTo(p.cx, y + p.h * 0.1, p.cx + p.w / 2, y); ctx.stroke();
    const n = Math.max(3, Math.round(p.w / (p.h * 0.5)));
    for (let k = 0; k < n; k++) {
      const fx = p.cx - p.w / 2 + (k + 0.5) * p.w / n, sag = Math.sin((k + 0.5) / n * Math.PI) * p.h * 0.08;
      ctx.fillStyle = [c.accent, c.accent2, c.roof, c.leaf][k % 4];
      ctx.beginPath(); ctx.moveTo(fx - p.h * 0.12, y + sag); ctx.lineTo(fx + p.h * 0.12, y + sag); ctx.lineTo(fx + wave * 0.3, y + sag + p.h * 0.3); ctx.fill();
    }
  },
  /* inside */
  arch(ctx, p, c, fy, o) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    ctx.fillStyle = c.wall2; swArchPath(ctx, x - p.w * 0.08, y - p.w * 0.08, p.w * 1.16, p.h + p.w * 0.08, true); ctx.fill();
    const g = ctx.createLinearGradient(0, y, 0, fy);
    g.addColorStop(0, o.night ? '#14234A' : c.sky); g.addColorStop(1, o.night ? '#2B3C6B' : c.sky2);
    ctx.fillStyle = g; swArchPath(ctx, x, y, p.w, p.h, true); ctx.fill();
    ctx.save(); swArchPath(ctx, x, y, p.w, p.h, true); ctx.clip();
    if (p.view !== false) {
      /* a distant dome through the window */
      ctx.fillStyle = o.night ? '#22305A' : swMix(c.roof, c.sky, 0.35);
      ctx.beginPath(); ctx.arc(p.cx, fy - p.h * 0.18, p.w * 0.22, Math.PI, 0); ctx.fill();
      ctx.fillRect(p.cx - p.w * 0.3, fy - p.h * 0.18, p.w * 0.6, p.h * 0.2);
    }
    ctx.restore();
    swR(ctx, x - p.w * 0.06, fy - p.h * 0.02, p.w * 1.12, p.h * 0.04, c.stone2, 2);
  },
  column(ctx, p, c, fy) {
    const x = p.cx - p.w / 2;
    swR(ctx, x, fy - p.h, p.w, p.h, c.wall2);
    ctx.fillStyle = 'rgba(0,0,0,0.1)'; ctx.fillRect(p.cx, fy - p.h, p.w / 2, p.h);
    swR(ctx, x - p.w * 0.25, fy - p.h, p.w * 1.5, p.h * 0.05, c.stone2, 3);
    swR(ctx, x - p.w * 0.25, fy - p.h * 0.05, p.w * 1.5, p.h * 0.05, c.stone2, 3);
  },
  divan(ctx, p, c, fy) {
    const x = p.cx - p.w / 2;
    swR(ctx, x, fy - p.h * 0.45, p.w, p.h * 0.45, p.color || c.accent, 6);
    swR(ctx, x, fy - p.h * 0.45, p.w, p.h * 0.08, swShade(p.color || c.accent, 0.15), 6);
    const n = Math.max(2, Math.round(p.w / p.h));
    for (let k = 0; k < n; k++) swR(ctx, x + (k + 0.1) * p.w / n, fy - p.h, p.w / n * 0.8, p.h * 0.6, [c.leaf, c.accent2, c.roof][k % 3], p.h * 0.18);
  },
  rug(ctx, p, c, fy) {
    const ry = fy + (p.y || 0);
    ctx.fillStyle = p.color || c.floor;
    ctx.beginPath(); ctx.ellipse(p.cx, ry + p.h * 0.5, p.w / 2, p.h / 2, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = c.accent2; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(p.cx, ry + p.h * 0.5, p.w * 0.44, p.h * 0.4, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = c.accent2;
    ctx.beginPath(); ctx.ellipse(p.cx, ry + p.h * 0.5, p.w * 0.12, p.h * 0.14, 0, 0, Math.PI * 2); ctx.fill();
  },
  lamp(ctx, p, c, fy, o) {
    const y = p.top != null ? p.top : 0, ly = y + p.h;
    ctx.strokeStyle = c.ink; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(p.cx, y); ctx.lineTo(p.cx, ly - p.w * 0.5); ctx.stroke();
    const gl = ctx.createRadialGradient(p.cx, ly, 2, p.cx, ly, p.w * 2.4);
    gl.addColorStop(0, 'rgba(255,214,140,' + (0.35 + 0.05 * Math.sin(o.time * 3)).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.fillStyle = gl; ctx.fillRect(p.cx - p.w * 2.4, ly - p.w * 2.4, p.w * 4.8, p.w * 4.8);
    ctx.fillStyle = c.accent2;
    ctx.beginPath(); ctx.moveTo(p.cx - p.w / 2, ly - p.w * 0.2); ctx.quadraticCurveTo(p.cx, ly - p.w * 0.9, p.cx + p.w / 2, ly - p.w * 0.2); ctx.lineTo(p.cx + p.w * 0.25, ly + p.w * 0.25); ctx.lineTo(p.cx - p.w * 0.25, ly + p.w * 0.25); ctx.fill();
  },
  shelf(ctx, p, c, fy) {
    const x = p.cx - p.w / 2, y = fy - p.h;
    swR(ctx, x, y, p.w, p.h, swShade(c.wood, -0.1), 4);
    const rows = 3;
    for (let r = 0; r < rows; r++) {
      const by = y + (r + 1) * p.h / rows;
      swR(ctx, x, by - 4, p.w, 4, swShade(c.wood, 0.2));
      for (let k = 0; k < 8; k++) {
        const bw = p.w / 10, bh = p.h / rows * (0.55 + 0.3 * ecHash(k + r * 8 + p.cx));
        swR(ctx, x + p.w * 0.05 + k * bw * 1.12, by - 4 - bh, bw, bh, [c.accent, c.roof, c.leaf, c.accent2, '#E8D9B5'][(k + r) % 5], 1);
      }
    }
  },
  table(ctx, p, c, fy) {
    const x = p.cx - p.w / 2;
    swR(ctx, x, fy - p.h, p.w, p.h * 0.18, c.wood, 4);
    swR(ctx, x + p.w * 0.08, fy - p.h * 0.85, p.w * 0.06, p.h * 0.85, swShade(c.wood, -0.2));
    swR(ctx, x + p.w * 0.86, fy - p.h * 0.85, p.w * 0.06, p.h * 0.85, swShade(c.wood, -0.2));
  },
  curtain(ctx, p, c, fy, o) {
    const x = p.cx - p.w / 2, y = fy - p.h, sway = Math.sin(o.time * 0.7) * p.w * 0.02;
    ctx.fillStyle = p.color || c.accent;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + p.w, y); ctx.quadraticCurveTo(x + p.w * 0.6 + sway, y + p.h * 0.5, x + p.w * 0.75, fy); ctx.lineTo(x, fy); ctx.fill();
    ctx.strokeStyle = swShade(p.color || c.accent, -0.2); ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * p.w * 0.2, y); ctx.quadraticCurveTo(x + k * p.w * 0.17 + sway, y + p.h * 0.5, x + k * p.w * 0.18, fy); ctx.stroke(); }
  }
};

function swScenery(ctx, spec, o) {
  spec = spec && typeof spec === 'object' ? spec : {};
  o = o || {};
  const W = ecN(o.W, 1080), H = ecN(o.H, 1920), U = Math.min(W, H), time = ecN(o.time, 0), camX = ecN(o.camX, 0);
  const night = !!(o.night || spec.night);
  const fy = ecClamp(ecN(spec.floor, 0.8), 0.3, 0.98) * H;
  const c = swSceneryPalette(spec, night);
  const opt = { time, night };
  const pieces = (Array.isArray(spec.pieces) ? spec.pieces : []).filter(p => p && SW_SCENERY_PIECES[p.part]);
  const fu = v => (Math.abs(v) <= 1.5 ? v * U : v);
  /* a piece's own colour follows the night like the palette does */
  const tint = col => (col && night ? swMix(col, spec.inside ? '#2A1A1A' : '#0B1530', spec.inside ? 0.25 : 0.6) : col);
  const place = (p, par) => Object.assign({}, p, {
    color: tint(p.color),
    cx: ecN(p.x, 0.5) * W - camX * par, w: fu(ecN(p.w, 0.2)), h: fu(ecN(p.h, 0.3)),
    top: typeof p.top === 'number' ? p.top * H : undefined, y: typeof p.y === 'number' ? fu(p.y) : 0
  });
  const layerOf = p => p.layer || (p.part === 'flowers' ? 'front' : 'mid');
  ctx.save();
  if (o.layer !== 'front') {
    if (spec.inside) {
      const g = ctx.createLinearGradient(0, 0, 0, fy);
      g.addColorStop(0, c.wall); g.addColorStop(1, c.wall2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, fy);
      /* a tiled band: a row of eight-point stars */
      const bandY = fy - U * 0.2, bh = U * 0.12;
      swR(ctx, 0, bandY, W, bh, c.tile1);
      ctx.fillStyle = c.tile2;
      for (let x = (-(camX * 0.6) % (bh)) - bh; x < W + bh; x += bh) {
        const cx = x + bh / 2, cy = bandY + bh / 2, r = bh * 0.32;
        ctx.beginPath();
        for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8, rr = k % 2 ? r * 0.55 : r; ctx[k ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
        ctx.fill();
      }
      swR(ctx, 0, bandY - 5, W, 5, c.stone2); swR(ctx, 0, bandY + bh, W, 5, c.stone2);
      const fg = ctx.createLinearGradient(0, fy, 0, H);
      fg.addColorStop(0, c.floor); fg.addColorStop(1, swShade(c.floor, -0.25));
      ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, fy);
      g.addColorStop(0, c.sky); g.addColorStop(1, c.sky2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, fy);
      if (spec.sun !== false && !night) {
        ctx.fillStyle = '#F6C343';
        ctx.beginPath(); ctx.arc(W * 0.86 - camX * 0.05, fy * 0.16, U * 0.05, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#F6C343'; ctx.lineWidth = 3;
        for (let k = 0; k < 12; k++) { const a = k * Math.PI / 6 + time * 0.1; ctx.beginPath(); ctx.moveTo(W * 0.86 - camX * 0.05 + Math.cos(a) * U * 0.065, fy * 0.16 + Math.sin(a) * U * 0.065); ctx.lineTo(W * 0.86 - camX * 0.05 + Math.cos(a) * U * 0.085, fy * 0.16 + Math.sin(a) * U * 0.085); ctx.stroke(); }
      }
      if (night && spec.moon !== false) { ctx.fillStyle = '#FFF4C9'; ctx.beginPath(); ctx.arc(W * 0.8, fy * 0.17, U * 0.04, 0, Math.PI * 2); ctx.fill(); }
      if (spec.clouds !== false && !night) {
        ctx.fillStyle = '#FFFFFF'; ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
        for (let k = 0; k < 3; k++) {
          const cx = ((W * (0.2 + k * 0.33) + time * 6 - camX * 0.1) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15, cy = fy * (0.12 + 0.07 * (k % 2)), s = U * 0.05;
          ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.arc(cx + s, cy + s * 0.2, s * 0.75, 0, Math.PI * 2); ctx.arc(cx - s, cy + s * 0.25, s * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.arc(cx + s, cy + s * 0.2, s * 0.75, 0, Math.PI * 2); ctx.arc(cx - s, cy + s * 0.25, s * 0.7, 0, Math.PI * 2); ctx.fill();
        }
      }
      if (spec.hills !== false) {
        const hill = (col, base, amp, par) => {
          ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, fy);
          for (let x = 0; x <= W; x += 16) ctx.lineTo(x, base - amp * (0.55 + 0.45 * Math.sin((x + camX * par) / (U * 0.28)) * Math.cos((x + camX * par) / (U * 0.61))));
          ctx.lineTo(W, fy); ctx.fill();
        };
        hill(swMix(c.hill, c.sky2, 0.4), fy - U * 0.14, U * 0.12, 0.15);
        hill(c.hill2, fy - U * 0.05, U * 0.05, 0.3);
      }
      for (const p of pieces) if (layerOf(p) === 'far') SW_SCENERY_PIECES[p.part](ctx, place(p, 0.3), c, fy - U * 0.04, opt);
      const fg = ctx.createLinearGradient(0, fy, 0, H);
      fg.addColorStop(0, c.ground); fg.addColorStop(1, c.ground2);
      ctx.fillStyle = fg; ctx.fillRect(0, fy, W, H - fy);
      if (spec.path !== false) {
        ctx.fillStyle = c.path;
        ctx.beginPath(); ctx.moveTo(W * 0.38 - camX * 0.3, fy); ctx.lineTo(W * 0.62 - camX * 0.3, fy); ctx.lineTo(W * 0.85, H); ctx.lineTo(W * 0.15, H); ctx.fill();
      }
    }
    for (const p of pieces) if (layerOf(p) === 'mid') SW_SCENERY_PIECES[p.part](ctx, place(p, 0.6), c, fy, opt);
  }
  if (o.layer !== 'back') {
    for (const p of pieces) if (layerOf(p) === 'front') SW_SCENERY_PIECES[p.part](ctx, place(p, 1.1), c, H - (H - fy) * 0.1, opt);
    if (spec.frame) {
      /* an ornamental border: a dark band, a light rule and corner squares */
      const b = U * 0.022;
      ctx.fillStyle = c.frame;
      ctx.fillRect(0, 0, W, b); ctx.fillRect(0, H - b, W, b); ctx.fillRect(0, 0, b, H); ctx.fillRect(W - b, 0, b, H);
      ctx.strokeStyle = c.accent2; ctx.lineWidth = 2;
      ctx.strokeRect(b * 1.4, b * 1.4, W - b * 2.8, H - b * 2.8);
      for (const [x, y] of [[0, 0], [W - b * 2, 0], [0, H - b * 2], [W - b * 2, H - b * 2]]) swR(ctx, x, y, b * 2, b * 2, c.accent2);
    }
  }
  ctx.restore();
  return { floor: fy };
}
SWDraw.scenery = swScenery;
SWDraw.sceneryPieces = Object.keys(SW_SCENERY_PIECES);
SWDraw.sceneryThemes = Object.keys(SW_SCENERY_THEMES);
