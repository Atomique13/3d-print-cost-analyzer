const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('server authentication, validation, conflicts, backups, and static boundaries', async t => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'print-analyzer-test-'));
    const file = path.join(directory, 'data.json');
    const child = spawn(process.execPath, ['server.js'], {
        env: { ...process.env, PORT: '0', DATA_FILE: file, AUTH_USERNAME: 'test', AUTH_PASSWORD: 'test-password' },
        stdio: ['ignore', 'pipe', 'pipe']
    });
    t.after(async () => {
        if (child.exitCode === null) { const exited = once(child, 'exit'); child.kill(); await exited; }
        fs.rmSync(directory, { recursive: true, force: true });
    });
    const port = await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Server did not start')), 10000);
        child.stdout.on('data', data => {
            const match = String(data).match(/Server running on port (\d+)/);
            if (match) { clearTimeout(timer); resolve(match[1]); }
        });
        child.once('exit', code => { clearTimeout(timer); reject(new Error(`Server exited: ${code}`)); });
    });
    const base = `http://127.0.0.1:${port}`;
    const unauthenticated = await fetch(base + '/api/data', { method: 'POST', redirect: 'manual' });
    assert.equal(unauthenticated.status, 401);
    const login = await fetch(base + '/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'test', password: 'test-password' })
    });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const get = url => fetch(base + url, { headers: { Cookie: cookie } });
    const loaded = await get('/api/data');
    let revision = loaded.headers.get('etag');
    const data = await loaded.json();
    const write = (url, body, version = revision) => fetch(base + url, {
        method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'If-Match': version },
        body: JSON.stringify(body)
    });
    const original = fs.readFileSync(file, 'utf8');
    assert.equal((await write('/api/import', { jobs: 'bad' })).status, 400);
    assert.equal(fs.readFileSync(file, 'utf8'), original);
    data.jobs[0].name = 'Updated';
    const saved = await write('/api/data', data);
    assert.equal(saved.status, 200);
    const nextRevision = saved.headers.get('etag');
    assert.notEqual(nextRevision, revision);
    assert.equal((await write('/api/data', data)).status, 409);
    revision = nextRevision;
    data.jobs[0].name = 'Imported';
    const imported = await write('/api/import', data);
    assert.equal(imported.status, 200);
    revision = imported.headers.get('etag');
    data.jobs[0].name = 'Imported again';
    assert.equal((await write('/api/import', data)).status, 200);
    assert.equal(fs.readdirSync(directory).filter(name => name.includes('import-backup')).length, 2);
    assert.equal(JSON.parse(fs.readFileSync(file)).jobs[0].name, 'Imported again');
    assert.equal(fs.existsSync(file + '.tmp'), false);
    for (const url of ['/server.js', '/package.json', '/data/data.json']) assert.equal((await get(url)).status, 404);
    for (const url of ['/', '/script.js', '/data-model.js']) assert.equal((await get(url)).status, 200);
});
