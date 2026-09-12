const express = require('express');
const fs = require('fs');
const path = require('path');
const session = require('express-session');
const crypto = require('crypto');
const { normalizeData } = require('./data-model');

const app = express();
const PORT = process.env.PORT || 80;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data/data.json');
const DATA_FILE_EXAMPLE = 'data/data.json.example';

// Ensure data directory exists and initialize with example if needed
function initializeDataFile() {
  const dataDir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  if (!fs.existsSync(DATA_FILE)) {
    if (fs.existsSync(DATA_FILE_EXAMPLE)) {
      fs.copyFileSync(DATA_FILE_EXAMPLE, DATA_FILE);
      console.log('✓ Initialized data.json from example');
    } else {
      // Fallback: create minimal structure
      const defaultData = {
        globalSettings: { printerPower: 100, electricityPrice: 0.12, currencySymbol: '🦁' },
        jobs: [],
        nextId: 1
      };
      fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
      console.log('✓ Created default data.json');
    }
  }
}

initializeDataFile();
// Default credentials (use environment variables for production)
const AUTH_USERNAME = process.env.AUTH_USERNAME || 'admin';
const AUTH_PASSWORD = process.env.AUTH_PASSWORD ?? 'admin';

// Safety checks
if (!AUTH_PASSWORD || AUTH_PASSWORD.trim() === '') {
  console.error('\n⛔ SECURITY ERROR: Password cannot be empty');
  console.error('Set AUTH_PASSWORD environment variable with a non-empty value');
  process.exit(1);
}

if ((AUTH_USERNAME === 'admin' && AUTH_PASSWORD === 'admin') && process.env.ALLOW_DEFAULT_CREDENTIALS !== 'true') {
  console.error('\n⛔ SECURITY ERROR: Using default credentials (admin/admin)');
  console.error('Set custom AUTH_USERNAME and AUTH_PASSWORD environment variables');
  console.error('Example: docker-compose up');
  console.error('Or set ALLOW_DEFAULT_CREDENTIALS=true to override (NOT recommended)\n');
  process.exit(1);
}

// Generate secure session secret if not provided or is placeholder
let SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET || SESSION_SECRET === 'change-this-secret-key' || SESSION_SECRET === 'change-this-in-production') {
  SESSION_SECRET = crypto.randomBytes(32).toString('hex');
  console.log('Generated random SESSION_SECRET for this session');
}

app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Authentication middleware
function requireAuth(req, res, next) {
  if (req.session.authenticated) {
    next();
  } else {
    if (req.path.startsWith('/api/')) res.status(401).json({ error: 'Session expired. Sign in again.' });
    else res.redirect('/login.html');
  }
}

// Login endpoint
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === AUTH_USERNAME && password === AUTH_PASSWORD) {
    req.session.regenerate(err => {
      if (err) return res.sendStatus(500);
      req.session.authenticated = true;
      req.session.save(err => res.sendStatus(err ? 500 : 200));
    });
  } else {
    res.sendStatus(401);
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.sendStatus(200);
});

function revision(text) {
  return '"' + crypto.createHash('sha256').update(text).digest('hex') + '"';
}

function validateWrite(req, res, next) {
  try {
    req.body = normalizeData(req.body);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
  try {
    if (req.get('If-Match') !== revision(fs.readFileSync(DATA_FILE, 'utf8'))) {
      return res.status(409).json({ error: 'Data changed on another device. Export your edits, then reload before saving.' });
    }
    next();
  } catch (err) {
    res.status(500).json({ error: 'Unable to read stored data.' });
  }
}

function atomicWrite(data) {
  const temporary = DATA_FILE + '.tmp';
  try {
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, DATA_FILE);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

// Protected data endpoints
app.get('/api/data', requireAuth, (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = fs.readFileSync(DATA_FILE, 'utf8');
      res.set('ETag', revision(data));
      res.json(JSON.parse(data));
    } else {
      // Default data
      const defaultData = {
        globalSettings: { printerPower: 100, electricityPrice: 0.12, currencySymbol: '🦁' },
        jobs: [],
        nextId: 1
      };
      res.json(defaultData);
    }
  } catch (err) {
    console.error('Error loading data:', err);
    res.status(500).send('Error loading data');
  }
});

app.post('/api/data', requireAuth, validateWrite, (req, res) => {
  try {
    atomicWrite(req.body);
    res.set('ETag', revision(fs.readFileSync(DATA_FILE, 'utf8')));
    res.sendStatus(200);
  } catch (err) {
    console.error('Error saving data:', err);
    res.status(500).send('Error saving data');
  }
});

// Import endpoint with backup
app.post('/api/import', requireAuth, validateWrite, (req, res) => {
  try {
    // Check if data is different before backing up
    let shouldBackup = true;
    if (fs.existsSync(DATA_FILE)) {
      const currentData = fs.readFileSync(DATA_FILE, 'utf8');
      const newData = JSON.stringify(req.body, null, 2);
      
      if (currentData === newData) {
        shouldBackup = false;
        console.log('⏭️  Import skipped backup - data unchanged');
      }
    }
    
    // Backup existing data before import only if different
    if (shouldBackup && fs.existsSync(DATA_FILE)) {
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const backupFile = `${DATA_FILE}.import-backup-${timestamp}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
      fs.copyFileSync(DATA_FILE, backupFile);
      console.log(`✓ Import backup created: ${backupFile}`);
      
      // Keep only last 10 import backups
      const backupFiles = fs.readdirSync(path.dirname(DATA_FILE))
        .filter(f => f.startsWith('data.json.import-backup-'))
        .map(f => path.join(path.dirname(DATA_FILE), f))
        .sort()
        .reverse();
      
      if (backupFiles.length > 10) {
        backupFiles.slice(10).forEach(f => {
          fs.unlinkSync(f);
          console.log(`✓ Removed old import backup: ${path.basename(f)}`);
        });
      }
    }
    
    atomicWrite(req.body);
    res.set('ETag', revision(fs.readFileSync(DATA_FILE, 'utf8')));
    res.sendStatus(200);
  } catch (err) {
    console.error('Error importing data:', err);
    res.status(500).send('Error importing data');
  }
});

// Serve login page without authentication
app.get('/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Get last backup timestamp
app.get('/api/last-backup', requireAuth, (req, res) => {
  try {
    const backupFiles = fs.readdirSync(path.dirname(DATA_FILE))
      .filter(f => f.startsWith('data.json.auto-backup-'))
      .map(f => {
        const stats = fs.statSync(path.join(path.dirname(DATA_FILE), f));
        return { name: f, time: stats.mtime };
      })
      .sort((a, b) => b.time - a.time);
    
    if (backupFiles.length > 0) {
      res.json({ lastBackup: backupFiles[0].time });
    } else {
      res.json({ lastBackup: null });
    }
  } catch (err) {
    console.error('Error getting last backup:', err);
    res.json({ lastBackup: null });
  }
});

// Protect all other static files
for (const file of ['index.html', 'script.js', 'styles.css', 'data-model.js']) {
  app.get(file === 'index.html' ? ['/', '/index.html'] : '/' + file, requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, file));
  });
}

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${server.address().port}`);
});

// Automatic periodic backup every 6 hours
function createAutoBackup() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const now = new Date();
      const timestamp = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}T${String(now.getHours()).padStart(2,'0')}-${String(now.getMinutes()).padStart(2,'0')}`;
      const backupFile = `${DATA_FILE}.auto-backup-${timestamp}`;
      fs.copyFileSync(DATA_FILE, backupFile);
      console.log(`✓ Auto backup created: ${backupFile}`);
      
      // Keep only last 5 auto backups
      const backupFiles = fs.readdirSync(path.dirname(DATA_FILE))
        .filter(f => f.startsWith('data.json.auto-backup-'))
        .map(f => path.join(path.dirname(DATA_FILE), f))
        .sort()
        .reverse();
      
      if (backupFiles.length > 5) {
        backupFiles.slice(5).forEach(f => {
          fs.unlinkSync(f);
          console.log(`✓ Removed old auto backup: ${path.basename(f)}`);
        });
      }
    }
  } catch (err) {
    console.error('Error creating auto backup:', err);
  }
}

// Create initial backup on startup
createAutoBackup();

// Schedule periodic backups every 6 hours (21600000 ms)
setInterval(createAutoBackup, 6 * 60 * 60 * 1000);
