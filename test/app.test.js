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

test('object counts default for older data and survive JSON round trips', () => {
    const data = example();
    assert.equal(normalizeData(data).jobs[0].count, 1);
    data.jobs[0].count = 4;
    assert.equal(normalizeData(JSON.parse(JSON.stringify(normalizeData(data)))).jobs[0].count, 4);
    for (const count of [0, -1, 1.5, '4', null, Number.MAX_SAFE_INTEGER + 1]) {
        data.jobs[0].count = count;
        assert.throws(() => normalizeData(data));
    }
});

test('multiple objects show divided prices while preserving plate totals', () => {
    const { context: c, run } = browser();
    run("globalSettings.currencySymbol = 'RON';");
    const job = { material: 'pla', weightG: 100, priceKg: 200, printTime: '0:00', count: 4 };
    const calc = c.calculateJob(job);
    assert.equal(calc.totalCost, 20);
    assert.equal(calc.sellingPrice, 60);
    assert.equal(c.formatJobTotal(calc.totalCost, 4), '20 RON (5.0)');
    assert.equal(c.formatJobTotal(calc.sellingPrice, 4), '60 RON (15.0)');
    assert.equal(c.formatJobTotal(20, 1), '20 RON');
    assert.equal(c.formatJobTotal(20, 3), '20 RON (6.7)');
});

test('multi-plate totals carry minutes and support long prints and decimal weights', () => {
    const { context: c } = browser();
    const totals = c.sumPlates([
        { weightG: '100.1', printTime: '12:45' },
        { weightG: '200.2', printTime: '10:30' },
        { weightG: '50', printTime: '2:50' }
    ]);
    assert.equal(totals.weightG, 350.3);
    assert.equal(totals.printTime, '26:05');
    assert.equal(c.sumPlates([{ weightG: '0', printTime: '2' }]).printTime, '2:00');
    for (const plate of [
        { weightG: '', printTime: '1:00' },
        { weightG: '-1', printTime: '1:00' },
        { weightG: 'abc', printTime: '1:00' },
        { weightG: '1', printTime: '1:60' },
        { weightG: '1', printTime: '' }
    ]) assert.equal(c.sumPlates([plate]), null);
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

test('reordering preserves job data and persists the order across reloads', async () => {
    const { context: c, run, storage } = browser();
    await c.loadData();
    const data = example();
    data.jobs.push({ ...data.jobs[0], id: 3, name: 'Third plate', count: 4 });
    c.applyData(data);
    const original = JSON.parse(run('JSON.stringify(jobs)'));
    assert.equal(c.moveJob(1, 3, true), true);
    await run('saveQueue');
    assert.deepEqual(JSON.parse(storage.get('3dPrintPricingData')).jobs, [original[1], original[2], original[0]]);
    await c.loadData();
    assert.equal(run('jobs.map(job => job.id).join()'), '2,3,1');
    assert.equal(c.moveJob(1, 2), true);
    await run('saveQueue');
    assert.equal(run('jobs.map(job => job.id).join()'), '1,2,3');
    assert.equal(c.moveJob(1, 1), false);
    assert.equal(c.moveJob(1, 2), false);
    assert.equal(c.moveJob(1, 999), false);
    assert.deepEqual(JSON.parse(run('JSON.stringify(jobs)')), original);
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
