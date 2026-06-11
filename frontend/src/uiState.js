// ── UI State Utilities ────────────────────────────────────────────────────────

// ── Navigation ────────────────────────────────────────────────────────────────

/**
 * Mark one nav button as active and clear all others.
 * @param {HTMLElement|null} activeBtn
 */
export function updateNavActiveState(activeBtn) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  if (activeBtn) {
    activeBtn.classList.add('active');
  }
}

// ── Button Loader ─────────────────────────────────────────────────────────────

/**
 * Reusable utility for managing button loading states.
 *
 * Usage:
 *   await ButtonLoader.wrap(btn, 'Saving...', async () => { ... });
 *
 *   const state = ButtonLoader.start(btn, 'Processing...');
 *   try { ... } finally { ButtonLoader.stop(btn, state); }
 */
export const ButtonLoader = {
  start(button, loadingText = 'Loading...') {
    const originalState = {
      text: button.innerHTML,
      disabled: button.disabled,
      classList: [...button.classList]
    };
    button.disabled = true;
    button.classList.add('loading');
    button.innerHTML = `<i class="bi bi-hourglass-split"></i> ${loadingText}`;
    return originalState;
  },

  stop(button, originalState) {
    button.innerHTML = originalState.text;
    button.disabled = originalState.disabled;
    button.classList.remove('loading');
  },

  async wrap(button, loadingText, asyncFn) {
    const originalState = this.start(button, loadingText);
    try {
      return await asyncFn();
    } finally {
      this.stop(button, originalState);
    }
  }
};

// ── Accent Color System ───────────────────────────────────────────────────────

export function rgbToHue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  let h;
  if (max === r)      h = ((g - b) / delta) % 6;
  else if (max === g) h = (b - r) / delta + 2;
  else                h = (r - g) / delta + 4;
  h = Math.round(h * 60);
  if (h < 0) h += 360;
  return h;
}

export function applyAccentColor(rgb) {
  const root = document.documentElement;
  const [r, g, b] = rgb.split(',').map(n => parseInt(n.trim()));
  root.style.setProperty('--accent-color',     `rgba(${r}, ${g}, ${b}, 1)`);
  root.style.setProperty('--accent-color-rgb', rgb);
  root.style.setProperty('--accent-subtle',    `rgba(${r}, ${g}, ${b}, 0.08)`);
  root.style.setProperty('--accent-border',    `rgba(${r}, ${g}, ${b}, 0.2)`);
  root.style.setProperty('--accent-shadow',    `rgba(${r}, ${g}, ${b}, 0.15)`);
  const h = rgbToHue(r, g, b);
  root.style.setProperty('--fullscreen-bg', `hsla(${h}, 70%, 95%, 0.95)`);
}

function saveAccentColor(colorName, rgb, storageKey) {
  localStorage.setItem(storageKey, JSON.stringify({ name: colorName, rgb }));
}

function setActiveAccentButton(accentColorBtns, colorName) {
  accentColorBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === colorName);
  });
}

function loadAccentColor(accentColorBtns, storageKey) {
  try {
    const saved = localStorage.getItem(storageKey);
    if (!saved) { setActiveAccentButton(accentColorBtns, 'blue'); return; }
    const { rgb, name } = JSON.parse(saved);
    applyAccentColor(rgb);
    setActiveAccentButton(accentColorBtns, name);
  } catch (e) {
    console.error('Failed to load accent color:', e);
    setActiveAccentButton(accentColorBtns, 'blue');
  }
}

/**
 * Wire up the accent-color picker: load saved color and bind click handlers.
 * Call once from within DOMContentLoaded after querying the buttons.
 * @param {NodeList} accentColorBtns
 * @param {string}   storageKey
 */
export function initAccentColors(accentColorBtns, storageKey) {
  loadAccentColor(accentColorBtns, storageKey);

  accentColorBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const { color: colorName, rgb } = btn.dataset;
      applyAccentColor(rgb);
      saveAccentColor(colorName, rgb, storageKey);
      setActiveAccentButton(accentColorBtns, colorName);
    });
  });
}
