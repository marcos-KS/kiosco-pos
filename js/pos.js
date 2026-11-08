/* Módulo POS: búsqueda/escáner, carrito, descuentos, cobro con pagos mixtos */
Views.pos = {
  cart: { items: [], adjust: null, customerId: '', lastIdx: -1 },
  cat: 'Todas',
  built: false,

  render() {
    const root = document.getElementById('view-pos');
    if (!this.built) {
      root.innerHTML = `
      <div class="pos-tabs">
        <button class="btn primary" data-tab="catalog">🛒 Catálogo</button>
        <button class="btn" data-tab="ticket">🧾 Ticket (<span id="pos-count">0</span>)</button>
      </div>
      <div class="pos" id="pos" data-tab="catalog">
        <div class="pos-left">
          <div class="searchbar">
            <input id="pos-search" type="search" autocomplete="off" placeholder="Escaneá o buscá por nombre / código  [F1]">
            <button class="btn primary" id="pos-cam" title="Escanear con la cámara">📷</button>
          </div>
          <div class="scroll">
            <div class="quick" id="pos-quick"></div>
            <div class="chips" id="pos-chips"></div>
            <div class="products" id="pos-products"></div>
          </div>
        </div>
        <div class="pos-right">
          <div class="ticket">
            <div class="ticket-head"><strong>Ticket actual</strong>
              <button class="btn sm" id="pos-clear">Limpiar <span class="kbd">Esc</span></button></div>
            <div class="ticket-items" id="pos-items"></div>
            <div class="ticket-foot">
              <div class="tot-line"><span>Subtotal</span><span id="pos-sub"></span></div>
              <div class="tot-line" id="pos-adj-line"></div>
              <div class="tot-big"><span>TOTAL</span><span id="pos-total"></span></div>
              <div class="row">
                <button class="btn" id="pos-adj">Desc/Recargo <span class="kbd">F4</span></button>
                <button class="btn ok big grow" id="pos-pay">COBRAR <span class="kbd">F2</span></button>
              </div>
            </div>
          </div>
        </div>
      </div>`;
      this.bind(root);
      this.built = true;
    }
    this.renderQuick(); this.renderChips(); this.renderProducts(); this.renderCart();
    setTimeout(() => this.focusSearch(), 50);
  },

  bind(root) {
    const search = root.querySelector('#pos-search');
    search.addEventListener('input', () => this.renderProducts());
    search.addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const q = search.value.trim();
      if (!q) { this.pay(); return; }
      this.submitSearch(q);
    });
    root.querySelector('#pos-clear').onclick = () => this.clearCart(true);
    root.querySelector('#pos-cam').onclick = () => Scanner.open({
      title: 'Escanear productos', continuous: true, onCode: code => this.submitSearch(code)
    });
    root.querySelector('#pos-adj').onclick = () => this.adjustModal();
    root.querySelector('#pos-pay').onclick = () => this.pay();
    root.querySelectorAll('.pos-tabs [data-tab]').forEach(b => b.onclick = () => this.setTab(b.dataset.tab));
    root.addEventListener('click', e => {
      const t = e.target.closest('[data-act]');
      if (!t) return;
      const act = t.dataset.act, i = Number(t.dataset.i);
      if (act === 'add') this.addProduct(Domain.product(t.dataset.id));
      else if (act === 'cat') { this.cat = t.dataset.cat; this.renderChips(); this.renderProducts(); }
      else if (act === 'inc') this.changeQty(i, 1);
      else if (act === 'dec') this.changeQty(i, -1);
      else if (act === 'del') this.removeLine(i);
      else if (act === 'setqty') this.qtyModal(i);
    });
  },

  setTab(tab) {
    const root = document.getElementById('view-pos');
    root.querySelector('#pos').dataset.tab = tab;
    root.querySelectorAll('.pos-tabs [data-tab]').forEach(b => b.classList.toggle('primary', b.dataset.tab === tab));
  },
  focusSearch() { const s = document.getElementById('pos-search'); if (s && App.current === 'pos') s.focus(); },

  // ---------- Catálogo ----------
  renderQuick() {
    const quick = Domain.S().products.filter(p => p.quick);
    document.getElementById('pos-quick').innerHTML =
      quick.map(p => `<button class="btn" data-act="add" data-id="${p.id}">${UI.esc(p.name)}${p.openPrice ? '' : ' · ' + UI.money(p.price)}</button>`).join('') +
      `<button class="btn" data-act="cat" data-cat="Bebidas">🥤 Bebidas frías</button>`;
  },
  renderChips() {
    const cats = ['Todas', ...Domain.categories()];
    if (!cats.includes(this.cat)) this.cat = 'Todas';
    document.getElementById('pos-chips').innerHTML = cats.map(c =>
      `<button class="chip ${c === this.cat ? 'active' : ''}" data-act="cat" data-cat="${UI.esc(c)}">${UI.esc(c)}</button>`).join('');
  },
  matches(q) {
    const t = q.toLowerCase();
    return Domain.S().products.filter(p => !p.openPrice &&
      (p.name.toLowerCase().includes(t) || (p.barcode && p.barcode.includes(t))));
  },
  renderProducts() {
    const q = document.getElementById('pos-search').value.trim();
    let list = q ? this.matches(q) : Domain.S().products.filter(p => !p.openPrice && (this.cat === 'Todas' || p.category === this.cat));
    list = list.slice(0, 80);
    document.getElementById('pos-products').innerHTML = list.length ? list.map(p => {
      const low = p.track !== false && p.stock <= p.minStock;
      return `<button class="pcard ${low ? 'low' : ''}" data-act="add" data-id="${p.id}">
        <span class="n">${UI.esc(p.name)}</span>
        <span><span class="p">${UI.money(p.price)}</span><br><span class="s">${p.track === false ? 'Sin control de stock' : 'Stock: ' + p.stock}</span></span></button>`;
    }).join('') : '<div class="empty">Sin resultados</div>';
  },
  submitSearch(q) {
    const exact = Domain.S().products.find(p => p.barcode && p.barcode === q);
    const list = exact ? [exact] : this.matches(q);
    if (!list.length) { UI.beep('error'); UI.toast('Producto no encontrado: ' + q, 'error'); return; }
    this.addProduct(list[0]);
    const s = document.getElementById('pos-search');
    s.value = ''; this.renderProducts(); s.focus();
  },

  // ---------- Carrito ----------
  addProduct(p) {
    if (!p) return;
    if (p.openPrice) { this.amountModal(p); return; }
    const items = this.cart.items;
    let idx = items.findIndex(i => i.pid === p.id && !i.open);
    if (idx >= 0) items[idx].qty += 1;
    else { items.push({ pid: p.id, name: p.name, price: p.price, cost: p.cost, qty: 1, track: p.track !== false }); idx = items.length - 1; }
    this.cart.lastIdx = idx;
    if (p.track !== false && items[idx].qty > p.stock) UI.toast('Stock insuficiente de ' + p.name + ' (' + p.stock + ')', 'warn');
    UI.beep('ok');
    this.renderCart();
  },
  amountModal(p) {
    UI.modal({
      title: p.name,
      html: `<form><div class="field"><label>Monto ($)</label><input name="amount" type="number" step="0.01" min="0.01" required autofocus></div>
        <div class="modal-foot"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary">Agregar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-close].btn').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const amount = UI.round2(Number(UI.formData(e.target).amount));
          if (!(amount > 0)) return;
          this.cart.items.push({ pid: p.id, name: p.name, price: amount, cost: UI.round2(amount * (p.costRatio || 0)), qty: 1, track: false, open: true });
          this.cart.lastIdx = this.cart.items.length - 1;
          close(); UI.beep('ok'); this.renderCart(); this.focusSearch();
        };
      }
    });
  },
  qtyModal(i) {
    const it = this.cart.items[i]; if (!it) return;
    UI.modal({
      title: 'Cantidad: ' + it.name,
      html: `<form><div class="field"><input name="qty" type="number" step="any" min="0.01" value="${it.qty}" required autofocus></div>
        <div class="modal-foot"><button class="btn primary">Aceptar</button></div></form>`,
      onMount: (el, close) => el.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const q = Number(UI.formData(e.target).qty);
        if (q > 0) { it.qty = q; this.cart.lastIdx = i; this.renderCart(); }
        close(); this.focusSearch();
      }
    });
  },
  changeQty(i, d) {
    const it = this.cart.items[i]; if (!it) return;
    it.qty += d;
    if (it.qty <= 0) { this.removeLine(i); return; }
    this.cart.lastIdx = i;
    this.renderCart();
  },
  removeLine(i) {
    this.cart.items.splice(i, 1);
    this.cart.lastIdx = this.cart.items.length - 1;
    this.renderCart();
  },
  clearCart(force) {
    if (!this.cart.items.length) return;
    const doIt = () => { this.cart = { items: [], adjust: null, customerId: '', lastIdx: -1 }; this.renderCart(); this.focusSearch(); };
    if (force && this.cart.items.length > 2) UI.confirm('¿Vaciar el ticket actual?', 'Vaciar', true).then(ok => ok && doIt());
    else doIt();
  },
  totals() {
    const subtotal = UI.round2(this.cart.items.reduce((a, i) => a + i.qty * i.price, 0));
    const a = this.cart.adjust;
    let adjust = 0;
    if (a) {
      const base = a.mode === 'pct' ? subtotal * a.value / 100 : a.value;
      adjust = UI.round2(a.type === 'discount' ? -Math.min(base, subtotal) : base);
    }
    return { subtotal, adjust, total: UI.round2(Math.max(0, subtotal + adjust)) };
  },
  renderCart() {
    const c = this.cart, t = this.totals();
    document.getElementById('pos-count').textContent = c.items.length;
    document.getElementById('pos-items').innerHTML = c.items.length ? c.items.map((it, i) => `
      <div class="titem ${i === c.lastIdx ? 'last' : ''}">
        <div class="nm">${UI.esc(it.name)}</div><div class="sub">${UI.money(it.qty * it.price)}</div>
        <div class="qty"><button data-act="dec" data-i="${i}">−</button>
          <button data-act="setqty" data-i="${i}" style="width:auto;padding:0 .6rem">${it.qty}</button>
          <button data-act="inc" data-i="${i}">+</button>
          <span class="muted">× ${UI.money(it.price)}</span></div>
        <div class="right"><button class="btn ghost sm" data-act="del" data-i="${i}">🗑</button></div>
      </div>`).join('') : '<div class="empty">Escaneá un producto para empezar</div>';
    document.getElementById('pos-sub').textContent = UI.money(t.subtotal);
    document.getElementById('pos-adj-line').innerHTML = t.adjust
      ? `<span>${t.adjust < 0 ? 'Descuento' : 'Recargo'}</span><span>${UI.money(t.adjust)}</span>` : '';
    document.getElementById('pos-total').textContent = UI.money(t.total);
    document.getElementById('pos-pay').disabled = !c.items.length;
    const box = document.getElementById('pos-items'); box.scrollTop = box.scrollHeight;
  },

  adjustModal() {
    if (!this.cart.items.length) return;
    const a = this.cart.adjust || { type: 'discount', mode: 'pct', value: '' };
    UI.modal({
      title: 'Descuento o recargo',
      html: `<form>
        <div class="grid2">
          <div class="field"><label>Tipo</label><select name="type" autofocus>
            <option value="discount" ${a.type === 'discount' ? 'selected' : ''}>Descuento</option>
            <option value="surcharge" ${a.type === 'surcharge' ? 'selected' : ''}>Recargo</option></select></div>
          <div class="field"><label>Modo</label><select name="mode">
            <option value="pct" ${a.mode === 'pct' ? 'selected' : ''}>Porcentaje (%)</option>
            <option value="amt" ${a.mode === 'amt' ? 'selected' : ''}>Monto ($)</option></select></div>
        </div>
        <div class="field"><label>Valor</label><input name="value" type="number" step="0.01" min="0" value="${a.value}"></div>
        <div class="modal-foot"><button type="button" class="btn" data-clear>Quitar</button><button class="btn primary">Aplicar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-clear]').onclick = () => { this.cart.adjust = null; this.renderCart(); close(); this.focusSearch(); };
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target), v = Number(d.value);
          this.cart.adjust = v > 0 ? { type: d.type, mode: d.mode, value: v } : null;
          this.renderCart(); close(); this.focusSearch();
        };
      }
    });
  },

  // ---------- Cobro ----------
  pay() {
    if (!this.cart.items.length) { UI.toast('El ticket está vacío', 'warn'); return; }
    if (!Domain.currentShift()) {
      UI.toast('Primero abrí la caja para poder cobrar', 'warn');
      Views.cash.openShiftModal(() => this.pay());
      return;
    }
    const t = this.totals();
    if (t.total <= 0) { UI.toast('El total debe ser mayor a cero', 'warn'); return; }
    const customers = Domain.S().customers;
    const rows = METHODS.map(([k, label]) => `
      <div class="pay-row"><label style="margin:0;color:var(--text)">${label}</label>
        <input type="number" step="0.01" min="0" data-m="${k}" value="${k === 'cash' ? t.total : ''}">
        <button type="button" class="btn sm" data-all="${k}">Todo</button></div>`).join('');
    const recent = Transfers.recent();
    const trHtml = recent.length ? `<div class="pay-summary"><strong>💸 Transferencias recibidas (sin vincular)</strong><div>
      ${recent.map(x => `<button type="button" class="btn sm" data-tr="${x.id}" style="margin:.25rem .25rem 0 0">${UI.money(x.amount)} · ${UI.esc(x.from || 'sin nombre')} · ${new Date(x.date).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</button>`).join('')}
      </div></div>` : '';
    UI.modal({
      title: 'Cobrar ' + UI.money(t.total),
      html: `<div>${rows}</div>${trHtml}
        <div class="field"><label>Cliente (obligatorio para Fiado)</label><select id="pay-cust">
          <option value="">— Sin cliente —</option>
          ${customers.map(c => `<option value="${c.id}">${UI.esc(c.name)} (debe ${UI.money(Domain.customerBalance(c.id))})</option>`).join('')}</select></div>
        <div class="pay-summary" id="pay-sum"></div>
        <div class="modal-foot"><button class="btn" data-close2>Cancelar</button>
          <button class="btn ok big" id="pay-ok">Confirmar venta <span class="kbd">Enter</span></button></div>`,
      onMount: (el, close) => {
        const inputs = [...el.querySelectorAll('input[data-m]')];
        const cust = el.querySelector('#pay-cust'), okBtn = el.querySelector('#pay-ok');
        cust.value = this.cart.customerId || '';
        const first = el.querySelector('input[data-m="cash"]'); first.focus(); first.select();
        let state = null, linked = null;
        const calc = () => {
          const v = {}; inputs.forEach(i => v[i.dataset.m] = Math.max(0, Number(i.value) || 0));
          const nonCash = UI.round2(METHODS.filter(m => m[0] !== 'cash').reduce((a, m) => a + v[m[0]], 0));
          const paid = UI.round2(nonCash + v.cash), missing = UI.round2(Math.max(0, t.total - paid));
          const cashNeeded = UI.round2(Math.max(0, t.total - nonCash));
          const change = v.cash > 0 ? UI.round2(Math.max(0, v.cash - cashNeeded)) : 0;
          let err = '';
          if (nonCash > t.total + 0.001) err = 'Los medios no efectivo superan el total';
          else if (missing > 0.001) err = 'Faltan ' + UI.money(missing);
          if (!err && v.fiado > 0) {
            const c = Domain.customer(cust.value);
            if (!c) err = 'Elegí un cliente para el fiado';
            else if (c.limit > 0 && Domain.customerBalance(c.id) + v.fiado > c.limit + 0.001)
              err = 'Supera el límite de ' + UI.money(c.limit) + ' del cliente';
          }
          state = { v, change, err };
          el.querySelector('#pay-sum').innerHTML = `
            <div class="tot-line"><span>Total</span><strong>${UI.money(t.total)}</strong></div>
            <div class="tot-line"><span>Ingresado</span><span>${UI.money(paid)}</span></div>
            ${change > 0 ? `<div class="tot-line ok"><strong>Vuelto</strong><strong>${UI.money(change)}</strong></div>` : ''}
            ${err ? `<div class="danger"><strong>${err}</strong></div>` : '<div class="ok"><strong>Listo para cobrar</strong></div>'}`;
          okBtn.disabled = !!err;
        };
        el.addEventListener('input', calc);
        cust.addEventListener('change', calc);
        el.querySelectorAll('[data-all]').forEach(b => b.onclick = () => {
          inputs.forEach(i => i.value = ''); linked = null;
          el.querySelector(`input[data-m="${b.dataset.all}"]`).value = t.total;
          if (b.dataset.all === 'fiado' && !cust.value) cust.focus();
          calc();
        });
        // usar una transferencia recibida: completa el monto en "Transferencia" y el resto en efectivo
        el.querySelectorAll('[data-tr]').forEach(b => b.onclick = () => {
          const tr = Transfers.list().find(x => x.id === b.dataset.tr); if (!tr) return;
          const amt = Math.min(tr.amount, t.total), rest = UI.round2(t.total - amt);
          inputs.forEach(i => i.value = '');
          el.querySelector('input[data-m="transfer"]').value = amt;
          if (rest > 0) el.querySelector('input[data-m="cash"]').value = rest;
          linked = tr.id; calc();
        });
        el.querySelector('[data-close2]').onclick = close;
        const confirmSale = () => {
          if (!state || state.err) return;
          const { v, change } = state;
          const payments = METHODS.map(m => m[0]).filter(k => v[k] > 0)
            .map(k => ({ method: k, amount: UI.round2(k === 'cash' ? v.cash - change : v[k]) }));
          const sale = Domain.completeSale({ items: this.cart.items, ...t, payments, customerId: cust.value });
          if (linked && v.transfer > 0) Transfers.link(linked, sale.id);
          this.cart = { items: [], adjust: null, customerId: '', lastIdx: -1 };
          close(); UI.beep('sale'); UI.toast('Venta registrada', 'ok');
          this.renderCart(); this.renderProducts(); App.refreshBadge();
          if (change > 0) this.changeModal(change); else this.focusSearch();
        };
        okBtn.onclick = confirmSale;
        el.addEventListener('keydown', e => {
          if (e.key !== 'Enter') return;
          if (e.target.tagName === 'BUTTON' && e.target !== okBtn) return;
          e.preventDefault(); confirmSale();
        });
        calc();
      }
    });
  },
  changeModal(change) {
    UI.modal({
      title: 'Vuelto',
      html: `<div class="change">${UI.money(change)}</div><div class="modal-foot"><button class="btn primary big" data-ok autofocus>Listo</button></div>`,
      onMount: (el, close) => el.querySelector('[data-ok]').onclick = () => { close(); this.focusSearch(); }
    });
  },

  // ---------- Atajos ----------
  onKey(e) {
    if (e.key === 'F1') { e.preventDefault(); this.setTab('catalog'); const s = document.getElementById('pos-search'); s.focus(); s.select(); }
    else if (e.key === 'F2') { e.preventDefault(); this.pay(); }
    else if (e.key === 'F4') { e.preventDefault(); this.adjustModal(); }
    else if (e.key === '+' || e.key === '-') {
      const t = e.target, s = document.getElementById('pos-search');
      const typing = t && /INPUT|SELECT|TEXTAREA/.test(t.tagName) && !(t === s && !s.value);
      if (typing || this.cart.lastIdx < 0) return;
      e.preventDefault();
      this.changeQty(this.cart.lastIdx, e.key === '+' ? 1 : -1);
    }
  },
  escape() {
    const s = document.getElementById('pos-search');
    if (s && s.value) { s.value = ''; this.renderProducts(); s.focus(); }
    else this.clearCart(true);
  }
};
