/* Lógica de negocio: conecta ventas, stock, caja y cuentas corrientes */
const METHODS = [
  ['cash', 'Efectivo'], ['qr', 'MercadoPago / QR'], ['transfer', 'Transferencia'],
  ['debit', 'Tarjeta débito'], ['credit', 'Tarjeta crédito'], ['fiado', 'Cuenta corriente (Fiado)']
];
const methodName = k => (METHODS.find(m => m[0] === k) || [k, k])[1];

const Domain = {
  S() { return Store.state; },
  product(id) { return this.S().products.find(p => p.id === id); },
  customer(id) { return this.S().customers.find(c => c.id === id); },
  supplier(id) { return this.S().suppliers.find(s => s.id === id); },
  currentShift() { return this.S().shifts.find(s => !s.closedAt) || null; },

  /** Lista de categorías: las creadas por el usuario + las usadas por productos. */
  categories() {
    const S = this.S();
    return [...new Set([...S.categories, ...S.products.map(p => p.category)].filter(Boolean))]
      .sort((a, b) => a.localeCompare(b));
  },
  addCategory(name) {
    name = (name || '').trim();
    if (!name) return null;
    const existing = this.categories().find(c => c.toLowerCase() === name.toLowerCase());
    if (existing) return existing;
    this.S().categories.push(name); Store.save();
    return name;
  },
  renameCategory(oldName, newName) {
    newName = (newName || '').trim();
    if (!newName) return false;
    const clash = this.categories().find(c => c.toLowerCase() === newName.toLowerCase() && c !== oldName);
    if (clash) return false;
    const S = this.S();
    S.categories = S.categories.map(c => c === oldName ? newName : c);
    S.products.forEach(p => { if (p.category === oldName) p.category = newName; });
    Store.save();
    return true;
  },
  /** Elimina una categoría; sus productos pasan a `moveTo` (o a "Sin categoría"). */
  deleteCategory(name, moveTo) {
    const S = this.S();
    S.categories = S.categories.filter(c => c !== name);
    S.products.forEach(p => { if (p.category === name) p.category = moveTo || 'Sin categoría'; });
    Store.save();
  },

  customerBalance(id) {
    return UI.round2(this.S().customerTx.filter(t => t.customerId === id)
      .reduce((a, t) => a + (t.type === 'charge' ? t.amount : -t.amount), 0));
  },

  /** Registra una venta: descuenta stock, suma a la caja (turno) y carga el fiado al cliente. */
  completeSale({ items, subtotal, adjust, total, payments, customerId }) {
    const S = this.S(), shift = this.currentShift();
    const sale = {
      id: Store.uid(), number: S.counters.sale++, date: new Date().toISOString(),
      items: items.map(i => ({ productId: i.pid, name: i.name, qty: i.qty, price: i.price, cost: i.cost })),
      subtotal, adjust, total, payments, customerId: customerId || null, shiftId: shift ? shift.id : null
    };
    items.forEach(i => {
      if (!i.track) return;
      const p = this.product(i.pid);
      if (p) p.stock = UI.round2(p.stock - i.qty);
    });
    S.sales.push(sale);
    const fiado = payments.find(p => p.method === 'fiado');
    if (fiado && customerId) {
      S.customerTx.push({
        id: Store.uid(), customerId, date: sale.date, type: 'charge', amount: fiado.amount,
        saleId: sale.id, detail: sale.items.map(i => i.qty + 'x ' + i.name).join(', '), shiftId: sale.shiftId
      });
    }
    Store.save();
    return sale;
  },

  /** Cobro de deuda de un cliente. */
  customerPayment(customerId, amount, method) {
    const shift = this.currentShift();
    this.S().customerTx.push({
      id: Store.uid(), customerId, date: new Date().toISOString(), type: 'payment',
      amount, method, detail: 'Pago de cuenta corriente (' + methodName(method) + ')', shiftId: shift ? shift.id : null
    });
    Store.save();
  },

  /** Compra a proveedor: suma stock, actualiza costo y opcionalmente descuenta efectivo de la caja. */
  addPurchase({ supplierId, lines, paidFromCash, updatePrice }) {
    const S = this.S(), shift = this.currentShift();
    let total = 0;
    lines.forEach(l => {
      const p = this.product(l.productId);
      if (!p) return;
      p.stock = UI.round2(p.stock + l.qty);
      p.cost = l.cost;
      if (updatePrice) p.price = Math.round(p.cost * (1 + (p.margin || 0) / 100));
      else p.margin = p.cost > 0 ? UI.round2((p.price / p.cost - 1) * 100) : 0;
      total += l.qty * l.cost;
    });
    total = UI.round2(total);
    const purchase = {
      id: Store.uid(), date: new Date().toISOString(), supplierId, total,
      lines: lines.map(l => ({ productId: l.productId, name: this.product(l.productId).name, qty: l.qty, cost: l.cost })),
      paidFromCash: !!paidFromCash
    };
    S.purchases.push(purchase);
    if (paidFromCash && shift) {
      S.cashMovements.push({
        id: Store.uid(), shiftId: shift.id, date: purchase.date, type: 'out', kind: 'proveedor',
        amount: total, concept: 'Compra a ' + (this.supplier(supplierId) || { name: 'proveedor' }).name
      });
    }
    Store.save();
    return purchase;
  },

  /** Ajuste masivo de precios por porcentaje, filtrando por categoría o proveedor. */
  bulkPrice({ category, supplierId, percent, applyCost, roundTo }) {
    const f = 1 + percent / 100;
    let n = 0;
    this.S().products.forEach(p => {
      if (p.openPrice) return;
      if (category && p.category !== category) return;
      if (supplierId && p.supplierId !== supplierId) return;
      let price = p.price * f;
      if (roundTo > 0) price = Math.round(price / roundTo) * roundTo;
      p.price = UI.round2(price);
      if (applyCost) p.cost = UI.round2(p.cost * f);
      p.margin = p.cost > 0 ? UI.round2((p.price / p.cost - 1) * 100) : 0;
      n++;
    });
    Store.save();
    return n;
  },

  /** Resumen de un turno de caja (efectivo esperado, ventas por medio de pago, ganancia). */
  shiftSummary(shift) {
    const S = this.S();
    const sales = S.sales.filter(s => s.shiftId === shift.id);
    const byMethod = {}; METHODS.forEach(m => byMethod[m[0]] = 0);
    let cost = 0, total = 0;
    sales.forEach(s => {
      total += s.total;
      s.payments.forEach(p => byMethod[p.method] = UI.round2(byMethod[p.method] + p.amount));
      cost += s.items.reduce((a, i) => a + i.qty * i.cost, 0);
    });
    const mov = S.cashMovements.filter(m => m.shiftId === shift.id);
    const sum = f => UI.round2(mov.filter(f).reduce((a, m) => a + m.amount, 0));
    const ins = sum(m => m.type === 'in');
    const outs = sum(m => m.type === 'out');
    const expenses = sum(m => m.type === 'out' && m.kind === 'gasto');
    const debtPay = S.customerTx.filter(t => t.shiftId === shift.id && t.type === 'payment');
    const debtCash = UI.round2(debtPay.filter(t => t.method === 'cash').reduce((a, t) => a + t.amount, 0));
    const debtOther = UI.round2(debtPay.filter(t => t.method !== 'cash').reduce((a, t) => a + t.amount, 0));
    total = UI.round2(total);
    return {
      sales, count: sales.length, total, byMethod, cost: UI.round2(cost),
      profit: UI.round2(total - cost - expenses), ins, outs, expenses, debtCash, debtOther,
      opening: shift.openingCash,
      expectedCash: UI.round2(shift.openingCash + byMethod.cash + debtCash + ins - outs), movements: mov
    };
  },

  lowStock() { return this.S().products.filter(p => p.track !== false && !p.openPrice && p.stock <= p.minStock); },
  expiring(days) {
    const limit = new Date(); limit.setDate(limit.getDate() + days);
    const lim = UI.dayKey(limit);
    return this.S().products.filter(p => p.expiry && p.expiry <= lim && (p.stock > 0))
      .sort((a, b) => a.expiry.localeCompare(b.expiry));
  }
};
