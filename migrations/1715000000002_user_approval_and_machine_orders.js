exports.up = (pgm) => {
  // Колонка status вже додана в міграції 001, тому тут ми її НЕ додаємо

  // Створюємо таблицю для замовлень апаратів (кавомашин)
  pgm.createTable('machine_requests', {
    id: 'id',
    franchisee_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    model: { type: 'varchar(255)', notNull: true },
    city: { type: 'varchar(255)' },
    address: { type: 'varchar(255)' },
    place_type: { type: 'varchar(255)' },
    status: { type: 'varchar(50)', notNull: true, default: 'pending' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') }
  });

  // Оновлюємо існуючих користувачів на 'approved'
  pgm.sql("UPDATE users SET status = 'approved'");
};

exports.down = (pgm) => {
  pgm.dropTable('machine_requests');
};