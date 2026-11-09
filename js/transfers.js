/* Transferencias por alias: recibe las notificaciones reenviadas desde el celular Android
   (a través de ntfy.sh) y las muestra en pantalla con sonido. */
const Transfers = {
  es: null,
  status: 'off', // off | connecting | on | error

  settings() { return Domain.S().settings; },
  topic() {
    const s = this.settings();
    if (!s.ntfyTopic) {
      const abc = 'abcdefghijkmnpqrstuvwxyz23456789', bytes = crypto.getRandomValues(new Uint8Array(24));
      s.ntfyTopic = 'kiosco-' + [...bytes].map(b => abc[b % abc.length]).join('');
      Store.save();
    }
    return s.ntfyTopic;
  },
  server() { return (this.settings().ntfyServer || 'https://ntfy.sh').replace(/\/$/, ''); },
  url() { return this.server() + '/' + this.topic(); },
  list() { return Domain.S().transfers; },

  connect() {
    this.disconnect();
    if (typeof EventSource === 'undefined') { this.status = 'error'; return; }
    const s = this.settings();
    if (!s.ntfySince) { s.ntfySince = Math.floor(Date.now() / 1000); Store.save(); }
    this.status = 'connecting'; this.refreshStatus();
    const es = new EventSource(this.url() + '/sse?since=' + s.ntfySince);
    es.onopen = () => { this.status = 'on'; this.refreshStatus(); };
    es.onerror = () => { this.status = 'error'; this.refreshStatus(); };
    es.onmessage = e => { try { this.receive(JSON.parse(e.data)); } catch (err) { /* mensaje inválido */ } };
    this.es = es;
  },
  disconnect() { if (this.es) { this.es.close(); this.es = null; } },

  /** Lee monto y remitente analizando texto simple o el JSON enviado desde MacroDroid. */
  parse(rawInput) {
    let titulo = '', mensaje = '', textoExtendido = '', rawCombined = '';

    if (typeof rawInput === 'string') {
      let trimmed = rawInput.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          const obj = JSON.parse(trimmed);
          titulo = (obj.titulo || obj.title || obj.not_title || '').trim();
          mensaje = (obj.mensaje || obj.message || obj.text || obj.notification || obj.body || obj.not_body || '').trim();
          textoExtendido = (obj.texto_extendido || obj.big_text || obj.bigText || obj.not_big_text || '').trim();
        } catch (e) {
          rawCombined = rawInput;
        }
      } else {
        rawCombined = rawInput;
      }
    } else if (rawInput && typeof rawInput === 'object') {
      titulo = (rawInput.titulo || rawInput.title || rawInput.not_title || '').trim();
      mensaje = (rawInput.mensaje || rawInput.message || rawInput.text || rawInput.notification || rawInput.body || rawInput.not_body || '').trim();
      textoExtendido = (rawInput.texto_extendido || rawInput.big_text || rawInput.bigText || rawInput.not_big_text || '').trim();
    }

    // Limpiar variables de MacroDroid que no fueron reemplazadas
    if (textoExtendido === '[not_big_text]') textoExtendido = '';
    if (mensaje === '[not_text]' || mensaje === '[not_body]' || mensaje === '[notification]') mensaje = '';
    if (titulo === '[not_title]') titulo = '';

    const textParts = [textoExtendido, mensaje, titulo, rawCombined].filter(Boolean);
    const fullText = textParts.join(' \n ');

    // 1. Extraer Monto ($ 1.234,56 o $1234.56)
    let amount = null;
    const matchMoney = fullText.match(/\$\s*(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
    if (matchMoney) {
      let n = matchMoney[1];
      if (n.includes(',')) n = n.replace(/\./g, '').replace(',', '.');
      else if (/^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '');
      const v = parseFloat(n);
      if (isFinite(v) && v > 0) amount = UI.round2(v);
    }

    // 2. Extraer Nombre de quien transfiere
    let from = '';
    const candidateTexts = [textoExtendido, mensaje, fullText];

    for (const t of candidateTexts) {
      if (!t) continue;

      // Patrón A: "Juan Perez te transfirió..." o "Juan Perez te envió..."
      const mTe = t.match(/(?:^|\n|[.¡!])\s*([A-Za-zÀ-ÿ0-9\s.]+?)\s+te\s+(?:transfiri[oó]|envi[oó]|mand[oó]|acredit[oó]|hizo\s+una\s+transferencia)/i);
      if (mTe && mTe[1] && !/personal\s*pay|billetera/i.test(mTe[1])) {
        from = mTe[1].trim();
        break;
      }

      // Patrón B: "de Juan Perez" o "desde Juan Perez"
      const mDe = t.match(/\b(?:de|desde|remitente:?)\s+([A-Za-zÀ-ÿ0-9\s.]+?)(?=\s+(?:por|a tu|en tu|te\b|a través)|[.,\n¡!]|$|\(|\$)/i);
      if (mDe && mDe[1] && !/personal\s*pay|billetera/i.test(mDe[1])) {
        from = mDe[1].trim();
        break;
      }

      // Patrón C: "Remitente: Juan Perez" o "Origen: Juan Perez"
      const mDeColon = t.match(/(?:de|remitente|origen):\s*([A-Za-zÀ-ÿ0-9\s.]+?)(?=\s+[.,\n]|$|\$)/i);
      if (mDeColon && mDeColon[1]) {
        from = mDeColon[1].trim();
        break;
      }
    }

    // Patrón D: El título es el nombre de la persona (cuando no dice Personal Pay / Transferencia)
    if (!from && titulo) {
      if (!/personal\s*pay|transferencia|dinero|recibiste|notificaci[oó]n|aviso|ingreso|cuenta/i.test(titulo) && !titulo.includes('$')) {
        from = titulo;
      }
    }

    if (from) {
      from = from.replace(/^[:\-–—\s]+|[:\-–—\s]+$/g, '').trim();
      from = from.replace(/^["']|["']$/g, '');
    }

    const displayParts = [
      titulo ? `Título: ${titulo}` : '',
      mensaje ? `Mensaje: ${mensaje}` : '',
      textoExtendido ? `Extendido: ${textoExtendido}` : ''
    ].filter(Boolean);
    const displayRaw = displayParts.join('\n') || rawCombined || String(rawInput || '');
    return { amount, from, raw: displayRaw, titulo, mensaje, textoExtendido };
  },

  receive(m) {
    if (m.event && m.event !== 'message') return;
    const S = Domain.S();
    if (m.id && S.transfers.some(t => t.ntfyId === m.id)) return;
    
    // Si el mensaje es el JSON de MacroDroid o texto plano:
    const p = this.parse(m.message || m.title || '');
    const raw = (typeof m.message === 'string' && m.message.trim().startsWith('{'))
      ? (p.raw + '\n\nJSON original:\n' + m.message)
      : (p.raw || [m.title, m.message].filter(Boolean).join(' — '));

    const t = {
      id: Store.uid(), ntfyId: m.id || '', raw, amount: p.amount, from: p.from, saleId: null,
      date: new Date((m.time || Date.now() / 1000) * 1000).toISOString()
    };
    S.transfers.push(t);
    if (m.time) S.settings.ntfySince = m.time;
    Store.save();
    this.alert(t);
    if (App.current === 'transf') Views.transf.render();
  },

  alert(t) {
    const msg = t.amount ? `💚 Transferencia recibida: ${UI.money(t.amount)}${t.from ? ' de ' + t.from : ''}` : '🔔 Notificación recibida: ' + t.raw;
    UI.beep('sale'); setTimeout(() => UI.beep('ok'), 160);
    UI.toast(msg, 'ok', 10000);
    try {
      if ('Notification' in window && Notification.permission === 'granted') new Notification('Kiosco POS', { body: msg });
    } catch (e) { /* notificaciones del sistema no disponibles */ }
  },

  link(id, saleId) { const t = this.list().find(x => x.id === id); if (t) { t.saleId = saleId; Store.save(); } },
  /** Transferencias con monto, sin vincular, de la última hora (para usar al cobrar). */
  recent() {
    const limit = Date.now() - 60 * 60 * 1000;
    return this.list().filter(t => t.amount && !t.saleId && new Date(t.date).getTime() >= limit).sort((a, b) => b.date.localeCompare(a.date));
  },

  async sendTest() {
    try {
      const testJson = JSON.stringify({
        app: "personal_pay",
        titulo: "¡Recibiste dinero!",
        mensaje: "Recibiste $ 5.000,50 de Carlos Benitez",
        texto_extendido: "Carlos Benitez te transfirió $ 5.000,50 a tu cuenta"
      });
      const r = await fetch(this.url(), { method: 'POST', body: testJson, headers: { Title: 'Personal Pay' } });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      UI.toast('Prueba enviada, debería aparecer en unos segundos', 'info');
    } catch (e) { UI.toast('No se pudo enviar la prueba (¿hay internet?)', 'error'); }
  },

  refreshStatus() {
    const el = document.getElementById('tr-status');
    if (el) el.outerHTML = this.statusHtml();
  },
  statusHtml() {
    const map = { on: ['Conectado', 'on'], connecting: ['Conectando…', ''], error: ['Sin conexión (reintentando)', 'off'], off: ['Desconectado', 'off'] };
    const [txt, cls] = map[this.status];
    return `<span id="tr-status" class="badge ${cls}">${txt}</span>`;
  }
};

Views.transf = {
  render() {
    const root = document.getElementById('view-transf');
    const today = UI.dayKey(new Date());
    const all = Transfers.list().slice().sort((a, b) => b.date.localeCompare(a.date));
    const todays = all.filter(t => UI.dayKey(t.date) === today);
    const total = UI.round2(todays.reduce((a, t) => a + (t.amount || 0), 0));
    root.innerHTML = `
      <div class="stats">
        <div class="stat"><div class="l">Transferencias de hoy</div><div class="v ok">${UI.money(total)}</div><div class="l">${todays.length} recibidas</div></div>
        <div class="stat"><div class="l">Conexión con el celular</div><div class="v" style="font-size:1.1rem">${Transfers.statusHtml()}</div></div>
      </div>
      <div class="card"><div class="row"><h3 class="grow" style="margin:0">💸 Transferencias recibidas</h3>
        <button class="btn" id="tr-test">Enviar prueba</button>
        <button class="btn" id="tr-notif">Avisos del navegador</button></div>
        ${all.length ? `<div class="table-wrap"><table><tr><th>Hora</th><th class="num">Monto</th><th>De</th><th>Estado</th><th></th></tr>
          ${all.slice(0, 50).map(t => `<tr title="${UI.esc(t.raw)}"><td>${UI.dateTime(t.date)}</td>
            <td class="num"><strong>${t.amount ? UI.money(t.amount) : '<span class="warn">¿monto?</span>'}</strong></td>
            <td>${UI.esc(t.from || '—')}</td>
            <td>${t.saleId ? '<span class="tag green">Vinculada a venta</span>' : '<span class="tag yellow">Sin vincular</span>'}</td>
            <td class="right" style="white-space:nowrap"><button class="btn sm" data-edit="${t.id}">Ver / editar</button>
              <button class="btn sm danger" data-del="${t.id}">🗑</button></td></tr>`).join('')}</table></div>`
        : '<div class="empty">Todavía no llegó ninguna transferencia.<br>Configurá el celular con los pasos de abajo y probá con "Enviar prueba".</div>'}</div>
      <div class="card"><h3>⚙️ Configurar el celular Android (una sola vez)</h3>
        <p>Tu celular recibe el aviso de Personal Pay; con una app de automatización lo reenviamos a este canal secreto:</p>
        <div class="field"><label>Dirección del canal (copiala, no la compartas)</label>
          <div class="row" style="flex-wrap:nowrap"><input id="tr-url" readonly value="${UI.esc(Transfers.url())}"><button class="btn" id="tr-copy">Copiar</button></div></div>
        <ol>
          <li>Instalá <strong>MacroDroid</strong> (Play Store, la versión gratuita alcanza).</li>
          <li>Creá una macro con el disparador <strong>Notificación recibida</strong> y elegí la app <strong>Personal Pay</strong>.</li>
          <li>Acción: <strong>Solicitud HTTP</strong> → método <strong>POST</strong> a la dirección de arriba. En el cuerpo (body) insertá el <strong>texto de la notificación</strong> con el botón de variables de MacroDroid.</li>
          <li>Dale a MacroDroid permiso de <strong>acceso a notificaciones</strong> y desactivá la <strong>optimización de batería</strong> para esa app.</li>
          <li>Pedile a alguien que te transfiera \$1 y mirá que aparezca acá. Si el monto o el nombre salen mal, tocá <strong>Ver / editar</strong> y pasame el texto original para ajustar la lectura.</li>
        </ol>
        <button class="btn danger sm" id="tr-new">Generar un canal nuevo</button>
        <p class="muted">Los avisos solo sirven para <strong>mirar</strong>: confirmá siempre que el dinero esté en tu cuenta. Quien conozca la dirección del canal podría enviar avisos falsos.</p>
      </div>`;
    const $ = id => root.querySelector('#' + id);
    $('tr-test').onclick = () => Transfers.sendTest();
    $('tr-notif').onclick = async () => {
      if (!('Notification' in window)) { UI.toast('Este navegador no soporta avisos', 'error'); return; }
      const r = await Notification.requestPermission();
      UI.toast(r === 'granted' ? 'Avisos del navegador activados' : 'Permiso no concedido', r === 'granted' ? 'ok' : 'warn');
    };
    $('tr-copy').onclick = () => {
      $('tr-url').select();
      const done = () => UI.toast('Dirección copiada', 'ok');
      if (navigator.clipboard) navigator.clipboard.writeText(Transfers.url()).then(done, () => { document.execCommand('copy'); done(); });
      else { document.execCommand('copy'); done(); }
    };
    $('tr-new').onclick = async () => {
      if (!await UI.confirm('Se generará un canal nuevo y tendrás que actualizar la dirección en MacroDroid. ¿Continuar?', 'Generar', true)) return;
      const s = Transfers.settings(); s.ntfyTopic = ''; s.ntfySince = 0; Store.save();
      Transfers.connect(); this.render();
    };
    root.onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) this.editModal(b.dataset.edit);
      else if (b.dataset.del && await UI.confirm('¿Quitar esta transferencia de la lista?', 'Quitar', true)) {
        const S = Domain.S(); S.transfers = S.transfers.filter(t => t.id !== b.dataset.del); Store.save(); this.render();
      }
    };
  },

  editModal(id) {
    const t = Transfers.list().find(x => x.id === id); if (!t) return;
    UI.modal({
      title: 'Transferencia',
      html: `<form>
        <div class="field"><label>Texto original de la notificación</label><textarea readonly rows="3">${UI.esc(t.raw)}</textarea></div>
        <div class="grid2">
          <div class="field"><label>Monto ($)</label><input name="amount" type="number" step="0.01" min="0" value="${t.amount || ''}" autofocus></div>
          <div class="field"><label>De</label><input name="from" value="${UI.esc(t.from)}"></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Guardar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target);
          t.amount = Number(d.amount) > 0 ? UI.round2(Number(d.amount)) : null; t.from = d.from.trim();
          Store.save(); close(); this.render();
        };
      }
    });
  }
};
