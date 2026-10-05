import Database from 'better-sqlite3';

const db = new Database(process.argv[2] || 'data/absa-demo.db', { readonly: true });
console.log('user_version:', db.pragma('user_version', { simple: true }));
const tables = db
  .prepare("SELECT name, sql FROM sqlite_master WHERE type = 'table' ORDER BY name")
  .all();
console.log('tables:', tables.map((t) => t.name).join(', ') || '(none)');
const alerts = tables.find((t) => t.name === 'alerts');
if (alerts) {
  const start = alerts.sql.indexOf('response_status');
  console.log('alerts.response_status ->\n' + alerts.sql.slice(start, start + 260));
}