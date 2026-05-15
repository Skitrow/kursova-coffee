const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, pool } = require('./server');

const BASE_URL = 'http://localhost:5000/api';
let adminToken = '', franchiseeToken = '';

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
    test('Логін адміна', async () => {
        const { status, data } = await api('POST', '/login', { email: 'admin@coffee-net.ua' });
        assert.equal(status, 200);
        adminToken = data.token;
    });

    test('Реєстрація нового франчайзі', async () => {
        const { status } = await api('POST', '/register', { name: 'New Partner', email: 'new@test.com', phone: '000' });
        assert.equal(status, 201);
    });

    test('Отримання списку машин', async () => {
        const { status } = await api('GET', '/machines', null, adminToken);
        assert.equal(status, 200);
    });
});

after(() => { pool.end(); setTimeout(() => process.exit(0), 1000); });