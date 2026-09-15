/* 共用工具：圖片處理與連結編碼 */
window.Arkanoid = (function () {
  'use strict';
  const JPEG_PREFIX = 'data:image/jpeg;base64,';

  function toB64Url(s) {
    return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function fromB64Url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return s;
  }

  /** 把遊戲設定壓成可以放在網址 # 後面的字串（純靜態主機的備援模式） */
  function encodePayload(p) {
    const strip = (d) => toB64Url(d.split(',')[1] || '');
    return ['1', String(p.cols), strip(p.brick), strip(p.bg)].join('.');
  }
  function decodePayload(str) {
    const parts = String(str).split('.');
    if (parts[0] !== '1' || parts.length !== 4 || !parts[2] || !parts[3]) {
      throw new Error('連結格式不正確');
    }
    return {
      cols: parseInt(parts[1], 10) || 8,
      brick: JPEG_PREFIX + fromB64Url(parts[2]),
      bg: JPEG_PREFIX + fromB64Url(parts[3]),
    };
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => resolve(im);
      im.onerror = () => reject(new Error('圖片載入失敗'));
      im.src = src;
    });
  }

  /** 從 File 讀成可以畫到 canvas 的物件（盡量尊重 EXIF 方向） */
  async function fileToBitmap(file) {
    if (typeof createImageBitmap === 'function') {
      try {
        return await createImageBitmap(file, { imageOrientation: 'from-image' });
      } catch (e) { /* 舊瀏覽器：退回 <img> */ }
    }
    const url = URL.createObjectURL(file);
    try {
      return await loadImage(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /** 等比縮小到最長邊 maxSide，輸出 JPEG data URL */
  function resizeToJpeg(img, maxSide, quality) {
    const w = img.width, h = img.height;
    const s = Math.min(1, maxSide / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * s));
    const ch = Math.max(1, Math.round(h * s));
    const c = document.createElement('canvas');
    c.width = cw;
    c.height = ch;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);
    return c.toDataURL('image/jpeg', quality);
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) { /* 退回舊方法 */ }
    }
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function shareUrl(url, title, text) {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return 'shared';
      } catch (e) {
        if (e && e.name === 'AbortError') return 'cancelled';
      }
    }
    return (await copyText(url)) ? 'copied' : 'failed';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  return { encodePayload, decodePayload, loadImage, fileToBitmap, resizeToJpeg, copyText, shareUrl, escapeHtml };
})();
