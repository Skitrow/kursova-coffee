exports.up = (pgm) => {
  pgm.addColumns('users', {
    status: { type: 'varchar(50)', notNull: true, default: 'active' }
  });
  pgm.alterColumn('coffee_machines', 'model', { notNull: false });
  pgm.alterColumn('coffee_machines', 'serial_number', { notNull: false });
};
exports.down = (pgm) => {
  pgm.dropColumns('users', ['status']);
};