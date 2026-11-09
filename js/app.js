/* Arranque, autenticación, navegación, tema y atajos globales */
const App = {
  current: 'pos',
  auth: null,
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
    document.getElementById('logout-btn').onclick = () => this.logout();
    document.getElementById('login-form').onsubmit = e => {
      e.preventDefault();
      this.login(document.getElementById('login-user').value.trim(), document.getElementById('login-pass').value);
    };
    document.addEventListener('keydown', e => this.onKey(e));

    // Verificar si ya hay una sesión activa en este navegador
    const savedAuth = sessionStorage.getItem('kiosco_auth');
    if (savedAuth) {
      try {
        this.auth = JSON.parse(savedAuth);
        this.unlockApp();
        return;
      } catch (e) {
        this.auth = null;
      }
    }
    this.lockApp();
  },

  login(user, pass) {
    const s = Store.state.settings;
    const currentPin = String(s.adminPin || '1234');
    const errEl = document.getElementById('login-error');
    if (!user) {
      errEl.textContent = 'Por favor ingresá un nombre de usuario';
      return;
    }
    if (pass !== currentPin) {
      UI.beep('error');
      errEl.textContent = 'Clave de administrador incorrecta';
      const p = document.getElementById('login-pass');
      p.value = '';
      p.focus();
      return;
    }

    errEl.textContent = '';
    this.auth = { user, role: 'admin', time: Date.now() };
    sessionStorage.setItem('kiosco_auth', JSON.stringify(this.auth));
    UI.beep('ok');
    UI.toast(`¡Bienvenido, ${user}!`, 'ok');
    this.unlockApp();
  },

  logout() {
    this.auth = null;
    sessionStorage.removeItem('kiosco_auth');
    Transfers.disconnect();
    this.lockApp();
    UI.toast('Sesión cerrada', 'info');
  },

  lockApp() {
    document.getElementById('login-screen').classList.add('active');
    document.getElementById('main').style.display = 'none';
    document.getElementById('nav').style.display = 'none';
    document.getElementById('shift-badge').style.display = 'none';
    document.getElementById('user-badge').style.display = 'none';
    document.getElementById('logout-btn').style.display = 'none';
    document.getElementById('bottom-nav').style.display = 'none';
    const u = document.getElementById('login-user'), p = document.getElementById('login-pass');
    if (p) p.value = '';
    if (u) { u.focus(); u.select(); }
  },

  unlockApp() {
    document.getElementById('login-screen').classList.remove('active');
    document.getElementById('main').style.display = '';
    document.getElementById('nav').style.display = '';
    document.getElementById('shift-badge').style.display = '';
    const uBadge = document.getElementById('user-badge');
    if (uBadge) {
      uBadge.textContent = '👤 ' + (this.auth ? this.auth.user : 'Admin');
      uBadge.style.display = 'inline-block';
    }
    document.getElementById('logout-btn').style.display = 'inline-block';
    document.getElementById('bottom-nav').style.display = '';
    this.show(this.current || 'pos');
    Transfers.connect();
  },

  applyTheme() { document.documentElement.dataset.theme = Store.state.settings.theme; },

  show(name) {
    if (!this.auth) return;
    this.current = name;
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('active', b.dataset.v === name));
    Views[name].render();
    this.refreshBadge();
  },
  refreshAll() {
    Views.pos.cart = { items: [], adjust: null, customerId: '', lastIdx: -1 };
    this.applyTheme();
    if (this.auth) {
      this.show(this.current);
      Transfers.connect();
    }
  },
  refreshBadge() {
    const b = document.getElementById('shift-badge'), open = !!Domain.currentShift();
    b.textContent = open ? 'Caja abierta' : 'Caja cerrada';
    b.className = 'badge ' + (open ? 'on' : 'off');
  },

  onKey(e) {
    if (!this.auth) return;
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
