/* Inventario: productos, márgenes, stock mínimo, vencimientos y precios masivos */
Views.inv = {
  q: '', cat: '', onlyLow: false,

  render() {
    const root = document.getElementById('view-inv');
    if (!root.dataset.built) {
      root.dataset.built = '1';
      root.innerHTML = `
        <div class="card"><div class="row">
          <div class="grow"><input id="inv-q" type="search" placeholder="Buscar producto o código..."></div>
          <div><select id="inv-cat"></select></div>
          <label style="margin:0;display:flex;gap:.4rem;align-items:center"><input type="checkbox" id="inv-low"> Solo stock bajo</label>
          <button class="btn" id="inv-cats">🏷 Categorías</button>
          <button class="btn" id="inv-bulk">% Precios masivos</button>
          <button class="btn primary" id="inv-new">+ Nuevo producto</button>
        </div></div>
        <div class="card"><div class="table-wrap" id="inv-table"></div></div>`;
      root.querySelector('#inv-q').oninput = e => { this.q = e.target.value.toLowerCase(); this.renderTable(); };
      root.querySelector('#inv-cat').onchange = e => { this.cat = e.target.value; this.renderTable(); };
      root.querySelector('#inv-low').onchange = e => { this.onlyLow = e.target.checked; this.renderTable(); };
      root.querySelector('#inv-new').onclick = () => this.form();
      root.querySelector('#inv-bulk').onclick = () => this.bulkModal();
      root.querySelector('#inv-cats').onclick = () => this.categoriesModal();
      root.addEventListener('click', e => {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const p = Domain.product(b.dataset.id);
        if (b.dataset.act === 'edit') this.form(p);
        else if (b.dataset.act === 'del') this.remove(p);
      });
    }
    const cats = Domain.categories();
    const sel = root.querySelector('#inv-cat');
    sel.innerHTML = '<option value="">Todas las categorías</option>' + cats.map(c => `<option ${c === this.cat ? 'selected' : ''}>${UI.esc(c)}</option>`).join('');
    this.renderTable();
  },

  renderTable() {
    const today = UI.dayKey(new Date());
    const list = Domain.S().products.filter(p =>
      (!this.q || p.name.toLowerCase().includes(this.q) || (p.barcode || '').includes(this.q)) &&
      (!this.cat || p.category === this.cat) &&
      (!this.onlyLow || (p.track !== false && !p.openPrice && p.stock <= p.minStock)))
      .sort((a, b) => a.name.localeCompare(b.name));
    document.getElementById('inv-table').innerHTML = `<table>
      <tr><th>Producto</th><th>Categoría</th><th class="num">Costo</th><th class="num">Margen</th><th class="num">Precio</th><th class="num">Stock</th><th>Vence</th><th></th></tr>
      ${list.map(p => {
        const low = p.track !== false && !p.openPrice && p.stock <= p.minStock;
        return `<tr><td><strong>${UI.esc(p.name)}</strong><br><span class="muted">${UI.esc(p.barcode || (p.openPrice ? 'Precio libre' : 'Sin código'))}</span></td>
          <td>${UI.esc(p.category)}</td><td class="num">${p.openPrice ? '—' : UI.money(p.cost)}</td>
          <td class="num">${p.openPrice ? '—' : p.margin + '%'}</td><td class="num">${p.openPrice ? '—' : UI.money(p.price)}</td>
          <td class="num">${p.track === false ? '—' : `<span class="tag ${p.stock <= 0 ? 'red' : low ? 'yellow' : 'green'}">${p.stock}</span> <span class="muted">/ ${p.minStock}</span>`}</td>
          <td>${p.expiry ? `<span class="tag ${p.expiry < today ? 'red' : ''}">${p.expiry}</span>` : ''}</td>
          <td class="right" style="white-space:nowrap"><button class="btn sm" data-act="edit" data-id="${p.id}">Editar</button>
            <button class="btn sm danger" data-act="del" data-id="${p.id}">🗑</button></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="empty">Sin productos</td></tr>'}</table>`;
  },

  form(p) {
    const edit = !!p;
    p = p || { barcode: '', name: '', category: '', cost: '', margin: 40, price: '', stock: 0, minStock: 5, expiry: '', supplierId: '', quick: false };
    const S = Domain.S();
    UI.modal({
      title: edit ? 'Editar producto' : 'Nuevo producto', wide: true,
      html: `<form>
        <div class="grid2">
          <div class="field"><label>Código de barras</label><div class="row" style="flex-wrap:nowrap"><input name="barcode" value="${UI.esc(p.barcode)}"><button type="button" class="btn" data-scan title="Escanear con la cámara">📷</button></div></div>
          <div class="field"><label>Nombre *</label><input name="name" required value="${UI.esc(p.name)}" autofocus></div>
          <div class="field"><label>Categoría * <span class="muted">(escribí una nueva para crearla)</span></label><input name="category" required list="cats" value="${UI.esc(p.category)}">
            <datalist id="cats">${Domain.categories().map(c => `<option value="${UI.esc(c)}">`).join('')}</datalist></div>
          <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">—</option>
            ${S.suppliers.map(s => `<option value="${s.id}" ${s.id === p.supplierId ? 'selected' : ''}>${UI.esc(s.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Precio de costo ($)</label><input name="cost" type="number" step="0.01" min="0" required value="${p.cost}"></div>
          <div class="field"><label>Margen de ganancia (%)</label><input name="margin" type="number" step="0.01" value="${p.margin}"></div>
          <div class="field"><label>Precio de venta ($) *</label><input name="price" type="number" step="0.01" min="0" required value="${p.price}"></div>
          <div class="field"><label>Vencimiento (opcional)</label><input name="expiry" type="date" value="${p.expiry || ''}"></div>
          <div class="field"><label>Stock actual</label><input name="stock" type="number" step="any" value="${p.stock}"></div>
          <div class="field"><label>Stock mínimo</label><input name="minStock" type="number" step="any" min="0" value="${p.minStock}"></div>
        </div>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="quick" ${p.quick ? 'checked' : ''}> Mostrar como acceso rápido en el POS</label>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Guardar</button></div></form>`,
      onMount: (el, close) => {
        const f = el.querySelector('form'), cost = f.cost, margin = f.margin, price = f.price;
        const fromMargin = () => { const c = Number(cost.value); if (c >= 0 && margin.value !== '') price.value = UI.round2(c * (1 + Number(margin.value) / 100)); };
        const fromPrice = () => { const c = Number(cost.value); if (c > 0) margin.value = UI.round2((Number(price.value) / c - 1) * 100); };
        cost.oninput = fromMargin; margin.oninput = fromMargin; price.oninput = fromPrice;
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('[data-scan]').onclick = () => Scanner.open({
          title: 'Escanear código del producto', continuous: false,
          onCode: code => { f.barcode.value = code; UI.toast('Código leído: ' + code, 'ok'); }
        });
        f.onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(f);
          const barcode = d.barcode.trim();
          if (barcode && S.products.some(x => x.barcode === barcode && x !== p)) { UI.toast('Ya existe un producto con ese código', 'error'); return; }
          const data = {
            barcode, name: d.name.trim(), category: d.category.trim(), supplierId: d.supplierId,
            cost: Number(d.cost), margin: Number(d.margin) || 0, price: Number(d.price),
            stock: Number(d.stock) || 0, minStock: Number(d.minStock) || 0, expiry: d.expiry, quick: !!d.quick
          };
          data.category = Domain.addCategory(data.category) || data.category;
          if (edit) Object.assign(p, data);
          else S.products.push(Object.assign({ id: Store.uid(), openPrice: false, track: true, costRatio: 0 }, data));
          Store.save(); close(); UI.toast('Producto guardado', 'ok'); this.render();
        };
      }
    });
  },

  async remove(p) {
    if (await UI.confirm('¿Eliminar "' + p.name + '"? Las ventas pasadas se conservan.', 'Eliminar', true)) {
      const S = Domain.S(); S.products = S.products.filter(x => x !== p);
      Store.save(); UI.toast('Producto eliminado', 'ok'); this.render();
    }
  },

  bulkModal() {
    const S = Domain.S(), cats = Domain.categories();
    UI.modal({
      title: 'Actualización masiva de precios',
      html: `<form>
        <div class="grid2">
          <div class="field"><label>Categoría</label><select name="category"><option value="">Todas</option>${cats.map(c => `<option>${UI.esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Proveedor</label><select name="supplierId"><option value="">Todos</option>${S.suppliers.map(s => `<option value="${s.id}">${UI.esc(s.name)}</option>`).join('')}</select></div>
        </div>
        <div class="grid2">
          <div class="field"><label>Porcentaje (negativo para bajar)</label><input name="percent" type="number" step="0.01" required autofocus></div>
          <div class="field"><label>Redondear a</label><select name="roundTo"><option value="0">Sin redondeo</option><option value="1">$1</option><option value="10" selected>$10</option><option value="50">$50</option><option value="100">$100</option></select></div>
        </div>
        <label style="display:flex;gap:.5rem;align-items:center"><input type="checkbox" name="applyCost"> Aplicar también al precio de costo</label>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Aplicar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = async e => {
          e.preventDefault();
          const d = UI.formData(e.target), percent = Number(d.percent);
          if (!isFinite(percent) || percent <= -100) { UI.toast('Porcentaje inválido', 'error'); return; }
          if (!await UI.confirm('¿Aplicar ' + percent + '% a los productos seleccionados?', 'Aplicar')) return;
          const n = Domain.bulkPrice({ category: d.category, supplierId: d.supplierId, percent, applyCost: !!d.applyCost, roundTo: Number(d.roundTo) });
          close(); UI.toast(n + ' productos actualizados', 'ok'); this.render();
        };
      }
    });
  },

  categoriesModal() {
    const h = UI.modal({ title: 'Categorías', html: '<div id="cat-body"></div>' });
    const body = h.el.querySelector('#cat-body');
    const draw = () => {
      const S = Domain.S();
      body.innerHTML = `
        <form id="cat-add" class="row" style="flex-wrap:nowrap;margin-bottom:.8rem">
          <input name="name" placeholder="Nueva categoría (ej. Helados)" required autofocus>
          <button class="btn primary">Agregar</button></form>
        <table>${Domain.categories().map(c => `<tr>
          <td><input data-name="${UI.esc(c)}" value="${UI.esc(c)}"></td>
          <td class="muted">${S.products.filter(p => p.category === c).length} prod.</td>
          <td class="right" style="white-space:nowrap">
            <button class="btn sm" data-rename="${UI.esc(c)}">Renombrar</button>
            <button class="btn sm danger" data-del="${UI.esc(c)}">🗑</button></td></tr>`).join('')
          || '<tr><td class="empty">Sin categorías</td></tr>'}</table>`;
    };
    const refresh = () => { draw(); this.render(); Views.pos.renderChips(); };
    draw();
    body.addEventListener('submit', e => {
      e.preventDefault();
      const name = e.target.name.value.trim();
      const before = Domain.categories().length;
      Domain.addCategory(name);
      if (Domain.categories().length === before) UI.toast('Esa categoría ya existe', 'warn');
      else UI.toast('Categoría creada', 'ok');
      refresh();
    });
    body.addEventListener('click', async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.rename !== undefined) {
        const old = b.dataset.rename, input = [...body.querySelectorAll('[data-name]')].find(i => i.dataset.name === old);
        if (input.value.trim() === old) return;
        if (Domain.renameCategory(old, input.value)) { UI.toast('Categoría renombrada', 'ok'); refresh(); }
        else UI.toast('Nombre vacío o ya existente', 'error');
      } else if (b.dataset.del !== undefined) {
        const name = b.dataset.del, n = Domain.S().products.filter(p => p.category === name).length;
        const msg = n ? `"${name}" tiene ${n} productos. Pasarán a "Sin categoría". ¿Eliminar?` : `¿Eliminar la categoría "${name}"?`;
        if (await UI.confirm(msg, 'Eliminar', true)) { Domain.deleteCategory(name); UI.toast('Categoría eliminada', 'ok'); refresh(); }
      }
    });
  }
};
