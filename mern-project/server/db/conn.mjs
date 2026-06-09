import { MongoClient } from "mongodb";

const uri = process.env.ATLAS_URI || "mongodb://localhost:27017";
const dbName = process.env.DB_NAME || "sample_training";

const client = new MongoClient(uri, {
  serverSelectionTimeoutMS: 5000,
});

async function connectWithRetry(attempt = 1) {
  try {
    await client.connect();
    await client.db(dbName).command({ ping: 1 });
    console.log(`Connected to MongoDB, database "${dbName}"`);
  } catch (err) {
    const delay = Math.min(attempt * 2000, 30000);
    console.error(
      `MongoDB connection failed (attempt ${attempt}): ${err.message}. Retrying in ${delay}ms`
    );
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
}

connectWithRetry();

const db = client.db(dbName);

export default db;
