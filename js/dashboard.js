/* Inicio: resumen del día, alertas de stock/vencimientos y copias de seguridad */
Views.dash = {
  render() {
    const S = Domain.S(), today = UI.dayKey(new Date());
    const sales = S.sales.filter(s => UI.dayKey(s.date) === today);
    const total = UI.round2(sales.reduce((a, s) => a + s.total, 0));
    const cost = sales.reduce((a, s) => a + s.items.reduce((x, i) => x + i.qty * i.cost, 0), 0);
    const expenses = S.cashMovements.filter(m => m.type === 'out' && m.kind === 'gasto' && UI.dayKey(m.date) === today)
      .reduce((a, m) => a + m.amount, 0);
    const profit = UI.round2(total - cost - expenses);
    const debt = UI.round2(S.customers.reduce((a, c) => a + Domain.customerBalance(c.id), 0));
    const low = Domain.lowStock(), days = S.settings.expiryDays, exp = Domain.expiring(days);
    const todayKey = today;
    const top = {};
    sales.forEach(s => s.items.forEach(i => top[i.name] = (top[i.name] || 0) + i.qty));
    const topList = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 5);

    document.getElementById('view-dash').innerHTML = `
      <div class="stats">
        <div class="stat"><div class="l">Ventas de hoy</div><div class="v">${UI.money(total)}</div><div class="l">${sales.length} tickets</div></div>
        <div class="stat"><div class="l">Ganancia estimada hoy</div><div class="v ok">${UI.money(profit)}</div></div>
        <div class="stat"><div class="l">Fiado pendiente</div><div class="v warn">${UI.money(debt)}</div></div>
        <div class="stat"><div class="l">Caja</div><div class="v">${Domain.currentShift() ? 'Abierta' : 'Cerrada'}</div></div>
      </div>
      <div class="cols">
        <div class="card"><h3>⚠️ Stock bajo (${low.length})</h3>
          ${low.length ? `<div class="table-wrap"><table><tr><th>Producto</th><th class="num">Stock</th><th class="num">Mín.</th></tr>
            ${low.map(p => `<tr><td>${UI.esc(p.name)}</td><td class="num"><span class="tag ${p.stock <= 0 ? 'red' : 'yellow'}">${p.stock}</span></td><td class="num">${p.minStock}</td></tr>`).join('')}</table></div>`
        : '<div class="muted">Todo en orden 👌</div>'}</div>
        <div class="card"><div class="row"><h3 class="grow">⏳ Próximos a vencer (${exp.length})</h3>
          <select id="exp-days" style="width:auto">${[15, 30, 60].map(d => `<option value="${d}" ${d === days ? 'selected' : ''}>${d} días</option>`).join('')}</select></div>
          ${exp.length ? `<div class="table-wrap"><table><tr><th>Producto</th><th>Vence</th><th class="num">Stock</th></tr>
            ${exp.map(p => `<tr><td>${UI.esc(p.name)}</td><td><span class="tag ${p.expiry < todayKey ? 'red' : 'yellow'}">${p.expiry}${p.expiry < todayKey ? ' (vencido)' : ''}</span></td><td class="num">${p.stock}</td></tr>`).join('')}</table></div>`
        : '<div class="muted">Nada por vencer en este período</div>'}</div>
        <div class="card"><h3>🏆 Más vendidos hoy</h3>
          ${topList.length ? `<table>${topList.map(([n, q]) => `<tr><td>${UI.esc(n)}</td><td class="num"><strong>${q}</strong></td></tr>`).join('')}</table>`
        : '<div class="muted">Todavía no hay ventas hoy</div>'}</div>
        <div class="card"><h3>💾 Copia de seguridad</h3>
          <div class="row">
            <button class="btn" id="bk-json">Exportar JSON</button>
            <button class="btn" id="bk-import">Importar JSON</button>
            <button class="btn" id="bk-prod">Productos (Excel/CSV)</button>
            <button class="btn" id="bk-sales">Ventas (Excel/CSV)</button>
          </div>
          <input type="file" id="bk-file" accept="application/json,.json" hidden>
          <p class="muted">Los datos se guardan en este navegador. Exportá una copia seguido para no perderlos.</p>
          <button class="btn danger sm" id="bk-reset">Restablecer datos de ejemplo</button>
        </div>
      </div>`;
    this.bind();
  },
  bind() {
    const $ = id => document.getElementById(id), file = $('bk-file');
    $('exp-days').onchange = e => { Domain.S().settings.expiryDays = Number(e.target.value); Store.save(); this.render(); };
    $('bk-json').onclick = () => Store.exportJSON();
    $('bk-prod').onclick = () => Store.exportProductsCSV();
    $('bk-sales').onclick = () => Store.exportSalesCSV();
    $('bk-import').onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files[0]; if (!f) return;
      if (!await UI.confirm('Esto reemplaza TODOS los datos actuales por los del archivo. ¿Continuar?', 'Importar', true)) { file.value = ''; return; }
      try { Store.importJSON(await f.text()); UI.toast('Copia importada', 'ok'); App.refreshAll(); }
      catch (err) { UI.toast(err.message, 'error'); }
      file.value = '';
    };
    $('bk-reset').onclick = async () => {
      if (await UI.confirm('Se borrarán todos los datos y se cargarán los de ejemplo. ¿Seguro?', 'Restablecer', true)) {
        Store.reset(); UI.toast('Datos restablecidos', 'ok'); App.refreshAll();
      }
    };
  }
};
