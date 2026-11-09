/* Utilidades de interfaz: formato, toasts, sonidos, modales y descargas */
const UI = {
  _fmt: new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 }),
  money(n) { return this._fmt.format(Number(n) || 0); },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  round2(n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; },
  dateTime(iso) { return new Date(iso).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }); },
  dayKey(d) {
    const x = d instanceof Date ? d : new Date(d);
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  },
  formData(form) { return Object.fromEntries(new FormData(form)); },

  toast(msg, type = 'info', ms = 3000) {
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = msg;
    document.getElementById('toasts').appendChild(t);
    setTimeout(() => t.remove(), ms);
  },

  _ctx: null,
  beep(kind = 'ok') {
    try {
      this._ctx = this._ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this._ctx, o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === 'error' ? 'square' : 'sine';
      o.frequency.value = kind === 'error' ? 180 : kind === 'sale' ? 988 : 760;
      g.gain.value = 0.06;
      o.connect(g); g.connect(ctx.destination);
      o.start(); o.stop(ctx.currentTime + (kind === 'error' ? 0.3 : 0.09));
    } catch (e) { /* audio no disponible */ }
  },

  _stack: [],
  hasModal() { return this._stack.length > 0; },
  modal({ title, html, wide = false, onMount, onClose }) {
    const back = document.createElement('div');
    back.className = 'back';
    back.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog">
      <div class="modal-head"><h3>${this.esc(title)}</h3><button class="btn ghost sm" data-close>✕</button></div>
      <div class="modal-body">${html}</div></div>`;
    const close = () => {
      const i = this._stack.indexOf(handle);
      if (i >= 0) this._stack.splice(i, 1);
      back.remove();
      if (onClose) { const f = onClose; onClose = null; f(); }
    };
    back.addEventListener('mousedown', e => { if (e.target === back) close(); });
    back.querySelector('[data-close]').addEventListener('click', close);
    document.getElementById('modals').appendChild(back);
    const handle = { el: back.querySelector('.modal'), close };
    this._stack.push(handle);
    if (onMount) onMount(handle.el, close);
    const first = handle.el.querySelector('[autofocus]') || handle.el.querySelector('input,select');
    if (first) { first.focus(); if (first.select) try { first.select(); } catch (e) { } }
    return handle;
  },
  closeModal() { const top = this._stack[this._stack.length - 1]; if (top) top.close(); },

  confirm(message, okLabel = 'Aceptar', danger = false) {
    return new Promise(resolve => {
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const h = this.modal({
        title: 'Confirmar',
        html: `<p>${this.esc(message)}</p><div class="modal-foot">
          <button class="btn" data-no>Cancelar</button>
          <button class="btn ${danger ? 'danger' : 'primary'}" data-yes autofocus>${this.esc(okLabel)}</button></div>`,
        onMount: el => {
          el.querySelector('[data-no]').onclick = () => { finish(false); h.close(); };
          el.querySelector('[data-yes]').onclick = () => { finish(true); h.close(); };
        }
      });
      const origClose = h.close;
      h.close = () => { finish(false); origClose(); };
      h.el.parentElement.querySelector('[data-close]').onclick = h.close;
    });
  },

  askPin(actionName = 'realizar esta acción') {
    return new Promise(resolve => {
      const s = Domain.S().settings;
      const currentPin = String(s.adminPin || '1234');
      let done = false;
      const finish = v => { if (!done) { done = true; resolve(v); } };
      const h = this.modal({
        title: '🔒 Clave de Administrador',
        html: `<form id="pin-form">
          <p>Ingresá la clave de administrador para <strong>${this.esc(actionName)}</strong>:</p>
          <div class="field"><input name="pin" type="password" required autofocus placeholder="Clave de admin"></div>
          <div class="modal-foot">
            <button type="button" class="btn" data-cancel>Cancelar</button>
            <button class="btn danger" type="submit">Autorizar</button>
          </div>
        </form>`,
        onMount: (el, close) => {
          el.querySelector('[data-cancel]').onclick = () => { finish(false); close(); };
          el.querySelector('#pin-form').onsubmit = e => {
            e.preventDefault();
            const val = e.target.pin.value;
            if (val === currentPin) {
              finish(true);
              close();
            } else {
              UI.beep('error');
              UI.toast('Clave de administrador incorrecta', 'error');
              e.target.pin.value = '';
              e.target.pin.focus();
            }
          };
        }
      });
      const origClose = h.close;
      h.close = () => { finish(false); origClose(); };
      h.el.parentElement.querySelector('[data-close]').onclick = h.close;
    });
  },

  changePinModal() {
    const s = Domain.S().settings;
    const currentPin = String(s.adminPin || '1234');
    this.modal({
      title: 'Cambiar clave de Administrador',
      html: `<form id="change-pin-form">
        <div class="field"><label>Clave actual (por defecto: 1234)</label><input name="oldPin" type="password" required autofocus></div>
        <div class="field"><label>Nueva clave</label><input name="newPin" type="password" minlength="4" required></div>
        <div class="field"><label>Repetir nueva clave</label><input name="newPin2" type="password" minlength="4" required></div>
        <div class="modal-foot">
          <button type="button" class="btn" data-cancel>Cancelar</button>
          <button class="btn primary" type="submit">Guardar clave</button>
        </div>
      </form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('#change-pin-form').onsubmit = e => {
          e.preventDefault();
          const f = e.target;
          if (f.oldPin.value !== currentPin) {
            UI.beep('error');
            UI.toast('La clave actual no es correcta', 'error');
            return;
          }
          if (f.newPin.value !== f.newPin2.value) {
            UI.beep('error');
            UI.toast('Las claves nuevas no coinciden', 'error');
            return;
          }
          s.adminPin = f.newPin.value;
          Store.save();
          close();
          UI.toast('Clave de administrador actualizada con éxito', 'ok');
        };
      }
    });
  },

  download(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  csv(rows) {
    const cell = v => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '\uFEFF' + rows.map(r => r.map(cell).join(';')).join('\r\n');
  }
};

/* Registro de vistas (cada modulo se registra aqui) */
const Views = {};
