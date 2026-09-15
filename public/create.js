/* 建立遊戲頁面 */
(function () {
  'use strict';
  const A = window.Arkanoid;
  const $ = (id) => document.getElementById(id);
  const imgs = { brick: null, bg: null };

  function setStatus(msg, isError) {
    const el = $('status');
    el.textContent = msg || '';
    el.classList.toggle('error', !!isError);
  }
  function updateButton() {
    $('generate').disabled = !(imgs.brick && imgs.bg);
  }

  function setupPicker(kind, inputId, dropId) {
    const input = $(inputId);
    const drop = $(dropId);
    const preview = drop.querySelector('img.preview');
    const placeholder = drop.querySelector('.placeholder');

    async function handleFile(file) {
      if (!file) return;
      if (!/^image\//.test(file.type) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.name)) {
        setStatus('請選擇圖片檔案。', true);
        return;
      }
      try {
        setStatus('讀取照片中…');
        const bmp = await A.fileToBitmap(file);
        imgs[kind] = bmp;
        preview.src = A.resizeToJpeg(bmp, 640, 0.85);
        preview.hidden = false;
        placeholder.textContent = '點此更換照片';
        drop.classList.add('has-image');
        setStatus('');
        $('result').hidden = true;
      } catch (e) {
        imgs[kind] = null;
        setStatus('無法讀取這張照片，請換一張試試（例如 JPG 或 PNG）。', true);
      }
      updateButton();
    }

    input.addEventListener('change', () => handleFile(input.files && input.files[0]));
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragging'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragging'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('dragging');
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) handleFile(f);
    });
  }

  setupPicker('brick', 'fileBrick', 'dropBrick');
  setupPicker('bg', 'fileBg', 'dropBg');

  /** 嘗試把遊戲存到伺服器，成功回傳短網址；沒有伺服器（純靜態主機）回傳 null */
  async function createOnServer(payload) {
    try {
      const r = await fetch('api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const isJson = (r.headers.get('content-type') || '').includes('application/json');
      if (r.ok && isJson) {
        const j = await r.json();
        if (j && j.url) return new URL(j.url, location.href).href;
      } else if (isJson) {
        const j = await r.json().catch(() => null);
        if (j && j.error && r.status !== 404 && r.status !== 405) throw new Error(j.error);
      }
    } catch (e) {
      if (!(e instanceof TypeError)) throw e; // TypeError = 網路錯誤 / 沒有伺服器
    }
    return null;
  }

  function buildEmbedUrl(cols) {
    // 純靜態主機：把縮得很小的圖片直接放進網址
    const brick = A.resizeToJpeg(imgs.brick, 80, 0.6);
    const bg = A.resizeToJpeg(imgs.bg, 480, 0.5);
    const base = new URL('play.html', location.href).href.split('#')[0];
    return base + '#d=' + A.encodePayload({ brick, bg, cols });
  }

  let currentUrl = '';
  function showResult(url, mode) {
    currentUrl = url;
    $('link').value = url;
    $('play').href = url;
    const note = $('resultNote');
    if (mode === 'embed') {
      note.textContent = `這個連結本身就包含照片資料（約 ${Math.round(url.length / 1000)} 千字元），不需要伺服器。` +
        '部分通訊軟體可能會截斷過長的連結，建議用「分享」功能或直接複製到瀏覽器開啟。';
      note.hidden = false;
    } else {
      note.hidden = true;
    }
    $('result').hidden = false;
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  $('generate').addEventListener('click', async () => {
    const btn = $('generate');
    btn.disabled = true;
    try {
      const checked = document.querySelector('input[name="cols"]:checked');
      const cols = parseInt(checked ? checked.value : '8', 10);
      setStatus('處理照片中…');
      await new Promise((r) => setTimeout(r, 30)); // 讓狀態文字先畫出來
      const brick = A.resizeToJpeg(imgs.brick, 256, 0.85);
      const bg = A.resizeToJpeg(imgs.bg, 1000, 0.82);
      setStatus('建立遊戲中…');
      let url = await createOnServer({ brick, bg, cols });
      let mode = 'server';
      if (!url) {
        url = buildEmbedUrl(cols);
        mode = 'embed';
      }
      setStatus('');
      showResult(url, mode);
    } catch (e) {
      setStatus('產生失敗：' + (e && e.message ? e.message : e), true);
    } finally {
      btn.disabled = false;
    }
  });

  $('copy').addEventListener('click', async () => {
    const ok = await A.copyText(currentUrl);
    setStatus(ok ? '已複製連結！' : '複製失敗，請手動選取連結複製。', !ok);
  });
  $('share').addEventListener('click', async () => {
    const r = await A.shareUrl(currentUrl, '照片打磚塊', '來玩我做的打磚塊遊戲！');
    if (r === 'copied') setStatus('此裝置不支援分享，已改為複製連結。');
    else if (r === 'failed') setStatus('無法分享，請手動複製連結。', true);
  });
})();
