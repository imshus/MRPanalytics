const { MongoClient } = require('mongodb');

let client = null;
let db = null;

async function getDb() {
  if (db) return db;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is not set (see .env.example)');
  client = new MongoClient(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 15000,
    maxPoolSize: 10,
  });
  await client.connect();
  db = client.db(process.env.MONGO_DB || 'pratham');
  return db;
}

async function closeDb() {
  if (client) await client.close();
  client = null;
  db = null;
}

module.exports = { getDb, closeDb };
