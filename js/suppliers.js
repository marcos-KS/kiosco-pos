/* Proveedores y registro de compras (reposición de mercadería) */
Views.sup = {
  render() {
    const S = Domain.S(), root = document.getElementById('view-sup');
    const purchases = S.purchases.slice(-8).reverse();
    root.innerHTML = `
      <div class="card"><div class="row"><h2 class="grow" style="margin:0">Proveedores</h2>
        <button class="btn primary" id="sup-new">+ Nuevo proveedor</button></div></div>
      <div class="card"><div class="table-wrap"><table>
        <tr><th>Proveedor</th><th>Vende</th><th>Visita / reparto</th><th>Contacto</th><th></th></tr>
        ${S.suppliers.map(s => `<tr><td><strong>${UI.esc(s.name)}</strong></td><td>${UI.esc(s.category)}</td><td>${UI.esc(s.visitDays)}</td>
          <td>${s.phone ? `<a href="https://wa.me/${encodeURIComponent(s.phone.replace(/\D/g, ''))}" target="_blank" rel="noopener">💬 ${UI.esc(s.phone)}</a>` : ''}</td>
          <td class="right" style="white-space:nowrap"><button class="btn sm ok" data-act="buy" data-id="${s.id}">Registrar compra</button>
            <button class="btn sm" data-act="edit" data-id="${s.id}">Editar</button></td></tr>`).join('')
          || '<tr><td colspan="5" class="empty">Sin proveedores</td></tr>'}</table></div></div>
      <div class="card"><h3>Últimas compras</h3>${purchases.length ? `<table><tr><th>Fecha</th><th>Proveedor</th><th>Detalle</th><th class="num">Total</th></tr>
        ${purchases.map(p => `<tr><td>${UI.dateTime(p.date)}</td><td>${UI.esc((Domain.supplier(p.supplierId) || { name: '—' }).name)}</td>
          <td>${UI.esc(p.lines.map(l => l.qty + 'x ' + l.name).join(', '))}</td><td class="num">${UI.money(p.total)}</td></tr>`).join('')}</table>`
        : '<div class="muted">Sin compras registradas</div>'}</div>`;
    root.querySelector('#sup-new').onclick = () => this.form();
    root.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const s = Domain.supplier(b.dataset.id);
      if (b.dataset.act === 'buy') this.buyModal(s); else this.form(s);
    };
  },

  form(s) {
    const edit = !!s; s = s || { name: '', phone: '', visitDays: '', category: '' };
    UI.modal({
      title: edit ? 'Editar proveedor' : 'Nuevo proveedor',
      html: `<form>
        <div class="field"><label>Nombre *</label><input name="name" required value="${UI.esc(s.name)}" autofocus></div>
        <div class="field"><label>WhatsApp / teléfono</label><input name="phone" value="${UI.esc(s.phone)}" placeholder="5491155551111"></div>
        <div class="field"><label>Días de visita / reparto</label><input name="visitDays" value="${UI.esc(s.visitDays)}"></div>
        <div class="field"><label>Categorías que vende</label><input name="category" value="${UI.esc(s.category)}"></div>
        <div class="modal-foot">${edit ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Guardar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        const del = el.querySelector('[data-del]');
        if (del) del.onclick = async () => {
          if (await UI.confirm('¿Eliminar a ' + s.name + '?', 'Eliminar', true)) {
            const S = Domain.S(); S.suppliers = S.suppliers.filter(x => x !== s);
            S.products.forEach(p => { if (p.supplierId === s.id) p.supplierId = ''; });
            Store.save(); close(); this.render();
          }
        };
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target);
          const data = { name: d.name.trim(), phone: d.phone.trim(), visitDays: d.visitDays.trim(), category: d.category.trim() };
          if (edit) Object.assign(s, data); else Domain.S().suppliers.push(Object.assign({ id: Store.uid() }, data));
          Store.save(); close(); UI.toast('Proveedor guardado', 'ok'); this.render();
        };
      }
    });
  },

  buyModal(s) {
    const products = Domain.S().products.filter(p => !p.openPrice && p.track !== false)
      .sort((a, b) => (b.supplierId === s.id) - (a.supplierId === s.id) || a.name.localeCompare(b.name));
    const opts = products.map(p => `<option value="${p.id}" data-cost="${p.cost}">${UI.esc(p.name)}${p.supplierId === s.id ? ' ★' : ''}</option>`).join('');
    UI.modal({
      title: 'Compra a ' + s.name, wide: true,
      html: `<form>
        <div id="buy-lines"></div>
        <button type="button" class="btn sm" id="buy-add">+ Agregar producto</button>
        <div class="pay-summary tot-line"><span>Total de la compra</span><strong id="buy-total">$ 0,00</strong></div>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="paid" checked> Pagado en efectivo desde la caja</label>
        <label style="display:flex;gap:.5rem;align-items:center;margin-top:.5rem"><input type="checkbox" name="updatePrice"> Actualizar precio de venta según el margen de cada producto</label>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn ok">Registrar compra</button></div></form>`,
      onMount: (el, close) => {
        const box = el.querySelector('#buy-lines');
        const total = () => {
          let t = 0; box.querySelectorAll('.pay-row').forEach(r => t += (Number(r.querySelector('[name=qty]').value) || 0) * (Number(r.querySelector('[name=cost]').value) || 0));
          el.querySelector('#buy-total').textContent = UI.money(t);
        };
        const addLine = () => {
          const row = document.createElement('div');
          row.className = 'pay-row'; row.style.gridTemplateColumns = '1fr 90px 110px auto';
          row.innerHTML = `<select name="pid">${opts}</select><input name="qty" type="number" min="0.01" step="any" value="1" title="Cantidad">
            <input name="cost" type="number" min="0" step="0.01" title="Costo unitario"><button type="button" class="btn sm ghost">🗑</button>`;
          const sel = row.querySelector('[name=pid]'), cost = row.querySelector('[name=cost]');
          const sync = () => { cost.value = sel.selectedOptions[0].dataset.cost; total(); };
          sel.onchange = sync; row.addEventListener('input', total);
          row.querySelector('button').onclick = () => { row.remove(); total(); };
          box.appendChild(row); sync();
        };
        addLine();
        el.querySelector('#buy-add').onclick = addLine;
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const lines = [...box.querySelectorAll('.pay-row')].map(r => ({
            productId: r.querySelector('[name=pid]').value, qty: Number(r.querySelector('[name=qty]').value), cost: Number(r.querySelector('[name=cost]').value)
          })).filter(l => l.qty > 0 && l.cost >= 0);
          if (!lines.length) { UI.toast('Agregá al menos un producto', 'error'); return; }
          const f = e.target;
          if (f.paid.checked && !Domain.currentShift()) { UI.toast('Abrí la caja para descontar el pago, o desmarcá "Pagado en efectivo"', 'warn'); return; }
          Domain.addPurchase({ supplierId: s.id, lines, paidFromCash: f.paid.checked, updatePrice: f.updatePrice.checked });
          close(); UI.toast('Compra registrada y stock actualizado', 'ok'); this.render();
        };
      }
    });
  }
};
