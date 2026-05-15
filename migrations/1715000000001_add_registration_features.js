exports.up = (pgm) => {
  // Додаємо поле статусу для користувачів (для модерації)
  pgm.addColumns('users', {
    status: { type: 'varchar(50)', notNull: true, default: 'active' }
  });
  
  // Дозволяємо порожні моделі та серійні номери для кавомашин 
  // (бо франчайзі спочатку просто замовляє апарат на певну локацію)
  pgm.alterColumn('coffee_machines', 'model', { notNull: false });
  pgm.alterColumn('coffee_machines', 'serial_number', { notNull: false });
};

exports.down = (pgm) => {
  pgm.dropColumns('users', ['status']);
};