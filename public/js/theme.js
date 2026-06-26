/**
 * @module theme
 * Theme toggle functionality for Forum Furiosum.
 * Reads initial theme from <html data-theme> attribute (set server-side).
 * On toggle: updates DOM, saves to cookie (anonymous) or sends API call (logged-in).
 */

/** @type {string} Current theme: 'light' | 'dark' */
const COOKIE_NAME = 'ff_theme';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

/**
 * Reads a cookie value by name.
 * @param {string} name
 * @returns {string|null}
 */
function getCookie(name) {
  const match = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Sets a cookie with SameSite=Lax.
 * @param {string} name
 * @param {string} value
 * @param {number} maxAge - seconds
 */
function setCookie(name, value, maxAge) {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAge}; SameSite=Lax`;
}

/**
 * Apply theme to document root element.
 * @param {string} theme - 'light' | 'dark'
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * Persist theme preference.
 * If user is logged in (userId present in dataset), calls PATCH /api/v1/users/:id.
 * Otherwise saves to cookie.
 * @param {string} theme - 'light' | 'dark'
 */
async function persistTheme(theme) {
  const userId = document.body.dataset.userId;
  if (userId) {
    try {
      await fetch(`/api/v1/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme }),
      });
    } catch (_) {
      // Fallback to cookie if API fails
      setCookie(COOKIE_NAME, theme, COOKIE_MAX_AGE);
    }
  } else {
    setCookie(COOKIE_NAME, theme, COOKIE_MAX_AGE);
  }
}

// Initialize
const toggle = document.getElementById('theme-toggle');
if (toggle) {
  toggle.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'light' ? 'dark' : 'light';
    applyTheme(next);
    await persistTheme(next);
  });
}
