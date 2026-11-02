/* ==========================================================================
   Sets: illustrated places in the editorial kit's flat style, so a story
   has somewhere to happen without photos or per-project drawing.

     SWDraw.set(ctx, name, { W, H, time, floor, night, camX, layer, colors })

   name   room | office | street | park | cafe | studio
   floor  where feet stand, 0..1 of H (default 0.8); SWDraw.setFloor(name)
   night  true: dark sky, lit windows and lamps
   camX   camera pan in px; far layers move less than near ones (parallax)
   layer  'back' (everything behind the cast) or 'front' (foreground pieces
          drawn over the cast); omitted draws both
   colors overrides of the set's palette (wall, floor, accent, ...)
   ========================================================================== */

const SW_SET_PALETTES = {
  room: { wall: '#F3E3D3', wallShade: '#E6CDB6', floor: '#B7835A', floorShade: '#9C6B45', accent: '#E76F51', accent2: '#2A9D8F', window: '#BFE3F2', ink: '#3D2C2E' },
  office: { wall: '#E7EEF5', wallShade: '#D2DEEA', floor: '#8E9AAF', floorShade: '#76839A', accent: '#3A86FF', accent2: '#FFBE0B', window: '#CDE7F7', ink: '#1F2A37' },
  street: { sky: '#9AD4F5', sky2: '#E9F6FD', bldg: '#E9C46A', bldg2: '#F4A261', bldg3: '#8AB6D6', floor: '#9CA3AF', floorShade: '#6B7280', accent: '#E76F51', window: '#FFF3C4', ink: '#1F2937' },
  park: { sky: '#A7DCF7', sky2: '#EEF8FD', hill: '#8FCB72', hill2: '#6DB35A', floor: '#7FBF5E', floorShade: '#5E9E45', path: '#E3C99A', accent: '#F4A261', tree: '#3E8E41', trunk: '#7A5233', ink: '#2D3B2D' },
  cafe: { wall: '#2F3E46', wallShade: '#263238', floor: '#8D6E63', floorShade: '#6D4C41', accent: '#F4A261', accent2: '#E9C46A', window: '#CFE8F3', counter: '#A1887F', ink: '#1B1B1B' },
  studio: { wall: '#1E293B', wallShade: '#0F172A', floor: '#334155', floorShade: '#1E293B', accent: '#38BDF8', accent2: '#A78BFA', ink: '#0B1224' }
};
const SW_SET_FLOOR = { room: 0.8, office: 0.8, street: 0.82, park: 0.82, cafe: 0.8, studio: 0.8 };

/* Night: the same palette, darker and bluer, with lit windows. */
function swSetNight(c) {
  const o = {};
  for (const k in c) o[k] = /window/.test(k) ? '#FFD27A' : swMix(c[k], '#0B1530', 0.62);
  if (c.sky) { o.sky = '#0F1B3D'; o.sky2 = '#25345F'; }
  return o;
}

function swSetRect(ctx, x, y, w, h, color, r) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r || 0); ctx.fill();
}

/* A potted plant (front layer in rooms). */
function swSetPlant(ctx, x, fy, s, c, time) {
  swSetRect(ctx, x - 22 * s, fy - 46 * s, 44 * s, 46 * s, c.accent, 6 * s);
  swSetRect(ctx, x - 25 * s, fy - 50 * s, 50 * s, 9 * s, swShade(c.accent, -0.15), 4 * s);
  const leaf = c.leaf || '#3E8E41';
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.32 + Math.sin(time * 1.1 + i) * 0.03;
    const L = (70 + (i % 3) * 18) * s;
    ctx.save();
    ctx.translate(x, fy - 50 * s);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillStyle = i % 2 ? leaf : swShade(leaf, -0.15);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-14 * s, -L * 0.5, 0, -L);
    ctx.quadraticCurveTo(14 * s, -L * 0.5, 0, 0);
    ctx.fill();
    ctx.restore();
  }
}

/* A window with frame, sill and light; night shows a moon. */
function swSetWindow(ctx, x, y, w, h, c, night, frame) {
  swSetRect(ctx, x - 8, y - 8, w + 16, h + 16, frame || '#FFFFFF', 6);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, night ? '#14234A' : c.window);
  g.addColorStop(1, night ? '#2B3C6B' : swMix(c.window, '#FFFFFF', 0.5));
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  if (night) {
    ctx.fillStyle = '#FFF4C9';
    ctx.beginPath(); ctx.arc(x + w * 0.72, y + h * 0.3, Math.min(w, h) * 0.09, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.moveTo(x + w * 0.15, y + h); ctx.lineTo(x + w * 0.45, y); ctx.lineTo(x + w * 0.6, y); ctx.lineTo(x + w * 0.3, y + h); ctx.fill();
  }
  ctx.fillStyle = frame || '#FFFFFF';
  ctx.fillRect(x + w / 2 - 3, y, 6, h);
  ctx.fillRect(x, y + h / 2 - 3, w, 6);
  swSetRect(ctx, x - 14, y + h + 6, w + 28, 10, swShade(frame || '#FFFFFF', -0.08), 3);
}

/* An interior: wall with a skirting board, wood floor in perspective. */
function swSetInterior(ctx, W, H, fy, c, camX) {
  const g = ctx.createLinearGradient(0, 0, 0, fy);
  g.addColorStop(0, c.wall);
  g.addColorStop(1, c.wallShade);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, fy);
  swSetRect(ctx, 0, fy - 14, W, 14, swShade(c.wallShade, -0.12));
  const fg = ctx.createLinearGradient(0, fy, 0, H);
  fg.addColorStop(0, c.floor);
  fg.addColorStop(1, c.floorShade);
  ctx.fillStyle = fg;
  ctx.fillRect(0, fy, W, H - fy);
  ctx.strokeStyle = swShade(c.floor, -0.12);
  ctx.lineWidth = 2;
  for (let i = -12; i <= 12; i++) {
    const x0 = W / 2 + i * W * 0.09 - camX * 0.9;
    ctx.beginPath(); ctx.moveTo(x0, fy); ctx.lineTo(W / 2 + (x0 - W / 2) * 2.4, H); ctx.stroke();
  }
}

/* Sky with soft clouds (outdoor sets). */
function swSetSky(ctx, W, H, fy, c, time, camX, night) {
  const g = ctx.createLinearGradient(0, 0, 0, fy);
  g.addColorStop(0, c.sky);
  g.addColorStop(1, c.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, fy);
  if (night) {
    ctx.fillStyle = '#FFFFFF';
    for (let i = 0; i < 40; i++) {
      const sx = ((ecHash(i) * W * 1.3 - camX * 0.05) % W + W) % W, sy = ecHash(i + 99) * fy * 0.6;
      ctx.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(time * 0.8 + i));
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    return;
  }
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 4; i++) {
    const cx = ((W * (0.15 + i * 0.3) + time * 8 - camX * 0.1) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15;
    const cy = fy * (0.14 + 0.09 * (i % 2));
    const s = Math.min(W, H) * (0.06 + 0.02 * (i % 3));
    ctx.beginPath();
    ctx.arc(cx, cy, s, 0, Math.PI * 2); ctx.arc(cx + s, cy + s * 0.2, s * 0.8, 0, Math.PI * 2); ctx.arc(cx - s, cy + s * 0.25, s * 0.7, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* A round-crowned tree; the crown sways a little. */
function swSetTree(ctx, x, fy, s, c, time) {
  swSetRect(ctx, x - 9 * s, fy - 120 * s, 18 * s, 120 * s, c.trunk || '#7A5233', 4 * s);
  const sway = Math.sin(time * 0.9 + x * 0.01) * 3 * s;
  const tree = c.tree || '#3E8E41';
  ctx.fillStyle = swShade(tree, -0.12);
  ctx.beginPath(); ctx.arc(x + sway - 26 * s, fy - 140 * s, 42 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = tree;
  ctx.beginPath(); ctx.arc(x + sway + 18 * s, fy - 150 * s, 50 * s, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = swShade(tree, 0.12);
  ctx.beginPath(); ctx.arc(x + sway - 4 * s, fy - 184 * s, 40 * s, 0, Math.PI * 2); ctx.fill();
}

/* The sets themselves: back(ctx, W, H, fy, c, o) and front(...). */
const SW_SETS = {
  studio: {
    back(ctx, W, H, fy, c) {
      const g = ctx.createRadialGradient(W / 2, fy * 0.6, 10, W / 2, fy * 0.6, Math.max(W, H) * 0.7);
      g.addColorStop(0, swMix(c.wall, c.accent, 0.18));
      g.addColorStop(1, c.wallShade);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      swSetRect(ctx, 0, fy, W, H - fy, c.floor);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.beginPath(); ctx.ellipse(W / 2, fy + (H - fy) * 0.25, W * 0.4, (H - fy) * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    }
  },
  room: {
    back(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080, cx = W / 2 - o.camX * 0.6;
      swSetInterior(ctx, W, H, fy, c, o.camX);
      swSetWindow(ctx, cx - U * 0.42, fy - U * 0.78, U * 0.3, U * 0.36, c, o.night);
      /* framed pictures */
      swSetRect(ctx, cx + U * 0.1, fy - U * 0.72, U * 0.16, U * 0.12, '#FFFFFF', 4);
      swSetRect(ctx, cx + U * 0.11, fy - U * 0.71, U * 0.14, U * 0.1, c.accent2, 2);
      swSetRect(ctx, cx + U * 0.3, fy - U * 0.76, U * 0.1, U * 0.14, '#FFFFFF', 4);
      swSetRect(ctx, cx + U * 0.31, fy - U * 0.75, U * 0.08, U * 0.12, c.accent, 2);
      /* sofa */
      const sw = U * 0.62, sx = cx - sw / 2 + U * 0.12, sy = fy - U * 0.26;
      swSetRect(ctx, sx, sy, sw, U * 0.16, swShade(c.accent2, -0.12), 18 * s);
      swSetRect(ctx, sx + U * 0.02, sy + U * 0.1, sw - U * 0.04, U * 0.1, c.accent2, 14 * s);
      swSetRect(ctx, sx - U * 0.03, sy + U * 0.06, U * 0.07, U * 0.17, swShade(c.accent2, -0.2), 14 * s);
      swSetRect(ctx, sx + sw - U * 0.04, sy + U * 0.06, U * 0.07, U * 0.17, swShade(c.accent2, -0.2), 14 * s);
      swSetRect(ctx, sx + U * 0.05, sy + U * 0.04, U * 0.1, U * 0.08, c.accent, 10 * s);
      /* floor lamp */
      const lx = cx + U * 0.5;
      swSetRect(ctx, lx - 3 * s, fy - U * 0.5, 6 * s, U * 0.5, c.ink);
      ctx.fillStyle = o.night ? '#FFE3A3' : '#FFF6E5';
      ctx.beginPath(); ctx.moveTo(lx - U * 0.06, fy - U * 0.5); ctx.lineTo(lx + U * 0.06, fy - U * 0.5); ctx.lineTo(lx + U * 0.04, fy - U * 0.6); ctx.lineTo(lx - U * 0.04, fy - U * 0.6); ctx.fill();
      if (o.night) {
        const gl = ctx.createRadialGradient(lx, fy - U * 0.5, 4, lx, fy - U * 0.5, U * 0.35);
        gl.addColorStop(0, 'rgba(255,214,140,0.35)');
        gl.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = gl; ctx.fillRect(lx - U * 0.35, fy - U * 0.85, U * 0.7, U * 0.7);
      }
      /* rug */
      ctx.fillStyle = swMix(c.accent, c.floor, 0.35);
      ctx.beginPath(); ctx.ellipse(cx, fy + (H - fy) * 0.3, U * 0.45, (H - fy) * 0.18, 0, 0, Math.PI * 2); ctx.fill();
    },
    front(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080;
      swSetPlant(ctx, W - U * 0.08 - o.camX * 1.15, H - (H - fy) * 0.15, 1.6 * s, c, o.time);
    }
  },
  office: {
    back(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080, cx = W / 2 - o.camX * 0.6;
      swSetInterior(ctx, W, H, fy, c, o.camX);
      /* window with blinds */
      const wx = cx - U * 0.46, wy = fy - U * 0.8, ww = U * 0.4, wh = U * 0.42;
      swSetWindow(ctx, wx, wy, ww, wh, c, o.night, '#F8FAFC');
      ctx.fillStyle = 'rgba(31,42,55,0.10)';
      for (let i = 0; i < 9; i++) ctx.fillRect(wx, wy + i * wh / 9, ww, 4);
      /* shelf with books */
      const shx = cx + U * 0.12, shy = fy - U * 0.68;
      for (let r = 0; r < 2; r++) {
        swSetRect(ctx, shx, shy + r * U * 0.16, U * 0.34, 8 * s, c.ink);
        for (let b = 0; b < 7; b++) {
          const bh = U * (0.08 + 0.03 * ecHash(b + r * 7));
          swSetRect(ctx, shx + U * 0.015 + b * U * 0.045, shy + r * U * 0.16 - bh, U * 0.035, bh, [c.accent, c.accent2, '#EF476F', '#06D6A0', c.ink][(b + r) % 5], 2);
        }
      }
      /* desk with a monitor */
      const dx = cx + U * 0.05, dy = fy - U * 0.2;
      swSetRect(ctx, dx, dy, U * 0.46, U * 0.035, swShade(c.floor, 0.25), 6);
      swSetRect(ctx, dx + U * 0.02, dy + U * 0.035, U * 0.02, U * 0.165, c.ink);
      swSetRect(ctx, dx + U * 0.42, dy + U * 0.035, U * 0.02, U * 0.165, c.ink);
      swSetRect(ctx, dx + U * 0.14, dy - U * 0.17, U * 0.2, U * 0.13, c.ink, 8);
      swSetRect(ctx, dx + U * 0.15, dy - U * 0.16, U * 0.18, U * 0.11, swMix(c.accent, '#FFFFFF', o.night ? 0.1 : 0.45), 4);
      swSetRect(ctx, dx + U * 0.225, dy - U * 0.04, U * 0.03, U * 0.04, c.ink);
      /* wall clock */
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath(); ctx.arc(cx + U * 0.29, fy - U * 0.85, U * 0.05, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c.ink; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.arc(cx + U * 0.29, fy - U * 0.85, U * 0.05, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + U * 0.29, fy - U * 0.85); ctx.lineTo(cx + U * 0.29 + Math.cos(o.time * 0.1) * U * 0.03, fy - U * 0.85 + Math.sin(o.time * 0.1) * U * 0.03); ctx.stroke();
    },
    front(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H);
      swSetPlant(ctx, U * 0.08 - o.camX * 1.15, H - (H - fy) * 0.12, 1.5 * U / 1080, c, o.time);
    }
  },
  street: {
    back(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080;
      swSetSky(ctx, W, H, fy, c, o.time, o.camX, o.night);
      /* far buildings, then near buildings with windows */
      const row = (par, base, hgts, colors, win) => {
        const off = -o.camX * par;
        const bw = U * 0.26;
        const n = Math.ceil(W / bw) + 3;
        for (let i = -2; i < n; i++) {
          const k = ((i % hgts.length) + hgts.length) % hgts.length;
          const x = i * bw + ((off % bw) + bw) % bw - bw, h = U * hgts[k];
          const col = colors[k % colors.length];
          swSetRect(ctx, x, base - h, bw - 6, h, col, 4);
          if (win) {
            for (let wy = base - h + U * 0.05; wy < base - U * 0.08; wy += U * 0.09) {
              for (let wx = x + U * 0.03; wx < x + bw - U * 0.06; wx += U * 0.07) {
                const lit = !o.night || ecHash(Math.floor(wx * 7 + wy)) > 0.45;
                swSetRect(ctx, wx, wy, U * 0.04, U * 0.05, lit ? c.window : swShade(col, -0.35), 2);
              }
            }
          }
        }
      };
      row(0.25, fy - U * 0.12, [0.55, 0.7, 0.48, 0.62], [swMix(c.bldg3, c.sky, 0.45)], false);
      row(0.6, fy - U * 0.02, [0.42, 0.55, 0.38, 0.5, 0.6], [c.bldg, c.bldg2, c.bldg3], true);
      /* sidewalk and road */
      swSetRect(ctx, 0, fy - U * 0.02, W, U * 0.03, swShade(c.floor, 0.15));
      const g = ctx.createLinearGradient(0, fy, 0, H);
      g.addColorStop(0, c.floor); g.addColorStop(1, c.floorShade);
      ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
      ctx.strokeStyle = swShade(c.floor, -0.1); ctx.lineWidth = 2;
      for (let x = -((o.camX * 0.9) % (U * 0.18)); x < W; x += U * 0.18) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo(x - U * 0.05, H); ctx.stroke(); }
      /* lamp post */
      const lx = W * 0.82 - o.camX * 0.9;
      swSetRect(ctx, lx - 5 * s, fy - U * 0.62, 10 * s, U * 0.62, c.ink, 3);
      swSetRect(ctx, lx - 5 * s, fy - U * 0.62, U * 0.09, 8 * s, c.ink, 3);
      ctx.fillStyle = o.night ? '#FFE08A' : '#FDFCE8';
      ctx.beginPath(); ctx.ellipse(lx + U * 0.08, fy - U * 0.6, U * 0.025, U * 0.015, 0, 0, Math.PI * 2); ctx.fill();
      if (o.night) {
        const gl = ctx.createRadialGradient(lx + U * 0.08, fy - U * 0.6, 2, lx + U * 0.08, fy - U * 0.6, U * 0.4);
        gl.addColorStop(0, 'rgba(255,224,138,0.35)'); gl.addColorStop(1, 'rgba(255,224,138,0)');
        ctx.fillStyle = gl; ctx.fillRect(lx - U * 0.35, fy - U * 1, U * 0.8, U * 1);
      }
    },
    front(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H);
      swSetTree(ctx, U * 0.06 - o.camX * 1.2, H + U * 0.02, 1.4 * U / 1080, { tree: '#4C9A52', trunk: '#6B4A2E' }, o.time);
    }
  },
  park: {
    back(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080;
      swSetSky(ctx, W, H, fy, c, o.time, o.camX, o.night);
      /* rolling hills */
      const hill = (col, base, amp, par) => {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(0, H);
        for (let x = 0; x <= W; x += 20) ctx.lineTo(x, base - amp * (0.6 + 0.4 * Math.sin((x + o.camX * par) / (U * 0.35))));
        ctx.lineTo(W, H); ctx.fill();
      };
      hill(swMix(c.hill, c.sky, 0.35), fy - U * 0.16, U * 0.08, 0.2);
      hill(c.hill2, fy - U * 0.05, U * 0.05, 0.4);
      for (let i = 0; i < 6; i++) swSetTree(ctx, ((i * U * 0.42 - o.camX * 0.5) % (W + U * 0.6) + W + U * 0.6) % (W + U * 0.6) - U * 0.3, fy - U * 0.04, (0.8 + 0.25 * ecHash(i)) * s, c, o.time);
      const g = ctx.createLinearGradient(0, fy, 0, H);
      g.addColorStop(0, c.floor); g.addColorStop(1, c.floorShade);
      ctx.fillStyle = g; ctx.fillRect(0, fy, W, H - fy);
      /* path toward the horizon */
      ctx.fillStyle = c.path;
      ctx.beginPath(); ctx.moveTo(W * 0.42 - o.camX * 0.3, fy); ctx.lineTo(W * 0.58 - o.camX * 0.3, fy); ctx.lineTo(W * 0.8, H); ctx.lineTo(W * 0.2, H); ctx.fill();
      /* bench */
      const bx = W * 0.72 - o.camX * 0.8, by = fy - U * 0.02;
      swSetRect(ctx, bx, by - U * 0.12, U * 0.24, U * 0.025, c.trunk, 4);
      swSetRect(ctx, bx, by - U * 0.07, U * 0.24, U * 0.025, swShade(c.trunk, 0.1), 4);
      swSetRect(ctx, bx + U * 0.02, by - U * 0.07, 8 * s, U * 0.07, c.ink);
      swSetRect(ctx, bx + U * 0.2, by - U * 0.07, 8 * s, U * 0.07, c.ink);
    },
    front(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080;
      /* grass tufts in the foreground */
      ctx.strokeStyle = swShade(c.floor, -0.2); ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const x = ((i * U * 0.17 - o.camX * 1.2) % (W + 40) + W + 40) % (W + 40) - 20, y = H - (H - fy) * (0.08 + 0.3 * ecHash(i + 5));
        for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + k * 6 * s, y - 10 * s, x + k * 9 * s + Math.sin(o.time * 2 + i) * 2, y - 20 * s); ctx.stroke(); }
      }
    }
  },
  cafe: {
    back(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080, cx = W / 2 - o.camX * 0.6;
      swSetInterior(ctx, W, H, fy, c, o.camX);
      /* big shop window */
      swSetWindow(ctx, cx - U * 0.5, fy - U * 0.72, U * 0.42, U * 0.42, { window: c.window }, o.night, swShade(c.wall, 0.3));
      /* chalk menu board */
      swSetRect(ctx, cx + U * 0.1, fy - U * 0.78, U * 0.32, U * 0.24, '#1F2A2E', 8);
      swSetRect(ctx, cx + U * 0.1, fy - U * 0.78, U * 0.32, U * 0.24, 'rgba(0,0,0,0)', 8);
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'; ctx.lineWidth = 3 * s; ctx.lineCap = 'round';
      for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx + U * 0.14, fy - U * 0.72 + i * U * 0.04); ctx.lineTo(cx + U * (0.3 + 0.08 * ecHash(i)), fy - U * 0.72 + i * U * 0.04); ctx.stroke(); }
      /* counter with a coffee machine */
      const kx = cx + U * 0.02, ky = fy - U * 0.22;
      swSetRect(ctx, kx, ky, U * 0.5, U * 0.22, c.counter, 6);
      swSetRect(ctx, kx - U * 0.01, ky - U * 0.02, U * 0.52, U * 0.03, swShade(c.counter, 0.2), 4);
      swSetRect(ctx, kx + U * 0.3, ky - U * 0.13, U * 0.12, U * 0.11, '#CFD8DC', 6);
      swSetRect(ctx, kx + U * 0.32, ky - U * 0.05, U * 0.08, U * 0.03, '#455A64', 2);
      /* pendant lamps, glowing */
      for (let i = 0; i < 3; i++) {
        const px = cx - U * 0.3 + i * U * 0.35, py = Math.max(fy - U * 0.95, fy * 0.1);
        ctx.strokeStyle = c.ink; ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, py); ctx.stroke();
        ctx.fillStyle = c.accent;
        ctx.beginPath(); ctx.moveTo(px - U * 0.04, py + U * 0.05); ctx.lineTo(px + U * 0.04, py + U * 0.05); ctx.lineTo(px + U * 0.015, py); ctx.lineTo(px - U * 0.015, py); ctx.fill();
        const gl = ctx.createRadialGradient(px, py + U * 0.06, 2, px, py + U * 0.06, U * 0.25);
        gl.addColorStop(0, 'rgba(255,214,140,' + (0.3 + 0.05 * Math.sin(o.time * 3 + i)).toFixed(3) + ')');
        gl.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.fillStyle = gl; ctx.fillRect(px - U * 0.25, py - U * 0.2, U * 0.5, U * 0.5);
      }
    },
    front(ctx, W, H, fy, c, o) {
      const U = Math.min(W, H), s = U / 1080;
      /* a small round table with cups, in front of the cast */
      const tx = U * 0.12 - o.camX * 1.1, ty = H - (H - fy) * 0.35;
      swSetRect(ctx, tx - 5 * s, ty, 10 * s, H - ty, '#3E2723');
      ctx.fillStyle = '#5D4037';
      ctx.beginPath(); ctx.ellipse(tx, ty, U * 0.1, U * 0.022, 0, 0, Math.PI * 2); ctx.fill();
      swSetRect(ctx, tx - U * 0.03, ty - U * 0.035, U * 0.03, U * 0.035, '#FFFFFF', 4);
    }
  }
};

/* Draw a set. Unknown names fall back to the studio. */
function swSet(ctx, name, o) {
  o = o || {};
  const key = SW_SETS[String(name || '').toLowerCase()] ? String(name).toLowerCase() : 'studio';
  const W = ecN(o.W, 1080), H = ecN(o.H, 1920);
  const fy = ecClamp(ecN(o.floor, SW_SET_FLOOR[key]), 0.3, 0.98) * H;
  let c = Object.assign({}, SW_SET_PALETTES[key], o.colors && typeof o.colors === 'object' ? o.colors : {});
  if (o.night) c = Object.assign(swSetNight(c), o.colors && typeof o.colors === 'object' ? o.colors : {});
  const opt = { time: ecN(o.time, 0), camX: ecN(o.camX, 0), night: !!o.night };
  ctx.save();
  if (o.layer !== 'front') SW_SETS[key].back(ctx, W, H, fy, c, opt);
  if (o.layer !== 'back' && SW_SETS[key].front) SW_SETS[key].front(ctx, W, H, fy, c, opt);
  ctx.restore();
  return { floor: fy };
}
SWDraw.set = swSet;
SWDraw.sets = Object.keys(SW_SETS);
SWDraw.setFloor = (name, H) => ecN(SW_SET_FLOOR[String(name || '').toLowerCase()], 0.8) * ecN(H, 1);
