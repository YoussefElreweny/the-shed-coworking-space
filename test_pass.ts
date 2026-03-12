import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const db = new Database('bookings.db');
const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string } | undefined;

if (row) {
  console.log('Hash in DB:', row.value);
  console.log('Matches shed-admin-2024?', bcrypt.compareSync('shed-admin-2024', row.value));
} else {
  console.log('No password in DB');
}
