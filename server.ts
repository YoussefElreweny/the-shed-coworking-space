import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';
import path from 'path';
import { fileURLToPath } from 'url';
import 'dotenv/config';
import bcrypt from 'bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Initialization
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// ── Admin session store (in-memory, fine for single server) ──────────────────
const adminSessions = new Set<string>();

async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
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

  // Seed rooms and admin if they don't exist
  async function seedSystem() {
    console.log('🌱 Checking system seeding...');
    
    // 1. Seed Rooms
    const { data: existingRooms } = await supabase.from('rooms').select('id').limit(1);
    
    if (!existingRooms || existingRooms.length === 0) {
      console.log('📦 Seeding rooms...');
      const rooms = [
        { id: 1, name: 'Office Room', capacity: '1-3', price: 110, description: 'Modern space perfect for focused team sprints and client meetings.', image_url: '/images/room1.jpg' },
        { id: 2, name: 'Shared Room', capacity: '15-20', price: 300, description: 'Cozy environment surrounded by books, ideal for creative brainstorming sessions.', image_url: '/images/room2.jpg' },
        { id: 3, name: 'Meeting Room', capacity: '10-13', price: 200, description: 'Professional setup with high-end AV equipment, perfect for important presentations.', image_url: '/images/room3.jpg' },
        { id: 4, name: 'Cordia Room', capacity: '8-10', price: 170, description: 'Private and quiet corner perfect for one-on-one sessions or deep focused work.', image_url: '/images/room4.jpg' }
      ];
      await supabase.from('rooms').insert(rooms);
    }

    // 2. Seed Admin Password
    const { data: existingPassword } = await supabase.from('admin_settings').select('value').eq('key', 'admin_password').single();
    if (!existingPassword) {
      console.log('🔑 Seeding admin password...');
      const defaultPassword = process.env.ADMIN_PASSWORD || 'shed-admin-2024';
      const hashedPassword = bcrypt.hashSync(defaultPassword, 10);
      await supabase.from('admin_settings').insert({ key: 'admin_password', value: hashedPassword });
    }
    console.log('✅ Seeding check complete.');
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  app.get('/api/rooms', async (_req, res) => {
    const { data, error } = await supabase.from('rooms').select('*');
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get('/api/bookings', async (req, res) => {
    const { start, end } = req.query;
    if (!start || !end) return res.status(400).json({ error: 'start and end required' });
    
    const { data, error } = await supabase
      .from('bookings')
      .select('*')
      .gte('start_time', start)
      .lte('start_time', end);

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post('/api/bookings', async (req, res) => {
    const { room_id, user_name, phone, start_time, end_time } = req.body;
    if (!room_id || !user_name || !start_time || !end_time) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    // Conflict Check
    const { data: conflict, error: conflictError } = await supabase
      .from('bookings')
      .select('*')
      .eq('room_id', room_id)
      .lt('start_time', end_time)
      .gt('end_time', start_time)
      .maybeSingle();

    if (conflictError) return res.status(500).json({ error: conflictError.message });
    if (conflict) return res.status(400).json({ error: 'This time slot is already booked.' });

    const { data, error } = await supabase
      .from('bookings')
      .insert({ room_id, user_name, phone: phone || null, start_time, end_time })
      .select()
      .single();

    if (error) return res.status(500).json({ error: error.message });

    broadcast({ type: 'BOOKING_CREATED', booking: data });
    res.status(201).json(data);
  });

  // ── Admin Auth ──────────────────────────────────────────────────────────────

  app.post('/api/admin/login', async (req, res) => {
    const { password } = req.body;
    if (!password) {
      return res.status(401).json({ error: 'Password required.' });
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_password')
      .single();
    
    if (error || !data || !bcrypt.compareSync(password, data.value)) {
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

  app.post('/api/admin/password', requireAdmin, async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Missing current or new password.' });
    }

    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'admin_password')
      .single();
    
    if (error || !data || !bcrypt.compareSync(currentPassword, data.value)) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const hashedNewPassword = bcrypt.hashSync(newPassword, 10);
    const { error: updateError } = await supabase
      .from('admin_settings')
      .update({ value: hashedNewPassword })
      .eq('key', 'admin_password');
    
    if (updateError) return res.status(500).json({ error: updateError.message });
    res.json({ success: true });
  });

  // ── Admin API (all protected) ───────────────────────────────────────────────

  app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
    const { room_id, date } = req.query;
    let query = supabase
      .from('bookings')
      .select(`
        id, user_name, phone, start_time, end_time,
        rooms ( name, id )
      `)
      .order('start_time', { ascending: true });

    if (room_id) query = query.eq('room_id', room_id);
    if (date) {
      // Postgres date check
      query = query.gte('start_time', `${date}T00:00:00Z`).lte('start_time', `${date}T23:59:59Z`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    
    // Flatten result to match frontend expectation
    const flattened = (data as any[]).map(b => ({
      ...b,
      room_name: b.rooms.name,
      room_id: b.rooms.id
    }));

    res.json(flattened);
  });

  app.delete('/api/admin/bookings/:id', requireAdmin, async (req, res) => {
    const { id } = req.params;
    const { error } = await supabase.from('bookings').delete().eq('id', id);
    if (error) return res.status(500).json({ error: error.message });
    
    broadcast({ type: 'BOOKING_DELETED', bookingId: id });
    res.json({ success: true });
  });

  app.get('/api/admin/stats', requireAdmin, async (_req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    
    const { count: total } = await supabase.from('bookings').select('*', { count: 'exact', head: true });
    const { count: today } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
      .gte('start_time', `${todayStr}T00:00:00Z`).lte('start_time', `${todayStr}T23:59:59Z`);
    const { count: upcoming } = await supabase.from('bookings').select('*', { count: 'exact', head: true })
      .gte('start_time', new Date().toISOString());

    res.json({ total: total || 0, today: today || 0, upcoming: upcoming || 0 });
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

  // ── Database Maintenance (Daily Snapshot) ──────────────────────────────────
  async function performMaintenance() {
    console.log('🧹 Running database maintenance...');
    try {
      // Delete bookings older than 1 year (rolling)
      const oneYearAgo = new Date();
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
      
      const { error, count } = await supabase
        .from('bookings')
        .delete({ count: 'exact' })
        .lt('start_time', oneYearAgo.toISOString());

      if (error) throw error;
      if (count && count > 0) {
        console.log(`🗑️ Deleted ${count} old bookings from Supabase.`);
      } else {
        console.log('✅ No old bookings to delete.');
      }
    } catch (err) {
      console.error('❌ Maintenance failed:', err);
    }
  }

  // Initial Seed
  await seedSystem();
  
  // Run maintenance on startup and every 24 hours
  performMaintenance();
  setInterval(performMaintenance, 1000 * 60 * 60 * 24);

  const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ The Shed server running on http://localhost:${PORT}`);
    console.log(`🔑 Admin panel: http://localhost:${PORT}/admin`);
  });
}

startServer();

