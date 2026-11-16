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
     furnishings (anywhere) — table, chair, vase, plant, bowl, lantern,
               candle, chest, books, teapot, cup: each with color / color2
               and its own shape options (legs, shape, pattern, flowers…),
               y to move its base and on: 'table' to stand on a piece
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
  /* a table: legs (1 = a pedestal, 2..8 seen side-on, back ones darker),
     shape rect | round, legStyle straight | turned | curved, cloth (a
     colour) with a color2 border */
  table(ctx, p, c, fy) {
    const col = p.color || c.wood, by = fy + p.y, top = by - p.h, x = p.cx - p.w / 2;
    const n = ecClamp(Math.round(ecN(p.legs, 2)), 1, 8), th = Math.max(3, p.h * 0.09), lw = Math.max(3, p.w * 0.055);
    const style = String(p.legStyle || 'straight'), round = p.shape === 'round';
    const leg = (lx, ly0, ly1, shade) => {
      const lc = swShade(col, shade);
      if (style === 'curved') {
        ctx.fillStyle = lc; ctx.beginPath();
        const out = lx < p.cx ? -1 : 1;
        ctx.moveTo(lx - lw / 2, ly0); ctx.lineTo(lx + lw / 2, ly0);
        ctx.quadraticCurveTo(lx + lw / 2 - out * lw * 0.8, (ly0 + ly1) / 2, lx + lw / 2 + out * lw * 0.9, ly1);
        ctx.lineTo(lx - lw / 2 + out * lw * 0.9, ly1);
        ctx.quadraticCurveTo(lx - lw / 2 - out * lw * 0.8, (ly0 + ly1) / 2, lx - lw / 2, ly0); ctx.fill();
      } else {
        swR(ctx, lx - lw / 2, ly0, lw, ly1 - ly0, lc, lw * 0.3);
        if (style === 'turned') {
          ctx.fillStyle = lc;
          for (const f of [0.3, 0.68]) { ctx.beginPath(); ctx.ellipse(lx, ly0 + (ly1 - ly0) * f, lw * 0.85, lw * 0.75, 0, 0, Math.PI * 2); ctx.fill(); }
          swR(ctx, lx - lw * 0.75, ly1 - lw * 0.6, lw * 1.5, lw * 0.6, swShade(lc, -0.1), 2);
        }
      }
    };
    if (n === 1) {
      leg(p.cx, top + th, by - lw, -0.2);
      ctx.fillStyle = swShade(col, -0.25);
      ctx.beginPath(); ctx.ellipse(p.cx, by - lw * 0.4, p.w * 0.22, lw * 0.6, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      const xs = []; for (let k = 0; k < n; k++) xs.push(x + p.w * 0.09 + (p.w * 0.82) * (n === 1 ? 0.5 : k / (n - 1)));
      /* legs further back stand a little higher and darker */
      if (n > 2) xs.forEach((lx, k) => { if (k % 2) leg(lx, top + th, by - p.h * 0.05, -0.38); });
      xs.forEach((lx, k) => { if (n <= 2 || !(k % 2)) leg(lx, top + th, by, -0.2); });
    }
    if (round) {
      ctx.fillStyle = swShade(col, -0.15); ctx.beginPath(); ctx.ellipse(p.cx, top + th * 0.6, p.w / 2, th * 1.1, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(p.cx, top, p.w / 2, th * 1.1, 0, 0, Math.PI * 2); ctx.fill();
    } else {
      swR(ctx, x, top, p.w, th, col, 3);
      swR(ctx, x + p.w * 0.04, top + th, p.w * 0.92, th * 0.7, swShade(col, -0.12));
    }
    if (p.cloth) {
      const cy = top - (round ? th * 0.5 : 0), drop = p.h * 0.32, cl = p.cloth;
      ctx.fillStyle = cl; ctx.beginPath();
      ctx.moveTo(x - p.w * 0.02, cy); ctx.lineTo(x + p.w * 1.02, cy); ctx.lineTo(x + p.w * 1.03, cy + drop);
      const sc = Math.max(3, Math.round(p.w / (drop * 0.5)));
      for (let k = sc; k > 0; k--) { const x1 = x - p.w * 0.03 + (p.w * 1.06) * (k - 1) / sc; ctx.quadraticCurveTo(x1 + p.w * 1.06 / sc / 2, cy + drop * 1.18, x1, cy + drop); }
      ctx.closePath(); ctx.fill();
      if (p.color2) swR(ctx, x - p.w * 0.025, cy + drop * 0.72, p.w * 1.05, drop * 0.1, p.color2);
      if (round) { ctx.fillStyle = swShade(cl, 0.08); ctx.beginPath(); ctx.ellipse(p.cx, cy, p.w * 0.51, th * 1.1, 0, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  curtain(ctx, p, c, fy, o) {
    const x = p.cx - p.w / 2, y = fy - p.h, sway = Math.sin(o.time * 0.7) * p.w * 0.02;
    ctx.fillStyle = p.color || c.accent;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + p.w, y); ctx.quadraticCurveTo(x + p.w * 0.6 + sway, y + p.h * 0.5, x + p.w * 0.75, fy); ctx.lineTo(x, fy); ctx.fill();
    ctx.strokeStyle = swShade(p.color || c.accent, -0.2); ctx.lineWidth = 2;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + k * p.w * 0.2, y); ctx.quadraticCurveTo(x + k * p.w * 0.17 + sway, y + p.h * 0.5, x + k * p.w * 0.18, fy); ctx.stroke(); }
  }
};

/* --- Furnishings with a shape and colours ---------------------------------
   Each takes color (its body) and color2 (trim, pattern, cushion); y moves
   its base (negative is up) and on: 'table' (a part name or a piece index)
   stands it on that piece. */
/* A turned silhouette (vase, pot, bowl): half-widths r (0..1 of w/2) at
   heights t (0 at the base, 1 at the top), smoothed. */
function swLathe(ctx, cx, by, w, h, prof) {
  const P = prof.map(([t, r]) => [r * w / 2, by - t * h]), n = P.length - 1;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const path = new Path2D();
  path.moveTo(cx - P[0][0], P[0][1]); path.lineTo(cx + P[0][0], P[0][1]);
  let m = mid(P[0], P[1]); path.lineTo(cx + m[0], m[1]);
  for (let i = 1; i < n; i++) { m = mid(P[i], P[i + 1]); path.quadraticCurveTo(cx + P[i][0], P[i][1], cx + m[0], m[1]); }
  path.lineTo(cx + P[n][0], P[n][1]); path.lineTo(cx - P[n][0], P[n][1]);
  m = mid(P[n], P[n - 1]); path.lineTo(cx - m[0], m[1]);
  for (let i = n - 1; i > 0; i--) { m = mid(P[i], P[i - 1]); path.quadraticCurveTo(cx - P[i][0], P[i][1], cx - m[0], m[1]); }
  path.closePath();
  return path;
}
/* Fill a silhouette with a flat shade on its right and a pattern in col2:
   band | stripes | dots | zigzag | none. */
function swLatheFill(ctx, path, cx, by, w, h, col, col2, pattern) {
  ctx.fillStyle = col; ctx.fill(path);
  ctx.save(); ctx.clip(path);
  if (col2 && pattern && pattern !== 'none') {
    ctx.fillStyle = col2; ctx.strokeStyle = col2; ctx.lineWidth = Math.max(1.5, w * 0.05);
    if (pattern === 'stripes') for (let k = -3; k <= 3; k++) swR(ctx, cx + k * w * 0.16 - w * 0.03, by - h, w * 0.06, h, col2);
    else if (pattern === 'dots') { for (let r = 0; r < 4; r++) for (let k = -3; k <= 3; k++) { ctx.beginPath(); ctx.arc(cx + (k + (r % 2) * 0.5) * w * 0.18, by - h * (0.2 + r * 0.17), w * 0.04, 0, Math.PI * 2); ctx.fill(); } }
    else if (pattern === 'zigzag') { ctx.beginPath(); for (let k = 0; k <= 12; k++) ctx.lineTo(cx - w / 2 + k * w / 12, by - h * (k % 2 ? 0.5 : 0.4)); ctx.stroke(); }
    else { swR(ctx, cx - w, by - h * 0.52, w * 2, h * 0.09, col2); swR(ctx, cx - w, by - h * 0.36, w * 2, h * 0.035, col2); }
  }
  ctx.fillStyle = 'rgba(2,6,23,0.16)'; ctx.fillRect(cx + w * 0.16, by - h, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(cx - w * 0.3, by - h * 0.8, w * 0.07, h * 0.5);
  ctx.restore();
}
const SW_VASE_SHAPES = {
  classic: [[0, 0.55], [0.08, 0.6], [0.42, 1], [0.76, 0.5], [0.9, 0.42], [1, 0.6]],
  slim: [[0, 0.5], [0.1, 0.55], [0.45, 0.78], [0.8, 0.34], [0.92, 0.32], [1, 0.5]],
  fat: [[0, 0.62], [0.08, 0.82], [0.42, 1.05], [0.78, 0.66], [0.9, 0.52], [1, 0.62]],
  amphora: [[0, 0.24], [0.08, 0.34], [0.56, 1], [0.8, 0.44], [0.95, 0.4], [1, 0.55]],
  jug: [[0, 0.6], [0.1, 0.7], [0.42, 1], [0.74, 0.62], [0.9, 0.5], [1, 0.58]],
  bottle: [[0, 0.8], [0.45, 0.85], [0.62, 0.42], [0.9, 0.24], [1, 0.3]],
  cylinder: [[0, 0.85], [0.5, 0.86], [0.96, 0.85], [1, 0.95]]
};
/* Flowers rising from a mouth at (x, y): n stems fanned, blooms daisy |
   tulip | round in the given colours, leaves in the leaf colour. */
function swBouquet(ctx, x, y, n, len, size, cols, leaf, kind, seed) {
  for (let k = 0; k < n; k++) {
    const a = n === 1 ? 0 : -0.62 + 1.24 * k / (n - 1) + (ecHash(k + seed) - 0.5) * 0.15;
    const L = len * (0.75 + 0.3 * ecHash(k * 3 + seed)), tx = x + Math.sin(a) * L, ty = y - Math.cos(a) * L;
    ctx.strokeStyle = leaf; ctx.lineWidth = Math.max(1.4, size * 0.16); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + Math.sin(a) * size * 0.3, y); ctx.quadraticCurveTo(x + Math.sin(a) * L * 0.4, y - L * 0.55, tx, ty); ctx.stroke();
    if (k % 2 === 0) { ctx.fillStyle = leaf; ctx.beginPath(); ctx.ellipse(x + Math.sin(a) * L * 0.45 + size * 0.3, y - Math.cos(a) * L * 0.45, size * 0.5, size * 0.2, -0.6, 0, Math.PI * 2); ctx.fill(); }
    const col = cols[k % cols.length];
    ctx.fillStyle = col;
    if (kind === 'tulip') {
      ctx.beginPath(); ctx.moveTo(tx - size * 0.55, ty - size * 0.2); ctx.quadraticCurveTo(tx - size * 0.6, ty + size * 0.7, tx, ty + size * 0.6);
      ctx.quadraticCurveTo(tx + size * 0.6, ty + size * 0.7, tx + size * 0.55, ty - size * 0.2); ctx.lineTo(tx + size * 0.25, ty + size * 0.05);
      ctx.lineTo(tx, ty - size * 0.45); ctx.lineTo(tx - size * 0.25, ty + size * 0.05); ctx.closePath(); ctx.fill();
    } else if (kind === 'round') {
      ctx.beginPath(); ctx.arc(tx, ty, size * 0.55, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = swShade(col, -0.15); ctx.beginPath(); ctx.arc(tx + size * 0.15, ty + size * 0.1, size * 0.3, 0, Math.PI * 2); ctx.fill();
    } else {
      for (let q = 0; q < 6; q++) { const b = q * Math.PI / 3 + k; ctx.beginPath(); ctx.ellipse(tx + Math.cos(b) * size * 0.42, ty + Math.sin(b) * size * 0.42, size * 0.32, size * 0.18, b, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#F2C14E'; ctx.beginPath(); ctx.arc(tx, ty, size * 0.2, 0, Math.PI * 2); ctx.fill();
    }
  }
}
Object.assign(SW_SCENERY_PIECES, {
  /* a vase: shape classic | slim | fat | amphora | jug | bottle | cylinder,
     pattern band | stripes | dots | zigzag | none, flowers (count) with
     flowerColors and flowerShape daisy | tulip | round */
  vase(ctx, p, c, fy) {
    const shape = SW_VASE_SHAPES[p.shape] ? p.shape : 'classic', by = fy + p.y, col = p.color || c.roof, col2 = p.color2 || c.accent2;
    const fl = ecClamp(Math.round(ecN(p.flowers, 0)), 0, 12);
    const prof = SW_VASE_SHAPES[shape], top = prof[prof.length - 1][1] * p.w / 2;
    if (fl) swBouquet(ctx, p.cx, by - p.h * 0.95, fl, p.h * 0.9, Math.max(4, p.w * 0.3), Array.isArray(p.flowerColors) && p.flowerColors.length ? p.flowerColors : [c.accent, '#F2EBDD', c.accent2, '#D96C9B'], c.leaf2, p.flowerShape, p.cx);
    ctx.strokeStyle = swShade(col, -0.1); ctx.lineWidth = Math.max(2, p.w * 0.09); ctx.lineCap = 'round';
    if (shape === 'amphora') for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(p.cx + sd * top * 0.7, by - p.h * 0.9); ctx.quadraticCurveTo(p.cx + sd * p.w * 0.62, by - p.h * 0.9, p.cx + sd * p.w * 0.42, by - p.h * 0.62); ctx.stroke(); }
    if (shape === 'jug') {
      ctx.beginPath(); ctx.moveTo(p.cx + top * 0.8, by - p.h * 0.88); ctx.bezierCurveTo(p.cx + p.w * 0.85, by - p.h * 0.9, p.cx + p.w * 0.8, by - p.h * 0.45, p.cx + p.w * 0.42, by - p.h * 0.38); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.cx - top * 0.6, by - p.h * 0.97); ctx.lineTo(p.cx - top * 1.6, by - p.h * 1.04); ctx.lineTo(p.cx - top * 0.9, by - p.h * 0.84); ctx.fill();
    }
    const path = swLathe(ctx, p.cx, by, p.w, p.h, prof);
    swLatheFill(ctx, path, p.cx, by, p.w, p.h, col, col2, p.pattern || 'band');
    ctx.fillStyle = swShade(col, -0.35); ctx.beginPath(); ctx.ellipse(p.cx, by - p.h, top * 0.8, Math.max(1.5, p.h * 0.025), 0, 0, Math.PI * 2); ctx.fill();
  },
  /* a chair seen side-on: back true | false (a stool) | 'high', legs 2..4,
     facing 1 | -1 (which way the seat looks), color2 a cushion */
  chair(ctx, p, c, fy) {
    const col = p.color || c.wood, by = fy + p.y, f = ecN(p.facing, 1) < 0 ? -1 : 1, x = p.cx - p.w / 2;
    const seatY = by - p.h * 0.5, lw = Math.max(3, p.w * 0.1), n = ecClamp(Math.round(ecN(p.legs, 2)), 2, 4);
    for (let k = 0; k < n; k++) { const lx = x + p.w * 0.06 + (p.w * 0.88 - lw) * k / (n - 1); swR(ctx, lx, seatY, lw, by - seatY, swShade(col, k % 2 && n > 2 ? -0.38 : -0.2), 2); }
    if (p.back !== false) {
      /* the back rises from the side away from where the seat looks */
      const bh = p.h * (p.back === 'high' ? 0.62 : 0.5), bx = f > 0 ? x : x + p.w - lw * 1.3;
      swR(ctx, bx, seatY - bh, lw * 1.3, bh, swShade(col, -0.1), 3);
      swR(ctx, bx - lw * 0.3, seatY - bh - lw * 0.4, lw * 1.9, lw * 1.2, col, lw * 0.5);
      swR(ctx, f > 0 ? bx : bx - lw * 0.7, seatY - bh * 0.62, lw * 2, bh * 0.38, swShade(col, 0.05), 3);
    }
    swR(ctx, x - p.w * 0.03, seatY - lw, p.w * 1.06, lw * 1.3, col, 3);
    if (p.color2) swR(ctx, x + p.w * 0.04, seatY - lw * 2.2, p.w * 0.92, lw * 1.3, p.color2, lw * 0.6);
  },
  /* a potted plant: kind leafy | cactus | tree | flowering, pot color and
     color2 band, leaves in leaf colours (or colors: [leaf, bloom]) */
  plant(ctx, p, c, fy) {
    const by = fy + p.y, ph = p.h * 0.32, pw = p.w * 0.62, kind = p.kind || 'leafy';
    const leaf = (Array.isArray(p.colors) && p.colors[0]) || c.leaf, bloom = (Array.isArray(p.colors) && p.colors[1]) || c.accent;
    const top = by - ph;
    if (kind === 'cactus') {
      const cw = pw * 0.42; swR(ctx, p.cx - cw / 2, by - p.h, cw, p.h - ph + 4, leaf, cw / 2);
      swR(ctx, p.cx - cw * 1.35, by - p.h * 0.72, cw * 0.55, p.h * 0.28, leaf, cw * 0.3); swR(ctx, p.cx - cw * 1.35, by - p.h * 0.5, cw * 1.2, cw * 0.4, leaf, cw * 0.2);
      swR(ctx, p.cx + cw * 0.8, by - p.h * 0.82, cw * 0.55, p.h * 0.3, leaf, cw * 0.3); swR(ctx, p.cx + cw * 0.3, by - p.h * 0.58, cw * 1.05, cw * 0.4, leaf, cw * 0.2);
      ctx.strokeStyle = swShade(leaf, -0.2); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(p.cx, by - p.h * 0.95); ctx.lineTo(p.cx, top); ctx.stroke();
    } else if (kind === 'tree') {
      swR(ctx, p.cx - pw * 0.06, top - p.h * 0.45, pw * 0.12, p.h * 0.45, c.wood);
      for (const [dx, dy, r] of [[0, -0.78, 0.36], [-0.28, -0.62, 0.28], [0.3, -0.6, 0.3], [0.05, -0.55, 0.3]]) {
        ctx.fillStyle = dx > 0.1 ? swShade(leaf, -0.15) : leaf; ctx.beginPath(); ctx.arc(p.cx + dx * p.w, by + dy * p.h, r * p.w, 0, Math.PI * 2); ctx.fill();
      }
    } else {
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = -1.1 + 2.2 * k / (n - 1), L = (p.h - ph) * (0.75 + 0.25 * Math.cos(a));
        ctx.fillStyle = k % 2 ? swShade(leaf, -0.15) : leaf;
        ctx.save(); ctx.translate(p.cx, top); ctx.rotate(a);
        ctx.beginPath(); ctx.ellipse(0, -L / 2, p.w * 0.11, L / 2, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
      if (kind === 'flowering') for (let k = 0; k < 5; k++) { ctx.fillStyle = bloom; ctx.beginPath(); ctx.arc(p.cx + (k - 2) * p.w * 0.17, top - (p.h - ph) * (0.7 + 0.2 * Math.cos(k)), p.w * 0.08, 0, Math.PI * 2); ctx.fill(); }
    }
    const pot = swLathe(ctx, p.cx, by, pw, ph, [[0, 0.72], [0.85, 1], [1, 1.08]]);
    swLatheFill(ctx, pot, p.cx, by, pw, ph, p.color || '#B5533C', p.color2 || null, p.color2 ? 'band' : 'none');
  },
  /* a bowl with fruit (count) in fruitColors */
  bowl(ctx, p, c, fy) {
    const by = fy + p.y, col = p.color || c.roof, n = ecClamp(Math.round(ecN(p.fruit, 3)), 0, 9);
    const cols = Array.isArray(p.fruitColors) && p.fruitColors.length ? p.fruitColors : [c.accent, c.accent2, c.leaf];
    const r = p.w * 0.17;
    for (let k = 0; k < n; k++) {
      const row = k < Math.ceil(n * 0.6) ? 0 : 1, inRow = row ? n - Math.ceil(n * 0.6) : Math.ceil(n * 0.6), i = row ? k - Math.ceil(n * 0.6) : k;
      const fx = p.cx + (i - (inRow - 1) / 2) * r * 1.6, fyy = by - p.h * 0.75 - row * r * 1.3;
      ctx.fillStyle = cols[k % cols.length]; ctx.beginPath(); ctx.arc(fx, fyy, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(fx - r * 0.35, fyy - r * 0.35, r * 0.25, 0, Math.PI * 2); ctx.fill();
    }
    const path = swLathe(ctx, p.cx, by, p.w, p.h, [[0, 0.4], [0.12, 0.45], [0.5, 0.85], [1, 1]]);
    swLatheFill(ctx, path, p.cx, by, p.w, p.h, col, p.color2 || c.accent2, p.pattern || 'band');
  },
  /* a standing lantern: color the metal, color2 the glow (brighter at night) */
  lantern(ctx, p, c, fy, o) {
    const by = fy + p.y, col = p.color || c.ink, glow = p.color2 || '#FFD68C', x = p.cx - p.w / 2;
    const g = ctx.createRadialGradient(p.cx, by - p.h * 0.45, 1, p.cx, by - p.h * 0.45, p.w * (o.night ? 3 : 1.6));
    g.addColorStop(0, swMix(glow, '#FFFFFF', 0.2) + ''); g.addColorStop(1, 'rgba(255,214,140,0)');
    ctx.save(); ctx.globalAlpha = o.night ? 0.55 : 0.25; ctx.fillStyle = g; ctx.fillRect(p.cx - p.w * 3, by - p.h * 0.45 - p.w * 3, p.w * 6, p.w * 6); ctx.restore();
    swR(ctx, x + p.w * 0.1, by - p.h * 0.8, p.w * 0.8, p.h * 0.65, glow, 3);
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(1.5, p.w * 0.07);
    ctx.strokeRect(x + p.w * 0.1, by - p.h * 0.8, p.w * 0.8, p.h * 0.65);
    ctx.beginPath(); ctx.moveTo(p.cx, by - p.h * 0.8); ctx.lineTo(p.cx, by - p.h * 0.15); ctx.stroke();
    swR(ctx, x, by - p.h * 0.15, p.w, p.h * 0.15, col, 2);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x - p.w * 0.05, by - p.h * 0.8); ctx.quadraticCurveTo(p.cx, by - p.h * 1.05, x + p.w * 1.05, by - p.h * 0.8); ctx.fill();
    ctx.lineWidth = Math.max(1.2, p.w * 0.05); ctx.beginPath(); ctx.arc(p.cx, by - p.h * 0.97, p.w * 0.12, Math.PI, 0); ctx.stroke();
  },
  /* candles (count) of wax color in a color2 holder, flames flickering */
  candle(ctx, p, c, fy, o) {
    const by = fy + p.y, n = ecClamp(Math.round(ecN(p.count, 1)), 1, 7), wax = p.color || '#F4EBD6', hold = p.color2 || c.accent2;
    const cw = p.w / (n * 1.6), hh = p.h * 0.18;
    for (let k = 0; k < n; k++) {
      const cx = p.cx + (k - (n - 1) / 2) * cw * 1.6, ch = (p.h - hh) * (n > 1 ? 0.7 + 0.3 * ecHash(k + 3) : 0.8);
      swR(ctx, cx - cw / 2, by - hh - ch, cw, ch, wax, cw * 0.2);
      const fl = Math.sin(o.time * 9 + k * 2) * 0.12;
      ctx.fillStyle = '#F6C343'; ctx.beginPath(); ctx.ellipse(cx, by - hh - ch - cw * 0.7, cw * 0.32, cw * (0.7 + fl), fl, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#FFF4C9'; ctx.beginPath(); ctx.ellipse(cx, by - hh - ch - cw * 0.55, cw * 0.14, cw * 0.35, 0, 0, Math.PI * 2); ctx.fill();
    }
    swR(ctx, p.cx - p.w / 2, by - hh, p.w, hh, hold, hh * 0.4);
  },
  /* a chest: color the wood, color2 the bands, shape flat | round lid */
  chest(ctx, p, c, fy) {
    const by = fy + p.y, col = p.color || c.wood, band = p.color2 || c.accent2, x = p.cx - p.w / 2, lid = p.h * 0.32;
    swR(ctx, x, by - p.h + lid, p.w, p.h - lid, col, 3);
    if (p.shape === 'round') { ctx.fillStyle = swShade(col, 0.08); ctx.beginPath(); ctx.moveTo(x, by - p.h + lid); ctx.quadraticCurveTo(p.cx, by - p.h - lid * 0.5, x + p.w, by - p.h + lid); ctx.fill(); }
    else swR(ctx, x - p.w * 0.02, by - p.h, p.w * 1.04, lid, swShade(col, 0.08), 3);
    for (const f of [0.15, 0.85]) swR(ctx, x + p.w * f - p.w * 0.04, by - p.h - (p.shape === 'round' ? -lid * 0.3 : 0), p.w * 0.08, p.h, band, 2);
    swR(ctx, p.cx - p.w * 0.06, by - p.h + lid * 0.7, p.w * 0.12, lid * 0.8, band, 2);
    ctx.fillStyle = c.ink; ctx.beginPath(); ctx.arc(p.cx, by - p.h + lid * 1.1, Math.max(1.2, p.w * 0.015), 0, Math.PI * 2); ctx.fill();
  },
  /* a stack of books (count) in colors */
  books(ctx, p, c, fy) {
    const by = fy + p.y, n = ecClamp(Math.round(ecN(p.count, 4)), 1, 10), bh = p.h / n;
    const cols = Array.isArray(p.colors) && p.colors.length ? p.colors : [c.accent, c.roof, c.leaf, c.accent2, '#E8D9B5'];
    for (let k = 0; k < n; k++) {
      const bw = p.w * (0.8 + 0.2 * ecHash(k + 7)), off = (ecHash(k + 11) - 0.5) * p.w * 0.12;
      swR(ctx, p.cx - bw / 2 + off, by - (k + 1) * bh, bw, bh * 0.92, cols[k % cols.length], 2);
      swR(ctx, p.cx + bw / 2 + off - bw * 0.06, by - (k + 1) * bh + bh * 0.15, bw * 0.04, bh * 0.6, '#F4EBD6');
    }
  },
  /* a teapot: color the body, color2 the lid and knob */
  teapot(ctx, p, c, fy) {
    const by = fy + p.y, col = p.color || c.roof, col2 = p.color2 || c.accent2, bw = p.w * 0.7;
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, p.w * 0.07); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.cx + bw * 0.4, by - p.h * 0.6); ctx.bezierCurveTo(p.cx + p.w * 0.6, by - p.h * 0.65, p.cx + p.w * 0.6, by - p.h * 0.2, p.cx + bw * 0.4, by - p.h * 0.2); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(p.cx - bw * 0.35, by - p.h * 0.4); ctx.quadraticCurveTo(p.cx - p.w * 0.45, by - p.h * 0.45, p.cx - p.w * 0.52, by - p.h * 0.78);
    ctx.lineTo(p.cx - p.w * 0.45, by - p.h * 0.8); ctx.quadraticCurveTo(p.cx - p.w * 0.38, by - p.h * 0.55, p.cx - bw * 0.3, by - p.h * 0.2); ctx.fill();
    const body = swLathe(ctx, p.cx, by, bw, p.h * 0.72, [[0, 0.6], [0.1, 0.8], [0.5, 1], [0.9, 0.62], [1, 0.5]]);
    swLatheFill(ctx, body, p.cx, by, bw, p.h * 0.72, col, col2, p.pattern || 'none');
    swR(ctx, p.cx - bw * 0.25, by - p.h * 0.8, bw * 0.5, p.h * 0.1, col2, 3);
    ctx.fillStyle = col2; ctx.beginPath(); ctx.arc(p.cx, by - p.h * 0.84, p.w * 0.06, 0, Math.PI * 2); ctx.fill();
  },
  /* a cup: shape tulip (a tea glass on a saucer) | mug | cup; color the
     drink or body, color2 the saucer */
  cup(ctx, p, c, fy) {
    const by = fy + p.y, col = p.color || '#A23B1E', col2 = p.color2 || c.accent2, shape = p.shape || 'tulip';
    if (shape === 'tulip') {
      ctx.fillStyle = col2; ctx.beginPath(); ctx.ellipse(p.cx, by - p.h * 0.05, p.w * 0.75, p.h * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      const glass = swLathe(ctx, p.cx, by - p.h * 0.08, p.w * 0.8, p.h * 0.92, [[0, 0.62], [0.3, 0.85], [0.55, 0.52], [1, 0.9]]);
      ctx.save(); ctx.clip(glass); ctx.fillStyle = col; ctx.fillRect(p.cx - p.w, by - p.h * 0.85, p.w * 2, p.h); ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fill(glass);
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1; ctx.stroke(glass);
    } else {
      ctx.strokeStyle = col; ctx.lineWidth = Math.max(2, p.w * 0.1);
      ctx.beginPath(); ctx.arc(p.cx + p.w * 0.42, by - p.h * 0.5, p.h * 0.2, -Math.PI / 2, Math.PI / 2); ctx.stroke();
      if (shape === 'cup') { ctx.fillStyle = col2; ctx.beginPath(); ctx.ellipse(p.cx, by - p.h * 0.04, p.w * 0.7, p.h * 0.07, 0, 0, Math.PI * 2); ctx.fill(); }
      const body = swLathe(ctx, p.cx, by - (shape === 'cup' ? p.h * 0.06 : 0), p.w * 0.84, p.h * (shape === 'cup' ? 0.75 : 1), shape === 'cup' ? [[0, 0.6], [0.5, 0.9], [1, 1]] : [[0, 0.95], [1, 1]]);
      swLatheFill(ctx, body, p.cx, by, p.w * 0.84, p.h, col, col2, shape === 'mug' ? 'band' : 'none');
    }
  }
});

/* Pieces that hang on a wall and stand behind the rest unless placed. */
const SW_SCENERY_WALL = new Set();

/* Default sizes [w, h] (0..1 of the short side) where a piece's own differ. */
const SW_SCENERY_SIZE = { flowers: [0.14, 0.08], well: [0.14, 0.16], lamp: [0.1, 0.3], rug: [0.4, 0.05],
  vase: [0.07, 0.13], chair: [0.13, 0.3], plant: [0.12, 0.26], bowl: [0.1, 0.045], lantern: [0.05, 0.11], candle: [0.04, 0.08],
  chest: [0.18, 0.12], books: [0.08, 0.05], teapot: [0.08, 0.07], cup: [0.025, 0.04] };

/* A described place drawn from parts: spec {theme, inside, floor, pieces,
   ...} as the story component takes it, o {W, H, time, camX}. */
function swScenery(ctx, spec, o) {
  spec = spec && typeof spec === 'object' ? spec : {};
  o = o || {};
  const W = ecN(o.W, 1080), H = ecN(o.H, 1920), U = Math.min(W, H), time = ecN(o.time, 0), camX = ecN(o.camX, 0);
  const night = !!(o.night || spec.night);
  const fy = ecClamp(ecN(spec.floor, 0.8), 0.3, 0.98) * H;
  const c = swSceneryPalette(spec, night);
  const opt = { time, night, W, H, inside: !!spec.inside };
  const pieces = (Array.isArray(spec.pieces) ? spec.pieces : []).filter(p => p && SW_SCENERY_PIECES[p.part]);
  const fu = v => (Math.abs(v) <= 1.5 ? v * U : v);
  /* a piece's own colours follow the night like the palette does */
  const tint = col => (typeof col === 'string' && col && night ? swMix(col, spec.inside ? '#2A1A1A' : '#0B1530', spec.inside ? 0.25 : 0.6) : col);
  const tints = l => (Array.isArray(l) ? l.map(tint) : l);
  const size = (p, i) => fu(ecN(p[i ? 'h' : 'w'], (SW_SCENERY_SIZE[p.part] || [0.2, 0.3])[i]));
  /* on: a part name (the nearest such piece) or an index into pieces */
  const support = p => {
    if (p.on == null) return null;
    const all = Array.isArray(spec.pieces) ? spec.pieces : [];
    if (typeof p.on === 'number') { const t = all[p.on]; return t && t !== p && SW_SCENERY_PIECES[t.part] && t.on == null ? t : null; }
    let best = null;
    for (const t of all) if (t && t !== p && t.part === p.on && t.on == null && (!best || Math.abs(ecN(t.x, 0.5) - ecN(p.x, ecN(t.x, 0.5))) < Math.abs(ecN(best.x, 0.5) - ecN(p.x, ecN(best.x, 0.5))))) best = t;
    return best;
  };
  const place = (p, par) => {
    const t = support(p);
    const x = ecN(p.x, t ? ecN(t.x, 0.5) : 0.5);
    const y = (typeof p.y === 'number' ? fu(p.y) : 0) + (t ? (typeof t.y === 'number' ? fu(t.y) : 0) - size(t, 1) : 0);
    return Object.assign({}, p, {
      color: tint(p.color), color2: tint(p.color2), cloth: tint(p.cloth),
      flowerColors: tints(p.flowerColors), fruitColors: tints(p.fruitColors), colors: tints(p.colors),
      cx: x * W - camX * par, w: size(p, 0), h: size(p, 1),
      top: typeof p.top === 'number' ? p.top * H : undefined, y
    });
  };
  /* a piece stands in its support's layer and is drawn after it */
  pieces.sort((a, b) => (support(a) ? 1 : 0) - (support(b) ? 1 : 0));
  const layerOf = p => p.layer || (support(p) ? layerOf(support(p)) : p.part === 'flowers' ? 'front' : SW_SCENERY_WALL.has(p.part) ? 'far' : 'mid');
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
      /* windows, shelves and hangings stand against the back wall */
      for (const p of pieces) if (layerOf(p) === 'far') SW_SCENERY_PIECES[p.part](ctx, place(p, 0.3), c, fy, opt);
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
