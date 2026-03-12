import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';

const db = new Database('bookings.db');
const hashedPassword = bcrypt.hashSync('shed-admin-2024', 10);
db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password'").run(hashedPassword);
console.log('Password reset to exactly "shed-admin-2024"');
