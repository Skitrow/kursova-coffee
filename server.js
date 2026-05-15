require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "super_secret_rgr_key";

const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://coffee_user:coffee_pass@localhost:5432/coffee_db"
});

// MIDDLEWARE
function authenticateToken(req, res, next) {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Доступ заборонено." });
    jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Недійсний токен." });
        req.user = user;
        next();
    });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) return res.status(403).json({ error: "Доступ заборонено." });
        next();
    };
}

// АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, phone, role } = req.body;
        const status = (role === 'franchisee') ? 'pending' : 'approved';
        const result = await pool.query(
            'INSERT INTO users (name, email, password, phone, role, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
            [name, email, password, phone, role || 'franchisee', status]
        );
        res.status(201).json({ id: result.rows[0].id, message: "Заявку відправлено. Очікуйте схвалення адміністратором." });
    } catch (err) {
        if (err.code === '23505') return res.status(400).json({ error: 'Email вже зареєстровано.' });
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Користувача не знайдено!' });
        if (user.password !== req.body.password) return res.status(401).json({ error: 'Невірний пароль!' });
        if (user.status !== 'approved') return res.status(403).json({ error: `Ваш статус: ${user.status}. Очікуйте схвалення.` });
        
        const token = jwt.sign({ id: user.id, role: user.role, name: user.name }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ token, role: user.role, name: user.name, id: user.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// КЕРУВАННЯ КОРИСТУВАЧАМИ (АДМІН)
app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, phone, role, status, created_at FROM users ORDER BY created_at DESC');
        res.json(result.rows.map(u => ({ ...u, _id: u.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/users/:id', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ЗАМОВЛЕННЯ АПАРАТІВ
app.post('/api/machine-requests', authenticateToken, requireRole('franchisee'), async (req, res) => {
    try {
        const { model } = req.body;
        await pool.query('INSERT INTO machine_requests (franchisee_id, model_requested) VALUES ($1, $2)', [req.user.id, model]);
        res.status(201).json({ message: "Запит надіслано." });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/machine-requests', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT r.*, u.name as franchisee_name FROM machine_requests r JOIN users u ON r.franchisee_id = u.id ORDER BY r.created_at DESC');
        res.json(result.rows.map(r => ({ ...r, _id: r.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// РЕШТА ЕНДПОІНТІВ (ДАШБОРД, МАШИНИ ТА ІНШЕ)
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const mCount = (await pool.query('SELECT COUNT(*) FROM coffee_machines')).rows[0].count;
        const uCount = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const eCount = (await pool.query('SELECT COUNT(*) FROM telemetry_logs WHERE has_error = true')).rows[0].count;
        const tCount = (await pool.query("SELECT COUNT(*) FROM maintenance_tasks WHERE status != 'виконано'")).rows[0].count;
        const oTotal = (await pool.query('SELECT SUM(total_price) FROM orders')).rows[0].sum || 0;
        res.json({ machinesCount: parseInt(mCount), usersCount: parseInt(uCount), errorsCount: parseInt(eCount), pendingTasks: parseInt(tCount), ordersTotal: parseFloat(oTotal) });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/machines', authenticateToken, async (req, res) => {
    try {
        let q = 'SELECT * FROM coffee_machines'; let p = [];
        if (req.user.role === 'franchisee') { q += ' WHERE franchisee_id = $1'; p.push(req.user.id); }
        const resDb = await pool.query(q, p);
        res.json(resDb.rows.map(m => ({ ...m, _id: m.id, location: { city: m.city, address: m.address, place_type: m.place_type } })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/machines', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { model, serial_number, location, franchisee_id } = req.body;
        const result = await pool.query('INSERT INTO coffee_machines (model, serial_number, city, address, place_type, franchisee_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id', [model, serial_number, location.city, location.address, location.place_type, franchisee_id, 'active']);
        res.status(201).json({ _id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ingredients', authenticateToken, async (req, res) => {
    try {
        const resDb = await pool.query('SELECT * FROM ingredients');
        res.json(resDb.rows.map(i => ({ ...i, _id: i.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        let q = 'SELECT * FROM orders'; let p = [];
        if (req.user.role === 'franchisee') { q += ' WHERE franchisee_id = $1'; p.push(req.user.id); }
        const resDb = await pool.query(q + ' ORDER BY order_date DESC', p);
        res.json(resDb.rows.map(o => ({ ...o, _id: o.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/telemetry/errors', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM telemetry_logs WHERE has_error = true ORDER BY timestamp DESC LIMIT 50');
        res.json(result.rows.map(l => ({ ...l, _id: l.id, sensors: { water_level_percent: l.water_level_percent, coffee_beans_percent: l.coffee_beans_percent, cups_count: l.cups_count } })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
    try { await pool.query('SELECT 1'); console.log(`🚀 Сервер: http://localhost:${PORT}`); } catch(e) { console.error('DB error', e); }
});

module.exports = { app, pool };