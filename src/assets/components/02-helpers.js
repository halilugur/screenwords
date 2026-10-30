
function ecN(v, d) { return typeof v === 'number' && isFinite(v) ? v : d; }
function ecS(v, d) { return typeof v === 'string' && v.length ? v : d; }
function ecClamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ecHash(n) {
  const v = Math.sin(n * 12.9898) * 43758.5453;
  return v - Math.floor(v);
}
function ecXY(p, W, H, fx, fy) {
  const q = p && p.position;
  return { x: ecN(q && q.x, fx) * W, y: ecN(q && q.y, fy) * H };
}
function ecAlpha(ctx, GA, v) { ctx.globalAlpha = ecClamp(GA * v, 0, 1); }
function ecFont(ctx, px, weight, family) {
  ctx.font = (weight || 800) + ' ' + Math.round(Math.max(1, px)) + 'px ' + (family || EC_FONT);
}
function ecText(ctx, text, x, y, px, color, align, weight, family, baseline) {
  if (text == null || String(text) === '') return;
  ecFont(ctx, px, weight, family);
  ctx.textAlign = align || 'center';
  ctx.textBaseline = baseline || 'middle';
  ctx.fillStyle = color || '#F4F8FF';
  ctx.fillText(String(text), x, y);
}
function ecWrap(ctx, text, maxW, px, weight) {
  ecFont(ctx, px, weight || 800);
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (let i = 0; i < words.length; i++) {
    const t = line ? line + ' ' + words[i] : words[i];
    if (line && ctx.measureText(t).width > maxW) { lines.push(line); line = words[i]; }
    else line = t;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}
function ecRound(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r || 0, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}
function ecPanel(ctx, x, y, w, h, r, fill, stroke, lw) {
  ecRound(ctx, x, y, w, h, r);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 2; ctx.stroke(); }
}
function ecLine(ctx, x0, y0, x1, y1, color, lw) {
  ctx.strokeStyle = color;
  ctx.lineWidth = lw || 3;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
}
function ecFrame(p, W, H, dw, dh) {
  const c = ecXY(p, W, H, 0.5, 0.5);
  const w = ecN(p.width, W * dw);
  const h = ecN(p.height, H * dh);
  return { x: c.x - w / 2, y: c.y - h / 2, w: w, h: h };
}
function ecItems(p, n, colors) {
  const src = Array.isArray(p.items) ? p.items : [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const it = src[i] || {};
    out.push({
      label: ecS(it.label, ''),
      value: Math.abs(ecN(it.value, EC_SERIES[i % EC_SERIES.length])),
      color: ecS(it.color, colors[i % colors.length])
    });
  }
  return out;
}
function ecStar(ctx, cx, cy, r1, r2, points, rot) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + (i * Math.PI) / points;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
function ecHex(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6;
    const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
}
/* Typography with no content still paints its layout rather than a blank
   frame: three plate bars where the headline would sit. */
function ecSkeleton(ctx, x, y, size, GA, col) {
  const widths = [size * 3.2, size * 2.2, size * 1.3];
  for (let i = 0; i < 3; i++) {
    ecAlpha(ctx, GA, i === 0 ? 0.85 : 0.35);
    ctx.fillStyle = i === 0 ? col : '#94A3B8';
    ecRound(ctx, x - widths[i] / 2, y + (i - 1) * size * 1.1, widths[i], size * 0.5, size * 0.25);
    ctx.fill();
  }
}
function ecGrad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}

/* --- Typography --------------------------------------------------------- */
function ecTitle(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.16);
  const x = a.x, y = a.y;
  const size = ecN(p.size, 74);
  const text = ecS(p.text, ecS(p.title, ''));
  const sub = ecS(p.subtitle, ecS(p.label, ''));
  const e = 1 - Math.pow(1 - ecClamp(prog * 1.6, 0, 1), 3);
  if (!text) { ecSkeleton(ctx, x, y, size, GA, col); return; }
  ecFont(ctx, size, 900);
  const tw = Math.max(size * 2, ctx.measureText(text || ' ').width);

  if (id === 'textReveal') {
    ctx.save();
    ctx.beginPath(); ctx.rect(x - tw / 2, y - size, tw * e, size * 2); ctx.clip();
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 900);
    ctx.restore();
    ecAlpha(ctx, GA, 0.9);
    ecLine(ctx, x - tw / 2, y + size * 0.72, x - tw / 2 + tw * e, y + size * 0.72, acc, 8);

  } else if (id === 'splitTitle') {
    const slide = (1 - e) * 120;
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x - slide, y - size * 0.4, size, '#F4F8FF', 'center', 900);
    ecText(ctx, sub, x + slide, y + size * 0.55, size * 0.52, acc, 'center', 800);
    ecLine(ctx, x - tw / 3, y + size * 0.06, x + tw / 3, y + size * 0.06, col, 4);

  } else if (id === 'outlineTitle') {
    ecAlpha(ctx, GA, 1);
    ctx.font = '900 ' + Math.round(size) + 'px ' + EC_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(2, size * 0.04);
    ctx.strokeStyle = col;
    ctx.strokeText(text, x, y);
    ctx.globalAlpha = ecClamp(GA * 0.14, 0, 1);
    ctx.fillStyle = acc;
    ctx.fillText(text, x, y);

  } else if (id === 'gradientTitle') {
    ecAlpha(ctx, GA, e);
    ctx.font = '900 ' + Math.round(size) + 'px ' + EC_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ecGrad(ctx, x - tw / 2, y, x + tw / 2, y, [[0, col], [1, acc]]);
    ctx.fillText(text, x, y);

  } else if (id === 'kickerTitle') {
    ecAlpha(ctx, GA, e);
    ecFont(ctx, size * 0.26, 700);
    if (sub) {
      const gap = size * 0.1;
      let total = 0;
      for (const ch of sub) total += ctx.measureText(ch).width + gap;
      let cx = x - (total - gap) / 2;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = acc;
      for (const ch of sub) { ctx.fillText(ch, cx, y - size * 0.78); cx += ctx.measureText(ch).width + gap; }
    }
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 900);

  } else if (id === 'stampTitle') {
    ctx.translate(x, y);
    ctx.rotate(-0.12);
    ctx.scale(0.85 + 0.15 * e, 0.85 + 0.15 * e);
    ecPanel(ctx, -tw / 2 - 34, -size * 0.85, tw + 68, size * 1.7, 10, 'rgba(4,7,15,0.35)', acc, 6);
    ecText(ctx, text, 0, 0, size * 0.82, acc, 'center', 900);

  } else if (id === 'verticalTitle') {
    ctx.translate(x * 0.5, H * 0.5);
    ctx.rotate(-Math.PI / 2);
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, 0, 0, size * 0.9, '#F4F8FF', 'center', 900);
    ecLine(ctx, -tw / 2, size * 0.72, -tw / 2 + tw * e, size * 0.72, acc, 6);

  } else if (id === 'underlinerTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 900);
    ecAlpha(ctx, GA, 0.95);
    ecLine(ctx, x - tw / 2, y + size * 0.62, x - tw / 2 + tw * e, y + size * 0.62, acc, 9);

  } else if (id === 'popWordsTitle') {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    ecFont(ctx, size, 900);
    let total = 0;
    const widths = words.map(w => { const wd = ctx.measureText(w).width; total += wd; return wd; });
    total += Math.max(0, words.length - 1) * size * 0.24;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      const q = ecClamp((prog - i / Math.max(1, words.length) * 0.55) / 0.35, 0, 1);
      const qe = 1 - Math.pow(1 - q, 3);
      ecAlpha(ctx, GA, qe);
      ctx.font = '900 ' + Math.round(size * (0.82 + 0.18 * qe)) + 'px ' + EC_FONT;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = i % 3 === 2 ? acc : '#F4F8FF';
      ctx.fillText(words[i], cx, y + (1 - qe) * 26);
      cx += widths[i] + size * 0.24;
    }

  } else if (id === 'ribbonTitle') {
    const bw = tw + 110, bh = size * 1.5;
    ecAlpha(ctx, GA, e);
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 - 30, y);
    ctx.lineTo(x - bw / 2, y - bh / 2);
    ctx.lineTo(x + bw / 2, y - bh / 2);
    ctx.lineTo(x + bw / 2 + 30, y);
    ctx.lineTo(x + bw / 2, y + bh / 2);
    ctx.lineTo(x - bw / 2, y + bh / 2);
    ctx.closePath();
    ctx.fillStyle = col; ctx.fill();
    ctx.save(); ctx.globalAlpha = ecClamp(GA * 0.22, 0, 1); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
    ecText(ctx, text, x, y, size * 0.72, '#04101E', 'center', 900);

  } else if (id === 'glowTitle') {
    ecAlpha(ctx, GA, e);
    ctx.save();
    ctx.shadowColor = col;
    ctx.shadowBlur = 28 + 14 * Math.sin(el * 2.4);
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 900);
    ctx.shadowBlur = 46;
    ctx.globalAlpha = ecClamp(GA * 0.35, 0, 1);
    ecText(ctx, text, x, y, size, col, 'center', 900);
    ctx.restore();

  } else if (id === 'shadowTitle') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x + 8, y + 8, size, acc, 'center', 900);
    ecAlpha(ctx, GA, 1);
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 900);

  } else if (id === 'badgeTitle') {
    const bw = tw + 96, bh = size * 1.5;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, bh / 2, 'rgba(4,7,15,0.72)', col, 3);
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(x - bw / 2 + 38, y, 10, 0, Math.PI * 2); ctx.fill();
    ecText(ctx, text, x + 18, y, size * 0.64, '#F4F8FF', 'center', 800);

  } else if (id === 'tickerTitle') {
    const band = size * 1.7;
    ecFont(ctx, size * 0.8, 900);
    const unit = ctx.measureText((text || ' ') + '   ').width;
    const off = (el * 160) % Math.max(1, unit);
    ctx.save();
    ctx.beginPath(); ctx.rect(0, y - band / 2, W, band); ctx.clip();
    ctx.fillStyle = 'rgba(4,7,15,0.55)'; ctx.fillRect(0, y - band / 2, W, band);
    ecAlpha(ctx, GA, 1);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#F4F8FF';
    for (let tx = -off; tx < W; tx += unit) ctx.fillText(text, tx, y);
    ctx.restore();
    ecAlpha(ctx, GA, 0.9);
    ecLine(ctx, 0, y - band / 2, W, y - band / 2, acc, 3);
    ecLine(ctx, 0, y + band / 2, W, y + band / 2, acc, 3);
  }
}

/* --- Captions ----------------------------------------------------------- */
function ecCaption(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.8);
  const x = a.x, y = a.y;
  const size = ecN(p.size, 44);
  const text = ecS(p.text, ecS(p.title, ''));
  if (!text) { ecSkeleton(ctx, x, y, size * 0.85, GA, col); return; }
  const maxW = ecN(p.maxWidth, W * 0.84);
  const lines = ecWrap(ctx, text, maxW, size, 800);
  const lh = size * 1.34;
  const blockH = lines.length * lh;

  if (id === 'captionPill' || id === 'bubbleCaption') {
    ecFont(ctx, size, 800);
    let widest = 0;
    for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
    const bw = Math.min(W * 0.94, widest + 64), bh = blockH + 34;
    ecAlpha(ctx, GA, ecClamp(prog * 2, 0, 1));
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, id === 'captionPill' ? bh / 2 : 26,
            'rgba(10,16,28,0.94)', id === 'captionPill' ? 'rgba(148,163,184,0.5)' : col, id === 'captionPill' ? 3 : 4);
    if (id === 'bubbleCaption') {
      ctx.beginPath();
      ctx.moveTo(x - 22, y + bh / 2);
      ctx.lineTo(x, y + bh / 2 + 26);
      ctx.lineTo(x + 22, y + bh / 2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(8,13,24,0.82)'; ctx.fill();
    }
    for (let i = 0; i < lines.length; i++) {
      ecText(ctx, lines[i], x, y - blockH / 2 + lh * (i + 0.5), size, '#F4F8FF', 'center', 800);
    }

  } else if (id === 'wordByWord') {
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const shown = Math.min(words.length, Math.ceil(prog * (words.length + 1)));
    const idx = Math.max(0, shown - 1);
    if (!words[idx]) return;
    const q = ecClamp((prog * (words.length + 1)) - idx, 0, 1);
    ecAlpha(ctx, GA, ecClamp(q * 1.4, 0, 1));
    ecText(ctx, words[idx], x, y, size * (1.05 + 0.16 * (1 - q)), '#F4F8FF', 'center', 900);
    ecAlpha(ctx, GA, 0.9);
    ecLine(ctx, x - size * 1.4, y + size * 0.8, x - size * 1.4 + size * 2.8 * q, y + size * 0.8, acc, 7);

  } else if (id === 'highlightSweep') {
    ecFont(ctx, size, 900);
    let widest = 0;
    for (const ln of lines) widest = Math.max(widest, ctx.measureText(ln).width);
    const sweep = widest * ecClamp(prog * 1.15, 0, 1);
    ecAlpha(ctx, GA, 1);
    for (let i = 0; i < lines.length; i++) {
      ecText(ctx, lines[i], x, y - blockH / 2 + lh * (i + 0.5), size, '#F4F8FF', 'center', 900);
    }
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < lines.length; i++) {
      const ly = y - blockH / 2 + lh * (i + 0.5);
      ctx.rect(x - widest / 2, ly - size * 0.62, sweep, size * 1.24);
    }
    ctx.clip();
    ecAlpha(ctx, GA, 0.9);
    ctx.fillStyle = acc;
    ctx.fillRect(x - widest / 2, y - blockH / 2 - size * 0.2, sweep, blockH + size * 0.4);
    ecAlpha(ctx, GA, 1);
    for (let i = 0; i < lines.length; i++) {
      ecText(ctx, lines[i], x, y - blockH / 2 + lh * (i + 0.5), size, '#04101E', 'center', 900);
    }
    ctx.restore();

  } else if (id === 'underlineWords') {
    ecFont(ctx, size, 800);
    const words = String(text || '').split(/\s+/).filter(Boolean);
    const shown = Math.max(0, Math.min(words.length, Math.ceil(prog * (words.length + 0.5))));
    const line = words.slice(0, Math.max(1, shown)).join(' ');
    const wid = ctx.measureText(line).width;
    ecAlpha(ctx, GA, 1);
    ecText(ctx, text, x, y, size, '#F4F8FF', 'center', 800);
    ecAlpha(ctx, GA, 1);
    ctx.beginPath();
    for (let i = 0; i < shown; i++) {
      const wtext = words.slice(0, i + 1).join(' ');
      const ww = ctx.measureText(wtext).width;
      const sx = x - wid / 2 + (wid - ww);
      ctx.moveTo(sx, y + size * 0.72);
      ctx.lineTo(sx + ctx.measureText(words[i]).width, y + size * 0.72);
    }
    ctx.strokeStyle = acc; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();

  } else if (id === 'karaokeCaption') {
    ecFont(ctx, size, 900);
    const words = String(text || '').split(/\s+/).filter(Boolean);
    let total = 0;
    const widths = words.map(w => { const wd = ctx.measureText(w).width; total += wd; return wd; });
    total += Math.max(0, words.length - 1) * size * 0.22;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      const mark = words.length <= 1 ? prog : i / (words.length - 1);
      const lit = ecClamp((prog - mark * 0.85) * 4, 0, 1);
      ecAlpha(ctx, GA, 0.55 + 0.45 * lit);
      ctx.font = '900 ' + Math.round(size * (1 + 0.1 * lit)) + 'px ' + EC_FONT;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = lit > 0.5 ? acc : '#F4F8FF';
      ctx.fillText(words[i], cx, y);
      cx += widths[i] + size * 0.22;
    }
  }
}

/* --- Shapes ------------------------------------------------------------- */
function ecShape(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const r = ecN(p.radius, 130);
  const e = 1 - Math.pow(1 - ecClamp(prog * 1.5, 0, 1), 3);

  if (id === 'ringSpinner') {
    const lw = ecN(p.strokeWidth, 12);
    ctx.lineCap = 'round';
    for (let g = 0; g < 3; g++) {
      const rot = el * (1.2 + g * 0.35) + g * 2.1;
      ecAlpha(ctx, GA, 0.9 - g * 0.2);
      ctx.strokeStyle = g === 1 ? acc : col;
      ctx.lineWidth = lw * (1 - g * 0.16);
      ctx.beginPath();
      ctx.arc(x, y, (r - g * 28) * e, rot, rot + 1.7);
      ctx.stroke();
    }

  } else if (id === 'concentricRings') {
    for (let i = 0; i < 5; i++) {
      const pulse = 0.5 + 0.5 * Math.sin(el * 2 - i * 0.6);
      ecAlpha(ctx, GA, 0.25 + 0.55 * pulse);
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r * (0.25 + i * 0.19) * e, 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'triangleBurst') {
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2 + el * 0.5;
      const dist = r * (0.5 + 0.5 * e);
      const bx = x + Math.cos(ang) * dist, by = y + Math.sin(ang) * dist;
      const s = 26 + 10 * Math.sin(el * 2 + i);
      ctx.save();
      ctx.translate(bx, by); ctx.rotate(ang + Math.PI / 2);
      ecAlpha(ctx, GA, 0.85);
      ctx.fillStyle = i % 2 ? acc : col;
      ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s * 0.9, s); ctx.lineTo(-s * 0.9, s); ctx.closePath(); ctx.fill();
      ctx.restore();
    }

  } else if (id === 'hexGrid') {
    const step = r * 0.55;
    for (let row = -2; row <= 2; row++) {
      for (let c = -2; c <= 2; c++) {
        const hx = x + c * step * 1.7 + (row % 2 ? step * 0.85 : 0);
        const hy = y + row * step * 1.5;
        const d = Math.hypot(hx - x, hy - y);
        const pulse = 0.5 + 0.5 * Math.sin(el * 2 - d * 0.02);
        ecAlpha(ctx, GA, (0.12 + 0.6 * pulse) * e);
        ecHex(ctx, hx, hy, step * 0.92);
        ctx.strokeStyle = pulse > 0.6 ? acc : col;
        ctx.lineWidth = 3; ctx.stroke();
      }
    }

  } else if (id === 'diamondShape') {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(el * 0.7);
    ecAlpha(ctx, GA, 0.95);
    ctx.strokeStyle = col; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r, 0); ctx.lineTo(0, r); ctx.lineTo(-r, 0); ctx.closePath(); ctx.stroke();
    ecAlpha(ctx, GA, 0.5 + 0.3 * Math.sin(el * 3));
    ctx.fillStyle = acc;
    const ir = r * 0.45;
    ctx.beginPath(); ctx.moveTo(0, -ir); ctx.lineTo(ir, 0); ctx.lineTo(0, ir); ctx.lineTo(-ir, 0); ctx.closePath(); ctx.fill();
    ctx.restore();

  } else if (id === 'starburst') {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(el * 0.6);
    ecAlpha(ctx, GA, 0.95);
    ecStar(ctx, 0, 0, r * e, r * 0.45 * e, 6, 0);
    ctx.fillStyle = col; ctx.fill();
    ecAlpha(ctx, GA, 0.65);
    ecStar(ctx, 0, 0, r * 0.62 * e, r * 0.28 * e, 6, Math.PI / 6);
    ctx.fillStyle = acc; ctx.fill();
    ctx.restore();

  } else if (id === 'dottedLine') {
    const half = W * 0.34;
    ecAlpha(ctx, GA, 0.9);
    ctx.strokeStyle = col; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.setLineDash([12, 22]);
    ctx.beginPath(); ctx.moveTo(x - half, y); ctx.lineTo(x + half, y); ctx.stroke();
    ctx.setLineDash([]);
    const travel = ((el * 0.35) % 1);
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(x - half + half * 2 * travel, y, 12, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'bezierArc') {
    const x0 = x - W * 0.3, y0 = y + H * 0.08;
    const x1 = x + W * 0.3, y1 = y - H * 0.08;
    ecAlpha(ctx, GA, 0.75);
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.setLineDash([14, 12]);
    ctx.beginPath(); ctx.moveTo(x0, y0);
    ctx.bezierCurveTo(x - W * 0.16, y - H * 0.24, x + W * 0.16, y + H * 0.24, x1, y1);
    ctx.stroke(); ctx.setLineDash([]);
    const t = ecClamp(prog, 0, 1);
    const bx = (1 - t) * (1 - t) * (1 - t) * x0 + 3 * (1 - t) * (1 - t) * t * (x - W * 0.16) + 3 * (1 - t) * t * t * (x + W * 0.16) + t * t * t * x1;
    const by = (1 - t) * (1 - t) * (1 - t) * y0 + 3 * (1 - t) * (1 - t) * t * (y - H * 0.24) + 3 * (1 - t) * t * t * (y + H * 0.24) + t * t * t * y1;
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(bx, by, 13, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'spiralShape') {
    ecAlpha(ctx, GA, 0.95);
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath();
    const turns = 3, steps = 160;
    for (let i = 0; i <= steps * e; i++) {
      const t = i / steps;
      const ang = t * Math.PI * 2 * turns + el;
      const rad = r * t;
      const px = x + Math.cos(ang) * rad, py = y + Math.sin(ang) * rad;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();

  } else if (id === 'waveRibbon') {
    for (let band = 0; band < 3; band++) {
      ctx.beginPath();
      for (let i = 0; i <= 60; i++) {
        const px = x - r * 1.9 + (i / 60) * r * 3.8;
        const py = y + band * 26 + Math.sin((i / 60) * Math.PI * 3 + el * 2 + band) * 42;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ecAlpha(ctx, GA, 0.85 - band * 0.2);
      ctx.strokeStyle = band % 2 ? acc : col;
      ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.stroke();
    }

  } else if (id === 'capsuleBar') {
    const w = ecN(p.width, 620), h = ecN(p.height, 40);
    const val = ecClamp(ecN(p.value, prog), 0, 1);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, h / 2, 'rgba(148,163,184,0.16)', 'rgba(148,163,184,0.35)', 2);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, x - w / 2, y - h / 2, Math.max(h, w * val), h, h / 2, ecGrad(ctx, x - w / 2, 0, x + w / 2, 0, [[0, col], [1, acc]]), null, 0);
    ecText(ctx, ecS(p.label, '') + ' ' + Math.round(val * 100) + '%', x, y + h * 1.15, h * 0.62, '#F4F8FF', 'center', 700);

  } else if (id === 'blobShape') {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    for (let i = 0; i <= 72; i++) {
      const th = (i / 72) * Math.PI * 2;
      const rr = r * e * (0.78 + 0.12 * Math.sin(3 * th + el) + 0.06 * Math.sin(5 * th - el * 0.7));
      const px = Math.cos(th) * rr, py = Math.sin(th) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ecAlpha(ctx, GA, 0.9);
    ctx.fillStyle = ecGrad(ctx, -r, -r, r, r, [[0, col], [1, acc]]);
    ctx.fill();
    ctx.restore();
  }
}

/* --- Charts ------------------------------------------------------------- */
function ecChart(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const f = ecFrame(p, W, H, 0.66, 0.3);
  const e = ecClamp(prog * 1.15, 0, 1);
  const cx = f.x + f.w / 2, cy = f.y + f.h / 2;

  if (id === 'sparkline') {
    const val = ecN(p.value, 0.62);
    ecAlpha(ctx, GA, 0.95);
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineJoin = 'round';
    ctx.beginPath();
    const n = 22;
    for (let i = 0; i < n; i++) {
      const px = f.x + (i / (n - 1)) * f.w;
      const py = f.y + f.h * (0.78 - 0.56 * (0.5 + 0.5 * Math.sin(i * 0.7)) * (0.4 + val));
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(f.x + f.w, f.y + f.h * (0.78 - 0.56 * (0.5 + 0.5 * Math.sin((n - 1) * 0.7)) * (0.4 + val)), 9, 0, Math.PI * 2); ctx.fill();
    return;
  }

  ecAlpha(ctx, GA, 0.55);
  ecPanel(ctx, f.x, f.y, f.w, f.h, 20, 'rgba(8,13,24,0.5)', 'rgba(148,163,184,0.26)', 2);
  ecAlpha(ctx, GA, 1);

  if (id === 'pieChart' || id === 'donutChart') {
    const items = ecItems(p, 5, [col, acc, '#8B5CF6', '#34D399', '#F87171']);
    let total = 0;
    for (const it of items) total += it.value;
    const radius = Math.min(f.w, f.h) * 0.42;
    let ang = -Math.PI / 2;
    for (let i = 0; i < items.length; i++) {
      const slice = (items[i].value / Math.max(1, total)) * Math.PI * 2 * e;
      ecAlpha(ctx, GA, 0.95);
      ctx.fillStyle = items[i].color;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, id === 'donutChart' ? radius * 0.72 : radius, ang, ang + slice);
      ctx.closePath(); ctx.fill();
      ang += slice;
    }
    if (id === 'donutChart') {
      ecAlpha(ctx, GA, 1);
      ctx.fillStyle = 'rgba(8,13,24,0.92)';
      ctx.beginPath(); ctx.arc(cx, cy, radius * 0.5, 0, Math.PI * 2); ctx.fill();
      ecText(ctx, ecS(p.value, Math.round((ecN(p.percent, 68))).toString() + '%'), cx, cy, radius * 0.34, '#F4F8FF', 'center', 900);
    }

  } else if (id === 'lineChart' || id === 'areaChart') {
    const items = ecItems(p, 7, [col]);
    const max = Math.max.apply(null, items.map(v => v.value).concat([1]));
    const pts = [];
    for (let i = 0; i < items.length; i++) {
      pts.push({
        x: f.x + 28 + (i / (items.length - 1)) * (f.w - 56),
        y: f.y + f.h - 30 - (items[i].value / max) * (f.h - 56)
      });
    }
    if (id === 'areaChart') {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, f.y + f.h - 26);
      for (const pt of pts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(pts[pts.length - 1].x, f.y + f.h - 26);
      ctx.closePath();
      ecAlpha(ctx, GA, 0.35);
      ctx.fillStyle = ecGrad(ctx, 0, f.y, 0, f.y + f.h, [[0, col], [1, 'rgba(56,189,248,0)']]);
      ctx.fill();
    }
    ecAlpha(ctx, GA, 0.95);
    ctx.strokeStyle = col; ctx.lineWidth = 5; ctx.lineJoin = 'round';
    ctx.beginPath();
    const upto = Math.max(1, Math.ceil(pts.length * e));
    for (let i = 0; i < upto; i++) {
      if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    if (id === 'lineChart') {
      ecAlpha(ctx, GA, 1);
      ctx.fillStyle = acc;
      for (let i = 0; i < upto; i++) {
        ctx.beginPath(); ctx.arc(pts[i].x, pts[i].y, 7, 0, Math.PI * 2); ctx.fill();
      }
    }

  } else if (id === 'radarChart') {
    const items = ecItems(p, 6, [col]);
    const max = Math.max.apply(null, items.map(v => v.value).concat([1]));
    const radius = Math.min(f.w, f.h) * 0.4;
    for (let ring = 1; ring <= 3; ring++) {
      ecAlpha(ctx, GA, 0.16);
      ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const ang = -Math.PI / 2 + (i / 6) * Math.PI * 2;
        const px = cx + Math.cos(ang) * radius * (ring / 3);
        const py = cy + Math.sin(ang) * radius * (ring / 3);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }
    ctx.beginPath();
    for (let i = 0; i <= 6; i++) {
      const ang = -Math.PI / 2 + (i % 6) / 6 * Math.PI * 2;
      const rr = radius * (items[i % 6].value / max) * e;
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ecAlpha(ctx, GA, 0.4); ctx.fillStyle = col; ctx.fill();
    ecAlpha(ctx, GA, 1); ctx.strokeStyle = acc; ctx.lineWidth = 4; ctx.stroke();

  } else if (id === 'heatmapGrid') {
    const cols = 8, rows = 4;
    const cw = (f.w - 32) / cols, ch = (f.h - 32) / rows;
    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        const q = ecHash(r0 * 13.7 + c0 * 4.1);
        const reveal = ecClamp((prog - (r0 * cols + c0) / (cols * rows) * 0.45) / 0.4, 0, 1);
        ecAlpha(ctx, GA, (0.12 + 0.78 * q) * reveal);
        ctx.fillStyle = q > 0.55 ? acc : col;
        ecRound(ctx, f.x + 16 + c0 * cw + 2, f.y + 16 + r0 * ch + 2, cw - 4, ch - 4, 6);
        ctx.fill();
      }
    }

  } else if (id === 'scatterPlot') {
    const items = ecItems(p, 6, [col]);
    ecAlpha(ctx, GA, 0.3);
    ecLine(ctx, f.x + 24, f.y + f.h - 24, f.x + f.w - 24, f.y + f.h - 24, '#94A3B8', 2);
    ecLine(ctx, f.x + 24, f.y + 20, f.x + 24, f.y + f.h - 24, '#94A3B8', 2);
    for (let i = 0; i < 22; i++) {
      const px = f.x + 34 + ecHash(i * 3.1) * (f.w - 68);
      const py = f.y + 30 + ecHash(i * 7.7 + 2) * (f.h - 66);
      const q = ecClamp((prog - i / 22 * 0.4) / 0.4, 0, 1);
      ecAlpha(ctx, GA, 0.85 * q);
      ctx.fillStyle = i % 4 === 0 ? acc : col;
      ctx.beginPath(); ctx.arc(px, py, 7 + 8 * ecHash(i), 0, Math.PI * 2); ctx.fill();
    }
    ecAlpha(ctx, GA, 0.9);
    ctx.strokeStyle = acc; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(f.x + 30, f.y + f.h - 34); ctx.lineTo(f.x + f.w - 30, f.y + 30); ctx.stroke();

  } else if (id === 'stackedBars') {
    const cols = 5, rows = 3;
    const gap = 26, bw = (f.w - gap * (cols + 1)) / cols;
    for (let c0 = 0; c0 < cols; c0++) {
      let base = f.y + f.h - 26;
      for (let r0 = 0; r0 < rows; r0++) {
        const q = ecHash(c0 * 5.3 + r0 * 9.1);
        const hgt = (f.h - 60) * (0.16 + 0.24 * q) * e;
        ecAlpha(ctx, GA, 0.9 - r0 * 0.22);
        ctx.fillStyle = r0 === 0 ? col : r0 === 1 ? acc : '#8B5CF6';
        ecRound(ctx, f.x + gap + c0 * (bw + gap), base - hgt, bw, hgt - 3, 5);
        ctx.fill();
        base -= hgt;
      }
    }

  } else if (id === 'funnelChart') {
    const items = ecItems(p, 4, [col, acc, '#8B5CF6', '#34D399']);
    const max = Math.max.apply(null, items.map(v => v.value).concat([1]));
    const gap = 10;
    for (let i = 0; i < 4; i++) {
      const topW = (f.w * 0.84) * (items[i].value / max) * e;
      const botW = (f.w * 0.84) * ((items[Math.min(3, i + 1)].value / max)) * e;
      const bh = (f.h - 44 - gap * 3) / 4;
      const ly = f.y + 22 + i * (bh + gap);
      ctx.beginPath();
      ctx.moveTo(cx - topW / 2, ly);
      ctx.lineTo(cx + topW / 2, ly);
      ctx.lineTo(cx + botW / 2, ly + bh);
      ctx.lineTo(cx - botW / 2, ly + bh);
      ctx.closePath();
      ecAlpha(ctx, GA, 0.92 - i * 0.12);
      ctx.fillStyle = items[i].color; ctx.fill();
    }

  } else if (id === 'ganttBars') {
    const rows = 4;
    for (let i = 0; i < rows; i++) {
      const y0 = f.y + 28 + i * ((f.h - 52) / rows);
      const left = ecHash(i * 4.7) * f.w * 0.3;
      const len = (f.w * (0.3 + 0.45 * ecHash(i * 8.3 + 1))) * e;
      ecAlpha(ctx, GA, 0.9 - i * 0.1);
      ecPanel(ctx, f.x + 18 + left, y0, len, (f.h - 52) / rows * 0.55, 8, i % 2 ? acc : col, null, 0);
      ecAlpha(ctx, GA, 0.4);
      ecLine(ctx, f.x + 18, y0 + (f.h - 52) / rows * 0.28, f.x + f.w - 18, y0 + (f.h - 52) / rows * 0.28, '#94A3B8', 1);
    }

  } else if (id === 'gaugeArc') {
    const radius = Math.min(f.w, f.h) * 0.44;
    const val = ecClamp(ecN(p.value, 0.68) * e, 0, 1);
    ecAlpha(ctx, GA, 0.28);
    ctx.strokeStyle = '#94A3B8'; ctx.lineWidth = 24; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2); ctx.stroke();
    ecAlpha(ctx, GA, 1);
    ctx.strokeStyle = ecGrad(ctx, cx - radius, 0, cx + radius, 0, [[0, col], [1, acc]]);
    ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, Math.PI + Math.PI * val); ctx.stroke();
    const needle = Math.PI + Math.PI * val;
    ecLine(ctx, cx, cy, cx + Math.cos(needle) * radius * 0.78, cy + Math.sin(needle) * radius * 0.78, '#F4F8FF', 6);
    ctx.fillStyle = '#F4F8FF';
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    ecText(ctx, ecS(p.label, Math.round(val * 100) + ''), cx, cy + radius * 0.55, 34, '#F4F8FF', 'center', 800);

  } else if (id === 'segmentedProgress') {
    const segs = 12, gap = 8;
    const sw = (f.w - 40 - gap * (segs - 1)) / segs;
    const filled = Math.round(e * segs);
    for (let i = 0; i < segs; i++) {
      ecAlpha(ctx, GA, i < filled ? 1 : 0.22);
      ctx.fillStyle = i < filled ? (i % 3 === 2 ? acc : col) : '#94A3B8';
      ecRound(ctx, f.x + 20 + i * (sw + gap), cy - 26, sw, 52, 8);
      ctx.fill();
    }
    ecText(ctx, ecS(p.label, Math.round(e * 100) + '%'), cx, f.y + f.h + 34, 30, '#F4F8FF', 'center', 700);

  } else if (id === 'bubbleChart') {
    for (let i = 0; i < 12; i++) {
      const bx = f.x + 40 + ecHash(i * 3.3) * (f.w - 80);
      const by = f.y + 34 + ecHash(i * 6.1 + 3) * (f.h - 68);
      const br = 14 + 36 * ecHash(i * 9.7 + 1);
      const q = ecClamp((prog - i / 12 * 0.35) / 0.45, 0, 1);
      ecAlpha(ctx, GA, 0.7 * q);
      ctx.fillStyle = i % 3 === 0 ? acc : col;
      ctx.beginPath(); ctx.arc(bx, by, br * q, 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === 'scoreMeter') {
    const val = ecClamp(ecN(p.value, 0.74) * e, 0, 1);
    const h = 58, w = f.w - 40;
    ecAlpha(ctx, GA, 0.22);
    ecPanel(ctx, f.x + 20, cy - h / 2, w, h, h / 2, '#94A3B8', null, 0);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, f.x + 20, cy - h / 2, Math.max(h, w * val), h, h / 2,
            ecGrad(ctx, f.x, 0, f.x + f.w, 0, [[0, '#F87171'], [0.5, acc], [1, '#34D399']]), null, 0);
    ecText(ctx, ecS(p.label, Math.round(val * 100) + ''), f.x + 20 + Math.max(h, w * val) - 34, cy, h * 0.5, '#04101E', 'center', 900);

  } else if (id === 'comparisonBars') {
    const items = ecItems(p, 2, [col, acc]);
    const max = Math.max.apply(null, items.map(v => v.value).concat([1]));
    for (let i = 0; i < 2; i++) {
      const bw = (f.w - 120) * (items[i].value / max) * e;
      const by = cy - 42 + i * 78;
      ecAlpha(ctx, GA, 0.95);
      ecPanel(ctx, f.x + 100, by, Math.max(10, bw), 48, 10, i ? acc : col, null, 0);
      ecText(ctx, items[i].label || (i ? 'B' : 'A'), f.x + 52, by + 24, 30, '#F4F8FF', 'center', 800);
      ecText(ctx, Math.round(items[i].value), f.x + 100 + Math.max(10, bw) + 22, by + 24, 28, '#F4F8FF', 'left', 700);
    }
  }
}

/* --- UI mockups and icons ----------------------------------------------- */
function ecUi(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const e = icEase(prog);
  const white = '#F4F8FF';

  if (id === 'phoneMockup') {
    const w = 280, h = 520;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, 44, '#0B1220', white, 6);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, x - w / 2 + 14, y - h / 2 + 14, w - 28, h - 28, 32, '#101A2E', null, 0);
    ecPanel(ctx, x - 44, y - h / 2 + 4, 88, 26, 13, '#0B1220', null, 0);
    for (let i = 0; i < 4; i++) {
      ecAlpha(ctx, GA, 0.22 + 0.5 * icClamp(prog * 3 - i * 0.5, 0, 1));
      ecPanel(ctx, x - 100, y - 80 + i * 56, 200, 34, 8, i % 2 ? acc : col, null, 0);
    }
    ecAlpha(ctx, GA, 0.9);
    ecPanel(ctx, x - 100, y + h / 2 - 90, 200, 44, 22, acc, null, 0);

  } else if (id === 'browserWindow') {
    const w = 640, h = 380;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, 18, '#0B1220', 'rgba(148,163,184,0.4)', 3);
    ecAlpha(ctx, GA, 1);
    ecLine(ctx, x - w / 2 + 2, y - h / 2 + 54, x + w / 2 - 2, y - h / 2 + 54, 'rgba(148,163,184,0.35)', 2);
    const dots = ['#F87171', '#FBBF24', '#34D399'];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = dots[i];
      ctx.beginPath(); ctx.arc(x - w / 2 + 30 + i * 26, y - h / 2 + 27, 8, 0, Math.PI * 2); ctx.fill();
    }
    ecPanel(ctx, x - 90, y - h / 2 + 14, 240, 26, 13, 'rgba(148,163,184,0.16)', null, 0);
    for (let i = 0; i < 5; i++) {
      ecAlpha(ctx, GA, 0.18 + 0.5 * icClamp(prog * 4 - i * 0.4, 0, 1));
      ecPanel(ctx, x - w / 2 + 34, y - h / 2 + 88 + i * 46, (w - 68) * (0.4 + 0.6 * icHash(i + 1)), 20, 6, i === 0 ? acc : col, null, 0);
    }

  } else if (id === 'chatBubbleLeft' || id === 'chatBubbleRight') {
    const right = id === 'chatBubbleRight';
    const bw = 470, bh = 132;
    const bx = right ? x + 60 : x - 60;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx - bw / 2, y - bh / 2, bw, bh, 28, right ? col : 'rgba(148,163,184,0.18)', null, 0);
    ctx.beginPath();
    const tail = right ? 1 : -1;
    ctx.moveTo(bx + tail * (bw / 2 - 34), y + bh / 2 - 8);
    ctx.lineTo(bx + tail * (bw / 2 + 18), y + bh / 2 + 20);
    ctx.lineTo(bx + tail * (bw / 2 - 62), y + bh / 2 - 4);
    ctx.closePath();
    ctx.fillStyle = right ? col : 'rgba(148,163,184,0.18)'; ctx.fill();
    ecAlpha(ctx, GA, 1);
    const txt = ecS(p.text, ecS(p.label, ''));
    const lines = ecWrap(ctx, txt, bw - 56, 30, 700);
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      ecText(ctx, lines[i], bx, y - 18 + i * 40, 30, right ? '#04101E' : white, 'center', 700);
    }

  } else if (id === 'notificationToast') {
    const w = 540, h = 116;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, 22, 'rgba(10,16,28,0.94)', 'rgba(148,163,184,0.3)', 2);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, x - w / 2 + 20, y - 34, 68, 68, 18, col, null, 0);
    ecText(ctx, '!', x - w / 2 + 54, y, 38, '#04101E', 'center', 900);
    ecText(ctx, ecS(p.title, ecS(p.text, '')), x - w / 2 + 108, y - 20, 30, white, 'left', 800);
    ecText(ctx, ecS(p.subtitle, ecS(p.label, '')), x - w / 2 + 108, y + 20, 24, acc, 'left', 600);
    ecAlpha(ctx, GA, 0.9);
    ctx.fillStyle = acc;
    ctx.fillRect(x - w / 2 + 20, y + h / 2 - 10, (w - 40) * icClamp(prog, 0, 1), 5);

  } else if (id === 'cursorClick') {
    ecAlpha(ctx, GA, 0.7);
    for (let i = 0; i < 3; i++) {
      const q = (el * 0.7 + i / 3) % 1;
      ctx.strokeStyle = col; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x + 26, y + 34, 24 + q * 110, 0, Math.PI * 2); ctx.stroke();
    }
    ecAlpha(ctx, GA, 1);
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, 0); ctx.lineTo(10, 82); ctx.lineTo(30, 60); ctx.lineTo(58, 88);
    ctx.lineTo(70, 76); ctx.lineTo(42, 48); ctx.lineTo(66, 38);
    ctx.closePath();
    ctx.fillStyle = white; ctx.fill();
    ctx.strokeStyle = '#04101E'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();

  } else if (id === 'keyboardKey') {
    const s = 132;
    const press = 0.5 + 0.5 * Math.sin(el * 4);
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - s / 2, y - s / 2 + press * 8, s, s, 24, '#0B1220', white, 4);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, x - s / 2 + 12, y - s / 2 + 12 + press * 8, s - 24, s - 24, 16, col, null, 0);
    ecText(ctx, ecS(p.text, ecS(p.label, 'K')), x, y + press * 8, 54, '#04101E', 'center', 900);

  } else if (id === 'searchField') {
    const w = 600, h = 86;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, h / 2, 'rgba(148,163,184,0.16)', 'rgba(148,163,184,0.4)', 2);
    ctx.strokeStyle = white; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x - w / 2 + 46, y - 4, 15, 0, Math.PI * 2); ctx.stroke();
    ecLine(ctx, x - w / 2 + 58, y + 8, x - w / 2 + 72, y + 22, white, 6);
    ecAlpha(ctx, GA, 1);
    ecText(ctx, ecS(p.text, ecS(p.label, '')), x - w / 2 + 100, y, 32, white, 'left', 600);
    if (Math.floor(el * 2) % 2 === 0) {
      const tw = ctx.measureText(ecS(p.text, ecS(p.label, '')) || ' ').width;
      ecLine(ctx, x - w / 2 + 106 + tw, y - 22, x - w / 2 + 106 + tw, y + 22, acc, 3);
    }

  } else if (id === 'toggleSwitch') {
    const w = 200, h = 92;
    const on = ecClamp(prog * 1.4, 0, 1);
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, h / 2, on > 0.5 ? col : 'rgba(148,163,184,0.3)', null, 0);
    ecAlpha(ctx, GA, 1);
    const knobX = x - w / 2 + h / 2 + (w - h) * on;
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.arc(knobX, y, h / 2 - 10, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'checkboxTick') {
    const s = 140;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - s / 2, y - s / 2, s, s, 24, 'rgba(148,163,184,0.12)', col, 6);
    const q = ecClamp((prog - 0.15) / 0.6, 0, 1);
    ecAlpha(ctx, GA, 1);
    ctx.strokeStyle = acc; ctx.lineWidth = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 34, y + 2);
    ctx.lineTo(x - 10, y + 28);
    ctx.lineTo(x - 34 + 80 * q, y + 28 - 70 * q);
    ctx.stroke();

  } else if (id === 'sliderControl') {
    const w = 620, h = 24;
    const val = ecClamp(prog, 0, 1);
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, h / 2, 'rgba(148,163,184,0.25)', null, 0);
    ecAlpha(ctx, GA, 1);
    ecPanel(ctx, x - w / 2, y - h / 2, Math.max(h, w * val), h, h / 2, ecGrad(ctx, x - w / 2, 0, x + w / 2, 0, [[0, col], [1, acc]]), null, 0);
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.arc(x - w / 2 + Math.max(h / 2, w * val), y, 30, 0, Math.PI * 2); ctx.fill();
    ecText(ctx, ecS(p.label, Math.round(val * 100) + ''), x, y - 58, 34, white, 'center', 800);

  } else if (id === 'avatarStack') {
    const r = 44;
    for (let i = 0; i < 4; i++) {
      const ax = x - 72 + i * 62;
      const q = icClamp(prog * 4 - i * 0.6, 0, 1);
      ecAlpha(ctx, GA, q);
      ctx.fillStyle = i % 2 ? acc : col;
      ctx.beginPath(); ctx.arc(ax, y, r * (0.7 + 0.3 * q), 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#0B1220'; ctx.lineWidth = 6; ctx.stroke();
      ecText(ctx, String.fromCharCode(65 + i), ax, y, 32, '#04101E', 'center', 900);
    }

  } else if (id === 'ratingStars') {
    const filled = Math.round(ecClamp(ecN(p.value, 4), 0, 5));
    for (let i = 0; i < 5; i++) {
      ecAlpha(ctx, GA, 1);
      ecStar(ctx, x - 150 + i * 76, y, 32, 14, 5, -Math.PI / 2);
      ctx.fillStyle = i < filled ? acc : 'rgba(148,163,184,0.3)';
      ctx.fill();
    }
    ecText(ctx, ecS(p.label, filled + '/5'), x, y + 72, 30, white, 'center', 700);

  } else if (id === 'tooltipBox') {
    const w = 400, h = 120;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - w / 2, y - h / 2, w, h, 18, '#0B1220', col, 3);
    ctx.beginPath();
    ctx.moveTo(x - 20, y + h / 2);
    ctx.lineTo(x, y + h / 2 + 24);
    ctx.lineTo(x + 20, y + h / 2);
    ctx.closePath();
    ctx.fillStyle = '#0B1220'; ctx.fill();
    ecAlpha(ctx, GA, 1);
    const txt = ecS(p.text, ecS(p.label, ''));
    ecText(ctx, txt, x, y, 28, white, 'center', 700);
  }
}

/* --- Motion graphics ---------------------------------------------------- */
function ecMotion(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const r = ecN(p.radius, 120);
  const e = icEase(prog);
  const white = '#F4F8FF';

  if (id === 'bounceBall') {
    const hop = Math.abs(Math.sin(el * 3.2));
    const by = y - hop * r * 1.5;
    const squash = 1 + 0.3 * (1 - hop);
    ecAlpha(ctx, GA, 0.25);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(x, y + r * 0.9, r * 0.7 * squash, r * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = ecGrad(ctx, x - r, by - r, x + r, by + r, [[0, col], [1, acc]]);
    ctx.beginPath(); ctx.ellipse(x, by, r * (2 - squash) * e, r * squash * e, 0, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'pendulumSwing') {
    const pivotY = y - r * 1.5;
    const ang = Math.sin(el * 2) * 0.75;
    const bx = x + Math.sin(ang) * r * 2, by = pivotY + Math.cos(ang) * r * 2;
    ecAlpha(ctx, GA, 0.9);
    ecLine(ctx, x, pivotY, bx, by, col, 6);
    ctx.fillStyle = white;
    ctx.beginPath(); ctx.arc(x, pivotY, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = acc;
    ctx.beginPath(); ctx.arc(bx, by, r * 0.42 * e, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'orbitDots') {
    for (let i = 0; i < 3; i++) {
      for (let tr = 0; tr < 3; tr++) {
        const ang = el * (1.1 + i * 0.3) + i * 2.1 - tr * 0.18;
        const rad = r * (1 + i * 0.24);
        ecAlpha(ctx, GA, (0.7 - tr * 0.2) * e);
        ctx.fillStyle = i === 1 ? acc : col;
        ctx.beginPath();
        ctx.arc(x + Math.cos(ang) * rad, y + Math.sin(ang) * rad, (16 - tr * 4) * e, 0, Math.PI * 2);
        ctx.fill();
      }
    }

  } else if (id === 'rippleWaves') {
    for (let i = 0; i < 5; i++) {
      const q = (el * 0.45 + i / 5) % 1;
      ecAlpha(ctx, GA, (1 - q) * 0.8);
      ctx.strokeStyle = i % 2 ? acc : col; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(x, y, r * q, 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'pulseGrid') {
    for (let row = -3; row <= 3; row++) {
      for (let c = -3; c <= 3; c++) {
        const px = x + c * 62, py = y + row * 62;
        const d = Math.hypot(c, row);
        const q = 0.5 + 0.5 * Math.sin(el * 3 - d * 0.6);
        ecAlpha(ctx, GA, q * e);
        ctx.fillStyle = q > 0.6 ? acc : col;
        ctx.beginPath(); ctx.arc(px, py, 5 + 9 * q, 0, Math.PI * 2); ctx.fill();
      }
    }

  } else if (id === 'equalizerBars') {
    const bars = 11, gap = 14, bw = 34;
    const total = bars * bw + (bars - 1) * gap;
    for (let i = 0; i < bars; i++) {
      const hgt = (0.2 + 0.8 * Math.abs(Math.sin(el * 3.4 + i * 0.6))) * r * 2.2 * e;
      const bx = x - total / 2 + i * (bw + gap);
      ecAlpha(ctx, GA, 0.9);
      ctx.fillStyle = ecGrad(ctx, 0, y - r, 0, y + r, [[0, acc], [1, col]]);
      ecRound(ctx, bx, y - hgt / 2, bw, hgt, 8); ctx.fill();
    }

  } else if (id === 'particleTrail') {
    for (let i = 0; i < 24; i++) {
      const t = el * 1.2 - i * 0.07;
      const px = x + Math.sin(t) * r * 1.5;
      const py = y + Math.sin(t * 1.7) * r;
      ecAlpha(ctx, GA, (1 - i / 26) * 0.95);
      ctx.fillStyle = i % 4 === 0 ? acc : col;
      ctx.beginPath(); ctx.arc(px, py, 26 * (1 - i / 27), 0, Math.PI * 2); ctx.fill();
    }

  } else if (id === 'rotatingGear') {
    const teeth = 10;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(el * 0.9);
    ctx.beginPath();
    for (let i = 0; i < teeth * 2; i++) {
      const rr = i % 2 ? r * 0.82 : r;
      const ang = (i / (teeth * 2)) * Math.PI * 2;
      const px = Math.cos(ang) * rr, py = Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ecAlpha(ctx, GA, 0.95); ctx.fillStyle = col; ctx.fill();
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = '#0B1220';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();

  } else if (id === 'springCoil') {
    const loops = 8, width = r * 2.6;
    const squeeze = 0.7 + 0.3 * Math.sin(el * 2);
    for (let i = 0; i <= loops * 24; i++) {
      const t = i / (loops * 24);
      const px = x - width / 2 + width * t;
      const py = y + Math.sin(t * Math.PI * 2 * loops + el * 3) * r * 0.36 * squeeze;
      if (i === 0) { ctx.beginPath(); ctx.moveTo(px, py); } else ctx.lineTo(px, py);
    }
    ecAlpha(ctx, GA, 0.95);
    ctx.strokeStyle = col; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.stroke();

  } else if (id === 'chevronFlow') {
    for (let i = 0; i < 4; i++) {
      const q = ((el * 0.6 + i / 4) % 1);
      const px = x - r + q * r * 2;
      ecAlpha(ctx, GA, Math.sin(q * Math.PI) * 0.95);
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.lineWidth = 14; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(px - 30, y - 42);
      ctx.lineTo(px + 16, y);
      ctx.lineTo(px - 30, y + 42);
      ctx.stroke();
    }
  }
}

/* --- Backgrounds -------------------------------------------------------- */
function ecBackground(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const T0 = (typeof T !== 'undefined' && T) ? T : {};
  const base = ecS(p.background, ecS(p.baseColor, ecS(T0.paper, '#04070F')));
  const e = icEase(prog);

  if (id === 'auroraBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 3; i++) {
      const gx = W * (0.25 + 0.25 * i) + Math.sin(el * 0.5 + i) * W * 0.18;
      const gy = H * (0.25 + 0.2 * Math.sin(el * 0.4 + i * 1.7));
      const g = ctx.createRadialGradient(gx, gy, 20, gx, gy, W * 0.55);
      g.addColorStop(0, (i === 1 ? acc : col) + '88');
      g.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.55);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();

  } else if (id === 'grainBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    ecAlpha(ctx, GA, 0.55);
    ctx.fillStyle = '#C7D2FE';
    for (let i = 0; i < 1400; i++) {
      ctx.fillRect(ecHash(i * 1.7) * W, ecHash(i * 9.3 + 4) * H, 3, 3);
    }

  } else if (id === 'radialGlowBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const pulse = 0.8 + 0.2 * Math.sin(el * 1.6);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 20, W / 2, H * 0.42, W * 0.8 * pulse);
    g.addColorStop(0, col + '99');
    g.addColorStop(0.45, acc + '33');
    g.addColorStop(1, 'transparent');
    ecAlpha(ctx, GA, 0.9);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'checkerboardBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const cell = 120, drift = (el * 14) % (cell * 2);
    for (let r0 = 0; r0 < Math.ceil(H / cell) + 1; r0++) {
      for (let c0 = 0; c0 < Math.ceil(W / cell) + 1; c0++) {
        if ((r0 + c0) % 2) {
          ecAlpha(ctx, GA, 0.24);
          ctx.fillStyle = col;
          ctx.fillRect(c0 * cell - drift, r0 * cell - drift, cell, cell);
        }
      }
    }

  } else if (id === 'halftoneBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const lx = W * (0.5 + 0.3 * Math.sin(el * 0.5));
    const ly = H * (0.5 + 0.25 * Math.cos(el * 0.4));
    for (let r0 = 0; r0 < 20; r0++) {
      for (let c0 = 0; c0 < 12; c0++) {
        const px = c0 * (W / 12) + W / 24;
        const py = r0 * (H / 20) + H / 40;
        const d = Math.hypot(px - lx, py - ly);
        const rr = ecClamp(18 - d * 0.035, 2, 18);
        ecAlpha(ctx, GA, 0.7);
        ctx.fillStyle = d < W * 0.35 ? acc : col;
        ctx.beginPath(); ctx.arc(px, py, rr * e, 0, Math.PI * 2); ctx.fill();
      }
    }

  } else if (id === 'topographicBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let ring = 0; ring < 8; ring++) {
      ecAlpha(ctx, GA, 0.5);
      ctx.strokeStyle = ring % 2 ? acc : col;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 90; i++) {
        const th = (i / 90) * Math.PI * 2;
        const rr = (ring + 1) * W * 0.075 + Math.sin(th * 3 + el + ring) * W * 0.02;
        const px = W / 2 + Math.cos(th) * rr * 1.4;
        const py = H / 2 + Math.sin(th) * rr;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.stroke();
    }

  } else if (id === 'silkBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    const bands = 28;
    for (let i = 0; i < bands; i++) {
      const t = i / bands;
      const off = Math.sin(t * Math.PI * 2 + el * 0.8) * W * 0.12;
      const g = ctx.createLinearGradient(off, 0, W + off, H);
      g.addColorStop(0, i % 2 ? col + '22' : acc + '18');
      g.addColorStop(1, 'transparent');
      ecAlpha(ctx, GA, 0.7);
      ctx.fillStyle = g;
      ctx.fillRect(0, (i / bands) * H, W, H / bands + 2);
    }

  } else if (id === 'horizonBackground') {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, base);
    g.addColorStop(0.55, '#13233F');
    g.addColorStop(1, '#02040A');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    const hy = H * 0.62;
    const sun = ctx.createRadialGradient(W / 2, hy, 10, W / 2, hy, W * 0.36);
    sun.addColorStop(0, acc + 'CC');
    sun.addColorStop(0.5, col + '44');
    sun.addColorStop(1, 'transparent');
    ecAlpha(ctx, GA, 0.95);
    ctx.fillStyle = sun; ctx.fillRect(0, 0, W, hy + 4);
    ecAlpha(ctx, GA, 0.9);
    ecLine(ctx, 0, hy, W, hy, col, 3);
    for (let i = 1; i < 6; i++) {
      ecAlpha(ctx, GA, 0.5 - i * 0.07);
      ecLine(ctx, 0, hy + i * H * 0.045, W, hy + i * H * 0.045, col, 2);
    }

  } else if (id === 'prismBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const ox = W * (0.3 + 0.2 * Math.sin(el * 0.4));
    for (let i = 0; i < 6; i++) {
      const ang = -0.5 + i * 0.24 + Math.sin(el * 0.5) * 0.1;
      const len = W * 1.1;
      const ex = ox + Math.cos(ang) * len, ey = -H * 0.1 + Math.sin(ang) * len;
      ctx.beginPath();
      ctx.moveTo(ox, H * 0.85);
      ctx.lineTo(ex - 70, ey);
      ctx.lineTo(ex + 70, ey);
      ctx.closePath();
      ecAlpha(ctx, GA, 0.16);
      ctx.fillStyle = [col, acc, '#8B5CF6'][i % 3];
      ctx.fill();
    }
    ctx.restore();
    ctx.fillStyle = 'rgba(4,7,15,0.25)'; ctx.fillRect(0, H * 0.85, W, H * 0.15);

  } else if (id === 'dotMatrixBackground') {
    ctx.fillStyle = base; ctx.fillRect(0, 0, W, H);
    for (let r0 = 0; r0 < 22; r0++) {
      for (let c0 = 0; c0 < 14; c0++) {
        const px = c0 * (W / 14) + W / 28;
        const py = r0 * (H / 22) + H / 44;
        const q = 0.5 + 0.5 * Math.sin(el * 2 + px * 0.01 + py * 0.008);
        ecAlpha(ctx, GA, 0.2 + 0.6 * q);
        ctx.fillStyle = q > 0.65 ? acc : col;
        ctx.beginPath(); ctx.arc(px, py, 3 + 3 * q, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

/* --- Effects ------------------------------------------------------------ */
function ecEffect(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const T0 = (typeof T !== 'undefined' && T) ? T : {};
  const e = icEase(prog);

  if (id === 'filmGrain') {
    ecAlpha(ctx, GA, 0.5);
    ctx.fillStyle = '#E2E8F0';
    for (let i = 0; i < 1100; i++) {
      const n = i + Math.floor(el * 24);
      ctx.fillRect(ecHash(n * 1.3) * W, ecHash(n * 7.1 + 2) * H, 3, 3);
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
    g.addColorStop(0, 'transparent'); g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ecAlpha(ctx, GA, 0.8);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'chromaticAberration') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ecAlpha(ctx, GA, 0.06);
    ctx.fillStyle = '#FF3355';
    ctx.fillRect(-6, 0, W, H);
    ctx.fillStyle = '#33E0FF';
    ctx.fillRect(6, 0, W, H);
    ctx.restore();
    ecAlpha(ctx, GA, 0.35);
    for (let i = 0; i < 7; i++) {
      const gy = (ecHash(i * 3.7 + Math.floor(el * 3)) * H);
      ecLine(ctx, 0, gy, W, gy, i % 2 ? '#FF3355' : '#33E0FF', 2);
    }

  } else if (id === 'lightLeak') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const lx = W * (-0.05 + 0.12 * (0.5 + 0.5 * Math.sin(el * 0.7)));
    const g = ctx.createRadialGradient(lx, H * 0.2, 20, lx, H * 0.2, W * 0.85);
    g.addColorStop(0, '#FFB86BCC');
    g.addColorStop(0.4, '#FF6B9D44');
    g.addColorStop(1, 'transparent');
    ecAlpha(ctx, GA, 0.85);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();

  } else if (id === 'vignettePulse') {
    const pulse = 0.45 + 0.2 * Math.sin(el * 2.4);
    const g = ctx.createRadialGradient(W / 2, H * 0.46, H * 0.18, W / 2, H * 0.46, H * 0.8);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, 'rgba(0,0,0,' + pulse.toFixed(3) + ')');
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'bloomHalo') {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const pulse = 0.85 + 0.15 * Math.sin(el * 1.8);
    const g = ctx.createRadialGradient(W / 2, H * 0.42, 10, W / 2, H * 0.42, W * 0.5 * pulse);
    g.addColorStop(0, ecS(p.color, '#FFFFFF') + 'AA');
    g.addColorStop(0.35, col + '55');
    g.addColorStop(1, 'transparent');
    ecAlpha(ctx, GA, 0.9);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.restore();

  } else if (id === 'colorWash') {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, col + '33');
    g.addColorStop(1, acc + '33');
    ecAlpha(ctx, GA, 0.9 * e);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  } else if (id === 'duotoneStripes') {
    ctx.save();
    for (let i = -H; i < W + H; i += 70) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i + 34, 0); ctx.lineTo(i + 34 - H * 0.6, H); ctx.lineTo(i - H * 0.6, H);
      ctx.closePath();
      ecAlpha(ctx, GA, 0.12);
      ctx.fillStyle = i % 140 === 0 ? col : acc;
      ctx.fill();
    }
    ctx.restore();

  } else if (id === 'glitchBars') {
    for (let i = 0; i < 10; i++) {
      const seed = i + Math.floor(el * 6);
      const gy = ecHash(seed * 2.3) * H;
      const gh = 8 + ecHash(seed * 5.1) * 46;
      const off = (ecHash(seed * 9.7) - 0.5) * 80 * e;
      ecAlpha(ctx, GA, 0.5);
      ctx.fillStyle = i % 3 === 0 ? acc : col;
      ctx.fillRect(off, gy, W, gh);
    }

  } else if (id === 'focusRings') {
    for (let i = 0; i < 3; i++) {
      const q = (el * 0.5 + i / 3) % 1;
      ecAlpha(ctx, GA, (1 - q) * 0.7);
      ctx.strokeStyle = i % 2 ? acc : col;
      ctx.lineWidth = 6;
      ctx.beginPath(); ctx.arc(W / 2, H * 0.45, H * 0.1 + q * H * 0.55, 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'speedLines') {
    for (let i = 0; i < 44; i++) {
      const ang = (i / 44) * Math.PI * 2 + ecHash(i) * 0.1;
      const q = (el * 0.9 + ecHash(i * 3.3)) % 1;
      const r0 = H * (0.18 + 0.5 * q);
      const r1 = r0 + H * (0.08 + 0.3 * ecHash(i * 2.7));
      ecAlpha(ctx, GA, (1 - q) * 0.45);
      ecLine(ctx, W / 2 + Math.cos(ang) * r0, H * 0.45 + Math.sin(ang) * r0,
             W / 2 + Math.cos(ang) * r1, H * 0.45 + Math.sin(ang) * r1,
             i % 3 === 0 ? acc : (T0.ink || '#F4F8FF'), 4);
    }
  }
}

/* --- Transitions -------------------------------------------------------- */
function ecTransition(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const k = Math.sin(ecClamp(prog, 0, 1) * Math.PI);
  const dark = ecS(p.color, '#04070F');

  if (id === 'transitionPush') {
    const h = H * k;
    ecAlpha(ctx, GA, 0.95);
    ctx.fillStyle = dark; ctx.fillRect(0, 0, W, h);
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = acc; ctx.fillRect(0, h - 8, W, 8);

  } else if (id === 'transitionIris') {
    const rr = Math.min(W, H) * 0.7 * k;
    ecAlpha(ctx, GA, 0.95);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H / 2 - rr); ctx.fillRect(0, H / 2 + rr, W, H / 2 - rr);
    ctx.fillRect(0, H / 2 - rr, W / 2 - rr, rr * 2);
    ctx.fillRect(W / 2 + rr, H / 2 - rr, W / 2 - rr, rr * 2);
    ecAlpha(ctx, GA, 0.9);
    ctx.strokeStyle = acc; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.stroke();

  } else if (id === 'transitionBarnDoors') {
    const w = (W / 2) * k;
    ecAlpha(ctx, GA, 0.95);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, w, H); ctx.fillRect(W - w, 0, w, H);
    ecAlpha(ctx, GA, 1);
    ecLine(ctx, w, 0, w, H, acc, 5); ctx.lineWidth = 5;
    ctx.strokeStyle = acc;
    ctx.beginPath(); ctx.moveTo(W - w, 0); ctx.lineTo(W - w, H); ctx.stroke();

  } else if (id === 'transitionPixelate') {
    const cols = 12, rows = 20;
    const cw = W / cols, ch = H / rows;
    for (let r0 = 0; r0 < rows; r0++) {
      for (let c0 = 0; c0 < cols; c0++) {
        const th = ecHash(r0 * 17.3 + c0 * 5.9);
        if (k > th) {
          ecAlpha(ctx, GA, 0.92);
          ctx.fillStyle = th > 0.8 ? acc : dark;
          ctx.fillRect(c0 * cw, r0 * ch, cw + 1, ch + 1);
        }
      }
    }

  } else if (id === 'transitionCircleReveal') {
    const rr = Math.min(W, H) * 0.85 * k;
    ecAlpha(ctx, GA, 0.65);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, Math.PI * 2); ctx.fill();

  } else if (id === 'transitionSwipeUp') {
    const h = H * k;
    const g = ctx.createLinearGradient(0, H - h - 160, 0, H);
    g.addColorStop(0, 'transparent');
    g.addColorStop(1, dark);
    ecAlpha(ctx, GA, 0.95);
    ctx.fillStyle = g; ctx.fillRect(0, H - h - 160, W, h + 160);
    ecAlpha(ctx, GA, 1);
    ctx.fillStyle = acc; ctx.fillRect(0, H - h, W, 6);

  } else if (id === 'transitionBlinds') {
    const slats = 12, sh = H / slats;
    for (let i = 0; i < slats; i++) {
      ecAlpha(ctx, GA, 0.92);
      ctx.fillStyle = dark;
      ctx.fillRect(0, i * sh, W, sh * k);
    }

  } else if (id === 'transitionBlurWipe') {
    for (let i = 0; i < 14; i++) {
      const t = i / 14;
      const x0 = (t * 1.6 - 0.3 + prog * 0.4) * W;
      ecAlpha(ctx, GA, 0.5);
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.fillRect(x0, 0, W * 0.09, H);
    }
    ecAlpha(ctx, GA, 0.5);
    ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H * 0.06);
    ctx.fillRect(0, H * 0.94, W, H * 0.06);
  }
}
