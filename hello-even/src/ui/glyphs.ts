// Only glyphs verified to render in the firmware LVGL font (confirmed in the
// simulator). Out-of-font characters are silently skipped, so keep to this set.

// Tap-count affordance: one CHEVRON = single tap, two = double tap. `▶` is from
// the firmware-supported navigation set (per Even design guidelines), unlike the
// old `●` which the guidelines reserve for selection state.
export const CHEVRON = "▶"; // single-tap indicator
export const MIDDOT = "·"; // inline separator
