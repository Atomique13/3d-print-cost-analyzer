# Usage guide

[Back to README](../README.md)

## Settings and jobs

Set printer power in watts, electricity price per kWh, and a currency symbol
(up to 10 characters). Add a row for each print, then enter its name, material,
filament price per kilogram, weight in grams, and duration in `H:MM` format.
Durations may exceed 24 hours, such as `36:30`.

Set **Count** to the number of objects on the plate (a whole number of at least
1). Enter weight and print time for the entire plate. When Count exceeds 1,
Total Base Cost and Estimated Selling Price also show the price per object in
parentheses, rounded to one decimal without repeating the currency (for example,
`60 RON (15.0)`). Counts are saved and exported; older data
defaults to 1. Duplicating a row keeps its count, and clearing a row resets it to 1.

Costs include filament and electricity. The suggested selling price is three
times the base cost rounded up to a multiple of five. Labor, machine wear, failed
prints, taxes, and actual profit are not included.

Use the row buttons to duplicate, delete, or clear a job. Delete and clear ask
for confirmation; clear also removes a custom density override.

Drag the grip at the start of a row to reorder the list. The highlighted line
is centered between rows and shows the single drop position for that gap.
The new order is saved and included in JSON exports. Drop outside the rows
or press Escape to cancel a drag.

## Multi-plate calculator

Open **Multi-plate calculator** above the list to combine weights and print times.
It starts with three plates; add or remove plates as needed. Totals update as you
type, and durations can exceed 24 hours. Collapse the panel to hide it without
losing inputs. Plate inputs are temporary and reset on reload.

Use **Add totals as a new row** to save the combined weight and duration to the
list, then enter the material, price/kg, and total object count. Weight follows
the list's existing rounding up to 0.1 g. Combine plates with the same material
and price/kg; keep different materials in separate jobs.

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
