/* Persistencia: localStorage + copia de seguridad JSON / CSV */
const Store = {
  KEY: 'kiosco_pos_v1',
  state: null,

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      this.state = raw ? JSON.parse(raw) : null;
    } catch (e) { this.state = null; }
    if (!this.state) { this.state = Seed.create(); this.save(); }
    this.normalize();
  },
  normalize() {
    const s = this.state, base = Seed.create();
    ['products', 'customers', 'suppliers', 'sales', 'customerTx', 'shifts', 'cashMovements', 'purchases', 'transfers']
      .forEach(k => { if (!Array.isArray(s[k])) s[k] = []; });
    if (!Array.isArray(s.categories)) s.categories = [];
    s.counters = Object.assign({ sale: 1 }, s.counters);
    s.settings = Object.assign({ theme: 'dark', expiryDays: 30 }, s.settings);
    if (!s.version) s.version = base.version;
  },
  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.state)); }
    catch (e) { UI.toast('No se pudo guardar: almacenamiento lleno', 'error'); }
  },
  uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },
  reset() {
    const old = this.state && this.state.settings;
    this.state = Seed.create();
    this.normalize();
    if (old) { // conserva el canal de transferencias para no reconfigurar el celular
      ['ntfyTopic', 'ntfyServer'].forEach(k => { if (old[k]) this.state.settings[k] = old[k]; });
    }
    this.save();
  },

  exportJSON() {
    UI.download('kiosco-backup-' + UI.dayKey(new Date()) + '.json', JSON.stringify(this.state, null, 2), 'application/json');
  },
  importJSON(text) {
    let data;
    try { data = JSON.parse(text); } catch (e) { throw new Error('El archivo no es un JSON válido'); }
    if (!data || !Array.isArray(data.products) || !Array.isArray(data.sales)) {
      throw new Error('El archivo no parece una copia de seguridad de Kiosco POS');
    }
    this.state = data;
    this.normalize();
    this.save();
  },
  exportProductsCSV() {
    const rows = [['Codigo', 'Nombre', 'Categoria', 'Costo', 'Margen %', 'Precio', 'Stock', 'Stock minimo', 'Vencimiento']];
    this.state.products.forEach(p => rows.push([p.barcode, p.name, p.category, p.cost, p.margin, p.price, p.stock, p.minStock, p.expiry]));
    UI.download('productos.csv', UI.csv(rows), 'text/csv;charset=utf-8');
  },
  exportSalesCSV() {
    const rows = [['Nro', 'Fecha', 'Items', 'Subtotal', 'Ajuste', 'Total', 'Pagos', 'Cliente']];
    this.state.sales.forEach(s => {
      const cust = this.state.customers.find(c => c.id === s.customerId);
      rows.push([s.number, UI.dateTime(s.date), s.items.map(i => i.qty + 'x ' + i.name).join(' | '),
        s.subtotal, s.adjust, s.total, s.payments.map(p => p.method + ':' + p.amount).join(' | '), cust ? cust.name : '']);
    });
    UI.download('ventas.csv', UI.csv(rows), 'text/csv;charset=utf-8');
  }
};
