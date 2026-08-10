// Conexão única (singleton) com o MongoDB Atlas.
import { MongoClient, ServerApiVersion } from "mongodb";

let client = null;
let db = null;

export async function connectDB() {
  if (db) return db;

  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "laundrflow";

  if (!uri) {
    throw new Error("MONGODB_URI não definido. Configure o .env (ou as variáveis do PaaS).");
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: true,
    },
    serverSelectionTimeoutMS: 10000,
    connectTimeoutMS: 10000,
  });

  await client.connect();
  await client.db("admin").command({ ping: 1 });
  db = client.db(dbName);
  console.log(`[db] Conectado ao MongoDB Atlas (banco: ${dbName}).`);
  return db;
}

export function getDB() {
  if (!db) throw new Error("Banco não conectado ainda. Chame connectDB() primeiro.");
  return db;
}

// Coleções usadas pelo sistema.
export const collections = {
  users: () => getDB().collection("users"),
  roles: () => getDB().collection("roles"),
  state: () => getDB().collection("state"),
};
