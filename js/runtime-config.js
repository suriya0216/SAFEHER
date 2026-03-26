/* ==========================================
   SAFEHER - Runtime Configuration
   ========================================== */

(function initSafeHerRuntimeConfig() {
  const DEFAULT_REMOTE_API_ORIGIN = 'https://safeher-kabilan-20260323.onrender.com';
  const hostname = (window.location.hostname || '').toLowerCase();

  function trimTrailingSlash(value) {
    return String(value || '').replace(/\/+$/, '');
  }

  function resolveApiBase() {
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return trimTrailingSlash(window.location.origin);
    }

    if (hostname.endsWith('.onrender.com')) {
      return trimTrailingSlash(window.location.origin);
    }

    if (hostname.endsWith('.github.io')) {
      return trimTrailingSlash(DEFAULT_REMOTE_API_ORIGIN);
    }

    return trimTrailingSlash(window.location.origin);
  }

  window.SAFEHER_API_BASE = resolveApiBase();
  window.safeherApiUrl = function safeherApiUrl(path) {
    const value = String(path || '');
    if (!value) return window.SAFEHER_API_BASE;
    if (/^https?:\/\//i.test(value)) return value;
    return `${window.SAFEHER_API_BASE}${value.startsWith('/') ? value : `/${value}`}`;
  };
})();
