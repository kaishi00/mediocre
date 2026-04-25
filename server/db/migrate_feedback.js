import db from '../config.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🚀 Running feedback migration...');

try {
  // Run base schema first (safe - IF NOT EXISTS)
  const baseSchemaPath = join(__dirname, 'db', 'schema.sql');
  const baseSchema = readFileSync(baseSchemaPath, 'utf-8');
  db.exec(baseSchema);
  console.log('✅ Base schema ensured');

  // Run feedback schema migrations
  const feedbackPath = join(__dirname, 'db', 'feedback_schema.sql');
  const feedbackSQL = readFileSync(feedbackPath, 'utf-8');
  db.exec(feedbackSQL);
  console.log('✅ Feedback schema applied');

  console.log('🎉 Migration completed successfully');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
}
