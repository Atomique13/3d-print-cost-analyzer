# Usage guide

[Back to README](../README.md)

## Settings and jobs

Set printer power in watts, electricity price per kWh, and a currency symbol
(up to 10 characters). Add a row for each print, then enter its name, material,
filament price per kilogram, weight in grams, and duration in `H:MM` format.
Durations may exceed 24 hours, such as `36:30`.

Costs include filament and electricity. The suggested selling price is three
times the base cost rounded up to a multiple of five. Labor, machine wear, failed
prints, taxes, and actual profit are not included.

Use the row buttons to duplicate, delete, or clear a job. Delete and clear ask
for confirmation; clear also removes a custom density override.

## Materials and density

Choose a preset or select **Custom...** to enter a material name. Entering a
preset name switches back to the dropdown. The gear beside filament length
lets you override density in **g/cm³**. Length calculations assume 1.75 mm filament.

| Material | Density (g/cm³) |
| --- | ---: |
| PLA | 1.24 |
| ABS | 1.04 |
| PETG | 1.27 |
| TPU | 1.21 |
| PA (Nylon) | 1.14 |
| ASA | 1.07 |
| PC | 1.20 |

Unknown materials use the PLA density unless overridden. Filament length is
green for presets, orange for a custom density, and blue for the fallback.

Older versions incorrectly treated custom density as g/m. Review existing
custom values if you compensated for that behavior.

## Import and export

**Export JSON** downloads your settings and jobs. To restore them, open the
file as text, copy its contents, select **Import JSON**, paste, and select
**Import JSON** again. Import replaces the current dataset after validation.
Server imports also back up changed data; see [backup behavior](deployment.md#storage-and-backups).

Imports require non-negative costs and weights, positive custom densities,
unique job IDs, and valid durations. Invalid imports leave the current data intact.

## Saving and recovery

The status message distinguishes browser storage from server saves. Browser
storage belongs to that browser profile; export data before clearing it or
moving to another device.

If another device changes server data, export your edits, reload, and reconcile
them before importing. If your session expires, export your edits and sign in
again. Failed server saves retain a browser recovery copy, available through
**Download recovery copy**, instead of silently switching to local mode.
