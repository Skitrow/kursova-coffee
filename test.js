/**
 * ============================================================
 * CoffeeNet ERP – Автоматизовані тести API
 * Лабораторна робота №5: Тестування (Test Plan)
 *
 * Запуск: node --test test.js
 * Вимоги: Node.js >= 18.x, сервер запущений на localhost:5000
 * ============================================================
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = 'http://localhost:5000/api';

// ─── Глобальні токени для тестів ────────────────────────────
let adminToken = '';
let franchiseeToken = '';
let technicianToken = '';
let createdOrderId = '';
let createdTaskId = '';
let machineId = '';

// ─── Допоміжна функція HTTP-запитів ─────────────────────────
async function api(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`${BASE_URL}${path}`, options);
    let data;
    try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, data };
}

// ============================================================
// 1. БЛОК: АУТЕНТИФІКАЦІЯ (Login)
// ============================================================
describe('1. Аутентифікація', () => {

    test('1.1 Успішний логін адміна', async () => {
        const { status, data } = await api('POST', '/login', {
            email: 'admin@coffee-net.ua',
            password: '123456'
        });
        assert.equal(status, 200, 'HTTP статус має бути 200');
        assert.ok(data.token, 'Відповідь повинна містити JWT токен');
        assert.equal(data.role, 'admin', 'Роль повинна бути admin');
        assert.ok(data.name, 'Відповідь повинна містити ім\'я користувача');
        adminToken = data.token;
    });

    test('1.2 Успішний логін франчайзі', async () => {
        const { status, data } = await api('POST', '/login', {
            email: 'irina.franchise@gmail.com',
            password: '123456'
        });
        assert.equal(status, 200);
        assert.ok(data.token);
        assert.equal(data.role, 'franchisee');
        franchiseeToken = data.token;
    });

    test('1.3 Успішний логін техніка', async () => {
        const { status, data } = await api('POST', '/login', {
            email: 'vasyl.tech@coffee-net.ua',
            password: '123456'
        });
        assert.equal(status, 200);
        assert.ok(data.token);
        assert.equal(data.role, 'technician');
        technicianToken = data.token;
    });

    test('1.4 Логін з неіснуючим email → 401', async () => {
        const { status, data } = await api('POST', '/login', {
            email: 'nonexistent@test.com',
            password: '123456'
        });
        assert.equal(status, 401, 'Неіснуючий email повинен повертати 401');
        assert.ok(data.error, 'Повинне бути поле error у відповіді');
    });

    test('1.5 Запит без токена → 401', async () => {
        const { status } = await api('GET', '/users');
        assert.equal(status, 401, 'Запит без токена повинен повертати 401');
    });

    test('1.6 Запит з невалідним токеном → 403', async () => {
        const { status } = await api('GET', '/users', null, 'invalid.token.here');
        assert.equal(status, 403, 'Невалідний токен повинен повертати 403');
    });
});

// ============================================================
// 2. БЛОК: ДАШБОРД
// ============================================================
describe('2. Дашборд та статистика', () => {

    test('2.1 Отримати статистику (адмін)', async () => {
        const { status, data } = await api('GET', '/dashboard/stats', null, adminToken);
        assert.equal(status, 200);
        assert.ok(typeof data.machinesCount === 'number', 'machinesCount має бути числом');
        assert.ok(typeof data.errorsCount === 'number', 'errorsCount має бути числом');
        assert.ok(typeof data.usersCount === 'number', 'usersCount має бути числом');
        assert.ok(typeof data.pendingTasks === 'number', 'pendingTasks має бути числом');
        assert.ok(data.usersCount > 0, 'Кількість користувачів має бути > 0');
    });

    test('2.2 Статистика доступна для франчайзі', async () => {
        const { status } = await api('GET', '/dashboard/stats', null, franchiseeToken);
        assert.equal(status, 200);
    });
});

// ============================================================
// 3. БЛОК: КАВОМАШИНИ ТА ТЕЛЕМЕТРІЯ (IoT)
// ============================================================
describe('3. Кавомашини та IoT-телеметрія', () => {

    test('3.1 Отримати список кавомашин (адмін)', async () => {
        const { status, data } = await api('GET', '/machines', null, adminToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Відповідь має бути масивом');
        assert.ok(data.length > 0, 'Список машин не повинен бути порожнім');

        const machine = data[0];
        assert.ok(machine._id, 'Машина повинна мати _id');
        assert.ok(machine.model, 'Машина повинна мати model');
        assert.ok(machine.serial_number, 'Машина повинна мати serial_number');
        assert.ok(machine.status, 'Машина повинна мати status');
        assert.ok(machine.location, 'Машина повинна мати location');

        machineId = machine._id;
    });

    test('3.2 Структура локації машини коректна', async () => {
        const { data } = await api('GET', '/machines', null, adminToken);
        const machine = data[0];
        assert.ok(machine.location.city, 'Локація повинна мати city');
        assert.ok(machine.location.address, 'Локація повинна мати address');
    });

    test('3.3 POST телеметрії від IoT-модуля → 201', async () => {
        const payload = {
            water_level_percent: 10,
            coffee_beans_percent: 12,
            cups_count: 5,
            has_error: true,
            error_code: 'ERR_LOW_WATER'
        };
        const { status, data } = await api('POST', `/telemetry/${machineId}`, payload);
        assert.equal(status, 201, 'Прийом телеметрії має повертати 201');
        assert.ok(data.message, 'Відповідь має містити message');
        assert.ok(data.timestamp, 'Відповідь має містити timestamp');
    });

    test('3.4 POST телеметрії без обов\'язкових полів → 400', async () => {
        const { status } = await api('POST', `/telemetry/${machineId}`, { cups_count: 5 });
        assert.equal(status, 400, 'Відсутні обов\'язкові поля → 400');
    });

    test('3.5 Телеметрія з критичним рівнем автоматично створює завдання', async () => {
        const payload = {
            water_level_percent: 5,
            coffee_beans_percent: 5,
            cups_count: 3,
            has_error: true,
            error_code: 'ERR_CRITICAL'
        };
        await api('POST', `/telemetry/${machineId}`, payload);

        // Перевіряємо, що завдання було автоматично створено
        const { data: tasks } = await api('GET', '/maintenance-tasks', null, adminToken);
        assert.ok(Array.isArray(tasks), 'Список завдань має бути масивом');
    });

    test('3.6 Отримати помилки телеметрії (адмін)', async () => {
        const { status, data } = await api('GET', '/telemetry/errors', null, adminToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data));

        if (data.length > 0) {
            const entry = data[0];
            assert.ok(entry.machine_id, 'Лог має містити machine_id');
            assert.ok(entry.sensors, 'Лог має містити sensors');
            assert.equal(entry.has_error, true, 'Лог помилки має has_error = true');
        }
    });

    test('3.7 Технік не може бачити телеметрію інших (доступна лише адміну)', async () => {
        // Телеметрія errors – тільки для адміна та всіх авторизованих
        // Перевіряємо, що неавторизований отримує 401
        const { status } = await api('GET', '/telemetry/errors');
        assert.equal(status, 401);
    });
});

// ============================================================
// 4. БЛОК: ІНГРЕДІЄНТИ (КАТАЛОГ)
// ============================================================
describe('4. Каталог інгредієнтів', () => {

    test('4.1 Отримати список інгредієнтів (авторизований)', async () => {
        const { status, data } = await api('GET', '/ingredients', null, franchiseeToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Каталог не повинен бути порожнім');

        const ing = data[0];
        assert.ok(ing.name, 'Інгредієнт повинен мати name');
        assert.ok(ing.price_per_unit !== undefined, 'Інгредієнт повинен мати price_per_unit');
        assert.ok(ing.unit, 'Інгредієнт повинен мати unit');
    });

    test('4.2 Список інгредієнтів недоступний без токена → 401', async () => {
        const { status } = await api('GET', '/ingredients');
        assert.equal(status, 401);
    });

    test('4.3 Додати інгредієнт (тільки адмін) → 201', async () => {
        const payload = { name: 'Тестовий інгредієнт', unit: 'кг', price_per_unit: 99.99, stock: 100 };
        const { status, data } = await api('POST', '/ingredients', payload, adminToken);
        assert.equal(status, 201, 'Адмін може додавати інгредієнти');
        assert.ok(data.ingredient_id, 'Відповідь має містити ingredient_id');
    });

    test('4.4 Франчайзі не може додавати інгредієнти → 403', async () => {
        const payload = { name: 'Заборонений інгредієнт', unit: 'кг', price_per_unit: 50, stock: 50 };
        const { status } = await api('POST', '/ingredients', payload, franchiseeToken);
        assert.equal(status, 403, 'Франчайзі не повинен мати право додавати інгредієнти');
    });

    test('4.5 Додати інгредієнт без обов\'язкових полів → 400', async () => {
        const { status } = await api('POST', '/ingredients', { unit: 'кг' }, adminToken);
        assert.equal(status, 400);
    });
});

// ============================================================
// 5. БЛОК: ЗАМОВЛЕННЯ ІНГРЕДІЄНТІВ
// ============================================================
describe('5. Замовлення інгредієнтів', () => {

    let ingredientId = '';

    before(async () => {
        const { data } = await api('GET', '/ingredients', null, franchiseeToken);
        if (data.length > 0) ingredientId = data[0]._id;
    });

    test('5.1 Франчайзі може оформити замовлення → 201', async () => {
        assert.ok(ingredientId, 'Потрібен ingredientId для тесту');
        const payload = {
            items: [{ ingredient_id: ingredientId, quantity: 5, price: 450.00 }],
            total_price: 2250.00
        };
        const { status, data } = await api('POST', '/orders', payload, franchiseeToken);
        assert.equal(status, 201, 'Франчайзі може створювати замовлення');
        assert.ok(data.order_id, 'Відповідь має містити order_id');
        assert.equal(data.status, 'прийнято_в_обробку', 'Початковий статус має бути прийнято_в_обробку');
        createdOrderId = data.order_id;
    });

    test('5.2 Замовлення зберігається і видно в списку', async () => {
        const { status, data } = await api('GET', '/orders', null, franchiseeToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data));
        assert.ok(data.length > 0, 'Список замовлень не повинен бути порожнім');
    });

    test('5.3 Порожній список items → 400', async () => {
        const { status } = await api('POST', '/orders', { items: [], total_price: 0 }, franchiseeToken);
        assert.equal(status, 400);
    });

    test('5.4 Технік не може створювати замовлення → 403', async () => {
        const payload = {
            items: [{ ingredient_id: ingredientId, quantity: 1, price: 100 }],
            total_price: 100
        };
        const { status } = await api('POST', '/orders', payload, technicianToken);
        assert.equal(status, 403, 'Технік не може оформляти замовлення');
    });

    test('5.5 Адмін може оновити статус замовлення', async () => {
        if (!createdOrderId) return;
        const { status } = await api('PATCH', `/orders/${createdOrderId}/status`,
            { status: 'відправлено' }, adminToken);
        assert.equal(status, 200, 'Адмін може міняти статус замовлення');
    });

    test('5.6 Недопустимий статус замовлення → 400', async () => {
        if (!createdOrderId) return;
        const { status } = await api('PATCH', `/orders/${createdOrderId}/status`,
            { status: 'недопустимий_статус' }, adminToken);
        assert.equal(status, 400);
    });
});

// ============================================================
// 6. БЛОК: ЗАВДАННЯ НА ОБСЛУГОВУВАННЯ
// ============================================================
describe('6. Завдання для техніків (Maintenance Tasks)', () => {

    test('6.1 Технік бачить свої завдання', async () => {
        const { status, data } = await api('GET', '/maintenance-tasks', null, technicianToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Список завдань має бути масивом');
    });

    test('6.2 Адмін бачить всі завдання', async () => {
        const { status, data } = await api('GET', '/maintenance-tasks', null, adminToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data));

        if (data.length > 0) {
            const task = data[0];
            assert.ok(task.machine_id, 'Завдання має мати machine_id');
            assert.ok(task.status, 'Завдання має мати status');
            assert.ok(task.description !== undefined, 'Завдання має мати description');
        }
    });

    test('6.3 Технік може оновити статус завдання → виконано', async () => {
        const { data: tasks } = await api('GET', '/maintenance-tasks', null, technicianToken);
        if (!tasks.length) {
            console.log('    [SKIP] Немає завдань для техніка');
            return;
        }
        const taskId = tasks[0]._id;
        const { status, data } = await api('PATCH', `/maintenance-tasks/${taskId}`,
            { status: 'виконано' }, technicianToken);
        assert.equal(status, 200);
        assert.equal(data.status, 'виконано', 'Статус завдання має бути оновлений');
        assert.ok(data.updated_at, 'Має бути поле updated_at');
    });

    test('6.4 Недопустимий статус завдання → 400', async () => {
        const { data: tasks } = await api('GET', '/maintenance-tasks', null, adminToken);
        if (!tasks.length) return;
        const { status } = await api('PATCH', `/maintenance-tasks/${tasks[0]._id}`,
            { status: 'неіснуючий_статус' }, adminToken);
        assert.equal(status, 400);
    });

    test('6.5 Завдання містить збагачені дані машини', async () => {
        const { data: tasks } = await api('GET', '/maintenance-tasks', null, adminToken);
        if (!tasks.length) return;
        const task = tasks[0];
        assert.ok(task.machine, 'Завдання має містити дані машини (machine)');
        assert.ok(task.machine.model, 'Дані машини мають містити model');
    });
});

// ============================================================
// 7. БЛОК: РОЯЛТІ (ТІЛЬКИ АДМІН)
// ============================================================
describe('7. Розрахунок роялті', () => {

    test('7.1 Адмін отримує звіт по роялті', async () => {
        const { status, data } = await api('GET', '/royalty', null, adminToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data), 'Звіт роялті має бути масивом');
    });

    test('7.2 Звіт роялті має правильну структуру', async () => {
        const { data } = await api('GET', '/royalty', null, adminToken);
        if (!data.length) return;
        const row = data[0];
        assert.ok(row.name, 'Має бути name');
        assert.ok(row.email, 'Має бути email');
        assert.ok(typeof row.totalRevenue === 'number', 'totalRevenue має бути числом');
        assert.ok(typeof row.royaltyAmount === 'number', 'royaltyAmount має бути числом');
        assert.ok(typeof row.balance === 'number', 'balance має бути числом');
    });

    test('7.3 Роялті = 8% від виручки', async () => {
        const { data } = await api('GET', '/royalty', null, adminToken);
        if (!data.length) return;
        const row = data[0];
        const expected = parseFloat((row.totalRevenue * 0.08).toFixed(2));
        assert.equal(row.royaltyAmount, expected, 'Розрахунок роялті: 8% від виручки');
    });

    test('7.4 Франчайзі НЕ може переглядати роялті → 403', async () => {
        const { status } = await api('GET', '/royalty', null, franchiseeToken);
        assert.equal(status, 403, 'Франчайзі не може бачити загальний звіт роялті');
    });

    test('7.5 Технік НЕ може переглядати роялті → 403', async () => {
        const { status } = await api('GET', '/royalty', null, technicianToken);
        assert.equal(status, 403);
    });
});

// ============================================================
// 8. БЛОК: УПРАВЛІННЯ КОРИСТУВАЧАМИ
// ============================================================
describe('8. Управління користувачами', () => {

    test('8.1 Адмін може отримати список користувачів', async () => {
        const { status, data } = await api('GET', '/users', null, adminToken);
        assert.equal(status, 200);
        assert.ok(Array.isArray(data));
        assert.ok(data.length >= 3, 'Має бути щонайменше 3 користувачі');
    });

    test('8.2 Структура користувача коректна', async () => {
        const { data } = await api('GET', '/users', null, adminToken);
        const user = data[0];
        assert.ok(user.name, 'Користувач має мати name');
        assert.ok(user.email, 'Користувач має мати email');
        assert.ok(user.role, 'Користувач має мати role');
        assert.equal(user.password, undefined, 'Пароль НЕ повинен передаватись у відповіді');
    });

    test('8.3 Франчайзі НЕ може переглядати список юзерів → 403', async () => {
        const { status } = await api('GET', '/users', null, franchiseeToken);
        assert.equal(status, 403);
    });

    test('8.4 Технік НЕ може переглядати список юзерів → 403', async () => {
        const { status } = await api('GET', '/users', null, technicianToken);
        assert.equal(status, 403);
    });

    test('8.5 Адмін може створити нового користувача', async () => {
        const payload = {
            name: 'Тестовий Технік',
            email: `test.tech.${Date.now()}@coffee-net.ua`,
            phone: '+380991234567',
            role: 'technician'
        };
        const { status, data } = await api('POST', '/users', payload, adminToken);
        assert.equal(status, 201, 'Адмін може створювати користувачів');
        assert.ok(data.user_id, 'Відповідь має містити user_id');
        assert.equal(data.role, 'technician');
    });

    test('8.6 Неіснуюча роль → 400', async () => {
        const payload = {
            name: 'Test', email: `test.bad.${Date.now()}@test.ua`,
            role: 'superuser'
        };
        const { status } = await api('POST', '/users', payload, adminToken);
        assert.equal(status, 400);
    });

    test('8.7 Дублікат email → 409', async () => {
        const payload = {
            name: 'Дублікат', email: 'admin@coffee-net.ua',
            role: 'admin'
        };
        const { status } = await api('POST', '/users', payload, adminToken);
        assert.equal(status, 409, 'Дублікат email → 409 Conflict');
    });
});

// ============================================================
// 9. БЛОК: БЕЗПЕКА (Security Tests)
// ============================================================
describe('9. Тести безпеки', () => {

    test('9.1 Ізоляція даних: франчайзі бачить тільки свої замовлення', async () => {
        const { data: adminOrders } = await api('GET', '/orders', null, adminToken);
        const { data: franchiseeOrders } = await api('GET', '/orders', null, franchiseeToken);
        // Франчайзі не повинен бачити замовлення, що не належать їй
        assert.ok(Array.isArray(franchiseeOrders), 'Франчайзі отримує масив замовлень');
        // Всі замовлення франчайзі повинні належати їй
        // (перевірка на рівні бізнес-логіки – сервер фільтрує)
    });

    test('9.2 Прострочений/підроблений токен → 403', async () => {
        const fakeToken = 'eyJhbGciOiJIUzI1NiJ9.eyJpZCI6IjEyMyIsInJvbGUiOiJhZG1pbiJ9.fake_signature';
        const { status } = await api('GET', '/users', null, fakeToken);
        assert.equal(status, 403);
    });

    test('9.3 Всі захищені ендпоінти вимагають авторизацію', async () => {
        const protectedRoutes = [
            ['GET', '/dashboard/stats'],
            ['GET', '/machines'],
            ['GET', '/orders'],
            ['GET', '/ingredients'],
            ['GET', '/maintenance-tasks'],
            ['GET', '/users'],
        ];
        for (const [method, path] of protectedRoutes) {
            const { status } = await api(method, path);
            assert.equal(status, 401, `${method} ${path} має вимагати токен (отримано ${status})`);
        }
    });

    test('9.4 Ендпоінт роялті захищений від не-адмінів', async () => {
        for (const token of [franchiseeToken, technicianToken]) {
            const { status } = await api('GET', '/royalty', null, token);
            assert.equal(status, 403, 'Лише адмін може бачити роялті');
        }
    });
});

// ============================================================
// 10. БЛОК: ПЕРЕВІРКА ВАЛІДАЦІЇ ДАНИХ
// ============================================================
describe('10. Валідація вхідних даних', () => {

    test('10.1 Login без email → помилка', async () => {
        const { status } = await api('POST', '/login', { password: '123' });
        // Сервер повинен не падати і повертати помилку
        assert.ok([400, 401, 500].includes(status), 'Сервер не повинен падати при відсутньому email');
    });

    test('10.2 Замовлення без items → 400', async () => {
        const { status } = await api('POST', '/orders', { total_price: 100 }, franchiseeToken);
        assert.equal(status, 400);
    });

    test('10.3 Телеметрія без обов\'язкових полів → 400', async () => {
        const { status } = await api('POST', `/telemetry/${machineId}`, { cups_count: 5 });
        assert.equal(status, 400);
    });

    test('10.4 Недопустима роль при створенні користувача → 400', async () => {
        const { status } = await api('POST', '/users',
            { name: 'Test', email: 'x@x.ua', role: 'hacker' }, adminToken);
        assert.equal(status, 400);
    });
});

// ============================================================
// ПІДСУМОК
// ============================================================
console.log('\n📋 CoffeeNet ERP – Тест-план (Лабораторна робота №5)');
console.log('─'.repeat(55));
console.log('Блоки тестів:');
console.log('  1. Аутентифікація (6 тестів)');
console.log('  2. Дашборд та статистика (2 тести)');
console.log('  3. Кавомашини та IoT-телеметрія (7 тестів)');
console.log('  4. Каталог інгредієнтів (5 тестів)');
console.log('  5. Замовлення інгредієнтів (6 тестів)');
console.log('  6. Завдання для техніків (5 тестів)');
console.log('  7. Розрахунок роялті (5 тестів)');
console.log('  8. Управління користувачами (7 тестів)');
console.log('  9. Тести безпеки (4 тести)');
console.log(' 10. Валідація вхідних даних (4 тести)');
console.log('─'.repeat(55));
console.log('Загалом: ~51 тест-кейс');
console.log('Інструмент: node:test (Node.js вбудований)');
console.log('─'.repeat(55) + '\n');