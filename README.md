# 3D Print Cost Analyzer

> Calculate 3D print costs and profits with real measurements – no guesswork!

A powerful web app for 3D printing enthusiasts and businesses. Built with vanilla HTML, CSS, and JavaScript – runs both locally in your browser and on a server for multi-device synchronization.

**🌐 Try it online:** https://atomique13.github.io/3d-print-cost-analyzer/

## Two Deployment Modes

### 1. Local Mode (Browser-Based)
- **No server required**: Open `index.html` directly in your browser
- **Browser Storage**: Data persists in browser localStorage
- **Single Device**: Perfect for quick calculations and testing
- **Instant**: Zero setup, immediate use

### 2. Server Mode (Docker/Express.js)
- **Multi-Device**: Access from any device on your network
- **Server Storage**: Data saved to `data/data.json` on the server
- **Authentication**: Simple login system to protect your pricing data
- **Docker Ready**: Pre-configured containerization for easy deployment

## Features

- **Live Spreadsheet Interface**: Inline editing with instant calculations
- **Real-Time Updates**: Costs update as you type
- **Material Dropdown Selector**: Quick-select from 7 preset materials or enter custom materials
- **Smart Material Detection**: Type a preset name in custom field to auto-switch to dropdown
- **Material Density Lookup**: Preset densities for common filaments (PLA, ABS, PETG, TPU, PA, ASA, PC)
- **Custom Density Override**: Adjust material density per job with visual indicators
- **Color-Coded Materials**: Green for preset materials, orange for custom materials
- **Customizable Currency**: Set your own currency symbol (defaults to 🦁)
- **Automatic Backups**: Server mode creates automatic backups every 6 hours (keeps last 5)
- **Import Protection**: Creates backup before importing JSON data (keeps last 10)
- **Smart Backup**: Skips backup if imported data is identical to existing data
- **Backup Status Display**: Shows time since last backup in the UI
- **JSON Export/Import**: Backup and share your pricing data
- **Mobile-Friendly**: Responsive design for phone and PC
- **Privacy-First**: Local mode keeps all data on your device; server mode uses secure session storage
- **Secure by Default**: Blocks default credentials in production, auto-generates session secrets

### Per-Job Calculations
- Time parsing and conversion
- Filament length (using material-specific densities)
- Material and electricity costs
- Profit estimation with smart formula

## Quick Start

### Live Demo (GitHub Pages)
Open https://atomique13.github.io/3d-print-cost-analyzer/ to use the app directly in your browser with localStorage persistence.

### Local (No Installation)
1. Download or clone the repo
2. Open `index.html` in your browser
3. Set printer power and electricity price
4. Add jobs and fill in details
5. View calculated costs and profits
6. Data is saved in your browser's localStorage

### Docker (Server Mode)

**For Production (Secure):**
1. Edit `docker-compose.yml` to set custom credentials:
   ```yaml
   AUTH_USERNAME: your_username
   AUTH_PASSWORD: your_secure_password
   ```
2. Run: `docker-compose up -d`
3. Open http://localhost:8080 in your browser
4. Login with your custom credentials
5. Data persists in `data/data.json` on your host machine

**For Local Testing:**
1. Run: `.\test-local.ps1` (Windows) or `docker compose -f docker-compose.local.yml up --build -d --wait`
2. Uses default admin/admin credentials (allowed via ALLOW_DEFAULT_CREDENTIALS flag)
3. Open http://localhost:8080 in your browser

**Security Features:**
- Auto-generates SESSION_SECRET if not provided
- Blocks default admin/admin credentials in production
- Rejects empty passwords
- Shows warning banners when using default credentials
- Session-based authentication protects all endpoints

### GitHub Container Registry
1. Pull: `docker pull ghcr.io/atomique13/3d-print-cost-analyzer:latest`
2. Run: `docker run -p 8080:80 -v ./data:/app/data -e AUTH_USERNAME=your_username -e AUTH_PASSWORD=your_secure_password ghcr.io/atomique13/3d-print-cost-analyzer:latest`
3. Open http://localhost:8080 in your browser

**Or use Docker Compose (recommended):**

Create a `docker-compose.yml` file:
```yaml
services:
  3d-print-analyzer:
    image: ghcr.io/atomique13/3d-print-cost-analyzer:latest
    ports:
      - "8080:80"
    volumes:
      - ./data:/app/data
    environment:
      AUTH_USERNAME: your_username
      AUTH_PASSWORD: your_secure_password
```

Then run:
```bash
docker-compose up -d
```

**Data Persistence**: In server mode, data is stored in `data/data.json` on your host. Mount the data directory with `-v ./data:/app/data` to persist data across container restarts and share across devices.

**Automatic Backups**: Server mode includes two backup systems:
- **Auto Backups**: Created every 6 hours automatically (keeps last 5)
  - Format: `data.json.auto-backup-YYYY-MM-DDTHH-MM`
- **Import Backups**: Created before importing JSON data (keeps last 10)
  - Format: `data.json.import-backup-YYYY-MM-DDTHH-MM`
  - Skips backup if imported data is identical to existing data
- All backups are stored in the mounted `data/` folder
- Backup status shown in UI with time since last backup

## Usage Guide

### Saving and recovery

The status message distinguishes local browser storage from server saves. Server
saves require the revision loaded by that browser. If another device changes the
data, the app rejects the stale save: export your edits, reload, and reconcile
them before importing. Expired sessions also show an error instead of reporting
a successful save. Failed server saves retain a browser recovery copy, available
through **Download recovery copy**; they do not silently switch to local mode.

Imports validate settings, non-negative costs/weights, positive custom densities,
unique job IDs, and durations before changing data. Durations can exceed 24 hours
(for example, `36:30`). Export JSON downloads a file; paste its contents into the
import textarea to restore it.

Custom density is entered in **g/cm³**, matching the material legend. Older versions
incorrectly treated that input as g/m. Review previously entered custom densities
if you compensated for that old behavior.

### Development checks

Run `npm ci` followed by `npm test` (Node.js 22). Tests cover calculations,
validation, safe HTML rendering, local saving, session expiry, save ordering, and
live server import/conflict/backup behavior. Server tests use temporary data.
The dependency lockfile makes installs reproducible; the `qs` override selects
the patched minor release while Express still specifies an older range.

### Global Settings
- **Printer Power (W)**: Your 3D printer's wattage
- **Electricity Price**: Cost per kWh in your area
- **Currency Symbol**: Customize your currency (max 10 characters, defaults to 🦁)

### Job Inputs
- **Name**: Job identifier
- **Material**: Select from dropdown (PLA, ABS, PETG, TPU, PA, ASA, PC) or choose "Custom..." to enter your own
- **Price/kg**: Filament cost
- **Weight (g)**: Actual printed weight
- **Print Time**: Hours:Minutes (e.g., 2:30)

### Material Selector
- **Dropdown**: Quick-select from 7 preset materials
- **Custom Entry**: Select "Custom..." to type any material name
- **Smart Detection**: Type "PLA" in custom field → auto-switches to dropdown
- **Color Coding**:
  - 🟢 Green: Preset material with known density
  - 🟠 Orange: Custom material using default or custom density

### Material Density (Filament Length)
- **Preset Densities**: Automatic calculation for 7 common materials
- **Custom Override**: Click ⚙️ gear button next to filament length to set custom density
- **Color Indicators**:
  - 🟢 Green: Using preset density from material library
  - 🟠 Orange: Custom density override applied
  - 🔵 Blue: Unknown material using PLA default (1.24 g/cm³)

### Actions
- Add Row: New job entry
- Duplicate: Copy a row
- Delete: Remove row (with confirmation)
- Clear: Reset row inputs (with confirmation)
- Export JSON: Download data
- Import JSON: Load saved data

## Material Densities (g/cm³)
- **PLA**: 1.24
- **ABS**: 1.04
- **PETG**: 1.27
- **TPU**: 1.21
- **PA (Nylon)**: 1.14
- **ASA**: 1.07
- **PC**: 1.20
- **Unknown**: 1.24 (PLA default)

## Building and publishing images

Build locally with `docker build -t print-analyzer:test .`. Run the isolated
container check with `node scripts/docker-smoke.cjs print-analyzer:test`.
It checks health, login, saving, persistence across restart, and runtime image
contents, then removes its temporary container and volume.

On Windows, `.\test-local.ps1` builds before replacing the local Compose container
and waits for a healthy result. A failed build leaves the previous container running.
The existing port mapping (`8080:80`) and data mount remain compatible.

The Docker workflow runs application tests and an AMD64 container smoke test on
pull requests, pushes to `master`/`main`, version tags (`v*`), and manual runs.
Pull requests never publish. Successful push/manual runs publish AMD64 and ARM64
images to `ghcr.io/<repository-owner>/<repository-name>` with:

- `sha-<full-commit>` for each published commit.
- Branch tags for branch builds.
- Version and major.minor tags for semantic version tags such as `v1.2.3`.
- `latest` only for the repository's default branch.

BuildKit reuses dependency layers through the GitHub Actions cache; local builds
also retain npm downloads in a cache mount. Images include OCI labels, build
provenance, and an SBOM. Only application files and production dependencies are
copied into the runtime image. Node runs directly and Docker checks `/login.html`
for health without requiring credentials. ARM64 is built in CI; the container
smoke test runs on AMD64.

The workflow follows Docker's [GitHub Actions caching guidance](https://docs.docker.com/build/ci/github-actions/cache/)
and [multi-platform build guidance](https://docs.docker.com/build/ci/github-actions/multi-platform/).
