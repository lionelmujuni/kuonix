export const GROUPS = [
  {
    id: "wb",
    label: "Balance",
    icon: "bi-thermometer-half",
    methods: ["temperature_tint", "gray_world", "white_patch", "shades_of_gray", "ffcc"],
  },
  {
    id: "tone",
    label: "Tone",
    icon: "bi-circle-half",
    methods: ["exposure", "clahe_lab", "local_laplacian", "highlight_recovery"],
  },
  {
    id: "color",
    label: "Color",
    icon: "bi-palette",
    methods: ["color_matrix", "color_distribution_alignment", "harmonization", "memory_color_skin"],
  },
  {
    id: "vib",
    label: "Saturation",
    icon: "bi-droplet-half",
    methods: ["saturation", "vibrance", "hsl_targeted", "gamut_compress"],
  },
  {
    id: "enhance",
    label: "Enhance",
    icon: "bi-stars",
    methods: ["ace", "msrcr_retinex", "dark_channel_dehaze", "bm3d"],
  },
  {
    id: "hdr",
    label: "HDR",
    icon: "bi-brightness-high",
    methods: ["exposure_fusion", "reinhard_tonemap", "mantiuk_tonemap"],
  },
];
