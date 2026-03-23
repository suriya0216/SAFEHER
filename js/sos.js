/* ==========================================
   SAFEHER - SOS Page JavaScript
   ========================================== */

let holdInterval = null;
let holdPct = 0;
let cdInterval = null;
let cdSecs = 30;

const CUSTOM_EMERGENCY_KEY = 'safeher_custom_emergency_numbers';
const VOICE_PREF_KEY = 'safeher_voice_auto_sos';
const EMERGENCY_BADGE_STYLES = [
  'background:rgba(255,45,85,0.12);color:var(--red2)',
  'background:rgba(0,122,255,0.12);color:var(--blue)',
  'background:rgba(52,199,89,0.12);color:var(--green)',
  'background:rgba(255,159,10,0.12);color:var(--gold)'
];
const VOICE_COMMANDS = [
  { regex: /\bhelp me\b/i, label: 'Help me' },
  { regex: /\bsave me\b/i, label: 'Save me' },
  { regex: /\bneed help\b/i, label: 'Need help' },
  { regex: /\bemergency\b/i, label: 'Emergency' },
  { regex: /\bs\.?o\.?s\b/i, label: 'SOS' }
];
const DEFAULT_SOS_CONTACTS = [
  { id: 'default-mother', label: 'Mother', displayNumber: '+91 98765 00001' },
  { id: 'default-father', label: 'Father', displayNumber: '+91 98765 00002' },
  { id: 'default-sister', label: 'Sister', displayNumber: '+91 98765 00003' },
  { id: 'default-friend', label: 'Best Friend', displayNumber: '+91 98765 00004' },
  { id: 'default-neighbor', label: 'Neighbor', displayNumber: '+91 98765 00005' }
];
const POLICE_SOS_UNIT = {
  label: 'Nearby Police Unit',
  reference: 'Ref #SH20260323-4871'
};
const ALERT_LOCATION = 'Pallavaram, Chennai';
const ALERT_VEHICLE = 'TN09AB4521';

let voiceRecognition = null;
let voiceEnabled = false;
let voiceRecognitionSupported = false;
let voiceListening = false;
let voiceStarting = false;
let voiceTriggered = false;
let voiceRestartTimer = null;
let emergencyFeedbackTimer = null;
let lastSosDispatchResult = null;

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function getStoredEmergencyNumbers() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_EMERGENCY_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (error) {
    return [];
  }
}

function saveEmergencyNumbers(numbers) {
  localStorage.setItem(CUSTOM_EMERGENCY_KEY, JSON.stringify(numbers));
}

function getInitials(label) {
  return (label || 'SOS')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0].toUpperCase())
    .join('');
}

function normalizePhoneDisplay(value) {
  return value.replace(/[^\d+\s()-]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePhoneDial(value) {
  const cleaned = value.trim();
  const digits = cleaned.replace(/\D/g, '');
  return cleaned.startsWith('+') ? `+${digits}` : digits;
}

function getCurrentUserName() {
  try {
    const user = JSON.parse(localStorage.getItem('safeher_user') || '{}');
    return user && user.name ? user.name : 'Priya';
  } catch (error) {
    return 'Priya';
  }
}

function getBadgeStyle(index) {
  return EMERGENCY_BADGE_STYLES[index % EMERGENCY_BADGE_STYLES.length];
}

function buildAlertMessage() {
  return `SAFEHER SOS ALERT\n${getCurrentUserName()} needs immediate help.\nLocation: ${ALERT_LOCATION}\nVehicle: ${ALERT_VEHICLE}\nThis is an automated SOS alert from SafeHer. Please respond immediately.`;
}

function getCustomRecipients() {
  return getStoredEmergencyNumbers().map((contact, index) => ({
    ...contact,
    badgeStyle: getBadgeStyle(index + DEFAULT_SOS_CONTACTS.length)
  }));
}

function getEmergencyRecipients() {
  const defaults = DEFAULT_SOS_CONTACTS.map((contact, index) => ({
    ...contact,
    dialNumber: normalizePhoneDial(contact.displayNumber),
    badgeStyle: getBadgeStyle(index)
  }));

  return [...defaults, ...getCustomRecipients()];
}

function formatContactNames(contacts) {
  const names = contacts.map(contact => contact.label);
  if (!names.length) return 'No contacts saved';
  if (names.length <= 5) return names.join(', ');
  return `${names.slice(0, 4).join(', ')} + ${names.length - 4} more`;
}

function getDispatchSummary(totalContacts) {
  if (!lastSosDispatchResult) {
    return {
      bannerClass: '',
      bannerTitle: 'SOS ALERT SENT',
      banner: `All ${totalContacts} contacts and police notified with live location`,
      safeNotice: `All ${totalContacts} contacts will be notified when you mark yourself safe`,
      safeStatus: `${totalContacts} contacts notified. Alert cancelled.`
    };
  }

  if (lastSosDispatchResult.ok) {
    return {
      bannerClass: '',
      bannerTitle: 'SOS ALERT SENT',
      banner: lastSosDispatchResult.message || `Automatic SOS sent to saved contacts.`,
      safeNotice: `All ${totalContacts} contacts will be notified when you mark yourself safe`,
      safeStatus: `${totalContacts} contacts notified. Alert cancelled.`
    };
  }

  if (lastSosDispatchResult.provider === 'unconfigured') {
    return {
      bannerClass: 'is-warning',
      bannerTitle: 'AUTOMATIC SEND NOT SET UP',
      banner: lastSosDispatchResult.message || 'Connect an SMS or WhatsApp webhook in .env to enable automatic SOS delivery.',
      safeNotice: `All ${totalContacts} contacts will be notified when you mark yourself safe`,
      safeStatus: `${totalContacts} contacts notified. Alert cancelled.`
    };
  }

  return {
    bannerClass: 'is-error',
    bannerTitle: 'AUTOMATIC SEND FAILED',
    banner: lastSosDispatchResult.message || 'Automatic SOS delivery could not be completed.',
    safeNotice: `All ${totalContacts} contacts will be notified when you mark yourself safe`,
    safeStatus: `${totalContacts} contacts notified. Alert cancelled.`
  };
}

function updateRecipientMeta() {
  const contacts = getEmergencyRecipients();
  const totalContacts = contacts.length;
  const dispatchSummary = getDispatchSummary(totalContacts);

  const trustedCount = document.getElementById('trustedContactCount');
  const liveTrackingSummary = document.getElementById('liveTrackingSummary');
  const contactReadyTitle = document.getElementById('contactReadyTitle');
  const contactReadySummary = document.getElementById('contactReadySummary');
  const countdownMessage = document.getElementById('countdownMessage');
  const alertBanner = document.getElementById('alertBanner');
  const alertBannerTitle = document.getElementById('alertBannerTitle');
  const alertBannerMessage = document.getElementById('alertBannerMessage');
  const safeNoticeText = document.getElementById('safeNoticeText');
  const safeStatusMessage = document.getElementById('safeStatusMessage');

  if (trustedCount) trustedCount.textContent = totalContacts;
  if (liveTrackingSummary) liveTrackingSummary.textContent = `Broadcasting to ${totalContacts} contacts`;
  if (contactReadyTitle) contactReadyTitle.textContent = `${totalContacts} emergency contacts ready`;
  if (contactReadySummary) contactReadySummary.textContent = formatContactNames(contacts);
  if (countdownMessage) {
    countdownMessage.innerHTML = `Alert will be sent to all ${totalContacts} emergency contacts and nearest police. Tap <strong style="color:var(--green)">I am Safe</strong> to cancel.`;
  }
  if (alertBanner) {
    alertBanner.className = `alert-banner ${dispatchSummary.bannerClass}`.trim();
  }
  if (alertBannerTitle) {
    alertBannerTitle.textContent = dispatchSummary.bannerTitle;
  }
  if (alertBannerMessage) {
    alertBannerMessage.textContent = dispatchSummary.banner;
  }
  if (safeNoticeText) {
    safeNoticeText.textContent = dispatchSummary.safeNotice;
  }
  if (safeStatusMessage) {
    safeStatusMessage.textContent = dispatchSummary.safeStatus;
  }
}

function getCustomDispatchState() {
  if (!lastSosDispatchResult) {
    return {
      cardClass: 'sent-contact-real',
      badgeClass: 'scc-real-badge',
      label: 'Ready for Automatic Send',
      detail: 'This number will receive an automatic SOS message when the alert is sent.'
    };
  }

  if (lastSosDispatchResult.ok) {
    return {
      cardClass: 'sent-contact-real',
      badgeClass: 'scc-real-badge',
      label: 'Sent Automatically',
      detail: 'This saved number received the SOS message from the backend.'
    };
  }

  return {
    cardClass: 'sent-contact-real sent-contact-failed',
    badgeClass: 'scc-real-badge scc-real-badge-error',
    label: 'Automatic Send Failed',
    detail: lastSosDispatchResult.message || 'Automatic SOS delivery is not available right now.'
  };
}

function renderSentContacts() {
  const sentContactsGrid = document.getElementById('sentContactsGrid');
  if (!sentContactsGrid) return;

  const customContacts = getCustomRecipients();
  const dispatchState = getCustomDispatchState();

  const customCards = customContacts.map(contact => `
    <div class="sent-contact-card ${dispatchState.cardClass}">
      <div class="scc-top">
        <div class="scc-av" style="${contact.badgeStyle}">${escapeHtml(getInitials(contact.label))}</div>
        <div>
          <div class="scc-name">${escapeHtml(contact.label)}</div>
          <div class="scc-num">${escapeHtml(contact.displayNumber)}</div>
        </div>
      </div>
      <div class="${dispatchState.badgeClass}"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>${escapeHtml(dispatchState.label)}</div>
      <div class="scc-msg">${escapeHtml(dispatchState.detail)}</div>
    </div>
  `);

  const defaultCards = DEFAULT_SOS_CONTACTS.map((contact, index) => `
    <div class="sent-contact-card">
      <div class="scc-top">
        <div class="scc-av" style="${getBadgeStyle(index)}">${escapeHtml(getInitials(contact.label))}</div>
        <div>
          <div class="scc-name">${escapeHtml(contact.label)}</div>
          <div class="scc-num">${escapeHtml(contact.displayNumber)}</div>
        </div>
      </div>
      <div class="scc-sent"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Protected</div>
      <div class="scc-msg">Demo contact only. Add real saved numbers to enable automatic delivery.</div>
    </div>
  `);

  const policeCard = `
    <div class="sent-contact-card">
      <div class="scc-top">
        <div class="scc-av" style="background:rgba(0,122,255,0.12);color:var(--blue)">PS</div>
        <div>
          <div class="scc-name">${escapeHtml(POLICE_SOS_UNIT.label)}</div>
          <div class="scc-num">${escapeHtml(POLICE_SOS_UNIT.reference)}</div>
        </div>
      </div>
      <div class="scc-sent"><svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>Unit dispatched</div>
      <div class="scc-msg">Route history and live location shared.</div>
    </div>
  `;

  sentContactsGrid.innerHTML = [...customCards, ...defaultCards, policeCard].join('');
}

function showEmergencyFeedback(message, tone) {
  const feedback = document.getElementById('emergencyFeedback');
  if (!feedback) return;

  clearTimeout(emergencyFeedbackTimer);
  feedback.className = `emergency-feedback is-${tone}`;
  feedback.textContent = message;
  feedback.style.display = 'block';

  emergencyFeedbackTimer = setTimeout(() => {
    feedback.style.display = 'none';
    feedback.textContent = '';
    feedback.className = 'emergency-feedback';
  }, 3200);
}

function renderCustomEmergencyNumbers() {
  const container = document.getElementById('customEmergencyList');
  if (!container) return;

  const numbers = getStoredEmergencyNumbers();
  if (!numbers.length) {
    container.innerHTML = `
      <div class="emergency-empty">
        No custom numbers saved yet. Add a trusted contact or private helpline number.
      </div>
    `;
    return;
  }

  container.innerHTML = numbers.map((item, index) => `
    <div class="emergency-number emergency-number-custom">
      <div class="emergency-number-content">
        <div class="emergency-number-badge" style="${getBadgeStyle(index + DEFAULT_SOS_CONTACTS.length)}">
          ${escapeHtml(getInitials(item.label))}
        </div>
        <div class="emergency-number-text">
          <div class="emergency-number-name">${escapeHtml(item.label)}</div>
          <div class="emergency-number-sub">${escapeHtml(item.displayNumber)}</div>
        </div>
      </div>
      <div class="emergency-number-actions">
        <a href="tel:${escapeHtml(item.dialNumber)}" class="emergency-call-btn emergency-call-btn-custom">Call</a>
        <button type="button" class="emergency-remove-btn" onclick="removeEmergencyNumber('${escapeHtml(item.id)}')">Remove</button>
      </div>
    </div>
  `).join('');
}

function addEmergencyNumber(event) {
  event.preventDefault();

  const nameInput = document.getElementById('emergencyName');
  const phoneInput = document.getElementById('emergencyPhone');
  if (!nameInput || !phoneInput) return;

  const label = nameInput.value.trim() || 'Saved Contact';
  const displayNumber = normalizePhoneDisplay(phoneInput.value);
  const dialNumber = normalizePhoneDial(displayNumber);
  const digitCount = dialNumber.replace(/\D/g, '').length;

  if (!displayNumber || digitCount < 5) {
    showEmergencyFeedback('Enter a valid phone number.', 'error');
    phoneInput.focus();
    return;
  }

  const numbers = getStoredEmergencyNumbers();
  const duplicate = numbers.some(item => item.dialNumber === dialNumber);
  if (duplicate) {
    showEmergencyFeedback('This number has already been saved.', 'error');
    phoneInput.focus();
    return;
  }

  numbers.unshift({
    id: `emg-${Date.now()}`,
    label,
    displayNumber,
    dialNumber
  });

  saveEmergencyNumbers(numbers);
  lastSosDispatchResult = null;
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  event.target.reset();
  showEmergencyFeedback(`${label} was saved successfully.`, 'success');
}

function removeEmergencyNumber(id) {
  const numbers = getStoredEmergencyNumbers();
  const nextNumbers = numbers.filter(item => item.id !== id);
  saveEmergencyNumbers(nextNumbers);
  lastSosDispatchResult = null;
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  showEmergencyFeedback('Saved number removed successfully.', 'success');
}

function isIdleViewActive() {
  const idleSection = document.getElementById('sos-idle');
  return !!idleSection && idleSection.style.display !== 'none';
}

function summarizeTranscript(transcript) {
  const text = transcript.trim();
  if (!text) return 'Last heard: waiting...';
  const shortened = text.length > 52 ? `${text.slice(0, 52)}...` : text;
  return `Last heard: "${shortened}"`;
}

function updateVoiceUI(tone, message, lastHeard) {
  const status = document.getElementById('voiceStatus');
  const statusText = document.getElementById('voiceStatusText');
  const lastHeardText = document.getElementById('voiceLastHeard');
  if (!status || !statusText || !lastHeardText) return;

  status.className = `voice-status is-${tone}`;
  statusText.textContent = message;
  lastHeardText.textContent = lastHeard;
}

function updateVoiceToggleButton() {
  const button = document.getElementById('voiceToggleBtn');
  if (!button) return;

  if (!voiceRecognitionSupported) {
    button.textContent = 'Voice Unavailable';
    button.disabled = true;
    return;
  }

  button.disabled = false;
  button.textContent = voiceEnabled ? 'Stop Listening' : 'Start Listening';
  button.className = voiceEnabled
    ? 'btn voice-toggle-btn voice-toggle-active'
    : 'btn btn-ghost voice-toggle-btn';
}

function persistVoicePreference() {
  localStorage.setItem(VOICE_PREF_KEY, String(voiceEnabled));
}

function getDetectedCommand(transcript) {
  const spoken = transcript.trim().toLowerCase();
  if (!spoken) return null;

  const match = VOICE_COMMANDS.find(command => command.regex.test(spoken));
  return match ? match.label : null;
}

function stopVoiceRecognition() {
  clearTimeout(voiceRestartTimer);
  voiceStarting = false;

  if (!voiceRecognition) return;

  try {
    voiceRecognition.stop();
  } catch (error) {}
}

function scheduleVoiceRestart() {
  clearTimeout(voiceRestartTimer);

  if (!voiceEnabled || !voiceRecognitionSupported || !isIdleViewActive() || document.hidden) {
    return;
  }

  voiceRestartTimer = setTimeout(() => {
    startVoiceRecognition();
  }, 900);
}

function startVoiceRecognition() {
  if (
    !voiceRecognitionSupported ||
    !voiceRecognition ||
    !voiceEnabled ||
    voiceListening ||
    voiceStarting ||
    !isIdleViewActive() ||
    document.hidden
  ) {
    return;
  }

  try {
    voiceStarting = true;
    updateVoiceUI('warning', 'Microphone starting...', 'Last heard: waiting for "Help me".');
    voiceRecognition.start();
  } catch (error) {
    voiceStarting = false;

    if (error && error.name === 'InvalidStateError') {
      return;
    }

    voiceEnabled = false;
    persistVoicePreference();
    updateVoiceToggleButton();
    updateVoiceUI('error', 'Microphone could not start. Allow browser access and try again.', 'Last heard: microphone blocked.');
  }
}

function disableVoiceActivation(message, lastHeard) {
  voiceEnabled = false;
  persistVoicePreference();
  stopVoiceRecognition();
  updateVoiceToggleButton();
  updateVoiceUI('idle', message || 'Voice auto SOS is off.', lastHeard || 'Last heard: microphone is off.');
}

function triggerVoiceSOS(commandLabel, transcript) {
  if (voiceTriggered || !isIdleViewActive()) return;

  voiceTriggered = true;
  updateVoiceUI('alert', `Detected "${commandLabel}". SOS triggering now...`, summarizeTranscript(transcript));
  stopVoiceRecognition();
  sosStart(`Voice activation - "${commandLabel}" detected`);
}

function initVoiceRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  voiceEnabled = localStorage.getItem(VOICE_PREF_KEY) !== 'false';

  if (!SpeechRecognition) {
    voiceRecognitionSupported = false;
    updateVoiceToggleButton();
    updateVoiceUI('error', 'Voice Auto SOS is not supported in this browser.', 'Last heard: browser voice recognition unavailable.');
    return;
  }

  voiceRecognitionSupported = true;
  voiceRecognition = new SpeechRecognition();
  voiceRecognition.continuous = true;
  voiceRecognition.interimResults = true;
  voiceRecognition.lang = 'en-IN';

  voiceRecognition.onstart = () => {
    voiceStarting = false;
    voiceListening = true;
    updateVoiceToggleButton();
    updateVoiceUI('active', 'Listening for "Help me"...', 'Last heard: waiting for voice command.');
  };

  voiceRecognition.onresult = event => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript.trim();
      if (!transcript) continue;

      updateVoiceUI(
        voiceTriggered ? 'alert' : 'active',
        voiceTriggered ? 'Voice command detected.' : 'Listening for "Help me"...',
        summarizeTranscript(transcript)
      );

      const commandLabel = getDetectedCommand(transcript);
      if (!commandLabel) continue;

      if (commandLabel === 'Help me' || event.results[i].isFinal) {
        triggerVoiceSOS(commandLabel, transcript);
        break;
      }
    }
  };

  voiceRecognition.onerror = event => {
    voiceStarting = false;
    voiceListening = false;

    if (!voiceEnabled) {
      updateVoiceToggleButton();
      return;
    }

    if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
      disableVoiceActivation(
        'Microphone permission is unavailable. Allow access and start listening again.',
        'Last heard: microphone permission denied.'
      );
      return;
    }

    updateVoiceToggleButton();
    updateVoiceUI('warning', 'Voice listener is reconnecting...', `Last heard: listener error "${event.error}".`);

    if (event.error !== 'aborted') {
      scheduleVoiceRestart();
    }
  };

  voiceRecognition.onend = () => {
    voiceStarting = false;
    voiceListening = false;
    updateVoiceToggleButton();

    if (!voiceEnabled || voiceTriggered || !isIdleViewActive()) {
      return;
    }

    updateVoiceUI('warning', 'Voice listener is reconnecting...', 'Last heard: waiting for microphone.');
    scheduleVoiceRestart();
  };

  updateVoiceToggleButton();
  updateVoiceUI(
    voiceEnabled ? 'warning' : 'idle',
    voiceEnabled ? 'Saved preference found. Voice listener starting...' : 'Voice auto SOS is off.',
    voiceEnabled ? 'Last heard: preparing microphone.' : 'Last heard: microphone is off.'
  );

  if (voiceEnabled) {
    startVoiceRecognition();
  }
}

function toggleVoiceActivation() {
  if (!voiceRecognitionSupported) {
    alert('Voice activation is not supported on this browser.');
    return;
  }

  if (voiceEnabled) {
    disableVoiceActivation();
    return;
  }

  voiceEnabled = true;
  voiceTriggered = false;
  persistVoicePreference();
  updateVoiceToggleButton();
  updateVoiceUI('warning', 'Microphone starting...', 'Last heard: waiting for "Help me".');
  startVoiceRecognition();
}

function holdStart(event) {
  if (event) event.preventDefault();
  if (holdInterval) return;

  holdPct = 0;
  holdInterval = setInterval(() => {
    holdPct += 100 / 40;
    document.getElementById('holdFill').style.width = `${Math.min(holdPct, 100)}%`;
    if (holdPct >= 100) {
      holdCancel();
      sosStart('SOS button held - emergency triggered');
    }
  }, 50);
}

function holdCancel() {
  clearInterval(holdInterval);
  holdInterval = null;
  document.getElementById('holdFill').style.width = '0';
}

function sosStart(reason) {
  clearInterval(cdInterval);
  voiceTriggered = false;
  stopVoiceRecognition();
  lastSosDispatchResult = null;
  renderSentContacts();
  updateRecipientMeta();

  document.getElementById('sos-idle').style.display = 'none';
  document.getElementById('sos-countdown').style.display = 'block';
  document.getElementById('sos-alerted').style.display = 'none';
  document.getElementById('sos-safe').style.display = 'none';
  document.getElementById('cdLbl').textContent = reason || 'SOS Triggered';

  cdSecs = 30;
  updateRing();
  cdInterval = setInterval(() => {
    cdSecs--;
    updateRing();
    if (cdSecs <= 0) {
      clearInterval(cdInterval);
      sosSend();
    }
  }, 1000);
}

function updateRing() {
  const countLabel = document.getElementById('cdNum');
  const fill = document.getElementById('cdrFill');
  if (!countLabel || !fill) return;

  countLabel.textContent = cdSecs;
  const pct = (30 - cdSecs) / 30;
  fill.style.strokeDashoffset = 465 * pct;

  const color = cdSecs > 15 ? 'var(--red2)' : cdSecs > 8 ? 'var(--red)' : 'var(--gold)';
  fill.style.stroke = color;
  countLabel.style.color = color;
}

async function sendAutomaticAlerts() {
  const customContacts = getCustomRecipients();
  if (!customContacts.length) {
    return {
      ok: false,
      provider: 'no-saved-contacts',
      dispatched: 0,
      message: 'No saved phone numbers are available for automatic messaging.',
      recipients: [],
    };
  }

  try {
    const response = await fetch('/api/sos/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: buildAlertMessage(),
        recipients: customContacts.map(contact => ({
          label: contact.label,
          dialNumber: contact.dialNumber,
        })),
        meta: {
          userName: getCurrentUserName(),
          location: ALERT_LOCATION,
          vehicle: ALERT_VEHICLE,
          trigger: document.getElementById('cdLbl')?.textContent || 'SOS Triggered',
        },
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }

    if (!payload) {
      return {
        ok: false,
        provider: 'invalid-response',
        dispatched: 0,
        message: 'The SOS server returned an invalid response.',
        recipients: [],
      };
    }

    return payload;
  } catch (error) {
    return {
      ok: false,
      provider: 'network-error',
      dispatched: 0,
      message: error instanceof Error ? error.message : 'Could not reach the SOS server.',
      recipients: [],
    };
  }
}

async function sosSend() {
  clearInterval(cdInterval);
  lastSosDispatchResult = await sendAutomaticAlerts();
  renderSentContacts();
  updateRecipientMeta();
  document.getElementById('sos-countdown').style.display = 'none';
  document.getElementById('sos-alerted').style.display = 'block';
}

function sosSafe() {
  clearInterval(cdInterval);
  stopVoiceRecognition();

  ['sos-countdown', 'sos-alerted'].forEach(id => {
    const section = document.getElementById(id);
    if (section) section.style.display = 'none';
  });

  document.getElementById('sos-idle').style.display = 'none';
  document.getElementById('sos-safe').style.display = 'block';
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopVoiceRecognition();
    return;
  }

  if (voiceEnabled && isIdleViewActive()) {
    startVoiceRecognition();
  }
});

window.addEventListener('beforeunload', () => {
  stopVoiceRecognition();
  clearInterval(cdInterval);
  clearInterval(holdInterval);
});

document.addEventListener('DOMContentLoaded', () => {
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  initVoiceRecognition();
});
