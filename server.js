require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Роздача фронтенду
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "super_secret_rgr_key";

// Підключення до PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || "postgres://coffee_user:coffee_pass@localhost:5432/coffee_db"
});

// ==========================================
// MIDDLEWARE
// ==========================================
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

// ==========================================
// АВТОРИЗАЦІЯ ТА РЕЄСТРАЦІЯ
// ==========================================
app.post('/api/register', async (req, res) => {
    try {
        const { name, email, phone, role } = req.body;
        const status = role === 'franchisee' ? 'pending' : 'approved';
        const result = await pool.query(
            'INSERT INTO users (name, email, phone, role, status) VALUES ($1, $2, $3, $4, $5) RETURNING id',
            [name, email, phone || '', role || 'franchisee', status]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Реєстрація успішна.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM users WHERE email = $1', [req.body.email]);
        const user = result.rows[0];
        if (!user) return res.status(401).json({ error: 'Користувача не знайдено!' });
        
        if (user.status === 'pending') return res.status(403).json({ error: 'Ваш акаунт на модерації. Дочекайтеся схвалення.' });
        if (user.status === 'rejected') return res.status(403).json({ error: 'Ваш акаунт відхилено адміністратором.' });

        const token = jwt.sign({ id: user.id, role: user.role, name: user.name, status: user.status }, SECRET_KEY, { expiresIn: '8h' });
        res.json({ token, role: user.role, name: user.name, id: user.id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// КОРИСТУВАЧІ
// ==========================================
app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query('SELECT id, name, email, phone, role, status, created_at FROM users');
        res.json(result.rows.map(u => ({ ...u, _id: u.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/users/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE users SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true, status: req.body.status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// ДАШБОРД
// ==========================================
app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
    try {
        const machinesCount = (await pool.query('SELECT COUNT(*) FROM coffee_machines')).rows[0].count;
        const usersCount = (await pool.query('SELECT COUNT(*) FROM users')).rows[0].count;
        const errorsCount = (await pool.query('SELECT COUNT(*) FROM telemetry_logs WHERE has_error = true')).rows[0].count;
        const pendingTasks = (await pool.query("SELECT COUNT(*) FROM maintenance_tasks WHERE status != 'виконано'")).rows[0].count;
        const ordersTotal = (await pool.query('SELECT SUM(total_price) FROM orders')).rows[0].sum || 0;
        
        res.json({ 
            machinesCount: parseInt(machinesCount), 
            usersCount: parseInt(usersCount), 
            errorsCount: parseInt(errorsCount), 
            pendingTasks: parseInt(pendingTasks), 
            ordersTotal: parseFloat(ordersTotal) 
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// КАВОМАШИНИ ТА ЗАМОВЛЕННЯ АПАРАТІВ
// ==========================================
app.get('/api/machines', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT * FROM coffee_machines';
        let params = [];
        if (req.user.role === 'franchisee') { 
            query += ' WHERE franchisee_id = $1'; 
            params.push(req.user.id); 
        }
        const result = await pool.query(query, params);
        res.json(result.rows.map(m => ({ 
            ...m, 
            _id: m.id, 
            location: { city: m.city, address: m.address, place_type: m.place_type } 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/machines', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const { model, serial_number, location, franchisee_id } = req.body;
        const result = await pool.query(
            'INSERT INTO coffee_machines (model, serial_number, city, address, place_type, franchisee_id, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
            [model, serial_number, location?.city, location?.address, location?.place_type, franchisee_id, 'active']
        );
        res.status(201).json({ _id: result.rows[0].id });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/machines/:id/status', authenticateToken, requireRole('admin', 'technician'), async (req, res) => {
    try {
        await pool.query('UPDATE coffee_machines SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Заявки на кавомашини
app.post('/api/machine-requests', authenticateToken, requireRole('franchisee'), async (req, res) => {
    try {
        const { model_requested, comment } = req.body;
        const result = await pool.query(
            'INSERT INTO machine_requests (franchisee_id, model_requested, comment) VALUES ($1, $2, $3) RETURNING id',
            [req.user.id, model_requested, comment]
        );
        res.status(201).json({ id: result.rows[0].id, message: 'Заявку на апарат подано.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/machine-requests', authenticateToken, requireRole('admin', 'franchisee'), async (req, res) => {
    try {
        let query = 'SELECT mr.*, u.name as franchisee_name FROM machine_requests mr JOIN users u ON mr.franchisee_id = u.id';
        let params = [];
        if (req.user.role === 'franchisee') {
            query += ' WHERE mr.franchisee_id = $1';
            params.push(req.user.id);
        }
        query += ' ORDER BY mr.created_at DESC';
        const result = await pool.query(query, params);
        res.json(result.rows.map(r => ({ ...r, _id: r.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.patch('/api/machine-requests/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE machine_requests SET status = $1 WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true, status: req.body.status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// ТЕЛЕМЕТРІЯ, ЗАМОВЛЕННЯ ТА ІНШЕ
// ==========================================
app.get('/api/machines/:id/telemetry', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM telemetry_logs WHERE machine_id = $1 ORDER BY timestamp DESC LIMIT 10', [req.params.id]);
        res.json(result.rows.map(l => ({ 
            ...l, 
            _id: l.id, 
            sensors: { water_level_percent: l.water_level_percent, coffee_beans_percent: l.coffee_beans_percent, cups_count: l.cups_count } 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/telemetry/:machine_id', async (req, res) => {
    try {
        const { water_level_percent, coffee_beans_percent, cups_count, has_error, error_code } = req.body;
        await pool.query(
            'INSERT INTO telemetry_logs (machine_id, water_level_percent, coffee_beans_percent, cups_count, has_error, error_code) VALUES ($1, $2, $3, $4, $5, $6)', 
            [req.params.machine_id, water_level_percent, coffee_beans_percent, cups_count || 0, Boolean(has_error), error_code || null]
        );
        res.status(201).json({ message: "Saved" });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/telemetry/errors', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM telemetry_logs WHERE has_error = true ORDER BY timestamp DESC LIMIT 50');
        res.json(result.rows.map(l => ({ 
            ...l, 
            _id: l.id, 
            sensors: { water_level_percent: l.water_level_percent, coffee_beans_percent: l.coffee_beans_percent, cups_count: l.cups_count } 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT * FROM orders';
        let params = [];
        if (req.user.role === 'franchisee') { 
            query += ' WHERE franchisee_id = $1'; 
            params.push(req.user.id); 
        }
        const result = await pool.query(query + ' ORDER BY order_date DESC', params);
        res.json(result.rows.map(o => ({ ...o, _id: o.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/orders', authenticateToken, requireRole('franchisee', 'admin'), async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (!req.body.items || req.body.items.length === 0) return res.status(400).json({ error: "Порожнє замовлення." });

        const orderRes = await client.query(
            "INSERT INTO orders (franchisee_id, status, total_price) VALUES ($1, 'прийнято_в_обробку', $2) RETURNING id", 
            [req.user.id, req.body.total_price]
        );
        const orderId = orderRes.rows[0].id;

        for (let item of req.body.items) {
            await client.query(
                'INSERT INTO order_details (order_id, ingredient_id, quantity, price) VALUES ($1, $2, $3, $4)', 
                [orderId, item.ingredient_id, item.quantity, item.price]
            );
        }
        await client.query('COMMIT');
        res.status(201).json({ order_id: orderId, status: 'прийнято_в_обробку' });
    } catch (err) { 
        await client.query('ROLLBACK'); 
        res.status(500).json({ error: err.message }); 
    } finally { 
        client.release(); 
    }
});

app.patch('/api/orders/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        await pool.query('UPDATE orders SET status = $1, updated_at = current_timestamp WHERE id = $2', [req.body.status, req.params.id]);
        res.json({ success: true, status: req.body.status });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/ingredients', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM ingredients');
        res.json(result.rows.map(i => ({ ...i, _id: i.id })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/maintenance-tasks', authenticateToken, async (req, res) => {
    try {
        let query = 'SELECT t.*, m.model, m.serial_number, m.city, m.address FROM maintenance_tasks t LEFT JOIN coffee_machines m ON t.machine_id = m.id';
        let params = [];
        if (req.user.role === 'technician') { 
            query += ' WHERE t.technician_id = $1'; 
            params.push(req.user.id); 
        }
        const result = await pool.query(query + ' ORDER BY t.assigned_at DESC', params);
        res.json(result.rows.map(r => ({ 
            ...r, 
            _id: r.id, 
            machine: { model: r.model, serial_number: r.serial_number, location: { city: r.city, address: r.address } } 
        })));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/royalty', authenticateToken, requireRole('admin'), async (req, res) => {
    try {
        const result = await pool.query("SELECT u.id as franchisee_id, u.name, u.email, COUNT(o.id) as orders_count, COALESCE(SUM(o.total_price), 0) as total_revenue FROM users u LEFT JOIN orders o ON u.id = o.franchisee_id WHERE u.role = 'franchisee' GROUP BY u.id");
        res.json(result.rows.map(r => {
            const totalRevenue = parseFloat(r.total_revenue);
            const royaltyAmount = totalRevenue * 0.08;
            return { 
                franchisee_id: r.franchisee_id, name: r.name, email: r.email, 
                ordersCount: parseInt(r.orders_count), totalRevenue, 
                royaltyAmount: parseFloat(royaltyAmount.toFixed(2)), 
                balance: parseFloat(royaltyAmount.toFixed(2)) 
            };
        }));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.listen(PORT, async () => {
    try { 
        await pool.query('SELECT 1'); 
        console.log(`🚀 PostgreSQL Сервер: http://localhost:${PORT}`); 
    } catch(e) { 
        console.error('DB error', e); 
    }
});

module.exports = { app, pool };
