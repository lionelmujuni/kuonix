// ── Toast Notification System ───────────────────────────────────────────────

/**
 * Show a non-blocking glassmorphism toast notification.
 * @param {string} message - The message to display
 * @param {string} type    - 'success' | 'error' | 'warning' | 'info' (default)
 * @param {number} duration - Duration in milliseconds (default 4000)
 * @returns {HTMLElement} The created toast element
 */
export function showToast(message, type = 'info', duration = 4000) {
  let toastContainer = document.querySelector('.toast-container');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'toast-container';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;

  let icon = '';
  if (type === 'success') {
    icon = '<i class="bi bi-check-circle-fill"></i>';
  } else if (type === 'error') {
    icon = '<i class="bi bi-exclamation-circle-fill"></i>';
  } else {
    icon = '<i class="bi bi-info-circle-fill"></i>';
  }

  toast.innerHTML = `
    <div class="toast__icon">${icon}</div>
    <div class="toast__message">${message}</div>
    <button class="toast__close" aria-label="Close">
      <i class="bi bi-x"></i>
    </button>
  `;

  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add('toast--show');
  });

  const autoRemove = setTimeout(() => {
    removeToast(toast);
  }, duration);

  toast.querySelector('.toast__close').addEventListener('click', () => {
    clearTimeout(autoRemove);
    removeToast(toast);
  });

  return toast;
}

/**
 * Remove a toast with slide-out animation.
 * @param {HTMLElement} toast - The toast element to remove
 */
export function removeToast(toast) {
  toast.classList.remove('toast--show');
  toast.classList.add('toast--hide');

  setTimeout(() => {
    if (toast.parentNode) {
      toast.parentNode.removeChild(toast);
    }
  }, 300);
}
