/* ==========================================
   SAFEHER - Download Page JavaScript
   ========================================== */

const SAFEHER_APK_DOWNLOAD_URL = 'https://github.com/suriya0216/SAFEHER/releases/download/mobile-latest/SafeHer-debug.apk';

function getDownloadButton() {
  return document.getElementById('downloadInstallBtn');
}

function getStatusBox() {
  return document.getElementById('downloadStatus');
}

function isAndroidDevice() {
  return /android/i.test(navigator.userAgent || '');
}

function isIOSDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent || '');
}

function setStatus(message, tone) {
  const statusBox = getStatusBox();
  if (!statusBox) return;
  statusBox.className = `download-status is-${tone || 'neutral'}`;
  statusBox.textContent = message;
}

function updateDownloadButtonState() {
  const button = getDownloadButton();
  if (!button) return;

  button.disabled = false;

  if (isIOSDevice()) {
    button.querySelector('span').textContent = 'Download Android APK';
    setStatus('This page now downloads the Android APK directly. iPhone cannot install APK files, so keep using the SafeHer website on iPhone.', 'info');
    return;
  }

  if (isAndroidDevice()) {
    button.querySelector('span').textContent = 'Download Android APK';
    setStatus('Tap the button once. Your browser will start downloading the latest SafeHer APK directly.', 'ready');
    return;
  }

  button.querySelector('span').textContent = 'Download SafeHer APK';
  setStatus('Desktop browsers can download the APK file too. After download, move it to an Android phone and install SafeHer there.', 'neutral');
}

function installSafeHerApp() {
  if (isIOSDevice()) {
    setStatus('APK installation is not supported on iPhone. Open SafeHer in Safari if you want to use the website there.', 'info');
    return;
  }

  setStatus('Download started. If your browser asks for permission, allow it and then open the APK file on Android to install SafeHer.', 'success');

  setTimeout(() => {
    window.location.href = SAFEHER_APK_DOWNLOAD_URL;
  }, 140);
}

document.addEventListener('DOMContentLoaded', () => {
  updateDownloadButtonState();
});
