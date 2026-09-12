// Uses isolated Docker resources; never mounts the developer's data directory.
const { execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const assert = require('node:assert/strict');
const image = process.argv[2] || 'print-analyzer:test';
const name = `print-smoke-${randomUUID()}`;
const volume = `${name}-data`;
const docker = (...args) => execFileSync('docker', args, { encoding: 'utf8', timeout: 120000 }).trim();
let containerCreated = false;
let volumeCreated = false;

async function ready() {
    for (let attempt = 0; attempt < 60; attempt++) {
        const state = JSON.parse(docker('inspect', '--format', '{{json .State}}', name));
        if (!state.Running) throw new Error('Container stopped unexpectedly');
        if (state.Health?.Status === 'healthy') return;
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    throw new Error('Health check timed out');
}

(async () => {
    try {
        docker('volume', 'create', volume);
        volumeCreated = true;
        docker('run', '-d', '--name', name, '-p', '127.0.0.1::80',
            '-e', 'AUTH_USERNAME=smoke', '-e', 'AUTH_PASSWORD=smoke-test-password',
            '--mount', `type=volume,src=${volume},dst=/app/data`, image);
        containerCreated = true;
        await ready();
        const address = () => {
            const ports = JSON.parse(docker('inspect', '--format', '{{json .NetworkSettings.Ports}}', name));
            return `http://127.0.0.1:${ports['80/tcp'][0].HostPort}`;
        };
        let base = address();
        const login = async () => {
            const response = await fetch(base + '/api/login', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username: 'smoke', password: 'smoke-test-password' })
            });
            assert.equal(response.status, 200);
            return response.headers.get('set-cookie').split(';')[0];
        };
        assert.equal((await fetch(base + '/api/data')).status, 401);
        let cookie = await login();
        const loaded = await fetch(base + '/api/data', { headers: { Cookie: cookie } });
        const data = await loaded.json();
        assert.ok(data.jobs.length > 0, 'Example data must initialize a new volume');
        data.jobs[0].name = name;
        const saved = await fetch(base + '/api/data', {
            method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', 'If-Match': loaded.headers.get('etag') },
            body: JSON.stringify(data)
        });
        assert.equal(saved.status, 200);
        docker('restart', name);
        await ready();
        // Docker can allocate a different ephemeral host port after restart.
        base = address();
        cookie = await login();
        const reloaded = await fetch(base + '/api/data', { headers: { Cookie: cookie } });
        assert.equal((await reloaded.json()).jobs[0].name, name);
        docker('exec', name, 'node', '-e', "const fs=require('fs'); for(const p of ['.git','test','README.md','.npm-cache','scripts']) { if(fs.existsSync('/app/'+p)) process.exit(1); }");
        console.log('Docker smoke test passed: health, login, save, restart persistence, and image contents.');
    } finally {
        if (containerCreated) {
            try { console.log(docker('logs', name)); }
            finally { docker('rm', '-f', name); }
        }
        if (volumeCreated) docker('volume', 'rm', volume);
    }
})().catch(error => { console.error(error); process.exitCode = 1; });
