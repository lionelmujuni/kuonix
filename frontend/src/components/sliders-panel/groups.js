// channel: which histogram channel this family of algorithms manipulates —
// the Adjust panel's histogram auto-switches to it so the curve that matters
// for the current edit is the one on screen.
export const GROUPS = [
  {
    id: "wb",
    label: "Balance",
    icon: "bi-thermometer-half",
    channel: "rgb",
    methods: ["temperature_tint", "gray_world", "white_patch", "shades_of_gray", "ffcc"],
  },
  {
    id: "tone",
    label: "Tone",
    icon: "bi-circle-half",
    channel: "luma",
    methods: ["exposure", "clahe_lab", "local_laplacian", "highlight_recovery"],
  },
  {
    id: "color",
    label: "Color",
    icon: "bi-palette",
    channel: "rgb",
    methods: ["color_matrix", "color_distribution_alignment", "harmonization", "memory_color_skin"],
  },
  {
    id: "vib",
    label: "Saturation",
    icon: "bi-droplet-half",
    channel: "sat",
    methods: ["saturation", "vibrance", "hsl_targeted", "gamut_compress"],
  },
  {
    id: "enhance",
    label: "Enhance",
    icon: "bi-stars",
    channel: "luma",
    methods: ["ace", "msrcr_retinex", "dark_channel_dehaze", "bm3d"],
  },
  {
    id: "hdr",
    label: "HDR",
    icon: "bi-brightness-high",
    channel: "luma",
    methods: ["exposure_fusion", "reinhard_tonemap", "mantiuk_tonemap"],
  },
];

// Per-method exceptions to the group channel.
export const METHOD_CHANNELS = {
  dark_channel_dehaze: "haze",
  hsl_targeted: "hue",
  memory_color_skin: "hue",
};
