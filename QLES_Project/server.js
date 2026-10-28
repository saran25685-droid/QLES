const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const dataDir = path.join(__dirname, 'data');
fs.mkdirSync(dataDir, { recursive: true });

const db = new sqlite3.Database(path.join(dataDir, 'qles.sqlite'));
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'patient' CHECK(role IN ('patient','admin')),
    phone TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS hospitals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    city TEXT NOT NULL,
    address TEXT NOT NULL,
    description TEXT DEFAULT ''
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS doctors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    hospital_id INTEGER NOT NULL REFERENCES hospitals(id),
    name TEXT NOT NULL,
    specialty TEXT NOT NULL,
    room TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Available',
    avg_minutes INTEGER NOT NULL DEFAULT 10,
    current_token INTEGER NOT NULL DEFAULT 0,
    next_token INTEGER NOT NULL DEFAULT 1,
    schedule TEXT NOT NULL DEFAULT '09:00 AM - 01:00 PM'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id),
    doctor_id INTEGER NOT NULL REFERENCES doctors(id),
    visit_date TEXT NOT NULL,
    token_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'Booked' CHECK(status IN ('Booked','Cancelled','Completed')),
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(doctor_id, visit_date, token_number)
  )`);

  seed();
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve({ id: this.lastID, changes: this.changes });
  }));
}
function get(sql, params = []) {
  return new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row)));
}
function all(sql, params = []) {
  return new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows)));
}
async function seed() {
  try {
    const count = await get('SELECT COUNT(*) AS n FROM hospitals');
    if (count.n === 0) {
      const h1 = await run('INSERT INTO hospitals(name,city,address,description) VALUES(?,?,?,?)',
        ['Green Valley Multispeciality Hospital', 'Coimbatore', '12 Avinashi Road, Coimbatore', 'Multispeciality care with outpatient consultations.']);
      const h2 = await run('INSERT INTO hospitals(name,city,address,description) VALUES(?,?,?,?)',
        ['Sunrise Community Hospital', 'Erode', '48 Perundurai Road, Erode', 'Community-focused general and specialist clinics.']);
      const h3 = await run('INSERT INTO hospitals(name,city,address,description) VALUES(?,?,?,?)',
        ['Riverbend Medical Centre', 'Sathyamangalam', '6 Bannari Road, Sathyamangalam', 'Outpatient clinics and family healthcare.']);
      const doctors = [
        [h1.id, 'Dr. Meera Krishnan', 'Cardiology', 'Room 204', 'Available', 12, 8, 9, '09:00 AM - 01:00 PM'],
        [h1.id, 'Dr. Arjun Raman', 'General Medicine', 'Room 108', 'Consulting', 10, 14, 15, '09:00 AM - 02:00 PM'],
        [h1.id, 'Dr. Nithya Bose', 'Dermatology', 'Room 302', 'Available', 15, 3, 4, '10:00 AM - 01:00 PM'],
        [h2.id, 'Dr. Karthik Selvan', 'Orthopedics', 'Room 12', 'Available', 15, 5, 6, '09:30 AM - 01:30 PM'],
        [h2.id, 'Dr. Priya Anand', 'Pediatrics', 'Room 17', 'On Break', 12, 11, 12, '09:00 AM - 12:30 PM'],
        [h3.id, 'Dr. V. Sanjay', 'General Medicine', 'Room 5', 'Available', 10, 2, 3, '09:00 AM - 01:00 PM'],
        [h3.id, 'Dr. Farah Iqbal', 'ENT', 'Room 9', 'Unavailable', 12, 0, 1, '10:00 AM - 12:00 PM']
      ];
      for (const d of doctors) await run(
        'INSERT INTO doctors(hospital_id,name,specialty,room,status,avg_minutes,current_token,next_token,schedule) VALUES(?,?,?,?,?,?,?,?,?)', d);
    }
    const admin = await get('SELECT id FROM users WHERE email=?', ['admin@qles.demo']);
    if (!admin) await run('INSERT INTO users(name,email,password_hash,role,phone) VALUES(?,?,?,?,?)',
      ['QLES Administrator', 'admin@qles.demo', bcrypt.hashSync('Admin123!', 10), 'admin', '9000000000']);
    const patient = await get('SELECT id FROM users WHERE email=?', ['patient@qles.demo']);
    if (!patient) {
      const p = await run('INSERT INTO users(name,email,password_hash,role,phone) VALUES(?,?,?,?,?)',
        ['Demo Patient', 'patient@qles.demo', bcrypt.hashSync('Patient123!', 10), 'patient', '9000000001']);
      const doc = await get('SELECT id FROM doctors ORDER BY id LIMIT 1');
      const today = new Date().toISOString().slice(0, 10);
      const existing = await get('SELECT id FROM bookings WHERE user_id=? AND doctor_id=? AND visit_date=?', [p.id, doc.id, today]);
      if (!existing) await run('INSERT INTO bookings(user_id,doctor_id,visit_date,token_number,status) VALUES(?,?,?,?,?)',
        [p.id, doc.id, today, 10, 'Booked']);
    }
    // Add realistic demo queue bookings for today's queue, without touching existing user bookings.
    const today = new Date().toISOString().slice(0, 10);
    const doctorsRows = await all('SELECT id, current_token FROM doctors');
    for (const d of doctorsRows) {
      const existingCount = await get('SELECT COUNT(*) AS n FROM bookings WHERE doctor_id=? AND visit_date=?', [d.id, today]);
      if (existingCount.n < 3) {
        for (let i = 1; i <= 3; i++) {
          const token = Math.max(d.current_token + i, 1);
          const found = await get('SELECT id FROM bookings WHERE doctor_id=? AND visit_date=? AND token_number=?', [d.id, today, token]);
          if (!found) {
            const demoUser = await get('SELECT id FROM users WHERE email=?', ['patient@qles.demo']);
            if (demoUser) await run('INSERT OR IGNORE INTO bookings(user_id,doctor_id,visit_date,token_number,status) VALUES(?,?,?,?,?)',
              [demoUser.id, d.id, today, token, 'Booked']);
          }
        }
      }
    }
  } catch (e) {
    console.error('Database seed error:', e.message);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  store: new SQLiteStore({ db: 'sessions.sqlite', dir: dataDir }),
  secret: process.env.SESSION_SECRET || 'change-this-qles-demo-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'Please sign in to continue.' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user || req.session.user.role !== 'admin') return res.status(403).json({ error: 'Administrator access required.' });
  next();
}
function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role, phone: user.phone || '' };
}

app.get('/api/session', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, phone = '' } = req.body;
    if (!name?.trim() || !email?.trim() || !password) return res.status(400).json({ error: 'Name, email, and password are required.' });
    if (password.length < 8) return res.status(400).json({ error: 'Password must contain at least 8 characters.' });
    if (String(email).length > 180 || String(name).length > 100) return res.status(400).json({ error: 'Input is too long.' });
    const result = await run('INSERT INTO users(name,email,password_hash,role,phone) VALUES(?,?,?,?,?)',
      [name.trim(), email.trim().toLowerCase(), bcrypt.hashSync(password, 10), 'patient', String(phone).slice(0, 30)]);
    const user = await get('SELECT id,name,email,role,phone FROM users WHERE id=?', [result.id]);
    req.session.user = publicUser(user);
    res.json({ user: req.session.user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'An account with that email already exists.' });
    res.status(500).json({ error: 'Could not create account.' });
  }
});
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Enter your email and password.' });
  const user = await get('SELECT * FROM users WHERE email=?', [String(email).trim().toLowerCase()]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Incorrect email or password.' });
  req.session.user = publicUser(user);
  res.json({ user: req.session.user });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/hospitals', async (req, res) => {
  const hospitals = await all(`SELECT h.*, COUNT(d.id) AS doctor_count FROM hospitals h
    LEFT JOIN doctors d ON d.hospital_id=h.id GROUP BY h.id ORDER BY h.name`);
  res.json(hospitals);
});
app.get('/api/doctors', async (req, res) => {
  const { search = '', specialty = '', status = '', hospital = '' } = req.query;
  let sql = `SELECT d.*, h.name AS hospital_name, h.city AS hospital_city, h.address AS hospital_address,
    (SELECT COUNT(*) FROM bookings b WHERE b.doctor_id=d.id AND b.visit_date=date('now','localtime') AND b.status='Booked' AND b.token_number>d.current_token) AS waiting_count
    FROM doctors d JOIN hospitals h ON h.id=d.hospital_id WHERE 1=1`;
  const params = [];
  if (search) { sql += ' AND (d.name LIKE ? OR h.name LIKE ? OR h.city LIKE ?)'; params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  if (specialty) { sql += ' AND d.specialty=?'; params.push(specialty); }
  if (status) { sql += ' AND d.status=?'; params.push(status); }
  if (hospital) { sql += ' AND d.hospital_id=?'; params.push(Number(hospital)); }
  sql += ' ORDER BY CASE d.status WHEN "Available" THEN 0 WHEN "Consulting" THEN 1 WHEN "On Break" THEN 2 ELSE 3 END, h.name, d.name';
  const rows = await all(sql, params);
  res.json(rows.map(d => ({
    ...d,
    estimated_wait: Math.max(0, d.waiting_count) * d.avg_minutes,
    live_source: 'SIMULATED DEMO DATA'
  })));
});
app.get('/api/bookings', requireAuth, async (req, res) => {
  const rows = await all(`SELECT b.*, d.name AS doctor_name, d.specialty, d.avg_minutes, d.current_token,
    h.name AS hospital_name, h.city AS hospital_city
    FROM bookings b JOIN doctors d ON d.id=b.doctor_id JOIN hospitals h ON h.id=d.hospital_id
    WHERE b.user_id=? ORDER BY b.created_at DESC`, [req.session.user.id]);
  const today = new Date().toISOString().slice(0, 10);
  res.json(rows.map(b => ({
    ...b,
    queue_position: b.status === 'Booked' && b.visit_date === today ? Math.max(0, b.token_number - b.current_token - 1) : null,
    estimated_wait: b.status === 'Booked' && b.visit_date === today ? Math.max(0, b.token_number - b.current_token - 1) * b.avg_minutes : null
  })));
});
app.post('/api/bookings', requireAuth, async (req, res) => {
  const { doctor_id, visit_date } = req.body;
  if (!doctor_id || !visit_date || !/^\d{4}-\d{2}-\d{2}$/.test(visit_date)) return res.status(400).json({ error: 'Choose a doctor and a valid visit date.' });
  const date = new Date(`${visit_date}T00:00:00`);
  const today = new Date(); today.setHours(0,0,0,0);
  if (Number.isNaN(date.getTime()) || date < today) return res.status(400).json({ error: 'Please choose today or a future date.' });
  const doctor = await get('SELECT * FROM doctors WHERE id=?', [Number(doctor_id)]);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  if (doctor.status === 'Unavailable') return res.status(400).json({ error: 'This doctor is currently unavailable for new bookings.' });
  const already = await get(`SELECT id FROM bookings WHERE user_id=? AND doctor_id=? AND visit_date=? AND status='Booked'`,
    [req.session.user.id, doctor.id, visit_date]);
  if (already) return res.status(409).json({ error: 'You already have an active booking with this doctor on that date.' });
  const last = await get('SELECT MAX(token_number) AS max_token FROM bookings WHERE doctor_id=? AND visit_date=?', [doctor.id, visit_date]);
  const token = Math.max(Number(last?.max_token || 0), Number(doctor.next_token) - 1) + 1;
  try {
    await run('INSERT INTO bookings(user_id,doctor_id,visit_date,token_number,status) VALUES(?,?,?,?,?)',
      [req.session.user.id, doctor.id, visit_date, token, 'Booked']);
    if (visit_date === new Date().toISOString().slice(0,10)) await run('UPDATE doctors SET next_token=MAX(next_token, ?) WHERE id=?', [token + 1, doctor.id]);
    res.json({ ok: true, token_number: token, message: `Your token number is ${token}.` });
  } catch (e) { res.status(500).json({ error: 'Booking could not be completed. Please refresh and try again.' }); }
});
app.post('/api/bookings/:id/cancel', requireAuth, async (req, res) => {
  const booking = await get('SELECT * FROM bookings WHERE id=? AND user_id=?', [Number(req.params.id), req.session.user.id]);
  if (!booking) return res.status(404).json({ error: 'Booking not found.' });
  if (booking.status !== 'Booked') return res.status(400).json({ error: 'Only active bookings can be cancelled.' });
  await run('UPDATE bookings SET status=? WHERE id=?', ['Cancelled', booking.id]);
  res.json({ ok: true, message: 'Your token has been cancelled.' });
});

app.get('/api/admin/summary', requireAdmin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const [patients, doctors, active, served] = await Promise.all([
    get("SELECT COUNT(*) AS n FROM users WHERE role='patient'"),
    get('SELECT COUNT(*) AS n FROM doctors'),
    get("SELECT COUNT(*) AS n FROM bookings WHERE visit_date=? AND status='Booked'", [today]),
    get("SELECT COUNT(*) AS n FROM bookings WHERE visit_date=? AND status='Completed'", [today])
  ]);
  res.json({ patients: patients.n, doctors: doctors.n, active_bookings: active.n, served_today: served.n, demo: true });
});
app.get('/api/admin/bookings', requireAdmin, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  res.json(await all(`SELECT b.*, u.name AS patient_name, u.email AS patient_email, d.name AS doctor_name,
    d.specialty, h.name AS hospital_name FROM bookings b JOIN users u ON u.id=b.user_id
    JOIN doctors d ON d.id=b.doctor_id JOIN hospitals h ON h.id=d.hospital_id
    WHERE b.visit_date=? ORDER BY h.name,d.name,b.token_number`, [today]));
});
app.patch('/api/admin/doctors/:id', requireAdmin, async (req, res) => {
  const allowed = ['Available', 'Consulting', 'On Break', 'Unavailable'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ error: 'Invalid doctor status.' });
  const result = await run('UPDATE doctors SET status=? WHERE id=?', [req.body.status, Number(req.params.id)]);
  if (!result.changes) return res.status(404).json({ error: 'Doctor not found.' });
  res.json({ ok: true });
});
app.post('/api/admin/doctors/:id/serve-next', requireAdmin, async (req, res) => {
  const doctor = await get('SELECT * FROM doctors WHERE id=?', [Number(req.params.id)]);
  if (!doctor) return res.status(404).json({ error: 'Doctor not found.' });
  const today = new Date().toISOString().slice(0, 10);
  const next = await get(`SELECT * FROM bookings WHERE doctor_id=? AND visit_date=? AND status='Booked' AND token_number>? ORDER BY token_number LIMIT 1`,
    [doctor.id, today, doctor.current_token]);
  if (!next) return res.status(404).json({ error: 'No active patient is waiting in today’s queue.' });
  await run("UPDATE bookings SET status='Completed' WHERE id=?", [next.id]);
  await run('UPDATE doctors SET current_token=?, status=? WHERE id=?', [next.token_number, 'Available', doctor.id]);
  res.json({ ok: true, message: `Token ${next.token_number} marked as served.` });
});

app.get('/api/health', (req, res) => res.json({ ok: true, mode: 'demo', liveHospitalIntegration: false }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => console.log(`QLES running at http://localhost:${PORT}`));
