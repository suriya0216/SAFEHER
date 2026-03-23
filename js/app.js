/* ==========================================
   SAFEHER - Shared App JavaScript
   Used by all pages inside /pages/
   ========================================== */

/* Highlight active sidebar item */
function setActiveSidebarItem() {
  const current = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-item').forEach(item => {
    const href = item.getAttribute('href') || '';
    if (href.includes(current)) {
      item.classList.add('active');
    }
  });
}

/* Redirect to auth if the user session is missing */
function ensureAuthenticatedUser() {
  try {
    const user = JSON.parse(localStorage.getItem('safeher_user') || '{}');
    if (user && user.registered && user.name) return user;
  } catch (error) {}

  window.location.href = '../index.html';
  return null;
}

/* User greeting */
function loadUserGreeting(user) {
  const greetEl = document.getElementById('greetName');
  if (greetEl && user && user.name) greetEl.textContent = user.name;
}

/* OTP box focus chain (reused in app pages too) */
function otpChain(el, idx, containerId) {
  const boxes = document.querySelectorAll(`#${containerId} .otp-box`);
  if (el.value.length === 1 && idx < boxes.length - 1) {
    boxes[idx + 1].focus();
  }
}

/* Simple loader helper */
function showLoader(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'block';
}

function hideLoader(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}

/* Run on every app page load */
document.addEventListener('DOMContentLoaded', () => {
  const user = ensureAuthenticatedUser();
  if (!user) return;

  setActiveSidebarItem();
  loadUserGreeting(user);
});
