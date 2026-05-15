const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool } = require('./server');

const BASE_URL = 'http://localhost:5000/api';
let adminToken = '';
let franchiseeToken = '';
let reqMachineId = '';

async function api(method, path, body = null, token = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);
    const res = await fetch(`${BASE_URL}${path}`, options);
    let data; try { data = await res.json(); } catch { data = {}; }
    return { status: res.status, data };
}

describe('Курсова: Реєстрація та Модерація', () => {
    test('1. Логін адміна', async () => {
        const { status, data } = await api('POST', '/login', { email: 'admin@coffee-net.ua' });
        assert.equal(status, 200);
        adminToken = data.token;
    });

    test('2. Реєстрація нового франчайзі (status = pending)', async () => {
        const payload = { name: 'New Partner', email: `partner_${Date.now()}@test.com`, phone: '000' };
        const { status } = await api('POST', '/register', payload);
        assert.equal(status, 201);
    });

    test('3. Логін існуючого Франчайзі', async () => {
        const { status, data } = await api('POST', '/login', { email: 'irina.franchise@gmail.com' });
        assert.equal(status, 200);
        franchiseeToken = data.token;
    });
});

describe('Курсова: Замовлення апарату', () => {
    test('4. Франчайзі подає заявку на апарат', async () => {
        const payload = { city: 'Kyiv', address: 'Khreshchatyk 1', place_type: 'Mall' };
        const { status, data } = await api('POST', '/machines/request', payload, franchiseeToken);
        assert.equal(status, 201);
        reqMachineId = data._id;
    });

    test('5. Адмін призначає реальний апарат за заявкою', async () => {
        assert.ok(reqMachineId);
        const payload = { model: 'Necta Krea Touch', serial_number: `SN-${Date.now()}` };
        const { status, data } = await api('PATCH', `/machines/${reqMachineId}/assign`, payload, adminToken);
        assert.equal(status, 200);
        assert.equal(data.success, true);
    });
});

after(() => { pool.end(); setTimeout(() => process.exit(0), 1000); });