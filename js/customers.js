/* Clientes y cuentas corrientes ("Fiado") */
Views.cli = {
  render() {
    const root = document.getElementById('view-cli');
    const list = Domain.S().customers;
    root.innerHTML = `
      <div class="card"><div class="row"><h2 class="grow" style="margin:0">Clientes / Fiado</h2>
        <button class="btn primary" id="cli-new">+ Nuevo cliente</button></div></div>
      <div class="card"><div class="table-wrap"><table>
        <tr><th>Cliente</th><th>Teléfono</th><th class="num">Límite</th><th class="num">Saldo pendiente</th><th></th></tr>
        ${list.map(c => {
          const bal = Domain.customerBalance(c.id);
          return `<tr><td><strong>${UI.esc(c.name)}</strong></td><td>${UI.esc(c.phone)}</td>
            <td class="num">${c.limit > 0 ? UI.money(c.limit) : 'Sin límite'}</td>
            <td class="num"><span class="tag ${bal > 0 ? 'yellow' : 'green'}">${UI.money(bal)}</span></td>
            <td class="right" style="white-space:nowrap">
              <button class="btn sm ok" data-act="pay" data-id="${c.id}" ${bal <= 0 ? 'disabled' : ''}>Registrar pago</button>
              <button class="btn sm" data-act="hist" data-id="${c.id}">Historial</button>
              <button class="btn sm" data-act="edit" data-id="${c.id}">Editar</button></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="empty">Sin clientes</td></tr>'}</table></div></div>`;
    root.querySelector('#cli-new').onclick = () => this.form();
    root.onclick = e => {
      const b = e.target.closest('[data-act]'); if (!b) return;
      const c = Domain.customer(b.dataset.id);
      if (b.dataset.act === 'pay') this.payModal(c);
      else if (b.dataset.act === 'hist') this.history(c);
      else if (b.dataset.act === 'edit') this.form(c);
    };
  },

  form(c) {
    const edit = !!c; c = c || { name: '', phone: '', limit: 0 };
    UI.modal({
      title: edit ? 'Editar cliente' : 'Nuevo cliente',
      html: `<form>
        <div class="field"><label>Nombre *</label><input name="name" required value="${UI.esc(c.name)}" autofocus></div>
        <div class="field"><label>Teléfono</label><input name="phone" value="${UI.esc(c.phone)}"></div>
        <div class="field"><label>Límite de deuda ($, 0 = sin límite)</label><input name="limit" type="number" min="0" step="0.01" value="${c.limit}"></div>
        <div class="modal-foot">${edit ? '<button type="button" class="btn danger" data-del>Eliminar</button>' : ''}
          <button type="button" class="btn" data-cancel>Cancelar</button><button class="btn primary">Guardar</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        const del = el.querySelector('[data-del]');
        if (del) del.onclick = async () => {
          if (Domain.customerBalance(c.id) > 0) { UI.toast('No se puede eliminar: tiene saldo pendiente', 'error'); return; }
          if (await UI.confirm('¿Eliminar a ' + c.name + '?', 'Eliminar', true)) {
            const S = Domain.S(); S.customers = S.customers.filter(x => x !== c); Store.save(); close(); this.render();
          }
        };
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target);
          const data = { name: d.name.trim(), phone: d.phone.trim(), limit: Number(d.limit) || 0 };
          if (edit) Object.assign(c, data); else Domain.S().customers.push(Object.assign({ id: Store.uid() }, data));
          Store.save(); close(); UI.toast('Cliente guardado', 'ok'); this.render();
        };
      }
    });
  },

  payModal(c) {
    const bal = Domain.customerBalance(c.id);
    UI.modal({
      title: 'Pago de ' + c.name,
      html: `<form>
        <div class="pay-summary">Saldo pendiente: <strong>${UI.money(bal)}</strong></div>
        <div class="grid2">
          <div class="field"><label>Monto ($)</label><input name="amount" type="number" step="0.01" min="0.01" max="${bal}" value="${bal}" required autofocus></div>
          <div class="field"><label>Medio</label><select name="method">${METHODS.filter(m => m[0] !== 'fiado').map(m => `<option value="${m[0]}">${m[1]}</option>`).join('')}</select></div>
        </div>
        <div class="modal-foot"><button type="button" class="btn" data-cancel>Cancelar</button><button class="btn ok">Registrar pago</button></div></form>`,
      onMount: (el, close) => {
        el.querySelector('[data-cancel]').onclick = close;
        el.querySelector('form').onsubmit = e => {
          e.preventDefault();
          const d = UI.formData(e.target), amount = UI.round2(Number(d.amount));
          if (!(amount > 0) || amount > bal + 0.001) { UI.toast('Monto inválido', 'error'); return; }
          if (d.method === 'cash' && !Domain.currentShift()) UI.toast('Caja cerrada: el efectivo no se sumará a ningún turno', 'warn');
          Domain.customerPayment(c.id, amount, d.method);
          close(); UI.toast('Pago registrado', 'ok'); this.render();
        };
      }
    });
  },

  history(c) {
    const tx = Domain.S().customerTx.filter(t => t.customerId === c.id).sort((a, b) => b.date.localeCompare(a.date));
    UI.modal({
      title: 'Historial de ' + c.name, wide: true,
      html: `<div class="pay-summary">Saldo pendiente: <strong>${UI.money(Domain.customerBalance(c.id))}</strong></div>
        ${tx.length ? `<div class="table-wrap"><table><tr><th>Fecha</th><th>Detalle</th><th class="num">Importe</th></tr>
        ${tx.map(t => `<tr><td>${UI.dateTime(t.date)}</td><td>${UI.esc(t.detail)}</td>
          <td class="num ${t.type === 'charge' ? 'warn' : 'ok'}">${t.type === 'charge' ? '+' : '−'}${UI.money(t.amount)}</td></tr>`).join('')}</table></div>`
        : '<div class="muted">Sin movimientos</div>'}`
    });
  }
};
