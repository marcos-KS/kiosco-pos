/* Caja diaria: apertura, movimientos, arqueo y resumen por medio de pago */
Views.cash = {
  render() {
    const shift = Domain.currentShift(), S = Domain.S();
    const root = document.getElementById('view-cash');
    let html = '';
    if (!shift) {
      html += `<div class="card"><h2>Caja cerrada</h2><p class="muted">Abrí la caja para empezar a cobrar.</p>
        <button class="btn primary big" id="cash-open">Abrir caja</button></div>`;
    } else {
      const sm = Domain.shiftSummary(shift);
      html += `<div class="card"><div class="row"><h2 class="grow">Turno abierto <span class="muted" style="font-size:.9rem">desde ${UI.dateTime(shift.openedAt)}</span></h2>
        <button class="btn" id="cash-move-in">+ Ingreso</button>
        <button class="btn" id="cash-move-out">− Salida / Gasto</button>
        <button class="btn danger" id="cash-close">Cerrar caja</button></div></div>
        <div class="stats">
          <div class="stat"><div class="l">Efectivo esperado en caja</div><div class="v">${UI.money(sm.expectedCash)}</div></div>
          <div class="stat"><div class="l">Vendido en el turno</div><div class="v">${UI.money(sm.total)}</div><div class="l">${sm.count} tickets</div></div>
          <div class="stat"><div class="l">Ganancia neta estimada</div><div class="v ok">${UI.money(sm.profit)}</div></div>
        </div>
        <div class="cols">
          <div class="card"><h3>Por medio de pago</h3><table>
            ${METHODS.map(([k, n]) => `<tr><td>${n}</td><td class="num"><strong>${UI.money(sm.byMethod[k])}</strong></td></tr>`).join('')}
            <tr><td class="muted">Cobros de fiado (efectivo)</td><td class="num">${UI.money(sm.debtCash)}</td></tr>
            <tr><td class="muted">Cobros de fiado (otros medios)</td><td class="num">${UI.money(sm.debtOther)}</td></tr>
          </table><p class="muted">Efectivo esperado = cambio inicial (${UI.money(sm.opening)}) + ventas en efectivo + cobros de fiado en efectivo + ingresos − salidas.</p></div>
          <div class="card"><h3>Movimientos de caja</h3>
            ${sm.movements.length ? `<table>${sm.movements.slice().reverse().map(m => `<tr>
              <td>${UI.dateTime(m.date)}</td><td>${UI.esc(m.concept)} <span class="tag">${m.kind}</span></td>
              <td class="num ${m.type === 'in' ? 'ok' : 'danger'}">${m.type === 'in' ? '+' : '−'}${UI.money(m.amount)}</td></tr>`).join('')}</table>`
          : '<div class="muted">Sin movimientos</div>'}</div>
        </div>`;
    }
    const closed = S.shifts.filter(s => s.closedAt).slice(-10).reverse();
    html += `<div class="card"><h3>Historial de turnos</h3>${closed.length ? `<div class="table-wrap"><table>
      <tr><th>Apertura</th><th>Cierre</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th></tr>
      ${closed.map(s => `<tr><td>${UI.dateTime(s.openedAt)}</td><td>${UI.dateTime(s.closedAt)}</td><td class="num">${UI.money(s.summary.total)}</td>
        <td class="num">${UI.money(s.expectedCash)}</td><td class="num">${UI.money(s.countedCash)}</td>
        <td class="num ${s.difference === 0 ? 'ok' : s.difference < 0 ? 'danger' : 'warn'}">${UI.money(s.difference)}</td></tr>`).join('')}</table></div>`
      : '<div class="muted">Aún no hay turnos cerrados</div>'}</div>`;
    root.innerHTML = html;
    const $ = id => root.querySelector('#' + id);
    if ($('cash-open')) $('cash-open').onclick = () => this.openShiftModal();
    if ($('cash-move-in')) $('cash-move-in').onclick = () => this.moveModal('in');
    if ($('cash-move-out')) $('cash-move-out').onclick = () => this.moveModal('out');
    if ($('cash-close')) $('cash-close').onclick = () => this.closeModal();
  },

  openShiftModal(after) {
    UI.modal({
      title: 'Apertura de caja',
      html: `<form><div class="field"><label>Cambio inicial en efectivo ($)</label>
        <input name="amount" type="number" step="0.01" min="0" value="0" required autofocus></div>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Abrir caja</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          Domain.S().shifts.push({ id: Store.uid(), openedAt: new Date().toISOString(), openingCash: UI.round2(Number(UI.formData(e.target).amount)), closedAt: null });
          Store.save(); close(); UI.toast('Caja abierta', 'ok'); App.refreshBadge();
          if (App.current === 'cash') this.render();
          if (after) after();
        };
      }
    });
  },

  moveModal(type) {
    const shift = Domain.currentShift(); if (!shift) return;
    const kinds = type === 'in' ? [['ingreso', 'Ingreso / aporte']] : [['gasto', 'Gasto (afecta ganancia)'], ['proveedor', 'Pago a proveedor'], ['retiro', 'Retiro del dueño']];
    UI.modal({
      title: type === 'in' ? 'Ingreso de efectivo' : 'Salida de efectivo',
      html: `<form>
        <div class="field"><label>Tipo</label><select name="kind">${kinds.map(k => `<option value="${k[0]}">${k[1]}</option>`).join('')}</select></div>
        <div class="field"><label>Monto ($)</label><input name="amount" type="number" step="0.01" min="0.01" required autofocus></div>
        <div class="field"><label>Concepto</label><input name="concept" required placeholder="Ej: compra de bolsas"></div>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Registrar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target);
          Domain.S().cashMovements.push({ id: Store.uid(), shiftId: shift.id, date: new Date().toISOString(), type, kind: d.kind, amount: UI.round2(Number(d.amount)), concept: d.concept.trim() });
          Store.save(); close(); UI.toast('Movimiento registrado', 'ok'); this.render();
        };
      }
    });
  },

  closeModal() {
    const shift = Domain.currentShift(); if (!shift) return;
    const sm = Domain.shiftSummary(shift);
    UI.modal({
      title: 'Cierre de caja (arqueo)',
      html: `<form>
        <div class="pay-summary">
          <div class="tot-line"><span>Efectivo esperado</span><strong>${UI.money(sm.expectedCash)}</strong></div>
          <div class="tot-line"><span>Ventas del turno</span><span>${UI.money(sm.total)}</span></div>
          <div class="tot-line"><span>Ganancia neta estimada</span><span>${UI.money(sm.profit)}</span></div></div>
        <div class="field"><label>Efectivo real contado ($)</label><input name="counted" type="number" step="0.01" min="0" required autofocus></div>
        <div class="pay-summary" id="diff">Ingresá el efectivo contado</div>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn danger">Cerrar caja</button></div></form>`,
      onMount: (el, close) => {
        const f = el.querySelector('form');
        f.counted.oninput = () => {
          const d = UI.round2(Number(f.counted.value) - sm.expectedCash);
          el.querySelector('#diff').innerHTML = d === 0 ? '<strong class="ok">La caja cierra exacta ✔</strong>'
            : `<strong class="${d < 0 ? 'danger' : 'warn'}">${d < 0 ? 'Faltante' : 'Sobrante'}: ${UI.money(Math.abs(d))}</strong>`;
        };
        el.querySelector('[data-cancel]').onclick = close;
        f.onsubmit = e => {
          e.preventDefault();
          const counted = UI.round2(Number(f.counted.value));
          Object.assign(shift, { closedAt: new Date().toISOString(), countedCash: counted, expectedCash: sm.expectedCash, difference: UI.round2(counted - sm.expectedCash),
            summary: { total: sm.total, count: sm.count, profit: sm.profit, byMethod: sm.byMethod } });
          Store.save(); close(); UI.toast('Caja cerrada', 'ok'); App.refreshBadge(); this.render();
        };
      }
    });
  }
};
