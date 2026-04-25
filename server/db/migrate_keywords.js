import db from '../config.js';

console.log('🚀 Running keyword weights column migration...');

try {
  // Check if column exists
  const tableInfo = db.prepare("PRAGMA table_info(taste_profiles)").all();
  const hasKeywordColumn = tableInfo.some(col => col.name === 'keyword_weights_json');

  if (!hasKeywordColumn) {
    db.exec("ALTER TABLE taste_profiles ADD COLUMN keyword_weights_json TEXT NOT NULL DEFAULT '{}'");
    console.log('✅ Added keyword_weights_json column to taste_profiles');
  } else {
    console.log('✅ keyword_weights_json column already exists');
  }

  console.log('🎉 Migration completed successfully');
} catch (err) {
  console.error('❌ Migration failed:', err);
  process.exit(1);
}
