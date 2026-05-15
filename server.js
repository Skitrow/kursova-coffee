require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "super_secret_rgr_key";
const pool = new Pool({ connectionString: process.env.DATABASE_URL || "postgres://coffee_user:coffee_pass@postgres:5432/coffee_db" });

function authenticateToken(req, res, next) {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Доступ заборонено." });
    jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Недійсний токен." });
        req.user = user; next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Доступ заборонено." });
        next();
    };
}

app.post('/api/login', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
        const user = rows[0];
        if (!user) return res.status(401).json({ error: 'Користувача не знайдено!' });
        if (user.status === 'pending') return res.status(403).json({ error: 'Акаунт очікує підтвердження адміністратором.' });
        if (user.status === 'blocked') return res.status(403).json({ error: 'Акаунт заблоковано.' });
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ token, role: user.role, name: user.name, id: user.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        await pool.query("INSERT INTO users (name, email, password, phone, role, status) VALUES ($1, $2, $3, $4, 'franchisee', 'pending')", [name, email, password || '123456', phone]);
        res.status(201).json({ message: "Заявку на реєстрацію відправлено." });
    } catch (err) { res.status(500).json({ error: "Помилка реєстрації. Можливо, email вже зайнятий." }); }
});

app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const m = (await pool.query('SELECT COUNT(*) FROM coffee_machines')).rows[0].count;
        const u = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const e = (await pool.query('SELECT COUNT(*) FROM telemetry_logs WHERE has_error = true')).rows[0].count;
        res.json({ machinesCount: parseInt(m), usersCount: parseInt(u), errorsCount: parseInt(e) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/machines', authenticateToken, async (req, res) => {
    try {
        let q = 'SELECT * FROM coffee_machines', p = [];
        if (req.user.role === 'franchisee') { q += ' WHERE franchisee_id = $1'; p.push(req.user.id); }
        const { rows } = await pool.query(q + ' ORDER BY id DESC', p);
        res.json(rows.map(m => ({ ...m, _id: m.id, location: { city: m.city, address: m.address, place_type: m.place_type } })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/machines/request', authenticateToken, requireRole('franchisee'), async (req, res) => {
    try {
        const { city, address, place_type } = req.body;
        const { rows } = await pool.query("INSERT INTO coffee_machines (city, address, place_type, franchisee_id, status) VALUES ($1, $2, $3, $4, 'requested') RETURNING id", [city, address, place_type, req.user.id]);
        res.status(201).json({ _id: rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/machines/:id/assign', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query("UPDATE coffee_machines SET model = $1, serial_number = $2, status = 'active' WHERE id = $3", [req.body.model, req.body.serial_number, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT id, name, email, phone, role, status, created_at FROM users ORDER BY id DESC');
        res.json(rows.map(u => ({ ...u, _id: u.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, () => console.log(`🚀 Сервер: ${PORT}`));
module.exports = { app, pool };