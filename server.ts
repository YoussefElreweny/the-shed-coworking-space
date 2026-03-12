import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database('bookings.db');

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    capacity TEXT NOT NULL,
    price INTEGER NOT NULL,
    description TEXT,
    image_url TEXT
  );

  CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_name TEXT NOT NULL,
    phone TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms (id)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

// Add phone column if upgrading from old schema
try {
  db.exec(`ALTER TABLE bookings ADD COLUMN phone TEXT;`);
} catch {
  // Column already exists, ignore
}

// Ensure admin password exists in settings
const existingPassword = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string } | undefined;
if (!existingPassword) {
  const defaultPassword = process.env.ADMIN_PASSWORD || 'shed-admin-2024';
  const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
  db.prepare("INSERT INTO settings (key, value) VALUES ('admin_password', ?)").run(hashedPassword);
}

// Seed rooms if empty
const roomCount = db.prepare('SELECT COUNT(*) as count FROM rooms').get() as { count: number };
if (roomCount.count === 0) {
  const insertRoom = db.prepare('INSERT INTO rooms (name, capacity, price, description, image_url) VALUES (?, ?, ?, ?, ?)');
  insertRoom.run('Office Room', '1-3', 110, 'Modern space perfect for focused team sprints and client meetings.', '/images/room1.jpg');
  insertRoom.run('Shared Room', '15-20', 300, 'Cozy environment surrounded by books, ideal for creative brainstorming sessions.', '/images/room2.jpg');
  insertRoom.run('Meeting Room', '10-13', 200, 'Professional setup with high-end AV equipment, perfect for important presentations.', '/images/room3.jpg');
  insertRoom.run('Cordia Room', '8-10', 170, 'Private and quiet corner perfect for one-on-one sessions or deep focused work.', '/images/room4.jpg');
}

// ── Admin session store (in-memory, fine for single server) ──────────────────
const adminSessions = new Set<string>();

function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const token = req.headers['x-admin-token'] as string;
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// ── Start server ─────────────────────────────────────────────────────────────
async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // WebSocket broadcast helper
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  // ── Public API ──────────────────────────────────────────────────────────────

  app.get('/api/rooms', (_req, res) => {
    const rooms = db.prepare('SELECT * FROM rooms').all();
    res.json(rooms);
  });

  app.get('/api/bookings', (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    const bookings = db
      .prepare('SELECT * FROM bookings WHERE start_time >= ? AND start_time <= ?')
      .all(start, end);
    res.json(bookings);
  });

  app.post('/api/bookings', (req, res) => {
    const { room_id, user_name, phone, start_time, end_time } = req.body;
    if (!room_id || !user_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const conflict = db.prepare(`
      SELECT * FROM bookings 
      WHERE room_id = ? AND start_time < ? AND end_time > ?
    `).get(room_id, end_time, start_time);

    if (conflict) return res.status(400).json({ error: 'This time slot is already booked.' });

    const result = db
      .prepare('INSERT INTO bookings (room_id, user_name, phone, start_time, end_time) VALUES (?, ?, ?, ?, ?)')
      .run(room_id, user_name, phone || null, start_time, end_time);

    const newBooking = { id: result.lastInsertRowid, room_id, user_name, phone, start_time, end_time };
    broadcast({ type: 'BOOKING_CREATED', booking: newBooking });
    res.status(201).json(newBooking);
  });

  // ── Admin Auth ──────────────────────────────────────────────────────────────

  app.post('/api/admin/login', (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(401).json({ error: 'Password required.' });
    }

    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string };
    
    if (!row || !bcrypt.compareSync(password, row.value)) {
      return res.status(401).json({ error: 'Wrong password.' });
    }

    const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
    adminSessions.add(token);
    res.json({ token });
  });

  app.post('/api/admin/logout', requireAdmin, (req, res) => {
    const token = req.headers['x-admin-token'] as string;
    adminSessions.delete(token);
    res.json({ success: true });
  });

  app.post('/api/admin/password', requireAdmin, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing current or new password.' });
    }

    const row = db.prepare("SELECT value FROM settings WHERE key = 'admin_password'").get() as { value: string };
    
    if (!row || !bcrypt.compareSync(currentPassword, row.value)) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    db.prepare("UPDATE settings SET value = ? WHERE key = 'admin_password'").run(hashedNewPassword);
    
    res.json({ success: true });
  });

  // ── Admin API (all protected) ───────────────────────────────────────────────

  // All bookings with room names joined
  app.get('/api/admin/bookings', requireAdmin, (req, res) => {
    const { room_id, date } = req.query;
    let query = `
      SELECT b.id, b.user_name, b.phone, b.start_time, b.end_time,
             r.name as room_name, r.id as room_id
      FROM bookings b
      JOIN rooms r ON b.room_id = r.id
    `;
    const conditions: string[] = [];
    const params: any[] = [];

    if (room_id) {
      conditions.push('b.room_id = ?');
      params.push(room_id);
    }
    if (date) {
      conditions.push("date(b.start_time) = ?");
      params.push(date);
    }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY b.start_time ASC';

    res.json(db.prepare(query).all(...params));
  });

  // Cancel (delete) a booking — admin only
  app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
    const { id } = req.params;
    db.prepare('DELETE FROM bookings WHERE id = ?').run(id);
    broadcast({ type: 'BOOKING_DELETED', bookingId: Number(id) });
    res.json({ success: true });
  });

  // Stats for the dashboard
  app.get('/api/admin/stats', requireAdmin, (_req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const total = (db.prepare('SELECT COUNT(*) as c FROM bookings').get() as any).c;
    const today = (db.prepare("SELECT COUNT(*) as c FROM bookings WHERE date(start_time) = ?").get(todayStr) as any).c;
    const upcoming = (db.prepare("SELECT COUNT(*) as c FROM bookings WHERE start_time >= datetime('now')").get() as any).c;
    res.json({ total, today, upcoming });
  });

  // ── Vite / static ──────────────────────────────────────────────────────────
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ The Shed server running on http://localhost:${PORT}`);
    console.log(`🔑 Admin panel: http://localhost:${PORT}/admin`);
  });
}

startServer();
