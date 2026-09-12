(function (root) {
    function normalizeData(data) {
        const fail = () => { throw new Error('Invalid data: check settings, job fields, and unique IDs.'); };
        const number = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
        if (!data || typeof data !== 'object' || !Array.isArray(data.jobs)) fail();
        const settings = data.globalSettings;
        if (!settings || !number(settings.printerPower) || !number(settings.electricityPrice) ||
            typeof settings.currencySymbol !== 'string' || !settings.currencySymbol.trim() || settings.currencySymbol.length > 10) fail();
        const ids = new Set();
        const jobs = data.jobs.map(job => {
            if (!job || !Number.isSafeInteger(job.id) || job.id < 1 || ids.has(job.id) ||
                typeof job.name !== 'string' || typeof job.material !== 'string' ||
                !number(job.priceKg) || !number(job.weightG) || typeof job.printTime !== 'string' ||
                !/^\d+:[0-5]\d$/.test(job.printTime) || !Number.isSafeInteger(Number(job.printTime.split(':')[0]) * 60 + Number(job.printTime.split(':')[1])) ||
                (job.customDensity != null && (!number(job.customDensity) || job.customDensity === 0))) fail();
            ids.add(job.id);
            return { id: job.id, name: job.name, material: job.material.trim().toLowerCase(), priceKg: job.priceKg,
                weightG: job.weightG, printTime: job.printTime, customDensity: job.customDensity ?? null };
        });
        const nextId = jobs.reduce((max, job) => Math.max(max, job.id + 1), 1);
        if (!Number.isSafeInteger(nextId)) fail();
        return { globalSettings: { printerPower: settings.printerPower, electricityPrice: settings.electricityPrice,
            currencySymbol: settings.currencySymbol }, jobs, nextId };
    }
    if (typeof module !== 'undefined' && module.exports) module.exports = { normalizeData };
    else root.normalizeData = normalizeData;
})(globalThis);
