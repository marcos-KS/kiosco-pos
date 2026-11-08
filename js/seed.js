/* Datos de prueba: productos típicos de kiosco, 2 clientes y 2 proveedores */
const Seed = {
  create() {
    const day = n => {
      if (n == null) return '';
      const d = new Date(); d.setDate(d.getDate() + n);
      return UI.dayKey(d);
    };
    // [codigo, nombre, categoria, costo, precio, stock, minimo, vence(días), proveedor, rapido]
    const rows = [
      ['7790895000010', 'Coca-Cola 500ml', 'Bebidas', 900, 1400, 24, 8, 120, 's1', true],
      ['7790895000027', 'Coca-Cola 1.5L', 'Bebidas', 1700, 2500, 12, 6, 120, 's1', false],
      ['7790895000034', 'Sprite 500ml', 'Bebidas', 880, 1350, 18, 6, 120, 's1', false],
      ['7791813420019', 'Agua Villa del Sur 500ml', 'Bebidas', 500, 900, 30, 10, 300, 's1', true],
      ['7791813420026', 'Agua con gas 500ml', 'Bebidas', 520, 950, 6, 8, 300, 's1', false],
      ['7790070410205', 'Gatorade 500ml', 'Bebidas', 1100, 1700, 10, 6, 150, 's1', false],
      ['7790895000041', 'Cerveza Quilmes 473ml', 'Bebidas', 1100, 1800, 20, 8, 180, 's1', false],
      ['7790040130022', 'Alfajor Havanna', 'Golosinas', 1500, 2400, 14, 5, 25, 's2', false],
      ['7790040130039', 'Alfajor Jorgito Chocolate', 'Golosinas', 450, 800, 40, 12, 90, 's2', true],
      ['7790040130046', 'Alfajor Guaymallén', 'Golosinas', 250, 450, 60, 20, 100, 's2', true],
      ['7790040130053', 'Chocolate Cofler Block', 'Golosinas', 1000, 1600, 15, 6, 12, 's2', false],
      ['7790040130060', 'Chicles Beldent', 'Golosinas', 400, 700, 25, 10, 200, 's2', false],
      ['7790040130077', 'Caramelos Sugus', 'Golosinas', 300, 550, 18, 8, 160, 's2', false],
      ['7790040130084', 'Mantecol 100g', 'Golosinas', 800, 1300, 4, 6, 70, 's2', false],
      ['7790310980011', 'Papas Lays Clásicas 85g', 'Snacks', 1300, 2100, 16, 6, 60, 's1', false],
      ['7790310980028', 'Doritos 90g', 'Snacks', 1400, 2200, 12, 6, 55, 's1', false],
      ['7790310980035', 'Palitos salados 100g', 'Snacks', 500, 900, 20, 8, 80, 's1', false],
      ['7790310980042', 'Maní salado 100g', 'Snacks', 450, 800, 3, 6, 110, 's1', false],
      ['7790310980059', 'Galletitas Oreo', 'Snacks', 900, 1500, 14, 6, 90, 's2', false],
      ['7790310980066', 'Galletitas Criollitas', 'Almacén', 800, 1300, 10, 5, 75, 's2', false],
      ['7790520000011', 'Marlboro Box 20', 'Cigarrillos', 3200, 3900, 30, 10, null, 's1', false],
      ['7790520000028', 'Philip Morris Box 20', 'Cigarrillos', 2700, 3300, 28, 10, null, 's1', false],
      ['7790520000035', 'Lucky Strike 20', 'Cigarrillos', 2900, 3500, 8, 10, null, 's1', false],
      ['7790520000042', 'Encendedor Bic', 'Varios', 700, 1500, 25, 8, null, 's2', false],
      ['7790520000059', 'Pañuelos descartables', 'Varios', 300, 600, 20, 6, null, 's2', false],
      ['7790520000066', 'Pilas AA x2', 'Varios', 1200, 2000, 9, 4, 400, 's2', false],
      ['7790001000019', 'Leche La Serenísima 1L', 'Almacén', 1200, 1700, 12, 6, 6, 's1', false],
      ['7790001000026', 'Pan lactal Bimbo', 'Almacén', 2000, 2900, 5, 4, 9, 's1', false],
      ['7790001000033', 'Yerba Playadito 500g', 'Almacén', 2800, 3800, 8, 4, 200, 's1', false],
      ['7790001000040', 'Café instantáneo sobre', 'Almacén', 250, 450, 40, 15, 300, 's2', false]
    ];
    const products = rows.map((r, i) => {
      const [barcode, name, category, cost, price, stock, minStock, exp, supplierId, quick] = r;
      return {
        id: 'p' + (i + 1), barcode, name, category, cost, price, stock, minStock,
        margin: UI.round2((price / cost - 1) * 100), expiry: day(exp), supplierId,
        quick, openPrice: false, track: true, costRatio: 0
      };
    });
    const special = (id, name, category, extra) => products.push(Object.assign({
      id, barcode: '', name, category, cost: 0, price: 0, stock: 0, minStock: 0, margin: 0,
      expiry: '', supplierId: '', quick: true, openPrice: true, track: false, costRatio: 0.6
    }, extra));
    special('pv1', 'Caramelos sueltos', 'Golosinas', { costRatio: 0.55 });
    special('pv2', 'Carga Virtual', 'Varios', { costRatio: 0.97 });
    special('pv3', 'Monto libre', 'Varios', { costRatio: 0.6 });
    special('pv4', 'Bolsas', 'Varios', { openPrice: false, price: 100, cost: 40, margin: 150, costRatio: 0 });

    return {
      version: 1,
      counters: { sale: 1 },
      settings: { theme: 'dark', expiryDays: 30 },
      products,
      customers: [
        { id: 'c1', name: 'María González', phone: '11 5555-1234', limit: 20000 },
        { id: 'c2', name: 'Juan Pérez', phone: '11 5555-9876', limit: 10000 }
      ],
      suppliers: [
        { id: 's1', name: 'Distribuidora Del Sol', phone: '5491155551111', visitDays: 'Lunes y Jueves', category: 'Bebidas, Snacks, Cigarrillos' },
        { id: 's2', name: 'Golosinas Mayorista Rex', phone: '5491155552222', visitDays: 'Miércoles', category: 'Golosinas, Varios' }
      ],
      sales: [],
      customerTx: [],
      shifts: [],
      cashMovements: [],
      purchases: []
    };
  }
};
