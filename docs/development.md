# Development

[Back to README](../README.md)

## Application checks

Use Node.js 22 and run commands from the repository root:

```sh
npm ci
npm test
```

Tests cover calculations, validation, safe rendering, browser saving, session
expiry, save ordering, and live server import/conflict/backup behavior. Server
tests use temporary data. The lockfile makes dependency installs reproducible;
the `qs` override selects the patched minor release while Express specifies an
older range.

The browser app consists of `index.html`, `styles.css`, and `script.js`.
`data-model.js` provides shared validation; `server.js` handles authenticated
storage and backups. Open `index.html` for browser-only development. For server
behavior, use the [local Docker setup](deployment.md#build-and-run-locally).

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
