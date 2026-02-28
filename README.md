# Tesla HW4 Extension

This Chrome extension scans Tesla inventory listings, reads Tesla's `inventory-results` API response, and adds a badge that estimates the Autopilot computer generation (`HW2.5`, `HW3`, `HW4`, or a mixed transition label).

The badge is an estimate based on VIN ranges, model, plant, and model year. Tesla does not expose a direct hardware-computer field in the inventory payload used by this extension.

## Current Criteria

### Model Y

- Austin (`plant code A`)
- `PA127000` through `PA131199` => `HW3/HW4`
- `PA131200+` => `HW4`
- Earlier VINs => `HW3`

- Fremont (`plant code F`)
- `PF789500` through `PF800000` => `HW3/HW4`
- `PF800001+` => `HW4`
- Earlier VINs => `HW3`

### Model S

- Fremont (`plant code F`)
- `PF501000` through `PF502000` => `HW3/HW4`
- `PF502001+` => `HW4`
- Earlier VINs => `HW3`

### Model X

- Fremont (`plant code F`)
- `PF370000` through `PF380000` => `HW3/HW4`
- `PF380001+` => `HW4`
- Earlier VINs => `HW3`

### Model 3

- `2018 and older` => `HW2.5`
- `2019` => `HW2.5/HW3`
- `2020-2023` => `HW3`
- `2024 and newer` => `HW4`

### Legacy Non-Model-3 Fallback

- `2018 and older` => `HW2.5`
- `2019` => `HW2.5/HW3`

If a model or plant does not have a stable cutoff configured, the extension falls back to `HW3/HW4`.

## Sources

These rules are based on community-reported transition ranges, not official Tesla documentation:

- Reddit VIN tracking for Model Y transition points
- Community VIN range references for Model Y, Model S, and Model X
- U.S. Model 3 assumption: `2024+` is treated as Highland-era / `HW4`

## Install

1. Open `chrome://extensions`
2. Enable Developer mode
3. Choose Load unpacked
4. Select the `extension` directory

## Test

Run:

```bash
npm install
npm test
```
