// Data structures
let globalSettings = {
    printerPower: 100, // default
    electricityPrice: 0.12, // default
    currencySymbol: '🦁'
};

let jobs = [];
let nextId = 1;

// Material density lookup (g/cm³) for 1.75mm filament
const MATERIAL_DENSITIES = {
    'pla': 1.24,
    'abs': 1.04,
    'petg': 1.27,
    'tpu': 1.21,
    'pa': 1.14,
    'asa': 1.07,
    'pc': 1.20
};

// Calculate linear density (g/m) from material density (g/cm³)
function getMaterialLinearDensity(materialName, customDensity = null) {
    const filamentArea = Math.PI * Math.pow(1.75 / 2, 2) / 100; // cm²
    const materialDensity = customDensity ?? getMaterialDensity(materialName); // default PLA
    return roundup(materialDensity * filamentArea * 100, 2); // g/m
}

// Get material density in g/cm³
function getMaterialDensity(materialName) {
    return isMaterialPreset(materialName) ? MATERIAL_DENSITIES[materialName.toLowerCase()] : 1.24; // default PLA
}

// Check if material is in preset list
function isMaterialPreset(materialName) {
    return materialName && Object.hasOwn(MATERIAL_DENSITIES, materialName.toLowerCase());
}

// Utility functions
function roundup(num, digits) {
    const factor = Math.pow(10, digits);
    return Math.ceil(num * factor) / factor;
}

function ceiling(num, sig) {
    return Math.ceil(num / sig) * sig;
}

function validateTime(value) {
    return /^\d+:[0-5]\d$/.test(value);
}

function parseTime(value) {
    if (!validateTime(value)) return { hours: 0, minutes: 0 };
    const [hours, minutes] = value.split(':').map(Number);
    return { hours, minutes };
}

function formatTime(value) {
    if (/^\d+$/.test(value)) return `${Number(value)}:00`;
    if (!/^\d+:[0-5]?\d$/.test(value)) return null;
    const [hours, minutes] = value.split(':').map(Number);
    return `${hours}:${String(minutes).padStart(2, '0')}`;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

// Calculations
function calculateJob(job) {
    const timeParsed = parseTime(job.printTime);
    const timeMinutes = timeParsed.hours * 60 + timeParsed.minutes;
    const timeHours = timeMinutes / 60;

    let filamentLength = '';
    const linearDensity = getMaterialLinearDensity(job.material, job.customDensity);
    if (job.weightG > 0 && linearDensity > 0) {
        filamentLength = roundup(job.weightG / linearDensity, 1);
    }

    const materialPrice = roundup((job.priceKg / 1000) * job.weightG, 1);
    const electricityCost = roundup((globalSettings.printerPower / 1000) * timeHours * globalSettings.electricityPrice, 1);
    const totalCost = roundup(materialPrice + electricityCost, 1);
    const sellingPrice = ceiling((totalCost * 3 / 5), 1) * 5;

    return {
        timeMinutes,
        timeHours,
        filamentLength,
        materialPrice,
        electricityCost,
        totalCost,
        sellingPrice
    };
}

// Persistence: server failures never switch an established server session to local mode.
let storageMode = 'loading';
let serverRevision = null;
let saveQueue = Promise.resolve();
const LOCAL_KEY = '3dPrintPricingData';
const RECOVERY_KEY = '3dPrintPricingRecovery';

function showStatus(message, attention = false) {
    const element = document.getElementById('error-message');
    element.textContent = message;
    element.style.display = 'block';
    document.getElementById('notification-status').textContent = attention ? 'Needs attention' : message;
    if (attention) document.getElementById('notifications').open = true;
}

function snapshot() { return normalizeData({ globalSettings, jobs, nextId }); }
function applyData(data) {
    ({ globalSettings, jobs, nextId } = normalizeData(data));
}

async function persist(data, importing = false) {
    if (storageMode === 'local') {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(data));
        showStatus('Saved locally in this browser.');
        return;
    }
    const previousRecovery = localStorage.getItem(RECOVERY_KEY);
    localStorage.setItem(RECOVERY_KEY, JSON.stringify(data));
    if (storageMode !== 'server') throw new Error('Server unavailable. Edits are kept in a local recovery copy; export them before reloading.');
    const response = await fetch(importing ? '/api/import' : '/api/data', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': serverRevision },
        body: JSON.stringify(data), redirect: 'error'
    });
    if (response.status === 401) throw new Error('Session expired. Export your edits, then sign in again. A local recovery copy is available.');
    if (response.status === 409) throw new Error('Another device changed the data. Export your edits, then reload. A local recovery copy is available.');
    if (!response.ok) throw new Error('Server save failed. Export your edits before reloading. A local recovery copy is available.');
    serverRevision = response.headers.get('ETag');
    if (previousRecovery) localStorage.setItem(RECOVERY_KEY, previousRecovery);
    else localStorage.removeItem(RECOVERY_KEY);
    showStatus('Saved to server.');
}

function queueSave(data, importing = false) {
    const task = saveQueue.then(() => persist(data, importing)).catch(err => {
        document.getElementById('export-recovery').hidden = !localStorage.getItem(RECOVERY_KEY);
        throw err;
    });
    saveQueue = task.catch(() => {});
    return task;
}

function saveData() {
    try {
        showStatus('Saving…');
        return queueSave(snapshot()).catch(err => showStatus(err.message, true));
    } catch (err) { showStatus(err.message, true); }
}

async function loadData() {
    try {
        if (location.protocol === 'file:') storageMode = 'local';
        else {
            const response = await fetch('/api/data', { redirect: 'error', cache: 'no-store' });
            if (response.status === 404) storageMode = 'local';
            else {
                if (response.status === 401) throw new Error('Sign in at /login.html, then reload.');
                if (!response.ok) throw new Error('Server data could not be loaded. Reload before editing.');
                applyData(await response.json());
                serverRevision = response.headers.get('ETag');
                storageMode = 'server';
                showStatus('Loaded from server.');
            }
        }
        if (storageMode === 'local') {
            const saved = localStorage.getItem(LOCAL_KEY);
            if (saved) applyData(JSON.parse(saved));
            showStatus('Local mode: data is saved in this browser.');
        }
        if (localStorage.getItem(RECOVERY_KEY)) {
            document.getElementById('export-recovery').hidden = false;
            showStatus('A recovery copy from an unsuccessful save is available. Download it before making further edits.', true);
        }
    } catch (err) {
        storageMode = 'blocked';
        showStatus(`Unable to load data: ${err.message}`, true);
        document.getElementById('global-settings').querySelectorAll('input').forEach(input => input.disabled = true);
        document.getElementById('add-row').disabled = true;
        document.getElementById('import-data').disabled = true;
        document.getElementById('export-recovery').hidden = !localStorage.getItem(RECOVERY_KEY);
    }
}

// Render functions
function formatJobTotal(total, count = 1) {
    if (!total) return '';
    const price = `${total} ${globalSettings.currencySymbol}`;
    return count > 1 ? `${price} (${(total / count).toFixed(1)})` : price;
}

function renderGlobalSettings() {
    document.getElementById('printer-power').value = globalSettings.printerPower;
    document.getElementById('electricity-price').value = globalSettings.electricityPrice;
    document.getElementById('currency-symbol').value = globalSettings.currencySymbol;
}

function renderTable() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';

    jobs.forEach(job => {
        const calc = calculateJob(job);
        const row = document.createElement('tr');
        row.setAttribute('data-job-id', job.id);

        row.innerHTML = `
            <td>
                <button type="button" class="action-btn drag-handle" title="Drag to reorder" aria-label="Drag to reorder ${escapeHTML(job.name || 'row')}">⠿</button>
                <button class="action-btn duplicate-btn" title="Duplicate">🔄</button>
                <button class="action-btn delete-btn" title="Delete">🗑️</button>
                <button class="action-btn clear-btn" title="Clear">🧹</button>
            </td>
            <td><input type="text" class="input-name" data-field="name" value="${escapeHTML(job.name)}"></td>
            <td><input type="number" class="input-count" data-field="count" value="${escapeHTML(job.count ?? 1)}" min="1" step="1" required aria-label="Number of objects on the plate"></td>
            <td class="material-cell">
                <select class="input-material ${isMaterialPreset(job.material) ? 'material-preset' : ''}" data-field="material" value="${escapeHTML(job.material)}" style="${isMaterialPreset(job.material) || !job.material ? 'display: inline-block;' : 'display: none;'}">
                    <option value="">Custom...</option>
                    <option value="pla" ${job.material === 'pla' ? 'selected' : ''}>PLA</option>
                    <option value="abs" ${job.material === 'abs' ? 'selected' : ''}>ABS</option>
                    <option value="petg" ${job.material === 'petg' ? 'selected' : ''}>PETG</option>
                    <option value="tpu" ${job.material === 'tpu' ? 'selected' : ''}>TPU</option>
                    <option value="pa" ${job.material === 'pa' ? 'selected' : ''}>PA</option>
                    <option value="asa" ${job.material === 'asa' ? 'selected' : ''}>ASA</option>
                    <option value="pc" ${job.material === 'pc' ? 'selected' : ''}>PC</option>
                </select>
                <input type="text" class="input-material-custom material-custom" data-field="material" value="${escapeHTML(job.material)}" placeholder="Custom material" style="${!isMaterialPreset(job.material) && job.material ? 'display: inline-block;' : 'display: none;'}">
            </td>
            <td><input type="number" class="input-price" data-field="priceKg" value="${escapeHTML(job.priceKg)}"></td>
            <td><input type="number" class="input-weight" data-field="weightG" value="${escapeHTML(job.weightG)}"></td>
            <td><input type="text" class="input-time" data-field="printTime" value="${escapeHTML(job.printTime)}" placeholder="H:MM" maxlength="10"></td>
            <td class="filament-cell">
                <span class="filament-length ${job.customDensity ? 'custom-density' : (isMaterialPreset(job.material) ? 'preset-density' : 'default-density')}">${calc.filamentLength || ''}</span>
                <button class="density-edit-btn" title="Material density: ${getMaterialLinearDensity(job.material, job.customDensity).toFixed(2)} g/m">⚙️</button>
                <input type="number" class="input-density" data-field="customDensity" value="${job.customDensity || ''}" placeholder="${getMaterialDensity(job.material).toFixed(2)}" aria-label="Material density (g/cm³)" title="Material density (g/cm³)" step="0.01" min="0.01" style="display: none;">
            </td>
            <td>${calc.materialPrice ? `${calc.materialPrice} ${escapeHTML(globalSettings.currencySymbol)}` : ''}</td>
            <td>${calc.electricityCost ? `${calc.electricityCost} ${escapeHTML(globalSettings.currencySymbol)}` : ''}</td>
            <td>${escapeHTML(formatJobTotal(calc.totalCost, job.count))}</td>
            <td>${escapeHTML(formatJobTotal(calc.sellingPrice, job.count))}</td>
        `;

        tbody.appendChild(row);
    });
}

function moveJob(id, targetId, after = false) {
    const from = jobs.findIndex(job => job.id === id);
    if (from < 0 || id === targetId || !jobs.some(job => job.id === targetId)) return false;
    const reordered = [...jobs];
    const [job] = reordered.splice(from, 1);
    const to = reordered.findIndex(item => item.id === targetId) + (after ? 1 : 0);
    reordered.splice(to, 0, job);
    if (reordered.every((item, index) => item === jobs[index])) return false;
    jobs = reordered;
    saveData();
    return true;
}

function initRowReordering() {
    const tbody = document.getElementById('table-body');
    const marker = document.createElement('div');
    marker.className = 'row-drop-marker';
    marker.hidden = true;
    marker.setAttribute('aria-hidden', 'true');
    document.body.appendChild(marker);
    let drag = null;
    function clearMarker() {
        marker.hidden = true;
    }
    function dropTarget(event) {
        const row = document.elementFromPoint(event.clientX, event.clientY)?.closest('tr[data-job-id]');
        if (!row || !tbody.contains(row) || row === drag.row) return null;
        const rows = [...tbody.querySelectorAll('tr[data-job-id]')];
        const bounds = row.getBoundingClientRect();
        const gap = rows.indexOf(row) + (event.clientY > bounds.top + bounds.height / 2 ? 1 : 0);
        const previous = rows[gap - 1];
        const next = rows[gap];
        if (previous === drag.row || next === drag.row) return null;
        const y = previous && next
            ? (previous.getBoundingClientRect().bottom + next.getBoundingClientRect().top) / 2
            : next ? next.getBoundingClientRect().top : previous.getBoundingClientRect().bottom;
        return { row: next || previous, after: !next, y };
    }
    function finish(event, cancelled = false) {
        if (!drag || event.pointerId !== drag.pointerId) return;
        const target = !cancelled && drag.moved ? dropTarget(event) : null;
        const id = Number(drag.row.dataset.jobId);
        drag.row.classList.remove('row-dragging');
        clearMarker();
        drag = null;
        if (target && moveJob(id, Number(target.row.dataset.jobId), target.after)) {
            renderTable();
            tbody.querySelector(`tr[data-job-id="${id}"] .drag-handle`).focus({ preventScroll: true });
        }
    }
    tbody.addEventListener('pointerdown', event => {
        const handle = event.target.closest('.drag-handle');
        if (!handle || event.button !== 0 || drag || storageMode === 'blocked' || storageMode === 'loading') return;
        handle.focus();
        drag = { row: handle.closest('tr'), pointerId: event.pointerId, startY: event.clientY, moved: false };
        handle.setPointerCapture(event.pointerId);
        event.preventDefault();
    });
    tbody.addEventListener('pointermove', event => {
        if (!drag || event.pointerId !== drag.pointerId) return;
        if (Math.abs(event.clientY - drag.startY) > 4) drag.moved = true;
        if (!drag.moved) return;
        drag.row.classList.add('row-dragging');
        clearMarker();
        const target = dropTarget(event);
        if (target) {
            const bounds = tbody.getBoundingClientRect();
            const container = document.getElementById('table-container').getBoundingClientRect();
            const left = Math.max(bounds.left, container.left, 0);
            const right = Math.min(bounds.right, container.right, window.innerWidth);
            marker.style.left = `${left}px`;
            marker.style.width = `${Math.max(0, right - left)}px`;
            marker.style.top = `${target.y}px`;
            marker.hidden = false;
        }
        if (event.clientY < 60) window.scrollBy(0, -20);
        else if (event.clientY > window.innerHeight - 60) window.scrollBy(0, 20);
    });
    tbody.addEventListener('pointerup', event => finish(event));
    tbody.addEventListener('pointercancel', event => finish(event, true));
    tbody.addEventListener('lostpointercapture', event => finish(event, true));
    tbody.addEventListener('keydown', event => {
        if (event.key === 'Escape' && drag) {
            finish({ pointerId: drag.pointerId }, true);
            return;
        }
    });
}

// Event handlers
function handleGlobalChange() {
    for (const id of ['printer-power', 'electricity-price']) {
        const input = document.getElementById(id);
        if (!input.checkValidity() || input.value === '' || Number(input.value) < 0) return;
    }
    globalSettings.printerPower = parseFloat(document.getElementById('printer-power').value) || 0;
    globalSettings.electricityPrice = parseFloat(document.getElementById('electricity-price').value) || 0;
    const currencyInput = document.getElementById('currency-symbol').value.trim();
    globalSettings.currencySymbol = currencyInput || '🦁';
    saveData();
    renderTable();
}

function handleTableChange(event) {
    const target = event.target;
    if ((target.tagName === 'INPUT' || target.tagName === 'SELECT') && target.hasAttribute('data-field')) {
        const row = target.closest('tr');
        const jobId = parseInt(row.getAttribute('data-job-id'));
        const field = target.getAttribute('data-field');
        let value = target.type === 'number' ? parseFloat(target.value) || 0 : target.value;
        if (field === 'count' && (!Number.isSafeInteger(value) || value < 1)) {
            target.setCustomValidity('Enter a whole number of objects, at least 1.');
            return;
        }
        
        if (target.type === 'number' && (target.value === '' || !Number.isFinite(value) || value < 0 || (field === 'customDensity' && value === 0))) {
            if (!(field === 'customDensity' && target.value === '')) {
                target.setCustomValidity('Enter a valid non-negative number (density must be greater than zero).');
                return;
            }
        }
        target.setCustomValidity('');
        // Handle material dropdown: show custom input when Custom is selected
        if (field === 'material' && target.tagName === 'SELECT') {
            const cell = target.closest('td');
            const materialSelect = cell.querySelector('.input-material');
            const customInput = cell.querySelector('.input-material-custom');
            if (value === '') {
                materialSelect.style.display = 'none';
                customInput.style.display = 'inline-block';
                customInput.focus();
                return; // Don't update job yet, wait for custom input
            }
        }

        if (field === 'priceKg' || field === 'weightG') {
            value = roundup(value, 1);
            target.value = value;
        } else if (field === 'customDensity') {
            value = parseFloat(value) || null;
            if (value) target.value = value;
        } else if (field === 'printTime') {
            // Format on blur only to avoid interfering with typing
            if (event.type === 'blur' || event.type === 'change') {
                value = formatTime(value);
                if (value === null) { target.setCustomValidity('Enter a duration such as 2:30 or 25:00.'); return; }
                target.value = value;
            }
        }

        if (field === 'printTime' && !validateTime(value)) return;
        if (field === 'material') value = value.trim().toLowerCase();
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            job[field] = value;
            
            // If material field changed and it's now a preset, switch back to dropdown
            if (field === 'material') {
                const cell = target.closest('td');
                const materialSelect = cell.querySelector('.input-material');
                const customInput = cell.querySelector('.input-material-custom');
                if (isMaterialPreset(value)) {
                    materialSelect.value = value.toLowerCase();
                    materialSelect.style.display = 'inline-block';
                    materialSelect.classList.add('material-preset');
                    customInput.style.display = 'none';
                } else {
                    materialSelect.classList.remove('material-preset');
                }
            }
            
            saveData();
            // Update calculated fields in the row
            const calc = calculateJob(job);
            const tds = row.querySelectorAll('td');
            // Update filament length span inside the cell
            const filamentSpan = tds[7].querySelector('.filament-length');
            if (filamentSpan) {
                filamentSpan.textContent = calc.filamentLength || '';
                let className = 'filament-length';
                if (job.customDensity) {
                    className += ' custom-density';
                } else if (isMaterialPreset(job.material)) {
                    className += ' preset-density';
                } else {
                    className += ' default-density';
                }
                filamentSpan.className = className;
            }
            // Update density button tooltip and input placeholder
            const densityBtn = tds[7].querySelector('.density-edit-btn');
            const densityInput = tds[7].querySelector('.input-density');
            if (densityBtn) {
                densityBtn.title = `Material density: ${getMaterialLinearDensity(job.material, job.customDensity).toFixed(2)} g/m`;
            }
            if (densityInput && field === 'material') {
                // Update placeholder when material changes
                densityInput.placeholder = getMaterialDensity(job.material).toFixed(2);
            }
            tds[8].textContent = calc.materialPrice ? `${calc.materialPrice} ${globalSettings.currencySymbol}` : '';
            tds[9].textContent = calc.electricityCost ? `${calc.electricityCost} ${globalSettings.currencySymbol}` : '';
            tds[10].textContent = formatJobTotal(calc.totalCost, job.count);
            tds[11].textContent = formatJobTotal(calc.sellingPrice, job.count);
        }
    }
}

function handleActions(event) {
    const target = event.target;
    if (target.classList.contains('density-edit-btn')) {
        const cell = target.closest('td');
        const densityInput = cell.querySelector('.input-density');
        const isVisible = densityInput.style.display !== 'none';
        densityInput.style.display = isVisible ? 'none' : 'inline-block';
        if (!isVisible) {
            densityInput.focus();
        }
    } else if (target.classList.contains('duplicate-btn')) {
        const row = target.closest('tr');
        const jobId = parseInt(row.getAttribute('data-job-id'));
        const job = jobs.find(j => j.id === jobId);
        if (job) {
            const newJob = { ...job, id: nextId++ };
            jobs.push(newJob);
            saveData();
            renderTable();
        }
    } else if (target.classList.contains('delete-btn')) {
        if (confirm('Are you sure you want to delete this row?')) {
            const row = target.closest('tr');
            const jobId = parseInt(row.getAttribute('data-job-id'));
            jobs = jobs.filter(j => j.id !== jobId);
            saveData();
            renderTable();
        }
    } else if (target.classList.contains('clear-btn')) {
        if (confirm('Are you sure you want to clear this row?')) {
            const row = target.closest('tr');
            const jobId = parseInt(row.getAttribute('data-job-id'));
            const job = jobs.find(j => j.id === jobId);
            if (job) {
                job.name = '';
                job.count = 1;
                job.material = '';
                job.priceKg = 0;
                job.weightG = 0;
                job.printTime = '0:00';
                job.customDensity = null;
                saveData();
                renderTable();
            }
        }
    }
}

function handleAddRow() {
    const newJob = {
        id: nextId++,
        name: '',
        count: 1,
        material: '',
        priceKg: 0,
        weightG: 0,
        printTime: '0:00'
    };
    jobs.push(newJob);
    saveData();
    renderTable();
}

function downloadJSON(text, filename) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function handleExport() {
    downloadJSON(JSON.stringify(snapshot(), null, 2), '3d-print-pricing.json');
}

async function handleImport() {
    const textarea = document.getElementById('import-textarea');
    const controls = [...document.querySelectorAll('input, select, button, textarea')];
    const disabled = controls.map(control => control.disabled);
    try {
        const data = normalizeData(JSON.parse(textarea.value));
        controls.forEach(control => control.disabled = true);
        await queueSave(data, true);
        applyData(data);
        renderGlobalSettings();
        renderTable();
        textarea.style.display = 'none';
        importMode = false;
    } catch (err) {
        showStatus(`Import failed: ${err.message}`, true);
    } finally {
        controls.forEach((control, index) => control.disabled = disabled[index]);
    }
}

// Update backup status display
// Shows: "just now", "X min(s) ago", "Xh Xm ago", or "No backups yet"
async function updateBackupStatus() {
    if (storageMode !== 'server') return;
    try {
        const response = await fetch('/api/last-backup');
        if (response.ok) {
            const data = await response.json();
            const backupText = document.getElementById('backup-text');
            if (data.lastBackup) {
                const backupTime = new Date(data.lastBackup);
                const now = new Date();
                const diffMs = now - backupTime;
                const diffMins = Math.floor(diffMs / 60000);
                const diffHours = Math.floor(diffMins / 60);
                
                let timeAgo;
                if (diffMins < 1) {
                    timeAgo = 'just now';
                } else if (diffMins < 60) {
                    timeAgo = `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
                } else {
                    const mins = diffMins % 60;
                    timeAgo = `${diffHours}h ${mins}m ago`;
                }
                
                backupText.textContent = `🕐 Last backup: ${timeAgo}`;
                document.getElementById('backup-status').style.display = 'block';
            } else {
                backupText.textContent = '🕐 No backups yet';
                document.getElementById('backup-status').style.display = 'block';
            }
        }
    } catch (err) {
        // Silently fail if not in server mode
        document.getElementById('backup-status').style.display = 'none';
    }
}

// Multi-plate scratch calculator. Keep durations in minutes, including beyond 24 hours.
function sumPlates(plates) {
    let weightG = 0;
    let minutes = 0;
    for (const plate of plates) {
        const weight = Number(plate.weightG);
        const time = formatTime(plate.printTime.trim());
        if (String(plate.weightG).trim() === '' || !Number.isFinite(weight) || weight < 0 || time === null) return null;
        const parsed = parseTime(time);
        weightG += weight;
        minutes += parsed.hours * 60 + parsed.minutes;
        if (!Number.isFinite(weightG) || !Number.isSafeInteger(minutes)) return null;
    }
    return { weightG: Math.round(weightG * 1e6) / 1e6,
        printTime: `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}` };
}

function updatePlateTotals() {
    const rows = [...document.querySelectorAll('.plate-row')];
    const totals = sumPlates(rows.map(row => ({
        weightG: row.querySelector('.plate-weight').value,
        printTime: row.querySelector('.plate-time').value
    })));
    document.getElementById('plate-totals').textContent = totals
        ? `Total weight: ${totals.weightG} g · Total print time: ${totals.printTime}`
        : 'Enter a valid weight and print time (H:MM) for every plate.';
    document.getElementById('use-plate-totals').disabled = !totals || !rows.length || storageMode === 'blocked' || storageMode === 'loading';
    return totals;
}

function addPlate() {
    const row = document.createElement('div');
    row.className = 'plate-row';
    row.innerHTML = `<strong class="plate-label"></strong>
        <label>Weight (g) <input class="plate-weight" type="number" min="0" step="any" value="0" required></label>
        <label>Print time (H:MM) <input class="plate-time" type="text" value="0:00" placeholder="H:MM" required></label>
        <button type="button" class="remove-plate">Remove</button>`;
    document.getElementById('plate-inputs').appendChild(row);
    renumberPlates();
}

function renumberPlates() {
    document.querySelectorAll('.plate-row').forEach((row, index) => {
        row.querySelector('.plate-label').textContent = `Plate ${index + 1}`;
        row.querySelector('.remove-plate').setAttribute('aria-label', `Remove plate ${index + 1}`);
    });
    updatePlateTotals();
}

function initPlateCalculator() {
    for (let i = 0; i < 3; i++) addPlate();
    document.getElementById('add-plate').addEventListener('click', addPlate);
    document.getElementById('plate-inputs').addEventListener('input', updatePlateTotals);
    document.getElementById('plate-inputs').addEventListener('click', event => {
        if (!event.target.classList.contains('remove-plate')) return;
        event.target.closest('.plate-row').remove();
        renumberPlates();
    });
    document.getElementById('plate-form').addEventListener('submit', event => {
        event.preventDefault();
        const totals = updatePlateTotals();
        if (!totals || document.getElementById('use-plate-totals').disabled) return;
        const id = nextId++;
        jobs.push({ id, name: '', material: '', priceKg: 0, count: 1,
            weightG: roundup(totals.weightG, 1), printTime: totals.printTime, customDensity: null });
        saveData();
        renderTable();
        const input = document.querySelector(`tr[data-job-id="${id}"] .input-name`);
        input.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        input.focus({ preventScroll: true });
    });
}

// Init
let importMode = false;

document.addEventListener('DOMContentLoaded', async () => {
    await loadData();
    renderGlobalSettings();
    renderTable();

    initPlateCalculator();
    initRowReordering();

    // Show warning if using default credentials
    if (sessionStorage.getItem('usingDefaultCredentials') === 'true') {
        document.getElementById('warning-message').style.display = 'block';
        document.getElementById('credential-badge').hidden = false;
    }
    
    // Update backup status
    updateBackupStatus();
    setInterval(updateBackupStatus, 60000); // Update every minute

    // Event listeners
    document.getElementById('printer-power').addEventListener('input', handleGlobalChange);
    document.getElementById('electricity-price').addEventListener('input', handleGlobalChange);
    document.getElementById('currency-symbol').addEventListener('input', handleGlobalChange);

    document.getElementById('table-body').addEventListener('input', handleTableChange);
    document.getElementById('table-body').addEventListener('blur', handleTableChange, true);
    document.getElementById('table-body').addEventListener('click', handleActions);

    document.getElementById('add-row').addEventListener('click', handleAddRow);
    document.getElementById('export-recovery').addEventListener('click', () => {
        const data = localStorage.getItem(RECOVERY_KEY);
        if (data) downloadJSON(data, '3d-print-recovery.json');
    });
    document.getElementById('export-data').addEventListener('click', handleExport);
    document.getElementById('import-data').addEventListener('click', () => {
        const textarea = document.getElementById('import-textarea');
        if (!importMode) {
            textarea.style.display = 'block';
            textarea.value = '';
            importMode = true;
        } else {
            handleImport();

        }
    });
});
