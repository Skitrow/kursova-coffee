exports.up = (pgm) => {
  pgm.createTable('users', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    email: { type: 'varchar(255)', notNull: true, unique: true },
    password: { type: 'varchar(255)', notNull: true },
    phone: { type: 'varchar(50)' },
    role: { type: 'varchar(50)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createTable('coffee_machines', {
    id: 'id',
    franchisee_id: { type: 'integer', references: 'users(id)', onDelete: 'CASCADE' },
    model: { type: 'varchar(255)', notNull: true },
    serial_number: { type: 'varchar(255)', notNull: true, unique: true },
    status: { type: 'varchar(50)', notNull: true },
    city: { type: 'varchar(100)' },
    address: { type: 'varchar(255)' },
    place_type: { type: 'varchar(100)' },
    installed_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
  });

  pgm.createTable('ingredients', {
    id: 'id',
    name: { type: 'varchar(255)', notNull: true },
    unit: { type: 'varchar(50)', notNull: true },
    price_per_unit: { type: 'decimal(10,2)', notNull: true },
    stock: { type: 'integer', notNull: true, default: 0 }
  });

  pgm.createTable('orders', {
    id: 'id',
    franchisee_id: { type: 'integer', references: 'users(id)', onDelete: 'CASCADE' },
    order_date: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    status: { type: 'varchar(50)', notNull: true },
    total_price: { type: 'decimal(10,2)', notNull: true },
    updated_at: { type: 'timestamp' }
  });

  pgm.createTable('order_details', {
    id: 'id',
    order_id: { type: 'integer', references: 'orders(id)', onDelete: 'CASCADE' },
    ingredient_id: { type: 'integer', references: 'ingredients(id)' },
    quantity: { type: 'integer', notNull: true },
    price: { type: 'decimal(10,2)', notNull: true }
  });

  pgm.createTable('telemetry_logs', {
    id: 'id',
    machine_id: { type: 'integer', references: 'coffee_machines(id)', onDelete: 'CASCADE' },
    timestamp: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    water_level_percent: { type: 'integer', notNull: true },
    coffee_beans_percent: { type: 'integer', notNull: true },
    cups_count: { type: 'integer', notNull: true },
    has_error: { type: 'boolean', notNull: true, default: false },
    error_code: { type: 'varchar(100)' }
  });

  pgm.createTable('maintenance_tasks', {
    id: 'id',
    machine_id: { type: 'integer', references: 'coffee_machines(id)', onDelete: 'CASCADE' },
    technician_id: { type: 'integer', references: 'users(id)', onDelete: 'SET NULL' },
    task_type: { type: 'varchar(100)', notNull: true },
    status: { type: 'varchar(50)', notNull: true },
    assigned_at: { type: 'timestamp', notNull: true, default: pgm.func('current_timestamp') },
    completed_at: { type: 'timestamp' },
    description: { type: 'text' },
    updated_at: { type: 'timestamp' }
  });

  pgm.sql(`
    INSERT INTO users (name, email, password, role) VALUES 
    ('Олександр Коваленко (Admin)', 'admin@coffee-net.ua', '123456', 'admin'),
    ('Ірина Петренко (Franchisee)', 'irina.franchise@gmail.com', '123456', 'franchisee'),
    ('Василь Симоненко (Tech)', 'vasyl.tech@coffee-net.ua', '123456', 'technician');
  `);
};
