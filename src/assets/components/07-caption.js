/* Third pack: captions and lower thirds (25). */
function p3Caption(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.86);
  const x = a.x, y = a.y;
  const text = p3TextOf(p);
  const sz = ecN(p.size, 40);
  const e = icEase(prog);
  const white = '#FFFFFF';
  if (!text) { ecSkeleton(ctx, x, y, sz, GA, col); return; }
  ecFont(ctx, sz, 700);
  const tw = Math.max(sz, ctx.measureText(text).width);
  const bw = tw + 56, bh = sz * 1.75;
  const label = ecS(p.label, '');

  if (id === 'captionGlowBar') {
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 22;
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = col;
    ctx.fillRect(x - W / 2, y - bh / 2, W, bh);
    ctx.restore();
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, p3Ink(col), 'center', 800);

  } else if (id === 'captionBoxedQuote') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 10, 'rgba(5,10,20,0.78)', col, 2);
    ecAlpha(ctx, GA, 0.5 * e);
    ecFont(ctx, sz * 1.6, 900);
    ctx.fillStyle = acc;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText('\u201C', x - bw / 2 + 16, y - bh / 2 - sz * 0.1);
    ecAlpha(ctx, GA, e);
    ctx.font = 'italic 600 ' + Math.round(sz * 0.9) + 'px ' + EC_FONT;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = white;
    ctx.fillText(text, x, y + sz * 0.05);

  } else if (id === 'captionSplitColor') {
    const half = Math.ceil(text.length / 2);
    ecAlpha(ctx, GA, e);
    ecText(ctx, text.slice(0, half), x - 8, y - sz * 0.4, sz * 0.84, white, 'right', 800);
    ecText(ctx, text.slice(half), x + 8, y + sz * 0.4, sz * 0.84, acc, 'left', 800);

  } else if (id === 'captionWave') {
    const words = text.split(/\s+/).slice(0, 8);
    ecFont(ctx, sz, 800);
    const ws = words.map(w => ctx.measureText(w).width);
    let total = ws.reduce((s, v) => s + v, 0) + (words.length - 1) * sz * 0.26;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      const dy = Math.sin(prog * Math.PI * 2 + i * 0.9) * sz * 0.14;
      ecAlpha(ctx, GA, e);
      ecText(ctx, words[i], cx + ws[i] / 2, y + dy, sz, i % 3 === 1 ? acc : white, 'center', 800);
      cx += ws[i] + sz * 0.26;
    }

  } else if (id === 'captionRise') {
    const q = icEase(ecClamp(prog / 0.6, 0, 1));
    ecAlpha(ctx, GA, q);
    ecText(ctx, text, x, y + (1 - q) * sz * 0.9, sz, white, 'center', 800);

  } else if (id === 'captionDrop') {
    const t = ecClamp(prog / 0.55, 0, 1);
    const q = icEase(t);
    const dy = -sz * 2 * (1 - q) + Math.sin(q * Math.PI * 2) * sz * 0.12 * (1 - q);
    ecAlpha(ctx, GA, ecClamp(t * 2, 0, 1));
    ecText(ctx, text, x, y + dy, sz, white, 'center', 900);
    ecAlpha(ctx, GA, 0.7 * q);
    ecLine(ctx, x - tw / 2, y + sz * 0.7, x + tw / 2, y + sz * 0.7, col, 3);

  } else if (id === 'captionTypeOn') {
    const n = Math.floor(ecClamp(prog, 0, 1) * text.length);
    ecAlpha(ctx, GA, 1);
    ecText(ctx, text.slice(0, n), x, y, sz, white, 'center', 700);
    if (Math.floor(el * 2.4) % 2 === 0) {
      ecFont(ctx, sz, 700);
      const wid = ctx.measureText(text.slice(0, n)).width;
      ecLine(ctx, x - tw / 2 + wid + 4, y - sz * 0.45, x - tw / 2 + wid + 4, y + sz * 0.45, acc, Math.max(2, sz * 0.1));
    }

  } else if (id === 'captionHighlightWord') {
    const words = text.split(/\s+/).slice(0, 8);
    const active = Math.min(words.length - 1, Math.floor(prog * words.length));
    ecFont(ctx, sz, 800);
    const ws = words.map(w => ctx.measureText(w).width);
    let total = ws.reduce((s, v) => s + v, 0) + (words.length - 1) * sz * 0.26;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      if (i === active) {
        ctx.save();
        ctx.globalAlpha = ecClamp(GA * 0.45, 0, 1);
        ctx.fillStyle = col;
        ctx.fillRect(cx - 6, y - sz * 0.62, ws[i] + 12, sz * 1.24);
        ctx.restore();
      }
      ecAlpha(ctx, GA, e);
      ecText(ctx, words[i], cx, y, sz, i === active ? p3Ink(col) : white, 'left', 800);
      cx += ws[i] + sz * 0.26;
    }

  } else if (id === 'captionUnderline') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 800);
    const q = icEase(ecClamp((prog - 0.15) / 0.55, 0, 1));
    ecLine(ctx, x - tw / 2, y + sz * 0.66, x - tw / 2 + tw * q, y + sz * 0.66, acc, 4);

  } else if (id === 'captionNeonFrame') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 10, null, col, 2);
    ctx.save();
    ctx.shadowColor = col; ctx.shadowBlur = 18;
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 800);
    ctx.restore();

  } else if (id === 'captionPillStack') {
    const ph = sz * 1.5;
    const oy = label ? sz * 0.5 : 0;
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - ph / 2 + oy, bw, ph, ph / 2, 'rgba(6,12,22,0.86)', acc, 2);
    ecText(ctx, text, x, y + oy, sz * 0.9, white, 'center', 700);
    if (label) {
      ecFont(ctx, sz * 0.32, 800);
      const lw = Math.max(sz, ctx.measureText(label.toUpperCase()).width) + 30;
      ecPanel(ctx, x - lw / 2, y - ph / 2 - sz * 0.42, lw, sz * 0.6, sz * 0.3, acc, null, 0);
      ecText(ctx, label.toUpperCase(), x, y - ph / 2 - sz * 0.12, sz * 0.3, p3Ink(acc), 'center', 800);
    }

  } else if (id === 'captionShadowText') {
    ecAlpha(ctx, GA, 0.7 * e);
    ecText(ctx, text, x + 6, y + 6, sz, '#000000', 'center', 800);
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 800);

  } else if (id === 'captionArrowTag') {
    const aw = Math.min(W * 0.7, bw + 26), ah = sz * 1.5;
    const ax = x - aw / 2, ay = y - ah / 2;
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = 'rgba(6,12,22,0.88)';
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + aw - 18, ay);
    ctx.lineTo(ax + aw, y);
    ctx.lineTo(ax + aw - 18, y + ah / 2);
    ctx.lineTo(ax, y + ah / 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = col;
    ctx.fillRect(ax, ay, 6, ah);
    ecText(ctx, text, ax + 26, y, sz * 0.82, white, 'left', 800);

  } else if (id === 'captionBracketLine') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 800);
    const b = sz * 0.5;
    const bx = x - tw / 2 - 18, cx2 = x + tw / 2 + 18;
    ecLine(ctx, bx, y - b, bx, y + b, acc, 3);
    ecLine(ctx, bx, y - b, bx + 12, y - b, acc, 3);
    ecLine(ctx, bx, y + b, bx + 12, y + b, acc, 3);
    ecLine(ctx, cx2, y - b, cx2, y + b, acc, 3);
    ecLine(ctx, cx2 - 12, y - b, cx2, y - b, acc, 3);
    ecLine(ctx, cx2 - 12, y + b, cx2, y + b, acc, 3);

  } else if (id === 'captionProgressDots') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 800);
    const n = 5, r = Math.max(2, sz * 0.07), gap = r * 3.4;
    const span = (n - 1) * gap;
    const lit = ecClamp(prog, 0, 1) * n;
    for (let i = 0; i < n; i++) {
      const dx = x - span / 2 + i * gap;
      ctx.beginPath();
      ctx.arc(dx, y + sz * 0.85, r, 0, Math.PI * 2);
      ctx.fillStyle = i < lit ? acc : 'rgba(255,255,255,0.3)';
      ctx.fill();
    }

  } else if (id === 'captionTimer') {
    const secs = Math.floor(ecClamp(prog, 0, 1) * 60);
    const mm = String(Math.floor(secs / 60)).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    ecAlpha(ctx, GA, e);
    if (label) ecText(ctx, label.toUpperCase(), x, y - sz * 0.72, sz * 0.3, acc, 'center', 800);
    ecAlpha(ctx, GA, e);
    ctx.font = '800 ' + Math.round(sz) + 'px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = white;
    ctx.fillText(mm + ':' + ss, x, y + (label ? sz * 0.1 : 0));

  } else if (id === 'captionSpeakerTag') {
    ecAlpha(ctx, GA, e);
    if (label) ecText(ctx, label.toUpperCase(), x, y - sz * 0.66, sz * 0.32, acc, 'center', 800);
    ecText(ctx, text, x, y + sz * 0.14, sz * 0.92, white, 'center', 700);
    ecAlpha(ctx, GA, 0.5 * e);
    ecLine(ctx, x - tw / 2, y - sz * 0.34, x + tw / 2, y - sz * 0.34, 'rgba(255,255,255,0.3)', 1);

  } else if (id === 'captionTwoLine') {
    const sub = ecS(p.sub, '') || label;
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y - sz * 0.28, sz, white, 'center', 800);
    if (sub) ecText(ctx, sub, x, y + sz * 0.5, sz * 0.42, acc, 'center', 600);

  } else if (id === 'captionCenterBar') {
    const barW = 8;
    const gx = x - (tw + barW + 16) / 2;
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = col;
    ctx.fillRect(gx, y - bh / 2 + 6, barW, bh - 12);
    ecText(ctx, text, gx + barW + 16, y, sz, white, 'left', 800);

  } else if (id === 'captionEdgeFade') {
    const g = ctx.createLinearGradient(x - W / 2, 0, x + W / 2, 0);
    g.addColorStop(0, 'rgba(2,5,12,0)');
    g.addColorStop(0.18, 'rgba(2,5,12,0.82)');
    g.addColorStop(0.82, 'rgba(2,5,12,0.82)');
    g.addColorStop(1, 'rgba(2,5,12,0)');
    ctx.save();
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = g;
    ctx.fillRect(x - W / 2, y - bh / 2, W, bh);
    ctx.restore();
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 700);

  } else if (id === 'captionKaraokeBar') {
    const words = text.split(/\s+/).slice(0, 8);
    const active = Math.min(words.length - 1, Math.floor(prog * words.length));
    ecFont(ctx, sz, 800);
    const ws = words.map(w => ctx.measureText(w).width);
    let total = ws.reduce((s, v) => s + v, 0) + (words.length - 1) * sz * 0.26;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      ecAlpha(ctx, GA, e);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.font = '800 ' + Math.round(sz) + 'px ' + EC_FONT;
      ctx.fillStyle = i === active ? acc : 'rgba(255,255,255,0.72)';
      ctx.fillText(words[i], cx, y);
      if (i === active) {
        const uw = ws[i] * ecClamp((prog * words.length) % 1, 0, 1);
        ecLine(ctx, cx, y + sz * 0.56, cx + uw, y + sz * 0.56, acc, 4);
      }
      cx += ws[i] + sz * 0.26;
    }

  } else if (id === 'captionWordPop') {
    const words = text.split(/\s+/).slice(0, 6);
    ecFont(ctx, sz, 800);
    const ws = words.map(w => ctx.measureText(w).width);
    let total = ws.reduce((s, v) => s + v, 0) + (words.length - 1) * sz * 0.28;
    let cx = x - total / 2;
    for (let i = 0; i < words.length; i++) {
      const q = icEase(ecClamp((prog - i * 0.12) / 0.35, 0, 1));
      ctx.save();
      ctx.translate(cx + ws[i] / 2, y);
      ctx.scale(0.6 + 0.4 * q, 0.6 + 0.4 * q);
      ecAlpha(ctx, GA, q);
      ecText(ctx, words[i], 0, 0, sz, i % 2 ? acc : white, 'center', 800);
      ctx.restore();
      cx += ws[i] + sz * 0.28;
    }

  } else if (id === 'captionBoxOutline') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, x - bw / 2, y - bh / 2, bw, bh, 10, null, 'rgba(255,255,255,0.85)', 2);
    ecText(ctx, text, x, y, sz, white, 'center', 700);

  } else if (id === 'captionGradientText') {
    const g = ctx.createLinearGradient(x - tw / 2, 0, x + tw / 2, 0);
    g.addColorStop(0, col); g.addColorStop(1, acc);
    ctx.save();
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = g;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '800 ' + Math.round(sz) + 'px ' + EC_FONT;
    ctx.fillText(text, x, y);
    ctx.restore();

  } else if (id === 'captionMinimal') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, text, x, y, sz, white, 'center', 500);
    ecAlpha(ctx, GA, 0.45);
    ecLine(ctx, x - tw / 2, y - sz * 0.72, x + tw / 2, y - sz * 0.72, 'rgba(255,255,255,0.35)', 1);

  }
}
