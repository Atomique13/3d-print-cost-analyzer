const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { normalizeData } = require('../data-model');
const example = () => JSON.parse(fs.readFileSync('data/data.json.example', 'utf8'));

function browser(fetch = async () => { throw new Error('Unexpected request'); }) {
    const elements = new Map();
    const storage = new Map();
    const context = { normalizeData, fetch, console, location: { protocol: 'file:' },
        localStorage: { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
        document: { addEventListener() {}, getElementById: id => {
            if (!elements.has(id)) elements.set(id, { style: {}, textContent: '' });
            return elements.get(id);
        } } };
    vm.createContext(context);
    vm.runInContext(fs.readFileSync('script.js', 'utf8'), context);
    return { context, storage, run: code => vm.runInContext(code, context) };
}

test('custom density uses the same units as preset density', () => {
    const { context: c } = browser();
    assert.equal(c.getMaterialLinearDensity('pla', 1.24), c.getMaterialLinearDensity('pla'));
    const job = { material: 'pla', weightG: 100, priceKg: 20, printTime: '25:30' };
    assert.equal(c.calculateJob(job).filamentLength, c.calculateJob({ ...job, customDensity: 1.24 }).filamentLength);
    assert.equal(c.calculateJob(job).timeMinutes, 1530);
    assert.equal(c.isMaterialPreset('constructor'), false);
    assert.equal(c.getMaterialDensity('__proto__'), 1.24);
    for (const invalid of ['-2:30', '2abc:30', '2:60']) assert.equal(c.validateTime(invalid), false);
});

test('schema rejects corrupt imports and derives collision-free IDs', () => {
    const data = example();
    data.nextId = 1;
    assert.equal(normalizeData(data).nextId, 3);
    for (const mutate of [d => d.jobs.push(d.jobs[0]), d => d.jobs[0].weightG = -1,
        d => d.jobs[0].material = {}, d => d.jobs[0].customDensity = 0,
        d => d.jobs[0].printTime = '2:99', d => d.globalSettings = null]) {
        const invalid = example(); mutate(invalid);
        assert.throws(() => normalizeData(invalid));
    }
});

test('HTML interpolation escapes attribute and element injection', () => {
    const { context, run } = browser();
    assert.equal(context.escapeHTML('\"><img src=x onerror=alert(1)>'), '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;');
    let rendered;
    context.document.createElement = () => ({ setAttribute() {} });
    context.document.getElementById('table-body').appendChild = row => { rendered = row.innerHTML; };
    const data = example();
    data.jobs = [data.jobs[0]];
    data.jobs[0].name = '\"><img src=x onerror=alert(1)>';
    context.applyData(data);
    context.renderTable();
    assert.equal(rendered.includes('<img'), false);
    assert.ok(rendered.includes('&lt;img'));
});

test('file mode saves without making API requests', async () => {
    const { context, storage } = browser();
    await context.loadData();
    await context.saveData();
    assert.ok(storage.has('3dPrintPricingData'));
});

test('expired sessions and conflicts reject saves and preserve recovery data', async () => {
    for (const status of [401, 409, 500]) {
        const { context, storage, run } = browser(async () => ({ status, ok: false }));
        run("storageMode = 'server'; serverRevision = 'old';");
        await assert.rejects(context.persist(example()));
        assert.ok(storage.has('3dPrintPricingRecovery'));
        assert.equal(storage.has('3dPrintPricingData'), false);
    }
});

test('queued saves use the revision returned by the previous save', async () => {
    const revisions = [];
    const { context, run } = browser(async (_, options) => {
        revisions.push(options.headers['If-Match']);
        return { ok: true, headers: { get: () => 'new' } };
    });
    run("storageMode = 'server'; serverRevision = 'old';");
    await Promise.all([context.queueSave(example()), context.queueSave(example())]);
    assert.deepEqual(revisions, ['old', 'new']);
});
