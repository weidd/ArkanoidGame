/* 遊玩頁面：打磚塊遊戲本體 */
(function () {
  'use strict';
  const A = window.Arkanoid;
  const W = 400;           // 邏輯座標寬
  const H = 600;           // 邏輯座標高
  const HUD_H = 40;        // 上方資訊列高度
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const overlay = document.getElementById('overlay');
  const panel = document.getElementById('panel');

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function coverRect(iw, ih, dw, dh) {
    const s = Math.max(dw / iw, dh / ih);
    const sw = dw / s, sh = dh / s;
    return { sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw, sh };
  }
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }
  function homeUrl() {
    if (/^\/p\/[^/]+\/?$/.test(location.pathname)) return '/';
    return new URL('index.html', location.href).href;
  }
  function showPanel(html) { panel.innerHTML = html; overlay.hidden = false; }
  function hidePanel() { overlay.hidden = true; }
  function formatTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m > 0 ? `${m} 分 ${s} 秒` : `${s} 秒`;
  }

  document.getElementById('newGame').href = homeUrl();

  async function loadConfig() {
    const m = location.pathname.match(/^\/p\/([A-Za-z0-9]+)\/?$/);
    if (m) {
      const r = await fetch('/api/games/' + m[1]);
      if (r.status === 404) throw new Error('找不到這個遊戲，連結可能已失效。');
      if (!r.ok) throw new Error('讀取遊戲資料失敗（' + r.status + '）。');
      return r.json();
    }
    let hash = location.hash || '';
    try { hash = decodeURIComponent(hash); } catch (e) { /* ignore */ }
    if (hash.startsWith('#d=')) return A.decodePayload(hash.slice(3));
    throw new Error('這個連結沒有遊戲資料，請從首頁建立新遊戲。');
  }

  /* ---------------- 遊戲 ---------------- */
  class Game {
    constructor(cfg, brickImg, bgImg, hooks) {
      this.brickImg = brickImg;
      this.bgImg = bgImg;
      this.hooks = hooks;
      this.cols = clamp(parseInt(cfg.cols, 10) || 8, 4, 14);
      // 磚塊區域：寬度佔滿，高度依底圖比例，但限制在畫面 30%~52%
      const cellW = W / this.cols;
      const natural = W * bgImg.height / bgImg.width;
      const targetH = clamp(natural, H * 0.3, H * 0.52);
      this.rows = clamp(Math.round(targetH / cellW), 3, 12);
      this.cellW = cellW;
      this.cellH = targetH / this.rows;
      this.region = { x: 0, y: HUD_H, w: W, h: this.cellH * this.rows };
      this.scale = 1;
      this.tile = null;
      this.keys = { left: false, right: false };
      this.reset();
    }

    reset() {
      this.bricks = [];
      for (let r = 0; r < this.rows; r++) {
        for (let c = 0; c < this.cols; c++) {
          this.bricks.push({
            x: this.region.x + c * this.cellW,
            y: this.region.y + r * this.cellH,
            w: this.cellW, h: this.cellH, alive: true,
          });
        }
      }
      this.total = this.bricks.length;
      this.remaining = this.total;
      this.paddle = { w: 76, h: 12, x: W / 2, y: H - 34 };
      this.ball = { x: W / 2, y: 0, r: 6, vx: 0, vy: 0, attached: true };
      this.lives = 3;
      this.hits = 0;
      this.baseSpeed = 250 + (this.cols - 8) * 8;
      this.speed = this.baseSpeed;
      this.state = 'ready'; // ready | playing | won | lost
      this.time = 0;
      this.particles = [];
    }

    brickAt(c, r) { return this.bricks[r * this.cols + c]; }

    setScale(scale) { this.scale = scale; this.buildTile(); }

    /** 預先把單一磚塊畫成小圖，之後每塊磚直接貼上 */
    buildTile() {
      const s = this.scale;
      const tw = Math.max(1, Math.round(this.cellW * s));
      const th = Math.max(1, Math.round(this.cellH * s));
      const t = document.createElement('canvas');
      t.width = tw; t.height = th;
      const g = t.getContext('2d');
      const im = this.brickImg;
      const cr = coverRect(im.width, im.height, tw, th);
      g.drawImage(im, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, tw, th);
      const b = Math.max(1, Math.round(2 * s));
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.fillRect(0, 0, tw, b); g.fillRect(0, 0, b, th);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, th - b, tw, b); g.fillRect(tw - b, 0, b, th);
      this.tile = t;
    }

    movePaddle(x) {
      this.paddle.x = clamp(x, this.paddle.w / 2, W - this.paddle.w / 2);
    }

    launch() {
      if (this.state !== 'ready' || !this.ball.attached) return;
      const ang = (Math.random() * 0.5 + 0.25) * (Math.random() < 0.5 ? -1 : 1);
      this.ball.vx = this.speed * Math.sin(ang);
      this.ball.vy = -this.speed * Math.cos(ang);
      this.applySpeed();
      this.ball.attached = false;
      this.state = 'playing';
    }

    update(dt) {
      if (this.keys.left) this.movePaddle(this.paddle.x - 480 * dt);
      if (this.keys.right) this.movePaddle(this.paddle.x + 480 * dt);
      this.updateParticles(dt);
      if (this.ball.attached) {
        this.ball.x = this.paddle.x;
        this.ball.y = this.paddle.y - this.paddle.h / 2 - this.ball.r - 1;
        return;
      }
      if (this.state !== 'playing') return;
      this.time += dt;
      const sp = Math.hypot(this.ball.vx, this.ball.vy);
      const steps = Math.max(1, Math.ceil(sp * dt / (this.ball.r * 0.8)));
      const sdt = dt / steps;
      for (let i = 0; i < steps && this.state === 'playing' && !this.ball.attached; i++) this.step(sdt);
    }

    step(dt) {
      const b = this.ball, p = this.paddle;
      const px = b.x, py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;

      // 牆壁
      if (b.x - b.r < 0) { b.x = b.r; b.vx = Math.abs(b.vx); }
      else if (b.x + b.r > W) { b.x = W - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y - b.r < HUD_H) { b.y = HUD_H + b.r; b.vy = Math.abs(b.vy); }

      // 板子：依擊中位置決定反彈角度（最大 60 度）
      const top = p.y - p.h / 2;
      if (b.vy > 0 && py + b.r <= top + 2 && b.y + b.r >= top &&
          b.x >= p.x - p.w / 2 - b.r && b.x <= p.x + p.w / 2 + b.r) {
        const rel = clamp((b.x - p.x) / (p.w / 2), -1, 1);
        const ang = rel * (Math.PI / 3);
        b.vx = this.speed * Math.sin(ang);
        b.vy = -this.speed * Math.cos(ang);
        b.y = top - b.r;
        this.applySpeed(); // 保證不會完全垂直
      }

      // 掉出底部
      if (b.y - b.r > H) { this.loseLife(); return; }

      // 磚塊：只檢查球附近的格子
      const reg = this.region;
      if (b.y - b.r < reg.y + reg.h && b.y + b.r > reg.y) {
        const c0 = clamp(Math.floor((b.x - b.r - reg.x) / this.cellW), 0, this.cols - 1);
        const c1 = clamp(Math.floor((b.x + b.r - reg.x) / this.cellW), 0, this.cols - 1);
        const r0 = clamp(Math.floor((b.y - b.r - reg.y) / this.cellH), 0, this.rows - 1);
        const r1 = clamp(Math.floor((b.y + b.r - reg.y) / this.cellH), 0, this.rows - 1);
        let hit = null, best = Infinity;
        for (let r = r0; r <= r1; r++) {
          for (let c = c0; c <= c1; c++) {
            const k = this.brickAt(c, r);
            if (!k.alive) continue;
            const cx = clamp(b.x, k.x, k.x + k.w), cy = clamp(b.y, k.y, k.y + k.h);
            const d2 = (b.x - cx) * (b.x - cx) + (b.y - cy) * (b.y - cy);
            if (d2 <= b.r * b.r && d2 < best) { best = d2; hit = k; }
          }
        }
        if (hit) {
          hit.alive = false;
          this.remaining--;
          this.hits++;
          this.spawnParticles(hit);
          const wasLeft = px + b.r <= hit.x, wasRight = px - b.r >= hit.x + hit.w;
          const wasAbove = py + b.r <= hit.y, wasBelow = py - b.r >= hit.y + hit.h;
          const horiz = wasLeft || wasRight, vert = wasAbove || wasBelow;
          if (horiz && !vert) b.vx = -b.vx;
          else if (vert && !horiz) b.vy = -b.vy;
          else if (horiz && vert) { b.vx = -b.vx; b.vy = -b.vy; }
          else b.vy = -b.vy;
          b.x = px; b.y = py;
          this.speed = Math.min(this.baseSpeed + this.hits * 4, 470);
          this.applySpeed();
          if (this.remaining === 0) this.win();
        }
      }
    }

    applySpeed() {
      const b = this.ball;
      const m = Math.hypot(b.vx, b.vy) || 1;
      b.vx = b.vx / m * this.speed;
      b.vy = b.vy / m * this.speed;
      // 避免球幾乎垂直或幾乎水平地卡住
      const minX = this.speed * 0.12, minY = this.speed * 0.2;
      if (Math.abs(b.vx) < minX) {
        b.vx = (b.vx < 0 ? -1 : 1) * minX;
        b.vy = (b.vy < 0 ? -1 : 1) * Math.sqrt(this.speed * this.speed - b.vx * b.vx);
      } else if (Math.abs(b.vy) < minY) {
        b.vy = (b.vy < 0 ? -1 : 1) * minY;
        b.vx = (b.vx < 0 ? -1 : 1) * Math.sqrt(this.speed * this.speed - b.vy * b.vy);
      }
    }

    loseLife() {
      this.lives--;
      if (this.lives <= 0) {
        this.state = 'lost';
        this.ball.attached = true;
        this.hooks.onLost(this);
        return;
      }
      this.speed = Math.max(this.baseSpeed, this.speed * 0.9);
      this.ball.attached = true;
      this.state = 'ready';
    }

    win() {
      this.state = 'won';
      this.ball.attached = true;
      this.hooks.onWon(this);
    }

    spawnParticles(k) {
      const cx = k.x + k.w / 2, cy = k.y + k.h / 2;
      for (let i = 0; i < 8; i++) {
        const a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * 140;
        this.particles.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.3, size: 2 + Math.random() * 3 });
      }
    }
    updateParticles(dt) {
      for (const q of this.particles) { q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 300 * dt; q.life -= dt; }
      this.particles = this.particles.filter((q) => q.life > 0);
    }

    draw() {
      const s = this.scale;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.imageSmoothingEnabled = true;

      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#182040');
      g.addColorStop(1, '#0b0e1a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);

      // 底圖照片
      const reg = this.region, im = this.bgImg;
      const cr = coverRect(im.width, im.height, reg.w, reg.h);
      ctx.drawImage(im, cr.sx, cr.sy, cr.sw, cr.sh, reg.x, reg.y, reg.w, reg.h);

      // 磚塊
      if (this.state !== 'won') {
        for (const k of this.bricks) {
          if (k.alive) ctx.drawImage(this.tile, k.x + 0.5, k.y + 0.5, k.w - 1, k.h - 1);
        }
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 2;
        ctx.strokeRect(reg.x + 1, reg.y + 1, reg.w - 2, reg.h - 2);
      }

      // 碎片
      for (const q of this.particles) {
        ctx.globalAlpha = Math.max(0, Math.min(1, q.life * 2));
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
      }
      ctx.globalAlpha = 1;

      if (this.state !== 'won') {
        // 板子
        const p = this.paddle;
        const pg = ctx.createLinearGradient(0, p.y - p.h / 2, 0, p.y + p.h / 2);
        pg.addColorStop(0, '#bae6fd');
        pg.addColorStop(1, '#38bdf8');
        ctx.fillStyle = pg;
        roundRect(ctx, p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, p.h / 2);
        ctx.fill();
        // 球
        const b = this.ball;
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // 資訊列
      ctx.font = 'bold 16px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#eef1ff';
      ctx.fillText(`磚塊 ${this.remaining} / ${this.total}`, 12, HUD_H / 2);
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9aa3c7';
      ctx.fillText(formatTime(this.time), W / 2, HUD_H / 2);
      ctx.textAlign = 'right';
      ctx.font = '20px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
      ctx.fillStyle = '#f87171';
      ctx.fillText('♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, 3 - this.lives)), W - 12, HUD_H / 2);

      // 提示
      if (this.state === 'ready') {
        const msg = this.hits === 0 && this.lives === 3 ? '點一下畫面發射球' : `剩下 ${this.lives} 條命，點一下繼續`;
        ctx.font = 'bold 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(msg).width + 28;
        const ty = H * 0.72;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        roundRect(ctx, W / 2 - tw / 2, ty - 16, tw, 32, 16);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.fillText(msg, W / 2, ty);
      }
    }
  }

  /* ---------------- 版面 / 輸入 / 主迴圈 ---------------- */
  let game = null;

  function layout() {
    if (!game) return;
    const aw = Math.max(50, stage.clientWidth - 12);
    const ah = Math.max(50, stage.clientHeight - 12);
    const s = Math.min(aw / W, ah / H);
    canvas.style.width = (W * s) + 'px';
    canvas.style.height = (H * s) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.round(W * s * dpr);
    canvas.height = Math.round(H * s * dpr);
    game.setScale(s * dpr);
  }

  function toLogicalX(e) {
    const r = canvas.getBoundingClientRect();
    return (e.clientX - r.left) / r.width * W;
  }

  function bindInput() {
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      game.movePaddle(toLogicalX(e));
      game.launch();
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse' || e.buttons > 0 || e.pointerType === 'touch' || e.pointerType === 'pen') {
        game.movePaddle(toLogicalX(e));
      }
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') game.keys.left = true;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') game.keys.right = true;
      else if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowUp') { game.launch(); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') game.keys.left = false;
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') game.keys.right = false;
    });
    window.addEventListener('resize', layout);
    window.addEventListener('orientationchange', () => setTimeout(layout, 100));
  }

  let last = 0;
  function frame(t) {
    if (!last) last = t;
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    game.update(dt);
    game.draw();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { last = 0; });

  function shareButtonHandler(btn) {
    btn.addEventListener('click', async () => {
      const r = await A.shareUrl(location.href, '照片打磚塊', '來挑戰這個用照片做的打磚塊遊戲！');
      if (r === 'copied') btn.textContent = '已複製連結！';
      else if (r === 'failed') btn.textContent = '無法分享';
    });
  }

  const hooks = {
    onWon(g) {
      showPanel(`
        <h2>🎉 破關成功！</h2>
        <p>你打掉了全部 ${g.total} 塊磚塊，照片完整揭曉！</p>
        <p>用時 ${formatTime(g.time)}，剩餘 ${g.lives} 條命</p>
        <div class="actions">
          <button id="btnAgain">🔁 再玩一次</button>
          <button id="btnShare">📤 分享這個遊戲</button>
          <a class="button primary" href="${A.escapeHtml(homeUrl())}">＋ 用自己的照片建立新遊戲</a>
        </div>`);
      document.getElementById('btnAgain').addEventListener('click', () => { g.reset(); hidePanel(); });
      shareButtonHandler(document.getElementById('btnShare'));
    },
    onLost(g) {
      showPanel(`
        <h2>💥 遊戲結束</h2>
        <p>還剩 ${g.remaining} 塊磚塊，再接再厲！</p>
        <div class="actions">
          <button id="btnAgain" class="primary">🔁 再試一次</button>
          <a class="button" href="${A.escapeHtml(homeUrl())}">＋ 建立新遊戲</a>
        </div>`);
      document.getElementById('btnAgain').addEventListener('click', () => { g.reset(); hidePanel(); });
    },
  };

  (async function main() {
    try {
      const cfg = await loadConfig();
      const [brickImg, bgImg] = await Promise.all([A.loadImage(cfg.brick), A.loadImage(cfg.bg)]);
      game = new Game(cfg, brickImg, bgImg, hooks);
      window.__game = game; // 方便除錯 / 測試
      layout();
      hidePanel();
      bindInput();
      requestAnimationFrame(frame);
    } catch (e) {
      showPanel(`
        <h2>無法載入遊戲</h2>
        <p>${A.escapeHtml(e && e.message ? e.message : String(e))}</p>
        <div class="actions"><a class="button primary" href="${A.escapeHtml(homeUrl())}">＋ 建立新遊戲</a></div>`);
    }
  })();
})();
