/* Third pack: transitions (25). Peak coverage at the midpoint. */
function p3Transition(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const amt = Math.sin(prog * Math.PI);
  const e = icEase(prog);
  const dark = ecS(p.color, '#050A14');
  ctx.save();
  ctx.globalAlpha = ecClamp(GA * amt, 0, 1);

  if (id === 'transitionBandSwipe') {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const off = (i / n) * W - e * W * 0.5;
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.fillRect(off, 0, W / n - 2, H);
    }

  } else if (id === 'transitionCircleWipe') {
    const r = Math.max(W, H) * 0.75 * e;
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.arc(W / 2, H / 2, Math.max(0.1, r), 0, Math.PI * 2, true);
    ctx.fill('evenodd');

  } else if (id === 'transitionDiagonalSplit') {
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W * e, 0); ctx.lineTo(0, H * e); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(W, H); ctx.lineTo(W - W * e, H); ctx.lineTo(W, H - H * e); ctx.closePath(); ctx.fill();

  } else if (id === 'transitionFadeThrough') {
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W, H);

  } else if (id === 'transitionGridReveal') {
    const cols = 5, rows = 7, cw = W / cols, ch = H / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const q = icEase(ecClamp((prog - (r + c) * 0.035) / 0.6, 0, 1));
        const s = (1 - q) * 0.86;
        ctx.fillStyle = (r + c) % 2 ? col : dark;
        ctx.fillRect(c * cw + cw * s / 2, r * ch + ch * s / 2, cw * (1 - s), ch * (1 - s));
      }
    }

  } else if (id === 'transitionHexWipe') {
    const r = W / 9;
    for (let row = -1; row < H / (r * 1.5) + 1; row++) {
      for (let col2 = -1; col2 < W / (r * 1.8) + 1; col2++) {
        const cx = col2 * r * 1.8 + (row % 2 ? r * 0.9 : 0);
        const cy = row * r * 1.5;
        const q = ecHash(row * 13 + col2 * 7);
        if (q > e * 1.25) continue;
        ecHex(ctx, cx, cy, r);
        ctx.fillStyle = q > 0.5 ? col : dark; ctx.fill();
      }
    }

  } else if (id === 'transitionInkSpread') {
    const r = Math.max(W, H) * 0.7 * e;
    ctx.fillStyle = dark;
    ctx.beginPath();
    for (let i = 0; i <= 42; i++) {
      const ang = (i / 42) * Math.PI * 2;
      const rr = r * (0.78 + 0.22 * Math.sin(ang * 5 + el));
      const px = W / 2 + Math.cos(ang) * rr, py = H / 2 + Math.sin(ang) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

  } else if (id === 'transitionLineWipe') {
    for (let i = 0; i < 24; i++) {
      const q = icEase(ecClamp((prog - i * 0.018) / 0.5, 0, 1));
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.fillRect((i / 24) * W, 0, W / 24 - 1, H * q);
    }

  } else if (id === 'transitionMosaicFlip') {
    const n = 6, cw = W / n, ch = H / n;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const q = icEase(ecClamp((prog - (r * n + c) * 0.02) / 0.5, 0, 1));
        const sy = Math.max(0.02, Math.abs(Math.cos(q * Math.PI * 0.5)));
        ctx.save();
        ctx.translate(c * cw + cw / 2, r * ch + ch / 2);
        ctx.scale(1, sy);
        ctx.fillStyle = (r + c) % 2 ? col : dark;
        ctx.fillRect(-cw / 2, -ch / 2, cw - 1, ch - 1);
        ctx.restore();
      }
    }

  } else if (id === 'transitionPageTurn') {
    const q = e;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(W * (1 - q), 0, W * q, H);
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(W, 0); ctx.lineTo(W * (1 - q), 0); ctx.quadraticCurveTo(W * (1 - q * 0.7), H / 2, W * (1 - q), H); ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

  } else if (id === 'transitionPixelDissolve') {
    const n = 120;
    for (let i = 0; i < n; i++) {
      const q = ecHash(i);
      if (q > prog) continue;
      const cw = W / 12, ch = H / 12;
      ctx.fillStyle = i % 3 ? dark : col;
      ctx.fillRect((i % 12) * cw, Math.floor(i / 12) * ch, cw, ch);
    }

  } else if (id === 'transitionRadialWipe') {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(W / 2, H / 2);
    ctx.arc(W / 2, H / 2, Math.max(W, H), -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * e);
    ctx.closePath(); ctx.fill();

  } else if (id === 'transitionRippleWipe') {
    for (let i = 0; i < 5; i++) {
      const q = p3Loop(prog * 1.2 - i * 0.18);
      ctx.strokeStyle = i % 2 ? col : dark; ctx.lineWidth = 20;
      ctx.beginPath(); ctx.arc(W / 2, H / 2, Math.max(1, q * Math.max(W, H) * 0.7), 0, Math.PI * 2); ctx.stroke();
    }

  } else if (id === 'transitionShapeWipe') {
    const r = Math.max(W, H) * 0.55 * e;
    ctx.fillStyle = dark;
    ecStar(ctx, W / 2, H / 2, r, r * 0.55, 12, el);
    ctx.fill();

  } else if (id === 'transitionSlideStack') {
    for (let i = 0; i < 5; i++) {
      const q = icEase(ecClamp((prog - i * 0.06) / 0.55, 0, 1));
      const off = (1 - q) * W;
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.fillRect(off, i * H / 5, W, H / 5 - 2);
    }

  } else if (id === 'transitionSmear') {
    for (let i = 0; i < 16; i++) {
      const yy = (i / 16) * H;
      const w0 = W * (0.2 + ecHash(i) * 0.7) * e;
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.globalAlpha = ecClamp(GA * amt * 0.5, 0, 1);
      ctx.fillRect(0, yy, w0, 6);
    }

  } else if (id === 'transitionSplitCurtain') {
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, W * 0.5 * (1 - e), H);
    ctx.fillRect(W - W * 0.5 * (1 - e), 0, W * 0.5 * (1 - e), H);

  } else if (id === 'transitionStaggerBars') {
    for (let i = 0; i < 10; i++) {
      const q = icEase(ecClamp((prog - i * 0.04) / 0.5, 0, 1));
      ctx.fillStyle = i % 2 ? dark : col;
      ctx.fillRect(i * (W / 10), 0, W / 10 - 2, H * q);
    }

  } else if (id === 'transitionStarWipe') {
    const r = Math.max(W, H) * 0.7 * e;
    ctx.fillStyle = dark;
    ecStar(ctx, W / 2, H / 2, r, r * 0.72, 6, -Math.PI / 2);
    ctx.fill();

  } else if (id === 'transitionSwipeLeft' || id === 'transitionSwipeRight') {
    const dir = id === 'transitionSwipeLeft' ? -1 : 1;
    const off = dir * W * (1 - e);
    ctx.fillStyle = dark;
    ctx.fillRect(off, 0, W, H);

  } else if (id === 'transitionTunnel') {
    for (let i = 0; i < 8; i++) {
      const q = p3Loop(prog * 0.8 + i / 8);
      const inset = q * Math.min(W, H) * 0.28;
      ctx.strokeStyle = i % 2 ? col : dark; ctx.lineWidth = 6;
      ctx.strokeRect(inset, inset * H / W, W - inset * 2, H - inset * 2 * H / W);
    }

  } else if (id === 'transitionWaveWipe') {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    for (let i = 0; i <= 20; i++) {
      const px = (i / 20) * W;
      const py = H * (0.1 + 0.8 * e) + Math.sin(i * 0.8 + el * 4) * H * 0.04;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(W, 0); ctx.closePath(); ctx.fill();

  } else if (id === 'transitionZoomPush') {
    const s = 0.2 + e * 1.1;
    ctx.save();
    ctx.translate(W / 2, H / 2); ctx.scale(s, s); ctx.translate(-W / 2, -H / 2);
    ctx.fillStyle = dark; ctx.fillRect(0, 0, W, H);
    ctx.restore();

  } else if (id === 'transitionBlindsReveal') {
    const n = 8, bh = H / n;
    for (let i = 0; i < n; i++) {
      const q = icEase(ecClamp((prog - i * 0.04) / 0.5, 0, 1));
      ctx.fillStyle = i % 2 ? col : dark;
      ctx.fillRect(0, i * bh, W, bh * (1 - q));
    }
  }
  ctx.restore();
}
