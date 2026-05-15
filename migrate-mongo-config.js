module.exports = {
  mongodb: {
    url: process.env.MONGO_URI || "mongodb://mongodb:27017",
    databaseName: "coffee_franchise_db",
    options: {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    }
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  migrationFileExtension: ".js",
  useFileHash: false,
  moduleSystem: 'commonjs',
};
