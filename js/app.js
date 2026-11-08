/* Arranque, navegación, tema y atajos globales */
const App = {
  current: 'pos',
  tabs: [['pos', '🛒', 'Venta'], ['dash', '📊', 'Inicio'], ['inv', '📦', 'Inventario'], ['cash', '💵', 'Caja'], ['cli', '👥', 'Clientes'], ['sup', '🚚', 'Proveedores'], ['transf', '💸', 'Transferencias']],

  init() {
    Store.load();
    this.applyTheme();
    document.getElementById('nav').innerHTML = this.tabs.map(t => `<button data-v="${t[0]}">${t[1]} ${t[2]}</button>`).join('');
    document.getElementById('bottom-nav').innerHTML = this.tabs.map(t => `<button data-v="${t[0]}"><span>${t[1]}</span>${t[2]}</button>`).join('');
    document.querySelectorAll('[data-v]').forEach(b => b.onclick = () => this.show(b.dataset.v));
    document.getElementById('theme-btn').onclick = () => {
      const s = Store.state.settings; s.theme = s.theme === 'dark' ? 'light' : 'dark'; Store.save(); this.applyTheme();
    };
    document.addEventListener('keydown', e => this.onKey(e));
    this.show('pos');
    Transfers.connect();
  },

  applyTheme() { document.documentElement.dataset.theme = Store.state.settings.theme; },

  show(name) {
    this.current = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === name));
    Views[name].render();
    this.refreshBadge();
  },
  refreshAll() {
    Views.pos.cart = { items: [], adjust: null, customerId: '', lastIdx: -1 };
    this.applyTheme(); this.show(this.current); Transfers.connect();
  },
  refreshBadge() {
    const b = document.getElementById('shift-badge'), open = !!Domain.currentShift();
    b.textContent = open ? 'Caja abierta' : 'Caja cerrada';
    b.className = 'badge ' + (open ? 'on' : 'off');
  },

  onKey(e) {
    if (e.key === 'Escape') {
      if (UI.hasModal()) { UI.closeModal(); e.preventDefault(); }
      else if (this.current === 'pos') Views.pos.escape();
      return;
    }
    if (UI.hasModal() || this.current !== 'pos') return;
    Views.pos.onKey(e);
  }
};
document.addEventListener('DOMContentLoaded', () => App.init());
