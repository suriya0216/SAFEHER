/* ==========================================
   SAFEHER - Shared App JavaScript
   Used by all pages inside /pages/
   ========================================== */

const APP_TABS = [
  {
    id: "dashboard",
    label: "Home",
    href: "dashboard.html",
    pages: ["dashboard.html"],
    icon:
      '<svg viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>'
  },
  {
    id: "verify",
    label: "Verify",
    href: "verify.html",
    pages: ["verify.html"],
    icon:
      '<svg viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>'
  },
  {
    id: "map",
    label: "Map",
    href: "map.html",
    pages: ["map.html"],
    icon:
      '<svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>'
  },
  {
    id: "sos",
    label: "SOS",
    href: "sos.html",
    pages: ["sos.html"],
    icon:
      '<svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg>'
  },
  {
    id: "profile",
    label: "Profile",
    href: "profile.html",
    pages: ["profile.html", "danger.html", "rating.html"],
    icon:
      '<svg viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>'
  }
];

function currentPageName() {
  return window.location.pathname.split("/").pop() || "dashboard.html";
}

function getCurrentAppTabId() {
  const page = currentPageName();
  const match = APP_TABS.find(tab => tab.pages.includes(page));
  return match ? match.id : "dashboard";
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("safeher_user") || "{}");
  } catch (error) {
    return {};
  }
}

function getUserInitials(user) {
  const source = String(user?.name || user?.email || "SafeHer")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase() || "")
    .join("");
  return source || "SH";
}

/* Highlight active sidebar item */
function setActiveSidebarItem() {
  const current = currentPageName();
  document.querySelectorAll(".sidebar-item").forEach(item => {
    const href = item.getAttribute("href") || "";
    if (href.includes(current)) {
      item.classList.add("active");
    }
  });
}

/* Redirect to auth if the user session is missing */
function ensureAuthenticatedUser() {
  const user = getStoredUser();
  if (user && user.registered && (user.name || user.email)) return user;

  window.location.href = "../index.html";
  return null;
}

/* User greeting */
function loadUserGreeting(user) {
  const greetEl = document.getElementById("greetName");
  if (greetEl && user && user.name) greetEl.textContent = user.name;
}

function hydrateUserChrome(user) {
  const initials = getUserInitials(user);
  document.querySelectorAll(".user-avatar").forEach(avatar => {
    avatar.textContent = initials;
  });

  const profileName = document.getElementById("profileUserName");
  const profileEmail = document.getElementById("profileUserEmail");
  const profileMethod = document.getElementById("profileAuthMethod");
  const profileAvatar = document.getElementById("profileAvatar");
  const googleStatus = document.getElementById("profileGoogleStatus");

  if (profileName) profileName.textContent = user.name || "SafeHer User";
  if (profileEmail) profileEmail.textContent = user.email || user.contact || "No email available";
  if (profileMethod) profileMethod.textContent = formatAuthMethod(user.authMethod);
  if (profileAvatar) profileAvatar.textContent = initials;
  if (googleStatus) {
    googleStatus.textContent = user.authMethod && String(user.authMethod).includes("google")
      ? "Google sign-in linked"
      : "Email sign-in active";
  }
}

function formatAuthMethod(value) {
  const auth = String(value || "email").toLowerCase();
  if (auth === "google+email") return "Google + Email";
  if (auth === "google") return "Google";
  return "Email";
}

function mountBottomNav() {
  if (document.querySelector(".safeher-bottom-nav")) return;

  const activeTab = getCurrentAppTabId();
  const nav = document.createElement("nav");
  nav.className = "safeher-bottom-nav";
  nav.setAttribute("aria-label", "SafeHer app navigation");
  nav.innerHTML = APP_TABS.map(tab => {
    const isActive = tab.id === activeTab;
    return `
      <a href="${tab.href}" class="safeher-bottom-nav__item${isActive ? " is-active" : ""}">
        <span class="safeher-bottom-nav__icon">${tab.icon}</span>
        <span class="safeher-bottom-nav__label">${tab.label}</span>
      </a>
    `;
  }).join("");

  document.body.appendChild(nav);
}

function logoutSafeHer() {
  localStorage.removeItem("safeher_user");
  window.location.href = "../index.html";
}

/* OTP box focus chain (kept for compatibility) */
function otpChain(el, idx, containerId) {
  const boxes = document.querySelectorAll(`#${containerId} .otp-box`);
  if (el.value.length === 1 && idx < boxes.length - 1) {
    boxes[idx + 1].focus();
  }
}

/* Simple loader helper */
function showLoader(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "block";
}

function hideLoader(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = "none";
}

/* Run on every app page load */
document.addEventListener("DOMContentLoaded", () => {
  const user = ensureAuthenticatedUser();
  if (!user) return;

  document.body.classList.add("safeher-app-page");
  setActiveSidebarItem();
  loadUserGreeting(user);
  hydrateUserChrome(user);
  mountBottomNav();
});

window.logoutSafeHer = logoutSafeHer;
window.otpChain = otpChain;
window.showLoader = showLoader;
window.hideLoader = hideLoader;
