module.exports = {
  async up(db, client) {
    await db.collection('users').insertOne({
      name: "Олександр Коваленко (Admin)",
      email: "admin@coffee-net.ua",
      password: "123456", 
      role: "admin",
      created_at: new Date()
    });
    
    await db.collection('users').insertOne({
      name: "Ірина Петренко (Franchisee)",
      email: "irina.franchise@gmail.com",
      password: "123456", 
      role: "franchisee",
      created_at: new Date()
    });

    await db.collection('users').insertOne({
      name: "Василь Симоненко (Tech)",
      email: "vasyl.tech@coffee-net.ua",
      password: "123456", 
      role: "technician",
      created_at: new Date()
    });
    console.log("✅ Міграція: Базових користувачів створено!");
  },

  async down(db, client) {
    await db.collection('users').deleteMany({ role: { $in: ["admin", "franchisee", "technician"] } });
  }
};
