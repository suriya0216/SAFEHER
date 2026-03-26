/* ==========================================
   SAFEHER - Landing Page JavaScript
   ========================================== */

window.addEventListener('scroll', () => {
  const nav = document.getElementById('mainNav');
  if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
});

let currentAuthMode = 'register';
let isSubmitting = false;
let deferredInstallPrompt = null;
let installPromptReady = false;

function getInstallButton() {
  return document.getElementById('installAppBtn');
}

function isStandaloneApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function updateInstallButtonState(state) {
  const button = getInstallButton();
  if (!button) return;

  const nextState = state || (isStandaloneApp() ? 'installed' : installPromptReady ? 'ready' : 'default');
  button.dataset.state = nextState;

  if (nextState === 'installed') {
    button.textContent = 'Installed';
    button.disabled = true;
    return;
  }

  button.disabled = false;
  button.textContent = nextState === 'ready' ? 'Download App' : 'Download App';
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register('service-worker.js?v=20260326c');
  } catch (error) {
    console.error('SafeHer service worker registration failed.', error);
  }
}

function showInstallFallback() {
  const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const isAndroid = /android/i.test(navigator.userAgent);

  if (isiOS) {
    window.alert('To install SafeHer on iPhone: tap Share in Safari, then choose "Add to Home Screen".');
    return;
  }

  if (isAndroid) {
    window.alert('If the install popup does not appear, open the browser menu and tap "Install app" or "Add to Home screen".');
    return;
  }

  window.alert('If your browser supports app installation, use the browser menu and choose "Install SafeHer" or "Add to Home screen".');
}

async function installSafeHerApp() {
  if (isStandaloneApp()) {
    updateInstallButtonState('installed');
    return;
  }

  if (!deferredInstallPrompt) {
    showInstallFallback();
    return;
  }

  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installPromptReady = false;

  if (choice && choice.outcome === 'accepted') {
    updateInstallButtonState('installed');
    return;
  }

  updateInstallButtonState('default');
}

function setCardCopy(title, sub) {
  const titleEl = document.getElementById('authCardTitle');
  const subEl = document.getElementById('authCardSub');
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
}

function showNotice(message, type) {
  const notice = document.getElementById('authNotice');
  if (!notice) return;
  notice.hidden = false;
  notice.className = `auth-notice ${type || 'info'}`;
  notice.textContent = message;
}

function clearNotice() {
  const notice = document.getElementById('authNotice');
  if (!notice) return;
  notice.hidden = true;
  notice.className = 'auth-notice';
  notice.textContent = '';
}

function markFieldInvalid(el) {
  if (!el) return;
  el.style.borderColor = 'rgba(255,59,48,0.42)';
  el.focus();
  setTimeout(() => {
    el.style.borderColor = '';
  }, 1500);
}

function getField(id) {
  return document.getElementById(id);
}

function setSubmittingState(loading) {
  isSubmitting = loading;
  const button = getField('authSubmitButton');
  if (!button) return;

  if (!button.dataset.defaultHtml) {
    button.dataset.defaultHtml = button.innerHTML;
  }

  button.disabled = loading;
  button.innerHTML = loading
    ? (currentAuthMode === 'register' ? 'Creating Account...' : 'Signing In...')
    : button.dataset.defaultHtml;
}

function updateAuthUi() {
  const registerTab = getField('registerTab');
  const loginTab = getField('loginTab');
  const nameGroup = getField('nameGroup');
  const confirmGroup = getField('confirmPasswordGroup');
  const panelCopy = getField('authPanelCopy');
  const helperText = getField('authHelperText');
  const submitLabel = getField('authSubmitLabel');

  if (registerTab) registerTab.classList.toggle('active', currentAuthMode === 'register');
  if (loginTab) loginTab.classList.toggle('active', currentAuthMode === 'login');
  if (nameGroup) nameGroup.classList.toggle('is-hidden', currentAuthMode !== 'register');
  if (confirmGroup) confirmGroup.classList.toggle('is-hidden', currentAuthMode !== 'register');

  if (currentAuthMode === 'register') {
    setCardCopy('Create your SafeHer account', 'Register once with email and password, then enter SafeHer instantly.');
    if (panelCopy) panelCopy.textContent = 'Use a secure email and password to create your account. No OTP or phone number needed.';
    if (helperText) helperText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode(event)">Sign in here -></a>';
    if (submitLabel) submitLabel.textContent = 'Create Account ->';
  } else {
    setCardCopy('Sign in to SafeHer', 'Use your registered email and password to continue securely.');
    if (panelCopy) panelCopy.textContent = 'Welcome back. Sign in with the same email and password you used during registration.';
    if (helperText) helperText.innerHTML = 'New to SafeHer? <a href="#" onclick="toggleAuthMode(event)">Create account -></a>';
    if (submitLabel) submitLabel.textContent = 'Sign In ->';
  }
}

function switchAuthMode(mode) {
  currentAuthMode = mode === 'login' ? 'login' : 'register';
  clearNotice();
  updateAuthUi();

  const focusField = currentAuthMode === 'register' ? getField('authNameField') : getField('authEmailField');
  if (focusField) setTimeout(() => focusField.focus(), 80);
}

function toggleAuthMode(event) {
  if (event) event.preventDefault();
  switchAuthMode(currentAuthMode === 'register' ? 'login' : 'register');
}

async function apiRequest(path, payload) {
  let response;
  try {
    response = await fetch(typeof window.safeherApiUrl === 'function' ? window.safeherApiUrl(path) : path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error('SafeHer server unreachable. Check your internet connection and try again.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || 'Request failed. Please try again.');
  }

  return data;
}

function collectRegisterPayload() {
  const nameField = getField('authNameField');
  const emailField = getField('authEmailField');
  const passwordField = getField('authPasswordField');
  const confirmField = getField('authConfirmPasswordField');

  const name = nameField ? nameField.value.trim() : '';
  const email = emailField ? emailField.value.trim() : '';
  const password = passwordField ? passwordField.value : '';
  const confirmPassword = confirmField ? confirmField.value : '';

  if (name.length < 2) {
    showNotice('Enter your full name to continue.', 'error');
    markFieldInvalid(nameField);
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showNotice('Enter a valid email address.', 'error');
    markFieldInvalid(emailField);
    return null;
  }

  if (password.length < 6) {
    showNotice('Password must be at least 6 characters.', 'error');
    markFieldInvalid(passwordField);
    return null;
  }

  if (password !== confirmPassword) {
    showNotice('Passwords do not match.', 'error');
    markFieldInvalid(confirmField);
    return null;
  }

  return { name, email, password };
}

function collectLoginPayload() {
  const emailField = getField('authEmailField');
  const passwordField = getField('authPasswordField');

  const email = emailField ? emailField.value.trim() : '';
  const password = passwordField ? passwordField.value : '';

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showNotice('Enter a valid email address.', 'error');
    markFieldInvalid(emailField);
    return null;
  }

  if (!password) {
    showNotice('Enter your password.', 'error');
    markFieldInvalid(passwordField);
    return null;
  }

  return { email, password };
}

async function submitAuth() {
  if (isSubmitting) return;

  const payload = currentAuthMode === 'register' ? collectRegisterPayload() : collectLoginPayload();
  if (!payload) return;

  clearNotice();
  setSubmittingState(true);

  try {
    const response = await apiRequest(
      currentAuthMode === 'register' ? '/api/auth/register' : '/api/auth/login',
      payload
    );
    localStorage.setItem('safeher_user', JSON.stringify(response.user));
    showNotice(response.message || 'Success. Redirecting...', 'success');
    setTimeout(() => {
      window.location.href = 'pages/dashboard.html';
    }, 220);
  } catch (error) {
    showNotice(error.message, 'error');
  } finally {
    setSubmittingState(false);
  }
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (!href || href === '#') return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter') submitAuth();
});

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installPromptReady = true;
  updateInstallButtonState('ready');
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installPromptReady = false;
  updateInstallButtonState('installed');
});

document.addEventListener('DOMContentLoaded', () => {
  switchAuthMode('register');
  updateInstallButtonState();
  registerServiceWorker();
});
