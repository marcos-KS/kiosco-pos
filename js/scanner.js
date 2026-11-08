/* Lector de códigos de barras con la cámara (celular o notebook).
   Usa BarcodeDetector si el navegador lo soporta (Android/Mac) y, si no, ZXing (incluido en js/vendor). */
const Scanner = {
  ZXING_URL: 'js/vendor/zxing.min.js',
  FORMATS: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'],

  loadZXing() {
    if (window.ZXing) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = this.ZXING_URL; s.onload = resolve;
      s.onerror = () => reject(new Error('No se pudo cargar el lector (falta js/vendor/zxing.min.js)'));
      document.head.appendChild(s);
    });
  },

  async nativeDetector() {
    if (!('BarcodeDetector' in window)) return null;
    try {
      const supported = await BarcodeDetector.getSupportedFormats();
      const formats = this.FORMATS.filter(f => supported.includes(f));
      return formats.length ? new BarcodeDetector({ formats }) : null;
    } catch (e) { return null; }
  },

  /** opts: { title, continuous (default true), onCode(code) } */
  async open({ title = 'Escanear código de barras', continuous = true, onCode }) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      UI.toast('La cámara requiere abrir la app por HTTPS o localhost', 'error');
      return;
    }
    let stream = null, timer = null, closed = false, last = { code: '', at: 0 };
    const stop = () => {
      closed = true;
      if (timer) clearInterval(timer);
      if (stream) stream.getTracks().forEach(t => t.stop());
    };
    const h = UI.modal({
      title,
      html: `<div class="scanner"><video id="scan-video" playsinline muted autoplay></video><div class="scan-line"></div></div>
        <p id="scan-status" class="muted" style="text-align:center">Iniciando cámara…</p>
        <p class="muted" style="text-align:center;font-size:.8rem">Acercá el código (15–25 cm), con buena luz y bien horizontal.</p>
        <form id="scan-manual" class="row" style="flex-wrap:nowrap">
          <input name="code" placeholder="¿No lee? Escribí el código a mano" inputmode="numeric">
          <button class="btn">OK</button></form>
        <div class="modal-foot"><button type="button" class="btn" data-done>Cerrar</button></div>`,
      onClose: stop
    });
    const video = h.el.querySelector('#scan-video'), status = h.el.querySelector('#scan-status');
    h.el.querySelector('[data-done]').onclick = h.close;

    const handle = code => {
      const now = Date.now();
      if (code === last.code && now - last.at < 1800) return;
      last = { code, at: now };
      status.textContent = 'Último código: ' + code;
      UI.beep('ok');
      onCode(code);
      if (!continuous) h.close();
    };
    h.el.querySelector('#scan-manual').onsubmit = e => {
      e.preventDefault();
      const v = e.target.code.value.trim();
      if (v) { handle(v); e.target.code.value = ''; }
    };

    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false
      });
      if (closed) { stop(); return; }
      video.srcObject = stream;
      await video.play().catch(() => { });

      const native = await this.nativeDetector();
      if (closed) return;
      if (native) {
        status.textContent = 'Cámara lista: apuntá al código de barras';
        let busy = false;
        timer = setInterval(async () => {
          if (busy || closed || video.readyState < 2) return;
          busy = true;
          try {
            const found = await native.detect(video);
            if (found.length && !closed) handle(found[0].rawValue);
          } catch (e) { /* frame no legible */ }
          busy = false;
        }, 200);
      } else {
        status.textContent = 'Cargando lector…';
        await this.loadZXing();
        if (closed) return;
        const Z = ZXing, hints = new Map();
        hints.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A,
          Z.BarcodeFormat.UPC_E, Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF]);
        hints.set(Z.DecodeHintType.TRY_HARDER, true);
        const reader = new Z.MultiFormatReader();
        reader.setHints(hints);
        const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d', { willReadFrequently: true });
        status.textContent = 'Cámara lista: apuntá al código de barras';
        timer = setInterval(() => {
          if (closed || video.readyState < 2 || !video.videoWidth) return;
          const scale = Math.min(1, 960 / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          try {
            const bitmap = new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(canvas)));
            handle(reader.decodeWithState(bitmap).getText());
          } catch (e) { /* no se encontró código en este cuadro */ }
        }, 150);
      }
    } catch (err) {
      const denied = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      const msg = denied ? 'Permiso de cámara denegado: habilitalo en el candado de la barra de direcciones'
        : err && err.name === 'NotFoundError' ? 'No se encontró ninguna cámara'
        : err && err.name === 'NotReadableError' ? 'La cámara está siendo usada por otra aplicación'
        : (err && err.message) || 'No se pudo usar la cámara';
      status.textContent = msg; status.className = 'danger'; status.style.textAlign = 'center';
      UI.toast(msg, 'error');
    }
  }
};
