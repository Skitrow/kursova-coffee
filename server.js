require('dotenv').config();
const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

// Роздача фронтенду (index.html)
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// MongoDB URI: беремо з .env або використовуємо локальну БД з Docker
const uri = process.env.MONGO_URI || "mongodb://mongodb:27017/coffee_franchise_db";
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "super_secret_rgr_key";

const client = new MongoClient(uri);

// ==========================================
// MIDDLEWARE: Перевірка JWT токена
// ==========================================
function authenticateToken(req, res, next) {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ error: "Доступ заборонено. Немає токена." });

    jwt.verify(token.replace("Bearer ", ""), SECRET_KEY, (err, user) => {
        if (err) return res.status(403).json({ error: "Недійсний або прострочений токен." });
        req.user = user;
        next();
    });
}

// MIDDLEWARE: Перевірка ролі (один або більше дозволених ролей)
function requireRole(...roles) {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Доступ дозволений тільки для: ${roles.join(', ')}.` });
        }
        next();
    };
}

async function startServer() {
    try {
        await client.connect();
        console.log("✅ Підключено до MongoDB!");
        const db = client.db("coffee_franchise_db");

        // ==========================================
        // 1. АВТОРИЗАЦІЯ (LOGIN)
        // ==========================================
        app.post('/api/login', async (req, res) => {
            const { email } = req.body;

            const user = await db.collection('users').findOne({ email });
            if (!user) {
                return res.status(401).json({ error: 'Користувача з таким email не знайдено!' });
            }

            const token = jwt.sign(
                { id: user._id, role: user.role, name: user.name },
                SECRET_KEY,
                { expiresIn: '8h' }
            );

            res.json({ token, role: user.role, name: user.name, id: user._id });
        });

        // ==========================================
        // 2. ДАШБОРД
        // ==========================================
        app.get('/api/dashboard/stats', authenticateToken, async (req, res) => {
            const machinesCount = await db.collection('coffee_machines').countDocuments();
            const usersCount = await db.collection('users').countDocuments();
            const errorsCount = await db.collection('telemetry_logs').countDocuments({ has_error: true });
            const pendingTasks = await db.collection('maintenance_tasks').countDocuments({ status: { $ne: 'виконано' } });
            const ordersTotal = await db.collection('orders').aggregate([
                { $group: { _id: null, total: { $sum: "$total_price" } } }
            ]).toArray();

            res.json({
                machinesCount,
                usersCount,
                errorsCount,
                pendingTasks,
                ordersTotal: ordersTotal[0]?.total || 0
            });
        });

        // ==========================================
        // 3. КАВОМАШИНИ
        // ==========================================
        app.get('/api/machines', authenticateToken, async (req, res) => {
            let filter = {};
            if (req.user.role === 'franchisee') {
                filter = { franchisee_id: new ObjectId(req.user.id) };
            }
            const machines = await db.collection('coffee_machines').find(filter).toArray();
            res.json(machines);
        });

        app.get('/api/machines/:id/telemetry', authenticateToken, async (req, res) => {
            const log = await db.collection('telemetry_logs')
                .find({ machine_id: new ObjectId(req.params.id) })
                .sort({ timestamp: -1 })
                .limit(10)
                .toArray();
            res.json(log);
        });

        app.post('/api/telemetry/:machine_id', async (req, res) => {
            const { water_level_percent, coffee_beans_percent, cups_count, has_error, error_code } = req.body;

            if (water_level_percent === undefined || coffee_beans_percent === undefined) {
                return res.status(400).json({ error: "Відсутні обов'язкові поля sensors." });
            }

            const log = {
                machine_id: new ObjectId(req.params.machine_id),
                timestamp: new Date(),
                sensors: {
                    water_level_percent: Number(water_level_percent),
                    coffee_beans_percent: Number(coffee_beans_percent),
                    cups_count: Number(cups_count || 0)
                },
                has_error: Boolean(has_error),
                error_code: error_code || null
            };

            await db.collection('telemetry_logs').insertOne(log);

            if (has_error || water_level_percent < 15 || coffee_beans_percent < 15 || cups_count < 10) {
                const existing = await db.collection('maintenance_tasks').findOne({
                    machine_id: new ObjectId(req.params.machine_id),
                    status: { $in: ['нове', 'в_процесі'] }
                });
                if (!existing) {
                    const technician = await db.collection('users').findOne({ role: 'technician' });
                    await db.collection('maintenance_tasks').insertOne({
                        machine_id: new ObjectId(req.params.machine_id),
                        technician_id: technician?._id || null,
                        task_type: 'refill',
                        status: 'нове',
                        assigned_at: new Date(),
                        description: `Автоматичне завдання: вода ${water_level_percent}%, кава ${coffee_beans_percent}%, стакани ${cups_count}шт. ${error_code ? 'Помилка: ' + error_code : ''}`
                    });
                }
            }

            res.status(201).json({ message: "Telemetry data saved successfully", timestamp: log.timestamp });
        });

        // ==========================================
        // 4. ТЕЛЕМЕТРІЯ: ПОМИЛКИ
        // ==========================================
        app.get('/api/telemetry/errors', authenticateToken, async (req, res) => {
            const errors = await db.collection('telemetry_logs')
                .find({ has_error: true })
                .sort({ timestamp: -1 })
                .limit(50)
                .toArray();
            res.json(errors);
        });

        // ==========================================
        // 5. ЗАМОВЛЕННЯ ІНГРЕДІЄНТІВ
        // ==========================================
        app.get('/api/orders', authenticateToken, async (req, res) => {
            let filter = {};
            if (req.user.role === 'franchisee') {
                filter = { franchisee_id: new ObjectId(req.user.id) };
            }
            const orders = await db.collection('orders').find(filter).sort({ order_date: -1 }).toArray();
            res.json(orders);
        });

        app.post('/api/orders', authenticateToken, requireRole('franchisee', 'admin'), async (req, res) => {
            const { items, total_price } = req.body;

            if (!items || !Array.isArray(items) || items.length === 0) {
                return res.status(400).json({ error: "Список товарів не може бути порожнім." });
            }

            const order = {
                franchisee_id: new ObjectId(req.user.id),
                order_date: new Date(),
                status: 'прийнято_в_обробку',
                total_price: Number(total_price),
                order_details: items.map(i => ({
                    ingredient_id: new ObjectId(i.ingredient_id),
                    quantity: Number(i.quantity),
                    price: Number(i.price)
                }))
            };

            const result = await db.collection('orders').insertOne(order);
            res.status(201).json({ order_id: result.insertedId, status: 'прийнято_в_обробку' });
        });

        app.patch('/api/orders/:id/status', authenticateToken, requireRole('admin'), async (req, res) => {
            const { status } = req.body;
            const allowed = ['прийнято_в_обробку', 'відправлено', 'доставлено', 'скасовано'];
            if (!allowed.includes(status)) {
                return res.status(400).json({ error: "Недопустимий статус." });
            }
            await db.collection('orders').updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: { status, updated_at: new Date() } }
            );
            res.json({ success: true, status });
        });

        // ==========================================
        // 6. ІНГРЕДІЄНТИ (КАТАЛОГ)
        // ==========================================
        app.get('/api/ingredients', authenticateToken, async (req, res) => {
            const ingredients = await db.collection('ingredients').find({}).toArray();
            res.json(ingredients);
        });

        app.post('/api/ingredients', authenticateToken, requireRole('admin'), async (req, res) => {
            const { name, unit, price_per_unit, stock } = req.body;
            if (!name || !price_per_unit) {
                return res.status(400).json({ error: "Поля name та price_per_unit є обов'язковими." });
            }
            const result = await db.collection('ingredients').insertOne({
                name, unit, price_per_unit: Number(price_per_unit), stock: Number(stock || 0)
            });
            res.status(201).json({ ingredient_id: result.insertedId, name });
        });

        // ==========================================
        // 7. ЗАВДАННЯ НА ОБСЛУГОВУВАННЯ (ТЕХНІКИ)
        // ==========================================
        app.get('/api/maintenance-tasks', authenticateToken, async (req, res) => {
            let filter = {};
            if (req.user.role === 'technician') {
                filter = { technician_id: new ObjectId(req.user.id) };
            }
            const tasks = await db.collection('maintenance_tasks').find(filter).sort({ assigned_at: -1 }).toArray();

            const enriched = await Promise.all(tasks.map(async (task) => {
                const machine = await db.collection('coffee_machines').findOne(
                    { _id: task.machine_id },
                    { projection: { model: 1, location: 1, serial_number: 1 } }
                );
                return { ...task, machine };
            }));

            res.json(enriched);
        });

        app.post('/api/maintenance-tasks', authenticateToken, requireRole('admin'), async (req, res) => {
            const { machine_id, technician_id, task_type, description } = req.body;
            const task = {
                machine_id: new ObjectId(machine_id),
                technician_id: new ObjectId(technician_id),
                task_type: task_type || 'refill',
                status: 'нове',
                assigned_at: new Date(),
                description: description || ''
            };
            const result = await db.collection('maintenance_tasks').insertOne(task);
            res.status(201).json({ task_id: result.insertedId, status: 'нове' });
        });

        app.patch('/api/maintenance-tasks/:id', authenticateToken, async (req, res) => {
            const { status } = req.body;
            const allowed = ['нове', 'в_процесі', 'виконано', 'скасовано'];
            if (!allowed.includes(status)) {
                return res.status(400).json({ error: "Недопустимий статус завдання." });
            }
            const update = { status, updated_at: new Date() };
            if (status === 'виконано') update.completed_at = new Date();

            await db.collection('maintenance_tasks').updateOne(
                { _id: new ObjectId(req.params.id) },
                { $set: update }
            );
            res.json({ success: true, task_id: req.params.id, status, updated_at: update.updated_at });
        });

        // ==========================================
        // 8. РОЯЛТІ (ТІЛЬКИ АДМІН)
        // ==========================================
        app.get('/api/royalty', authenticateToken, requireRole('admin'), async (req, res) => {
            const franchisees = await db.collection('users').find({ role: 'franchisee' }).toArray();

            const royaltyReport = await Promise.all(franchisees.map(async (f) => {
                const orders = await db.collection('orders').find({ franchisee_id: f._id }).toArray();
                const totalRevenue = orders.reduce((sum, o) => sum + (o.total_price || 0), 0);
                const royaltyAmount = totalRevenue * 0.08;

                const paidPayments = await db.collection('payments').find({
                    franchisee_id: f._id,
                    payment_type: 'роялті_за_місяць',
                    status: 'оплачено'
                }).toArray();
                const totalPaid = paidPayments.reduce((sum, p) => sum + p.amount, 0);

                return {
                    franchisee_id: f._id,
                    name: f.name,
                    email: f.email,
                    ordersCount: orders.length,
                    totalRevenue: totalRevenue,
                    royaltyAmount: parseFloat(royaltyAmount.toFixed(2)),
                    totalPaid,
                    balance: parseFloat((royaltyAmount - totalPaid).toFixed(2))
                };
            }));

            res.json(royaltyReport);
        });

        // ==========================================
        // 9. КОРИСТУВАЧІ (ТІЛЬКИ АДМІН)
        // ==========================================
        app.get('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
            const users = await db.collection('users').find({}, { projection: { password: 0 } }).toArray();
            res.json(users);
        });

        app.post('/api/users', authenticateToken, requireRole('admin'), async (req, res) => {
            const { name, email, phone, role } = req.body;
            const allowed_roles = ['admin', 'franchisee', 'technician'];
            if (!allowed_roles.includes(role)) {
                return res.status(400).json({ error: "Недопустима роль." });
            }
            const exists = await db.collection('users').findOne({ email });
            if (exists) return res.status(409).json({ error: "Користувач з таким email вже існує." });

            const result = await db.collection('users').insertOne({
                name, email, phone, role, created_at: new Date()
            });
            res.status(201).json({ user_id: result.insertedId, name, role });
        });

        // ==========================================
        // 10. ПЛАТЕЖІ (АДМІН)
        // ==========================================
        app.get('/api/payments', authenticateToken, requireRole('admin'), async (req, res) => {
            const payments = await db.collection('payments').find({}).sort({ payment_date: -1 }).toArray();
            res.json(payments);
        });

        app.listen(PORT, () => console.log(`🚀 CoffeeNet CRM: http://localhost:${PORT}`));

    } catch (err) {
        console.error("❌ Помилка підключення:", err);
        process.exit(1);
    }
}

startServer();

module.exports = { app };
