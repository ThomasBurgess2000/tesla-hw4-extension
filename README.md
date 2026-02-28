# Tesla HW4 Extension

This Chrome extension scans Tesla inventory listing cards, extracts any VIN it can find, and adds a small badge that estimates whether the vehicle has HW3 or HW4.

The current thresholds are configured from the values you provided for used Model Y listings:

- Austin: `2023-06-04`, `PA131200` and above => `HW4`
- Fremont: `2023-05-24`, `PF789500` and above => `HW4`

The badge is an estimate based on VIN thresholds, not a direct hardware readout.

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
