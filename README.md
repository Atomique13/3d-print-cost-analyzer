# 3D Print Cost Analyzer

Estimate filament and electricity costs, filament length, and a suggested selling
price for your 3D prints. Built with vanilla JavaScript and an optional Express server.

[Open the app](https://atomique13.github.io/3d-print-cost-analyzer/) · [Usage guide](docs/usage.md) · [Docker setup](docs/deployment.md) · [Development](docs/development.md)

## Get started

**In your browser:** open the app above or download this repo and open
`index.html`. Data is saved in that browser.

**With Docker:** edit the credentials in [docker-compose.yml](docker-compose.yml), then run:

```sh
docker compose up -d --wait
```

Open [localhost:8080](http://localhost:8080) and sign in. This mode stores shared
data and backups in the mounted `data/` directory. See [Docker setup](docs/deployment.md)
for local builds and configuration.

## What it does

- Edit print jobs in a spreadsheet with immediate cost calculations.
- Choose from seven material presets or enter a custom material and density.
- Set printer power, electricity price, and currency.
- Duplicate jobs and import or export JSON data.
- Use authenticated server storage with backups and conflicting-save detection.

To calculate a job, set your global settings, select **Add Row**, and enter the
material price, weight, and print duration (for example, `2:30`). The suggested
selling price is three times the base cost, rounded up to a multiple of five;
it is not an actual profit calculation.

## Contributing

With Node.js 22 installed:

```sh
npm ci
npm test
```

See [Development](docs/development.md) for image builds, container checks, and CI.
Licensed under [MIT](LICENSE).
