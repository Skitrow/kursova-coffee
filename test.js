const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool } = require('./server');

const BASE_URL = 'http://localhost:5000/api';
let adminToken = '', franchiseeToken = '', technicianToken = '', machineId = '';

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

describe('1. Аутентифікація', () => {
    test('1.1 Логін адміна', async () => {
        const { status, data } = await api('POST', '/login', { email: 'admin@coffee-net.ua', password: '123' });
        assert.equal(status, 200);
        adminToken = data.token;
    });
    test('1.2 Логін франчайзі', async () => {
        const { data } = await api('POST', '/login', { email: 'irina.franchise@gmail.com' });
        franchiseeToken = data.token;
    });
    test('1.3 Логін техніка', async () => {
        const { data } = await api('POST', '/login', { email: 'vasyl.tech@coffee-net.ua' });
        technicianToken = data.token;
    });
});

describe('2. Дашборд та статистика', () => {
    test('Отримати статистику (адмін)', async () => {
        const { status, data } = await api('GET', '/dashboard/stats', null, adminToken);
        assert.equal(status, 200);
        assert.ok(data.usersCount > 0);
    });
});

describe('3. Кавомашини та IoT', () => {
    test('Створити кавомашину (адмін)', async () => {
        const { status, data } = await api('POST', '/machines', {
            model: 'Test', serial_number: `SN-${Date.now()}`, location: { city: 'Kyiv', address: '123' }
        }, adminToken);
        assert.equal(status, 201);
        machineId = data._id;
    });
    test('Отримати машини', async () => {
        const { status, data } = await api('GET', '/machines', null, adminToken);
        assert.equal(status, 200);
        assert.ok(data.length > 0);
    });
    test('POST телеметрія', async () => {
        const { status } = await api('POST', `/telemetry/${machineId}`, {
            water_level_percent: 10, coffee_beans_percent: 10, cups_count: 5, has_error: true
        });
        assert.equal(status, 201);
    });
});

describe('4. Управління користувачами', () => {
    test('Адмін отримує юзерів', async () => {
        const { status } = await api('GET', '/users', null, adminToken);
        assert.equal(status, 200);
    });
});

after(() => { 
    pool.end(); 
    setTimeout(() => process.exit(0), 1000); 
});
