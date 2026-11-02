/* Third pack: UI mockups and cards (25). */
function p3Ui(ctx, W, H, el, prog, id, p, GA, col, acc) {
  const a = ecXY(p, W, H, 0.5, 0.5);
  const x = a.x, y = a.y;
  const e = icEase(prog);
  const sz = ecN(p.size, 22);
  const title = p3TextOf(p);
  const sub = p3SubOf(p);
  const rows = p3Rows(p, 4);
  const white = '#F4F8FF';
  const panel = 'rgba(10,16,28,0.86)';
  const border = 'rgba(255,255,255,0.16)';
  const fw = Math.min(W * 0.74, 620);
  const fh = Math.min(H * 0.52, 560);
  const bx = x - fw / 2, by = y - fh / 2;
  const rl = i => p3RowLabel(rows[i % rows.length]);

  if (id === 'appWindow') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw, fh, 14, 'rgba(12,18,30,0.94)', col, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(bx, by, fw, 44);
    ['#F87171', '#FBBF24', '#34D399'].forEach((c, i) => { ecDot(ctx, bx + 24 + i * 20, by + 22, 6, c); });
    ecText(ctx, title || 'Window', bx + fw / 2, by + 22, 20, white, 'center', 600);
    for (let i = 0; i < 4; i++) {
      ecText(ctx, rl(i), bx + 26, by + 88 + i * 46, sz * 0.82, 'rgba(255,255,255,0.72)', 'left', 500);
      ecAlpha(ctx, GA, 0.14);
      ecLine(ctx, bx + 26, by + 110 + i * 46, bx + fw - 26, by + 110 + i * 46, white, 1);
    }

  } else if (id === 'authCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by + fh * 0.08, fw * 0.62, fh * 0.84, 16, panel, border, 1.5);
    const cw = fw * 0.62, cx = x - cw / 2;
    ecText(ctx, title || 'Sign in', x, by + fh * 0.2, 28, white, 'center', 800);
    ecPanel(ctx, cx + 28, by + fh * 0.32, cw - 56, 40, 8, 'rgba(255,255,255,0.08)', border, 1);
    ecPanel(ctx, cx + 28, by + fh * 0.45, cw - 56, 40, 8, 'rgba(255,255,255,0.08)', border, 1);
    ecPanel(ctx, cx + 28, by + fh * 0.6, cw - 56, 40, 8, col, null, 0);
    ecText(ctx, sub || 'Continue', x, by + fh * 0.6 + 20, 18, p3Ink(col), 'center', 800);

  } else if (id === 'bottomSheet') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, y + H * 0.06, fw, H * 0.34, 24, panel, border, 1.5);
    ecPanel(ctx, x - 26, y + H * 0.09, 52, 5, 3, 'rgba(255,255,255,0.3)', null, 0);
    ecText(ctx, title, bx + 30, y + H * 0.15, 26, white, 'left', 800);
    for (let i = 0; i < 3; i++) {
      ecText(ctx, rl(i), bx + 30, y + H * 0.22 + i * 40, sz, 'rgba(255,255,255,0.72)', 'left', 500);
    }

  } else if (id === 'chatThread') {
    ecAlpha(ctx, GA, e);
    for (let i = 0; i < 4; i++) {
      const mine = i % 2 === 1;
      const bw = fw * (0.34 + ecHash(i + 3) * 0.32);
      const bx2 = mine ? bx + fw - bw : bx;
      const by2 = by + 20 + i * 86;
      ecPanel(ctx, bx2, by2, bw, 62, 14, mine ? col : 'rgba(255,255,255,0.1)',
        mine ? null : border, mine ? 0 : 1);
      ecText(ctx, rl(i), bx2 + 16, by2 + 22, sz * 0.8, mine ? p3Ink(col) : white, 'left', 600);
      ecText(ctx, '12:' + String(10 + i).padStart(2, '0'), bx2 + 16, by2 + 46, sz * 0.55, 'rgba(255,255,255,0.45)', 'left', 500);
    }

  } else if (id === 'checkoutCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.7, fh, 16, panel, border, 1.5);
    ecText(ctx, title || 'Checkout', bx + 28, by + 40, 26, white, 'left', 800);
    for (let i = 0; i < 3; i++) {
      ecText(ctx, rl(i), bx + 28, by + 90 + i * 40, sz * 0.82, 'rgba(255,255,255,0.7)', 'left', 500);
      ecText(ctx, '$' + (12 + i * 9), bx + fw * 0.7 - 28, by + 90 + i * 40, sz * 0.82, white, 'right', 600);
    }
    ecLine(ctx, bx + 28, by + fh - 100, bx + fw * 0.7 - 28, by + fh - 100, border, 1);
    ecText(ctx, 'Total', bx + 28, by + fh - 64, 20, 'rgba(255,255,255,0.65)', 'left', 600);
    ecText(ctx, ecS(p.total, '$58.00'), bx + fw * 0.7 - 28, by + fh - 64, 24, acc, 'right', 900);
    ecPanel(ctx, bx + 28, by + fh - 44, fw * 0.7 - 56, 34, 8, col, null, 0);

  } else if (id === 'commandPalette') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by + fh * 0.12, fw, 64, 12, 'rgba(10,16,28,0.96)', 'rgba(255,255,255,0.3)', 2);
    ecDot(ctx, bx + 30, by + fh * 0.12 + 32, 7, acc);
    ecText(ctx, title || 'Search commands…', bx + 52, by + fh * 0.12 + 32, 20, 'rgba(255,255,255,0.55)', 'left', 500);
    for (let i = 0; i < 3; i++) {
      const ny = by + fh * 0.12 + 76 + i * 44;
      ecPanel(ctx, bx, ny, fw, 38, 8, i === 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)', null, 0);
      ecText(ctx, rl(i), bx + 24, ny + 19, sz * 0.8, white, 'left', 500);
    }

  } else if (id === 'cookieBanner') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, y + H * 0.16, fw, H * 0.24, 16, panel, border, 1.5);
    ecText(ctx, title || 'We use cookies', bx + 28, y + H * 0.21, 22, white, 'left', 800);
    ecText(ctx, sub || 'Preferences are saved on this device.', bx + 28, y + H * 0.27, 16, 'rgba(255,255,255,0.65)', 'left', 500);
    ecPanel(ctx, bx + 28, y + H * 0.32, 110, 34, 8, col, null, 0);
    ecPanel(ctx, bx + 150, y + H * 0.32, 110, 34, 8, 'rgba(255,255,255,0.08)', border, 1);

  } else if (id === 'dashboardTile') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.46, fh * 0.42, 16, panel, border, 1.5);
    ecText(ctx, title, bx + 24, by + 38, 20, 'rgba(255,255,255,0.7)', 'left', 600);
    ecText(ctx, ecS(p.value, '82%'), bx + 24, by + fh * 0.24, 44, white, 'left', 900);
    for (let i = 0; i < 8; i++) {
      const hh = 20 + ecHash(i + 2) * 60;
      ecPanel(ctx, bx + 24 + i * 26, by + fh * 0.4 - hh, 12, hh, 3, i % 2 ? acc : col, null, 0);
    }

  } else if (id === 'datePicker') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.6, fh * 0.8, 16, panel, border, 1.5);
    const cols = 7, cw = fw * 0.6 / cols;
    ecText(ctx, title || 'March 2026', x, by + 36, 22, white, 'center', 800);
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < cols; c++) {
        const day = r * cols + c + 1;
        const sel = day === 14;
        if (sel) ecPanel(ctx, bx + c * cw + 4, by + 64 + r * 44, cw - 8, 36, 8, col, null, 0);
        ecText(ctx, String(day > 31 ? day - 31 : day), bx + c * cw + cw / 2, by + 82 + r * 44, 15, sel ? p3Ink(col) : 'rgba(255,255,255,0.7)', 'center', 600);
      }
    }

  } else if (id === 'dropdownMenu') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by + fh * 0.2, fw * 0.52, fh * 0.6, 12, panel, border, 1.5);
    for (let i = 0; i < 4; i++) {
      ecText(ctx, rl(i), bx + 26, by + fh * 0.2 + 34 + i * 44, 18, i === 1 ? acc : white, 'left', 500);
      if (i === 1) { ecPanel(ctx, bx + 8, by + fh * 0.2 + 20 + i * 44, fw * 0.52 - 16, 40, 8, 'rgba(255,255,255,0.08)', null, 0); }
    }

  } else if (id === 'emailCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.8, fh * 0.7, 14, panel, border, 1.5);
    ecText(ctx, title || 'From: Studio', bx + 26, by + 36, 18, 'rgba(255,255,255,0.6)', 'left', 500);
    ecText(ctx, sub || 'Subject: Weekly brief', bx + 26, by + 68, 24, white, 'left', 800);
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(bx + 26, by + 112 + i * 22, (fw * 0.8 - 52) * (0.55 + ecHash(i) * 0.4), 8);
    }

  } else if (id === 'fileBrowser') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.82, fh * 0.8, 14, panel, border, 1.5);
    ecPanel(ctx, bx + 1, by + 1, fw * 0.22, fh * 0.8 - 2, 13, 'rgba(255,255,255,0.05)', null, 0);
    for (let i = 0; i < 5; i++) ecText(ctx, i === 0 ? 'Documents' : rl(i), bx + 20, by + 34 + i * 34, 15, i === 0 ? acc : 'rgba(255,255,255,0.7)', 'left', 500);
    for (let i = 0; i < 6; i++) {
      const gx = bx + fw * 0.3 + (i % 3) * (fw * 0.16);
      const gy = by + 40 + Math.floor(i / 3) * 90;
      ecPanel(ctx, gx, gy, 54, 40, 6, 'rgba(255,255,255,0.1)', border, 1);
      ecText(ctx, rl(i), gx + 27, gy + 62, 12, 'rgba(255,255,255,0.6)', 'center', 500);
    }

  } else if (id === 'formField') {
    ecAlpha(ctx, GA, e);
    ecText(ctx, sub || 'Email address', bx + 6, y - 60, 15, 'rgba(255,255,255,0.65)', 'left', 600);
    ecPanel(ctx, bx, y - 34, fw * 0.6, 52, 10, 'rgba(255,255,255,0.06)', col, 2);
    ecText(ctx, title || 'you@studio.com', bx + 18, y - 8, 18, white, 'left', 500);
    ecText(ctx, 'We only use this for replies.', bx + 6, y + 38, 13, 'rgba(255,255,255,0.45)', 'left', 500);

  } else if (id === 'heroBanner') {
    ecAlpha(ctx, GA, e);
    const g = ctx.createLinearGradient(bx, by, bx + fw, by + fh);
    g.addColorStop(0, col); g.addColorStop(1, acc);
    ctx.fillStyle = g; ctx.globalAlpha = ecClamp(GA * 0.9, 0, 1);
    ecRound(ctx, bx, by, fw, fh * 0.7, 18); ctx.fill();
    ctx.globalAlpha = ecClamp(GA * e, 0, 1);
    ecText(ctx, title || 'Big idea', bx + 34, by + 50, 30, p3Ink(col), 'left', 900);
    ecText(ctx, sub || 'A short supporting line.', bx + 34, by + 90, 16, p3Ink(col), 'left', 500);
    ecPanel(ctx, bx + 34, by + 118, 120, 34, 8, 'rgba(0,0,0,0.25)', null, 0);

  } else if (id === 'kanbanCard') {
    ecAlpha(ctx, GA, e);
    const cw = fw * 0.42, ch = fh * 0.34;
    for (let i = 0; i < 2; i++) {
      const gx = x - cw - 12 + i * (cw + 24);
      ecPanel(ctx, gx, by, cw, ch, 12, panel, border, 1.5);
      ecPanel(ctx, gx + 14, by + 16, 70, 6, 3, i ? acc : col, null, 0);
      for (let r = 0; r < 3; r++) ecText(ctx, rl(i * 3 + r), gx + 14, by + 44 + r * 30, 14, 'rgba(255,255,255,0.7)', 'left', 500);
    }

  } else if (id === 'loginCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.58, fh * 0.86, 18, panel, border, 1.5);
    ecDot(ctx, x, by + 52, 20, col);
    ecText(ctx, title || 'Welcome back', x, by + 100, 24, white, 'center', 800);
    ecPanel(ctx, x - fw * 0.2, by + 140, fw * 0.4, 38, 8, 'rgba(255,255,255,0.07)', border, 1);
    ecPanel(ctx, x - fw * 0.2, by + 190, fw * 0.4, 38, 8, 'rgba(255,255,255,0.07)', border, 1);
    ecPanel(ctx, x - fw * 0.2, by + 244, fw * 0.4, 40, 10, col, null, 0);
    ecText(ctx, 'Sign in', x, by + 264, 17, p3Ink(col), 'center', 800);

  } else if (id === 'modalDialog') {
    ecAlpha(ctx, GA, e);
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
    ecPanel(ctx, bx, by + fh * 0.18, fw * 0.7, fh * 0.62, 16, panel, border, 1.5);
    ecText(ctx, title || 'Are you sure?', x, by + fh * 0.28, 24, white, 'center', 800);
    ecText(ctx, sub || 'This action can be undone.', x, by + fh * 0.38, 16, 'rgba(255,255,255,0.6)', 'center', 500);
    ecPanel(ctx, x - fw * 0.28, by + fh * 0.62, fw * 0.22, 38, 8, col, null, 0);
    ecPanel(ctx, x + fw * 0.06, by + fh * 0.62, fw * 0.22, 38, 8, 'rgba(255,255,255,0.08)', border, 1);

  } else if (id === 'navBar') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, 0, by, W, 68, 0, 'rgba(10,16,28,0.9)', null, 0);
    ecText(ctx, title || 'Studio', bx + 20, by + 34, 22, white, 'left', 900);
    for (let i = 0; i < 3; i++) ecText(ctx, ['Work', 'About', 'Contact'][i], bx + fw * 0.48 + i * 90, by + 34, 15, 'rgba(255,255,255,0.7)', 'left', 500);
    ecPanel(ctx, bx + fw - 70, by + 18, 70, 32, 8, col, null, 0);

  } else if (id === 'notificationStack') {
    ecAlpha(ctx, GA, e);
    for (let i = 0; i < 3; i++) {
      const ny = y - 60 + i * 54;
      ecPanel(ctx, x - fw * 0.38, ny, fw * 0.76, 44, 10, 'rgba(10,16,28,0.94)', border, 1);
      ecDot(ctx, x - fw * 0.34, ny + 22, 9, i % 2 ? acc : col);
      ecText(ctx, rl(i), x - fw * 0.29, ny + 22, 16, white, 'left', 600);
    }

  } else if (id === 'onboardingCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.7, fh * 0.8, 18, panel, border, 1.5);
    ecDot(ctx, x, by + 50, 26, col);
    ecText(ctx, title || 'Step 1 of 3', x, by + fh * 0.2, 22, white, 'center', 800);
    ecText(ctx, sub || 'Tell us what you make.', x, by + fh * 0.27, 16, 'rgba(255,255,255,0.6)', 'center', 500);
    for (let i = 0; i < 3; i++) {
      ecDot(ctx, x - 24 + i * 24, by + fh * 0.72, 6, i === 0 ? acc : 'rgba(255,255,255,0.3)');
    }

  } else if (id === 'productCard') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.46, fh * 0.9, 16, panel, border, 1.5);
    ecPanel(ctx, bx + 14, by + 14, fw * 0.46 - 28, fh * 0.42, 10, 'rgba(255,255,255,0.08)', null, 0);
    ecText(ctx, title || 'Product', bx + 20, by + fh * 0.54, 20, white, 'left', 800);
    ecText(ctx, sub || 'Details', bx + 20, by + fh * 0.62, 14, 'rgba(255,255,255,0.6)', 'left', 500);
    ecText(ctx, ecS(p.price, '$24'), bx + 20, by + fh * 0.76, 24, acc, 'left', 900);
    ecPanel(ctx, bx + fw * 0.46 - 84, by + fh * 0.72, 66, 30, 8, col, null, 0);

  } else if (id === 'progressToast') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, y + H * 0.12, fw * 0.6, 64, 12, 'rgba(10,16,28,0.94)', border, 1.5);
    ecText(ctx, title || 'Exporting…', bx + 24, y + H * 0.12 + 24, 18, white, 'left', 700);
    ecPanel(ctx, bx + 24, y + H * 0.12 + 40, fw * 0.6 - 48, 8, 4, 'rgba(255,255,255,0.12)', null, 0);
    ecPanel(ctx, bx + 24, y + H * 0.12 + 40, (fw * 0.6 - 48) * ecClamp(prog, 0, 1), 8, 4, col, null, 0);

  } else if (id === 'searchResults') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.8, 44, 10, 'rgba(255,255,255,0.06)', border, 1);
    ecText(ctx, title || 'Search…', bx + 18, by + 22, 17, 'rgba(255,255,255,0.55)', 'left', 500);
    for (let i = 0; i < 4; i++) {
      const ny = by + 60 + i * 48;
      ecText(ctx, rl(i), bx + 18, ny + 14, 17, i === 0 ? acc : white, 'left', 600);
      ecText(ctx, 'result ' + (i + 1), bx + 18, ny + 32, 12, 'rgba(255,255,255,0.45)', 'left', 500);
    }

  } else if (id === 'sidebarMenu') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.26, fh, 12, 'rgba(10,16,28,0.9)', border, 1);
    ecText(ctx, title || 'Workspace', bx + 18, by + 32, 16, white, 'left', 800);
    for (let i = 0; i < 5; i++) {
      if (i === 1) ecPanel(ctx, bx + 8, by + 58 + i * 40, fw * 0.26 - 16, 34, 8, 'rgba(255,255,255,0.1)', null, 0);
      ecText(ctx, rl(i), bx + 20, by + 75 + i * 40, 14, i === 1 ? acc : 'rgba(255,255,255,0.68)', 'left', 500);
    }

  } else if (id === 'statTile') {
    ecAlpha(ctx, GA, e);
    ecPanel(ctx, bx, by, fw * 0.58, fh * 0.5, 16, panel, border, 1.5);
    ecText(ctx, title || 'Revenue', bx + 26, by + 40, 18, 'rgba(255,255,255,0.6)', 'left', 600);
    ecText(ctx, ecS(p.value, '$12.4k'), bx + 26, by + fh * 0.28, 42, white, 'left', 900);
    ecText(ctx, ecS(p.delta, '+8.2%'), bx + 26, by + fh * 0.4, 16, '#34D399', 'left', 700);
    ecPanel(ctx, bx + 26, by + fh * 0.44, fw * 0.58 - 52, 4, 2, 'rgba(255,255,255,0.1)', null, 0);
  }
}
