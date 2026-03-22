const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const Database = require('better-sqlite3');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'anadhaan-secret-key-change-in-prod';

// Database setup
const db = new Database(path.join(__dirname, 'anadhaan.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS food_spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    location TEXT NOT NULL,
    photo TEXT,
    people_count INTEGER NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);

// Multer config for photo uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only images allowed'));
    cb(null, true);
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Auth middleware
function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ── Auth Routes ──────────────────────────────────────────────────────────────

app.post('/api/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password)
    return res.status(400).json({ error: 'All fields required' });
  if (password.length < 6)
    return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const hash = bcrypt.hashSync(password, 10);
  try {
    const stmt = db.prepare('INSERT INTO users (username, email, password) VALUES (?, ?, ?)');
    const result = stmt.run(username.trim(), email.trim().toLowerCase(), hash);
    const token = jwt.sign({ id: result.lastInsertRowid, username: username.trim() }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, username: username.trim() });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      return res.status(409).json({ error: 'Username or email already exists' });
    }
    res.status(500).json({ error: 'Registration failed' });
  }
});

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.trim().toLowerCase());
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });

  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, username: user.username });
});

app.get('/api/me', auth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

// ── Food Spot Routes ──────────────────────────────────────────────────────────

app.get('/api/spots', (req, res) => {
  const now = new Date().toISOString();
  const spots = db.prepare(`
    SELECT fs.*, u.username
    FROM food_spots fs
    JOIN users u ON fs.user_id = u.id
    WHERE fs.expires_at > ?
    ORDER BY fs.created_at DESC
  `).all(now);
  res.json(spots);
});

app.get('/api/spots/:id', (req, res) => {
  const spot = db.prepare(`
    SELECT fs.*, u.username
    FROM food_spots fs
    JOIN users u ON fs.user_id = u.id
    WHERE fs.id = ?
  `).get(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Not found' });
  res.json(spot);
});

app.post('/api/spots', auth, upload.single('photo'), (req, res) => {
  const { title, description, location, people_count, expires_at } = req.body;
  if (!title || !description || !location || !people_count || !expires_at)
    return res.status(400).json({ error: 'All fields required' });

  const expiresDate = new Date(expires_at);
  if (isNaN(expiresDate.getTime()) || expiresDate <= new Date())
    return res.status(400).json({ error: 'Expiry must be a future date/time' });

  const photo = req.file ? `/uploads/${req.file.filename}` : null;
  const stmt = db.prepare(`
    INSERT INTO food_spots (user_id, title, description, location, photo, people_count, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(req.user.id, title.trim(), description.trim(), location.trim(), photo, parseInt(people_count), expiresDate.toISOString());
  const spot = db.prepare('SELECT fs.*, u.username FROM food_spots fs JOIN users u ON fs.user_id = u.id WHERE fs.id = ?').get(result.lastInsertRowid);
  res.status(201).json(spot);
});

app.delete('/api/spots/:id', auth, (req, res) => {
  const spot = db.prepare('SELECT * FROM food_spots WHERE id = ?').get(req.params.id);
  if (!spot) return res.status(404).json({ error: 'Not found' });
  if (spot.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  if (spot.photo) {
    const filePath = path.join(__dirname, spot.photo);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  db.prepare('DELETE FROM food_spots WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── Frontend ──────────────────────────────────────────────────────────────────

app.get('/{*path}', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => console.log(`Anadhaan running on http://localhost:${PORT}`));
