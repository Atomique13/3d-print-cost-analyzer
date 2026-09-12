# Docker setup

[Back to README](../README.md)

## Run the published image

The repository's [docker-compose.yml](../docker-compose.yml) uses
`ghcr.io/atomique13/3d-print-cost-analyzer:latest`. Set your own `AUTH_USERNAME`
and `AUTH_PASSWORD` in that file, then run from the repository root:

```sh
docker compose up -d --wait
```

Open [localhost:8080](http://localhost:8080) and sign in. The host port is 8080;
the container listens on port 80. The health check tests the login page.

To update, pull the image and recreate the service:

```sh
docker compose pull
docker compose up -d --wait
```

## Build and run locally

On Windows, run `.\test-local.ps1` from the repository root. It builds before
replacing the container and waits for health; a failed build leaves the previous
container running. On other platforms:

```sh
docker compose -f docker-compose.local.yml up --build -d --wait
```

The local configuration uses `admin/admin` with an explicit default-credential
override. It is intended for local testing. Open the same localhost address above.
Use `docker compose -f docker-compose.local.yml logs -f` to inspect local logs.

## Configuration

| Variable | Behavior |
| --- | --- |
| `AUTH_USERNAME` | Login name; defaults to `admin`. |
| `AUTH_PASSWORD` | Login password; empty values are rejected. Set your own password. |
| `ALLOW_DEFAULT_CREDENTIALS` | Only `true` permits `admin/admin`; used by local testing. |
| `SESSION_SECRET` | Optional session signing secret; generated on startup if omitted. |
| `PORT` | Listening port inside the container; defaults to `80`. Update the port mapping if changed. |
| `DATA_FILE` | Optional data file path; defaults to `/app/data/data.json` in Docker. |

Sessions expire after 24 hours and are stored in server memory, so restarting
the server requires signing in again. The provided configuration serves HTTP;
use an HTTPS reverse proxy if deploying it beyond your local network.

## Storage and backups

Both Compose files mount `./data` at `/app/data`. Keep that mount to preserve
jobs and backups when replacing the container. A new dataset starts from the
included example file.

- Automatic backups run on startup and every six hours; the last five are retained.
- Imports back up changed data before replacement; the last ten are retained.
- Identical serialized import data skips the backup.

Backups live beside `data.json`, with `auto-backup` or `import-backup` in their
names. Restore one by pasting its JSON into the app's import box. Export current
work first if you need to keep it. The app displays the last automatic backup time.

For build commands and image tags, see [Development](development.md).
