import Database from 'better-sqlite3';
import { readFileSync, existsSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load .env from project root
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const dbPath = process.env.DB_PATH || join(__dirname, '..', 'data', 'seerr.db');

// Ensure data directory exists
const dataDir = dirname(dbPath);
if (!existsSync(dataDir)) {
  mkdirSync(dataDir, { recursive: true });
  console.log(`📁 Created data directory: ${dataDir}`);
}

console.log(`🔧 Connecting to database: ${dbPath}`);

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('cache_size = 64000');

// Auto-initialize base schema if tables don't exist
function initSchema() {
  // Check if core tables exist
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();

  if (!tables) {
    console.log('📦 Initializing base schema...');
    const schemaPath = join(__dirname, 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf-8');
    db.exec(schema);
    console.log('✅ Base schema initialized');
  } else {
    console.log('✅ Database already initialized');
  }
}

initSchema();
db.path = dbPath;

export default db;
