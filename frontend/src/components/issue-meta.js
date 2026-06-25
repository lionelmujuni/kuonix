// Single source of truth for issue presentation metadata.
//
// Keyed by the canonical ImageIssue enum names emitted by the backend
// classifier (see restful .../dto/ImageIssue.java) — the same strings that
// flow through state as `img.issues`. The ribbon, contact sheet, and issue
// drawer all read from here so their labels, icons, and colour families can
// never drift apart again.
//
//   label  — human label shown on chips / dots / drawer header
//   icon   — Bootstrap Icons class
//   family — colour family for chip/dot styling: exposure | cast | noise | other
//   gap    — style-profile gap dimension this issue maps to, or null

export const ISSUE_META = {
  Needs_Exposure_Increase:   { label: "Underexposed",       icon: "bi-moon-stars",           family: "exposure", gap: "brightness" },
  Needs_Exposure_Decrease:   { label: "Overexposed",        icon: "bi-brightness-high",      family: "exposure", gap: "brightness" },
  Needs_Contrast_Increase:   { label: "Low contrast",       icon: "bi-circle-half",          family: "exposure", gap: "contrast"   },
  Needs_Contrast_Decrease:   { label: "High contrast",      icon: "bi-circle-half",          family: "exposure", gap: "contrast"   },
  Needs_Saturation_Increase: { label: "Low saturation",     icon: "bi-droplet",              family: "cast",     gap: "saturation" },
  Oversaturated_Global:      { label: "Oversaturated",      icon: "bi-droplet-fill",         family: "cast",     gap: "saturation" },
  Oversaturated_Red:         { label: "Oversaturated red",  icon: "bi-droplet-fill",         family: "cast",     gap: "saturation" },
  Oversaturated_Green:       { label: "Oversaturated green",icon: "bi-droplet-fill",         family: "cast",     gap: "saturation" },
  Oversaturated_Blue:        { label: "Oversaturated blue", icon: "bi-droplet-fill",         family: "cast",     gap: "saturation" },
  Oversaturated_Cyan:        { label: "Oversaturated cyan", icon: "bi-droplet-fill",         family: "cast",     gap: "saturation" },
  Oversaturated_Magenta:     { label: "Oversaturated magenta", icon: "bi-droplet-fill",      family: "cast",     gap: "saturation" },
  Oversaturated_Yellow:      { label: "Oversaturated yellow",  icon: "bi-droplet-fill",      family: "cast",     gap: "saturation" },
  ColorCast_Red:             { label: "Red cast",           icon: "bi-circle-fill",          family: "cast",     gap: "castAngle"  },
  ColorCast_Green:           { label: "Green cast",         icon: "bi-tree",                 family: "cast",     gap: "castAngle"  },
  ColorCast_Blue:            { label: "Cool cast",          icon: "bi-cloud",                family: "cast",     gap: "castAngle"  },
  ColorCast_Cyan:            { label: "Cyan cast",          icon: "bi-water",                family: "cast",     gap: "castAngle"  },
  ColorCast_Magenta:         { label: "Magenta cast",       icon: "bi-flower1",              family: "cast",     gap: "castAngle"  },
  ColorCast_Yellow:          { label: "Warm cast",          icon: "bi-sun",                  family: "cast",     gap: "castAngle"  },
  Needs_Noise_Reduction:     { label: "Shadow noise",       icon: "bi-grid-3x3",             family: "noise",    gap: "noise"      },
  SkinTone_Too_Green:        { label: "Skin: green",        icon: "bi-person",               family: "cast",     gap: "castAngle"  },
  SkinTone_Too_Magenta:      { label: "Skin: magenta",      icon: "bi-person",               family: "cast",     gap: "castAngle"  },
  SkinTone_Too_Desaturated:  { label: "Skin: flat",         icon: "bi-person",               family: "cast",     gap: "saturation" },
  SkinTone_Too_OrangeRed:    { label: "Skin: orange-red",   icon: "bi-person",               family: "cast",     gap: "castAngle"  },
  Hazy:                      { label: "Hazy",               icon: "bi-cloud-haze2",          family: "other",    gap: null         },
  Crushed_Shadows:           { label: "Crushed shadows",    icon: "bi-shadows",              family: "exposure", gap: "brightness" },
  Clipped_Highlights:        { label: "Highlights clipped", icon: "bi-exclamation-triangle", family: "noise",    gap: "brightness" },
};

// Maximum expected magnitude per gap dimension, for normalising the style-gap bar.
export const GAP_MAX = { brightness: 1.0, contrast: 0.5, saturation: 1.0, castAngle: 180, noise: 1.0 };

// Family → theme RGB-triple custom property. The edit-view chips/dots tint via
// family CSS classes (.issue-chip--exposure …); surfaces that tint inline with
// rgb(var(--…)) (e.g. the library gallery) use this map so both stay in sync
// with the same warning/info/error theme tokens and adapt to light/dark.
export const FAMILY_RGB = {
  exposure: "var(--color-warning-rgb)",
  cast:     "var(--color-info-rgb)",
  noise:    "var(--color-error-rgb)",
  other:    "var(--accent-color-rgb)",
};

export function issueRgb(issue) {
  return FAMILY_RGB[getIssueMeta(issue).family] || FAMILY_RGB.other;
}

export function prettify(s) {
  return String(s).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Always returns a complete meta object — falls back to a prettified label,
// generic icon, and the "other" family for any unmapped issue key.
export function getIssueMeta(issue) {
  return ISSUE_META[issue] || { label: prettify(issue), icon: "bi-circle", family: "other", gap: null };
}
