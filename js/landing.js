/* ==========================================
   SAFEHER - Landing Page JavaScript
   ========================================== */

let currentAuthMode = "register";
let isSubmitting = false;
let publicAuthConfig = null;
let googleLibraryPromise = null;
let googleButtonRendered = false;

window.addEventListener("scroll", () => {
  const nav = document.getElementById("mainNav");
  if (nav) nav.classList.toggle("scrolled", window.scrollY > 24);
});

function getField(id) {
  return document.getElementById(id);
}

function scrollToAuth() {
  const target = document.getElementById("authStage");
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function setCardCopy(title, sub) {
  const titleEl = getField("authCardTitle");
  const subEl = getField("authCardSub");
  if (titleEl) titleEl.textContent = title;
  if (subEl) subEl.textContent = sub;
}

function showNotice(message, type) {
  const notice = getField("authNotice");
  if (!notice) return;
  notice.hidden = false;
  notice.className = `auth-notice ${type || "info"}`;
  notice.textContent = message;
}

function clearNotice() {
  const notice = getField("authNotice");
  if (!notice) return;
  notice.hidden = true;
  notice.className = "auth-notice";
  notice.textContent = "";
}

function markFieldInvalid(el) {
  if (!el) return;
  el.style.borderColor = "rgba(255, 45, 85, 0.45)";
  el.focus();
  setTimeout(() => {
    el.style.borderColor = "";
  }, 1600);
}

function setSubmittingState(loading, label) {
  isSubmitting = loading;
  const button = getField("authSubmitButton");
  if (!button) return;

  if (!button.dataset.defaultHtml) {
    button.dataset.defaultHtml = button.innerHTML;
  }

  button.disabled = loading;
  button.innerHTML = loading
    ? label
    : button.dataset.defaultHtml;
}

function updateAuthUi() {
  const registerTab = getField("registerTab");
  const loginTab = getField("loginTab");
  const nameGroup = getField("nameGroup");
  const confirmGroup = getField("confirmPasswordGroup");
  const panelCopy = getField("authPanelCopy");
  const helperText = getField("authHelperText");
  const submitLabel = getField("authSubmitLabel");

  if (registerTab) registerTab.classList.toggle("active", currentAuthMode === "register");
  if (loginTab) loginTab.classList.toggle("active", currentAuthMode === "login");
  if (nameGroup) nameGroup.classList.toggle("is-hidden", currentAuthMode !== "register");
  if (confirmGroup) confirmGroup.classList.toggle("is-hidden", currentAuthMode !== "register");

  if (currentAuthMode === "register") {
    setCardCopy("Create your SafeHer account", "Register once with email and password, then enter SafeHer instantly.");
    if (panelCopy) panelCopy.textContent = "Use email and password for a clean first-time setup, or continue with Google if it is enabled.";
    if (helperText) helperText.innerHTML = 'Already have an account? <a href="#" onclick="toggleAuthMode(event)">Sign in here</a>';
    if (submitLabel) submitLabel.textContent = "Create Account";
  } else {
    setCardCopy("Sign in to SafeHer", "Use your email password or Google account to continue quickly.");
    if (panelCopy) panelCopy.textContent = "Welcome back. Sign in with the same SafeHer account you already created.";
    if (helperText) helperText.innerHTML = 'New to SafeHer? <a href="#" onclick="toggleAuthMode(event)">Create account</a>';
    if (submitLabel) submitLabel.textContent = "Sign In";
  }
}

function switchAuthMode(mode) {
  currentAuthMode = mode === "login" ? "login" : "register";
  clearNotice();
  updateAuthUi();

  const focusField = currentAuthMode === "register" ? getField("authNameField") : getField("authEmailField");
  if (focusField) setTimeout(() => focusField.focus(), 80);
}

function toggleAuthMode(event) {
  if (event) event.preventDefault();
  switchAuthMode(currentAuthMode === "register" ? "login" : "register");
}

async function apiRequest(path, payload) {
  let response;
  try {
    response = await fetch(typeof window.safeherApiUrl === "function" ? window.safeherApiUrl(path) : path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    throw new Error("SafeHer server is unreachable right now. Check the connection and try again.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) {
    throw new Error(data.message || "Request failed. Please try again.");
  }

  return data;
}

async function fetchPublicConfig() {
  try {
    const response = await fetch(typeof window.safeherApiUrl === "function" ? window.safeherApiUrl("/api/public-config") : "/api/public-config", {
      method: "GET",
      cache: "no-store"
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) {
      throw new Error(data.message || "Could not load public auth config.");
    }
    publicAuthConfig = data;
  } catch (error) {
    publicAuthConfig = {
      ok: false,
      auth: {
        googleEnabled: false,
        googleClientId: ""
      }
    };
  }
}

function setGoogleHint(message, disabled) {
  const hint = getField("googleSigninHint");
  const mount = getField("googleSigninMount");
  if (hint) hint.textContent = message;
  if (!mount) return;

  if (disabled) {
    mount.classList.add("is-disabled");
    mount.textContent = "Google sign-in is not configured yet.";
  } else if (mount.classList.contains("is-disabled")) {
    mount.classList.remove("is-disabled");
    mount.textContent = "";
  }
}

function loadGoogleIdentityScript() {
  if (googleLibraryPromise) return googleLibraryPromise;

  googleLibraryPromise = new Promise((resolve, reject) => {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      resolve(window.google);
      return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error("Google sign-in library could not load."));
    document.head.appendChild(script);
  });

  return googleLibraryPromise;
}

async function submitGoogleCredentialResponse(response) {
  if (!response || !response.credential) {
    showNotice("Google sign-in did not return a valid credential. Please try again.", "error");
    return;
  }

  clearNotice();
  setSubmittingState(true, "Signing in with Google...");

  try {
    const result = await apiRequest("/api/auth/google", {
      credential: response.credential,
      clientId: publicAuthConfig?.auth?.googleClientId || ""
    });
    localStorage.setItem("safeher_user", JSON.stringify(result.user));
    showNotice(result.message || "Google sign-in successful. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "pages/dashboard.html";
    }, 220);
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setSubmittingState(false);
  }
}

async function initializeGoogleSignIn() {
  const googleEnabled = Boolean(publicAuthConfig && publicAuthConfig.auth && publicAuthConfig.auth.googleEnabled);
  if (!googleEnabled) {
    setGoogleHint("Google sign-in will appear here after SAFEHER_GOOGLE_CLIENT_ID is added on the server.", true);
    return;
  }

  try {
    await loadGoogleIdentityScript();
  } catch (error) {
    setGoogleHint("Google sign-in library could not load in this browser right now.", true);
    return;
  }

  const mount = getField("googleSigninMount");
  const clientId = publicAuthConfig?.auth?.googleClientId || "";
  if (!mount || !window.google || !window.google.accounts || !window.google.accounts.id || !clientId) {
    setGoogleHint("Google sign-in is temporarily unavailable.", true);
    return;
  }

  if (googleButtonRendered) return;

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: submitGoogleCredentialResponse,
    ux_mode: "popup",
    auto_select: false,
    cancel_on_tap_outside: true
  });

  mount.innerHTML = "";
  mount.classList.remove("is-disabled");
  window.google.accounts.id.renderButton(mount, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: currentAuthMode === "login" ? "signin_with" : "continue_with",
    width: Math.min(Math.max(mount.clientWidth || 280, 240), 360)
  });
  window.google.accounts.id.prompt();
  googleButtonRendered = true;
  setGoogleHint("Use your Google account for faster SafeHer access.", false);
}

function collectRegisterPayload() {
  const nameField = getField("authNameField");
  const emailField = getField("authEmailField");
  const passwordField = getField("authPasswordField");
  const confirmField = getField("authConfirmPasswordField");

  const name = nameField ? nameField.value.trim() : "";
  const email = emailField ? emailField.value.trim() : "";
  const password = passwordField ? passwordField.value : "";
  const confirmPassword = confirmField ? confirmField.value : "";

  if (name.length < 2) {
    showNotice("Enter your full name to continue.", "error");
    markFieldInvalid(nameField);
    return null;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showNotice("Enter a valid email address.", "error");
    markFieldInvalid(emailField);
    return null;
  }

  if (password.length < 6) {
    showNotice("Password must be at least 6 characters.", "error");
    markFieldInvalid(passwordField);
    return null;
  }

  if (password !== confirmPassword) {
    showNotice("Passwords do not match.", "error");
    markFieldInvalid(confirmField);
    return null;
  }

  return { name, email, password };
}

function collectLoginPayload() {
  const emailField = getField("authEmailField");
  const passwordField = getField("authPasswordField");

  const email = emailField ? emailField.value.trim() : "";
  const password = passwordField ? passwordField.value : "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showNotice("Enter a valid email address.", "error");
    markFieldInvalid(emailField);
    return null;
  }

  if (!password) {
    showNotice("Enter your password.", "error");
    markFieldInvalid(passwordField);
    return null;
  }

  return { email, password };
}

async function submitAuth() {
  if (isSubmitting) return;

  const payload = currentAuthMode === "register" ? collectRegisterPayload() : collectLoginPayload();
  if (!payload) return;

  clearNotice();
  setSubmittingState(true, currentAuthMode === "register" ? "Creating account..." : "Signing in...");

  try {
    const response = await apiRequest(
      currentAuthMode === "register" ? "/api/auth/register" : "/api/auth/login",
      payload
    );
    localStorage.setItem("safeher_user", JSON.stringify(response.user));
    showNotice(response.message || "Success. Redirecting...", "success");
    setTimeout(() => {
      window.location.href = "pages/dashboard.html";
    }, 220);
  } catch (error) {
    showNotice(error.message, "error");
  } finally {
    setSubmittingState(false);
  }
}

async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  try {
    await navigator.serviceWorker.register("service-worker.js?v=20260407g");
  } catch (error) {
    console.error("SafeHer service worker registration failed.", error);
  }
}

document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener("click", function onAnchorClick(event) {
    const href = this.getAttribute("href");
    if (!href || href === "#") return;
    event.preventDefault();
    const target = document.querySelector(href);
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Enter") submitAuth();
});

document.addEventListener("DOMContentLoaded", async () => {
  switchAuthMode("register");
  await fetchPublicConfig();
  await initializeGoogleSignIn();
  registerServiceWorker();
});

window.scrollToAuth = scrollToAuth;
window.switchAuthMode = switchAuthMode;
window.toggleAuthMode = toggleAuthMode;
window.submitAuth = submitAuth;
