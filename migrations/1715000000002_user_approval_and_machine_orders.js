exports.up = (pgm) => {
  // Додаємо статус користувача (pending, approved, rejected)
  pgm.addColumn('users', {
    status: { type: 'varchar(50)', notNull: true, default: 'approved' } 
  });

  // Створюємо таблицю для замовлень апаратів (кавомашин)
  pgm.createTable('machine_requests', {
    id: 'id',
    franchisee_id: { type: 'integer', notNull: true, references: 'users(id)', onDelete: 'CASCADE' },
    model_requested: { type: 'varchar(255)', notNull: true },
    status: { type: 'varchar(50)', notNull: true, default: 'pending' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    comment: { type: 'text' }
  });

  // Оновлюємо існуючих користувачів на 'approved'
  pgm.sql("UPDATE users SET status = 'approved'");
};

exports.down = (pgm) => {
  pgm.dropTable('machine_requests');
  pgm.dropColumn('users', 'status');
};