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
const INCIDENT_SNAPSHOT_INTERVAL_MS = 4500;
const INCIDENT_VIDEO_CHUNK_MS = 6000;
const INCIDENT_TRANSCRIPT_FLUSH_DELAY_MS = 1800;
const INCIDENT_TRANSCRIPT_HISTORY_LIMIT = 16;
const SNAPSHOT_CAPTURE_WIDTH = 960;

let voiceRecognition = null;
let voiceEnabled = false;
let voiceRecognitionSupported = false;
let voiceListening = false;
let voiceStarting = false;
let voiceTriggered = false;
let voiceRestartTimer = null;
let emergencyFeedbackTimer = null;
let lastSosDispatchResult = null;

let incidentMediaStream = null;
let incidentPreparing = false;
let incidentSnapshotTimer = null;
let incidentSession = null;
let incidentUploadInFlight = false;
let incidentLastSnapshotAt = 0;
let incidentVideoRecorder = null;
let incidentVideoUploadInFlight = false;
let incidentLastTriggerReason = 'SOS Triggered';
let incidentTranscriptRecognition = null;
let incidentTranscriptSupported = false;
let incidentTranscriptRunning = false;
let incidentTranscriptStarting = false;
let incidentTranscriptShouldRun = false;
let incidentTranscriptRestartTimer = null;
let incidentTranscriptFlushTimer = null;
let incidentTranscriptQueue = [];
let incidentTranscriptHistory = [];
let incidentTranscriptTail = 'Speech transcript will appear here after SOS starts.';

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('Could not read media clip.'));
    reader.readAsDataURL(blob);
  });
}

function getSupportedIncidentVideoMimeType() {
  if (!window.MediaRecorder || typeof MediaRecorder.isTypeSupported !== 'function') {
    return '';
  }

  const preferred = [
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm',
    'video/mp4',
  ];

  return preferred.find(type => MediaRecorder.isTypeSupported(type)) || '';
}

function isValidEmail(value) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

function normalizePhoneDisplay(value) {
  return String(value || '').replace(/[^\d+\s()-]/g, '').replace(/\s+/g, ' ').trim();
}

function normalizePhoneDial(value) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return '';
  const digits = cleaned.replace(/\D/g, '');
  return cleaned.startsWith('+') ? `+${digits}` : digits;
}

function normalizeEmailValue(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!email) return '';
  if (!isValidEmail(email)) {
    throw new Error('Enter a valid email address.');
  }
  return email;
}

function normalizeTelegramValue(value) {
  const telegram = String(value || '').trim();
  if (!telegram) return '';
  if (/^-?\d{5,}$/.test(telegram) || /^@[A-Za-z0-9_]{5,}$/.test(telegram)) {
    return telegram;
  }
  throw new Error('Telegram Chat ID must be numeric or start with @.');
}

function normalizeStoredEmergencyContact(contact, index) {
  if (!contact || typeof contact !== 'object') {
    return null;
  }

  const label = String(contact.label || contact.name || 'Saved Contact').trim() || 'Saved Contact';
  const displayNumber = normalizePhoneDisplay(contact.displayNumber || contact.phone || contact.number || '');
  const dialNumber = normalizePhoneDial(contact.dialNumber || displayNumber);
  const email = isValidEmail(String(contact.email || '').trim().toLowerCase())
    ? String(contact.email || '').trim().toLowerCase()
    : '';
  const telegramChatId = String(contact.telegramChatId || contact.telegram || '').trim();

  if (!displayNumber && !email && !telegramChatId) {
    return null;
  }

  return {
    id: String(contact.id || `emg-${Date.now()}-${index}`),
    label,
    displayNumber,
    dialNumber,
    email,
    telegramChatId
  };
}

function getStoredEmergencyNumbers() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_EMERGENCY_KEY) || '[]');
    if (!Array.isArray(stored)) return [];

    return stored
      .map((contact, index) => normalizeStoredEmergencyContact(contact, index))
      .filter(Boolean);
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

function getAutomationReadyRecipients() {
  return getCustomRecipients().filter(contact => Boolean(contact.email || contact.telegramChatId));
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

function countAutomaticChannels() {
  return getAutomationReadyRecipients().reduce((total, contact) => total + Number(Boolean(contact.email)) + Number(Boolean(contact.telegramChatId)), 0);
}

function getDispatchSummary(totalContacts) {
  const readyContacts = getAutomationReadyRecipients().length;

  if (!lastSosDispatchResult) {
    const readyLine = readyContacts
      ? `${readyContacts} automation-ready contact(s) will receive the secure live viewer link.`
      : 'Add email or Telegram Chat ID to a saved contact so automatic online alerts can be sent.';

    return {
      bannerClass: '',
      bannerTitle: 'SOS ALERT SENT',
      banner: readyLine,
      safeNotice: 'Contacts will be updated again if you mark yourself safe.',
      safeStatus: `${totalContacts} contacts available. Alert cancelled.`,
    };
  }

  if (lastSosDispatchResult.ok) {
    return {
      bannerClass: '',
      bannerTitle: 'LIVE INCIDENT SHARED',
      banner: lastSosDispatchResult.message || 'SafeHer shared the secure incident viewer and live updates with your contacts.',
      safeNotice: 'Contacts will receive a safe update when you cancel this alert.',
      safeStatus: 'Safe update sent to your trusted contacts.',
    };
  }

  if (lastSosDispatchResult.provider === 'unconfigured' || lastSosDispatchResult.provider === 'no-automation-contacts') {
    return {
      bannerClass: 'is-warning',
      bannerTitle: 'AUTOMATION NOT READY',
      banner: lastSosDispatchResult.message || 'Add email and Telegram settings in .env to enable automatic alerts.',
      safeNotice: 'You can still cancel the countdown and stay on this page while fixing the contact channels.',
      safeStatus: 'Alert cancelled locally.',
    };
  }

  return {
    bannerClass: 'is-error',
    bannerTitle: 'AUTOMATIC SEND FAILED',
    banner: lastSosDispatchResult.message || 'SafeHer could not send the online alerts.',
    safeNotice: 'You can retry after updating contact details or provider settings.',
    safeStatus: 'Alert cancelled locally.',
  };
}

function updateRecipientMeta() {
  const contacts = getEmergencyRecipients();
  const totalContacts = contacts.length;
  const automationReady = getAutomationReadyRecipients();
  const channelCount = countAutomaticChannels();
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
  if (liveTrackingSummary) {
    liveTrackingSummary.textContent = channelCount
      ? `${channelCount} email/Telegram channel(s) ready`
      : 'Add email or Telegram details for automatic online alerts';
  }
  if (contactReadyTitle) {
    contactReadyTitle.textContent = automationReady.length
      ? `${automationReady.length} automation-ready contact(s)`
      : `${totalContacts} contacts saved`;
  }
  if (contactReadySummary) {
    contactReadySummary.textContent = automationReady.length
      ? formatContactNames(automationReady)
      : 'Mother, Father, Sister, Best Friend, Neighbor';
  }
  if (countdownMessage) {
    countdownMessage.innerHTML = automationReady.length
      ? `Alert will share a secure live viewer with ${automationReady.length} trusted contact(s). Tap <strong style="color:var(--green)">I am Safe</strong> to cancel.`
      : `Add email or Telegram details to a saved contact for live sharing. Tap <strong style="color:var(--green)">I am Safe</strong> to cancel.`;
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

function getContactChannelChips(contact) {
  const chips = [];
  if (contact.displayNumber) {
    chips.push({ tone: 'phone', label: `Call ${contact.displayNumber}` });
  }
  if (contact.email) {
    chips.push({ tone: 'email', label: `Email ${contact.email}` });
  }
  if (contact.telegramChatId) {
    chips.push({ tone: 'telegram', label: `Telegram ${contact.telegramChatId}` });
  }
  return chips;
}

function buildContactMetaChipsHtml(contact) {
  return getContactChannelChips(contact).map(chip => `
    <span class="emergency-meta-chip is-${escapeHtml(chip.tone)}">${escapeHtml(chip.label)}</span>
  `).join('');
}

function buildResultChannelBadges(contact, dispatchResult) {
  if (dispatchResult && Array.isArray(dispatchResult.channels) && dispatchResult.channels.length) {
    return dispatchResult.channels.map(channel => `
      <span class="sent-contact-channel-badge ${channel.ok ? 'is-ok' : 'is-failed'}">
        ${escapeHtml(channel.type)}${channel.ok ? ' sent' : ' failed'}
      </span>
    `).join('');
  }

  if (!contact.email && !contact.telegramChatId) {
    return '<span class="sent-contact-channel-badge is-warning">Call only</span>';
  }

  return [
    contact.email ? '<span class="sent-contact-channel-badge is-ready">Email ready</span>' : '',
    contact.telegramChatId ? '<span class="sent-contact-channel-badge is-ready">Telegram ready</span>' : '',
  ].join('');
}

function getContactDispatchResult(contact) {
  if (!lastSosDispatchResult || !Array.isArray(lastSosDispatchResult.recipients)) {
    return null;
  }

  return lastSosDispatchResult.recipients.find(item => (
    item.contactId === contact.id ||
    (item.label === contact.label && item.email === contact.email && item.telegramChatId === contact.telegramChatId)
  )) || null;
}

function getCustomDispatchState(contact) {
  const dispatchResult = getContactDispatchResult(contact);

  if (!contact.email && !contact.telegramChatId) {
    return {
      cardClass: 'sent-contact-warning',
      badgeClass: 'scc-real-badge scc-real-badge-error',
      label: 'Call Only',
      detail: 'Add an email address or Telegram Chat ID to include this contact in automatic online alerts.',
      channelsHtml: buildResultChannelBadges(contact, null)
    };
  }

  if (!lastSosDispatchResult) {
    return {
      cardClass: 'sent-contact-real',
      badgeClass: 'scc-real-badge',
      label: 'Automation Ready',
      detail: 'This contact will receive the secure viewer link and live transcript updates when SOS is sent.',
      channelsHtml: buildResultChannelBadges(contact, null)
    };
  }

  if (!dispatchResult) {
    return {
      cardClass: 'sent-contact-real sent-contact-failed',
      badgeClass: 'scc-real-badge scc-real-badge-error',
      label: 'Dispatch Unknown',
      detail: lastSosDispatchResult.message || 'SafeHer could not confirm delivery for this contact.',
      channelsHtml: buildResultChannelBadges(contact, null)
    };
  }

  const okChannels = dispatchResult.channels.filter(channel => channel.ok);
  const failedChannels = dispatchResult.channels.filter(channel => !channel.ok);

  if (okChannels.length && !failedChannels.length) {
    return {
      cardClass: 'sent-contact-real',
      badgeClass: 'scc-real-badge',
      label: 'Shared Successfully',
      detail: 'Viewer link and incident updates were delivered successfully.',
      channelsHtml: buildResultChannelBadges(contact, dispatchResult)
    };
  }

  if (okChannels.length) {
    return {
      cardClass: 'sent-contact-real',
      badgeClass: 'scc-real-badge',
      label: 'Partially Shared',
      detail: failedChannels[0]?.message || 'At least one configured channel failed, but another channel delivered the alert.',
      channelsHtml: buildResultChannelBadges(contact, dispatchResult)
    };
  }

  return {
    cardClass: 'sent-contact-real sent-contact-failed',
    badgeClass: 'scc-real-badge scc-real-badge-error',
    label: 'Automatic Send Failed',
    detail: failedChannels[0]?.message || lastSosDispatchResult.message || 'Automatic online delivery is not available right now.',
    channelsHtml: buildResultChannelBadges(contact, dispatchResult)
  };
}

function renderSentContacts() {
  const sentContactsGrid = document.getElementById('sentContactsGrid');
  if (!sentContactsGrid) return;

  const customContacts = getCustomRecipients();

  const customCards = customContacts.map(contact => {
    const dispatchState = getCustomDispatchState(contact);
    const contactLines = [
      contact.displayNumber ? `<div class="scc-num">${escapeHtml(contact.displayNumber)}</div>` : '',
      contact.email ? `<div class="scc-num">${escapeHtml(contact.email)}</div>` : '',
      contact.telegramChatId ? `<div class="scc-num">${escapeHtml(contact.telegramChatId)}</div>` : '',
    ].join('');

    return `
      <div class="sent-contact-card ${dispatchState.cardClass}">
        <div class="scc-top">
          <div class="scc-av" style="${contact.badgeStyle}">${escapeHtml(getInitials(contact.label))}</div>
          <div>
            <div class="scc-name">${escapeHtml(contact.label)}</div>
            ${contactLines}
          </div>
        </div>
        <div class="${dispatchState.badgeClass}">
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          ${escapeHtml(dispatchState.label)}
        </div>
        <div class="sent-contact-channel-row">${dispatchState.channelsHtml}</div>
        <div class="scc-msg">${escapeHtml(dispatchState.detail)}</div>
      </div>
    `;
  });

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
      <div class="scc-msg">Demo contact only. Add real email or Telegram details to enable automatic delivery.</div>
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
  }, 3600);
}

function renderCustomEmergencyNumbers() {
  const container = document.getElementById('customEmergencyList');
  if (!container) return;

  const numbers = getStoredEmergencyNumbers();
  if (!numbers.length) {
    container.innerHTML = `
      <div class="emergency-empty">
        No custom contacts saved yet. Add a trusted person with at least one phone, email, or Telegram channel.
      </div>
    `;
    return;
  }

  container.innerHTML = numbers.map((item, index) => {
    const canCall = Boolean(item.dialNumber);
    const automationHint = item.email || item.telegramChatId
      ? 'Automatic online alerts are ready for this contact.'
      : 'This contact can be called quickly. Add email or Telegram to include them in automation.';

    return `
      <div class="emergency-number emergency-number-custom">
        <div class="emergency-number-content">
          <div class="emergency-number-badge" style="${getBadgeStyle(index + DEFAULT_SOS_CONTACTS.length)}">
            ${escapeHtml(getInitials(item.label))}
          </div>
          <div class="emergency-number-text">
            <div class="emergency-number-name">${escapeHtml(item.label)}</div>
            ${item.displayNumber ? `<div class="emergency-number-sub">${escapeHtml(item.displayNumber)}</div>` : ''}
            ${item.email ? `<div class="emergency-number-sub">${escapeHtml(item.email)}</div>` : ''}
            ${item.telegramChatId ? `<div class="emergency-number-sub">${escapeHtml(item.telegramChatId)}</div>` : ''}
            <div class="emergency-number-meta">${buildContactMetaChipsHtml(item)}</div>
            <div class="emergency-status-hint">${escapeHtml(automationHint)}</div>
          </div>
        </div>
        <div class="emergency-number-actions">
          <div class="emergency-action-stack">
            ${canCall ? `<a href="tel:${escapeHtml(item.dialNumber)}" class="emergency-call-btn emergency-call-btn-custom">Call</a>` : ''}
            <button type="button" class="emergency-remove-btn" onclick="removeEmergencyNumber('${escapeHtml(item.id)}')">Remove</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function addEmergencyNumber(event) {
  event.preventDefault();

  const nameInput = document.getElementById('emergencyName');
  const phoneInput = document.getElementById('emergencyPhone');
  const emailInput = document.getElementById('emergencyEmail');
  const telegramInput = document.getElementById('emergencyTelegram');
  if (!nameInput || !phoneInput || !emailInput || !telegramInput) return;

  const label = nameInput.value.trim() || 'Saved Contact';
  const displayNumber = normalizePhoneDisplay(phoneInput.value);
  const dialNumber = normalizePhoneDial(displayNumber);
  const digitCount = dialNumber.replace(/\D/g, '').length;

  let email = '';
  let telegramChatId = '';
  try {
    email = normalizeEmailValue(emailInput.value);
    telegramChatId = normalizeTelegramValue(telegramInput.value);
  } catch (error) {
    showEmergencyFeedback(error instanceof Error ? error.message : 'Enter valid contact details.', 'error');
    return;
  }

  if (displayNumber && digitCount < 5) {
    showEmergencyFeedback('Enter a valid phone number.', 'error');
    phoneInput.focus();
    return;
  }

  if (!displayNumber && !email && !telegramChatId) {
    showEmergencyFeedback('Add at least one phone number, email, or Telegram chat ID.', 'error');
    phoneInput.focus();
    return;
  }

  const numbers = getStoredEmergencyNumbers();
  const duplicate = numbers.some(item => (
    (dialNumber && item.dialNumber === dialNumber) ||
    (email && item.email === email) ||
    (telegramChatId && item.telegramChatId === telegramChatId)
  ));
  if (duplicate) {
    showEmergencyFeedback('This contact channel has already been saved.', 'error');
    return;
  }

  numbers.unshift({
    id: `emg-${Date.now()}`,
    label,
    displayNumber,
    dialNumber,
    email,
    telegramChatId
  });

  saveEmergencyNumbers(numbers);
  lastSosDispatchResult = null;
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  event.target.reset();

  const configuredChannels = [
    displayNumber ? 'phone' : '',
    email ? 'email' : '',
    telegramChatId ? 'Telegram' : ''
  ].filter(Boolean).join(', ');

  showEmergencyFeedback(`${label} saved successfully with ${configuredChannels}.`, 'success');
}

function removeEmergencyNumber(id) {
  const numbers = getStoredEmergencyNumbers();
  const nextNumbers = numbers.filter(item => item.id !== id);
  saveEmergencyNumbers(nextNumbers);
  lastSosDispatchResult = null;
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  showEmergencyFeedback('Saved contact removed successfully.', 'success');
}

function isIdleViewActive() {
  const idleSection = document.getElementById('sos-idle');
  return !!idleSection && idleSection.style.display !== 'none';
}

function isSosFlowActive() {
  return ['sos-countdown', 'sos-alerted'].some(id => {
    const element = document.getElementById(id);
    return element && element.style.display !== 'none';
  });
}

function summarizeTranscript(transcript) {
  const text = transcript.trim();
  if (!text) return 'Last heard: waiting...';
  const shortened = text.length > 64 ? `${text.slice(0, 64)}...` : text;
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
  incidentTranscriptTail = transcript.trim() || incidentTranscriptTail;
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

function setIncidentPanelVisibility(visible) {
  const panel = document.getElementById('incidentLivePanel');
  if (!panel) return;
  panel.hidden = !visible;
}

function setIncidentCardState(cardId, tone, title, detail) {
  const card = document.getElementById(cardId);
  if (!card) return;

  const titleElement = document.getElementById(`${cardId.replace('Card', 'Title')}`);
  const detailElement = document.getElementById(`${cardId.replace('Card', 'Detail')}`);
  card.className = `incident-status-card is-${tone}`;
  if (titleElement) titleElement.textContent = title;
  if (detailElement) detailElement.textContent = detail;
}

function setIncidentViewerLink(url) {
  const link = document.getElementById('incidentViewerLink');
  if (!link) return;

  if (!url) {
    link.hidden = true;
    link.removeAttribute('href');
    return;
  }

  link.hidden = false;
  link.href = url;
}

function updateIncidentPreviewPlaceholder(title, detail) {
  const placeholder = document.getElementById('incidentPreviewPlaceholder');
  if (!placeholder) return;

  const titleElement = placeholder.querySelector('.incident-preview-title');
  const detailElement = placeholder.querySelector('.incident-preview-copy');
  if (titleElement) titleElement.textContent = title;
  if (detailElement) detailElement.textContent = detail;
}

function updateIncidentPreviewState() {
  const video = document.getElementById('incidentPreviewVideo');
  const placeholder = document.getElementById('incidentPreviewPlaceholder');
  if (!video || !placeholder) return;

  const hasVisibleStream = Boolean(incidentMediaStream && incidentMediaStream.getVideoTracks().some(track => track.readyState === 'live'));
  video.classList.toggle('is-visible', hasVisibleStream);
  placeholder.classList.toggle('is-hidden', hasVisibleStream);
}

function attachIncidentStream() {
  const video = document.getElementById('incidentPreviewVideo');
  if (!video) return;

  video.srcObject = incidentMediaStream;
  video.muted = true;
  video.playsInline = true;
  video.play().catch(() => {});
  video.onloadedmetadata = () => {
    if (incidentSession) {
      uploadIncidentSnapshot(true);
      startIncidentVideoRecording();
    }
  };
  updateIncidentPreviewState();
}

function stopIncidentSnapshotLoop() {
  clearInterval(incidentSnapshotTimer);
  incidentSnapshotTimer = null;
}

function stopIncidentTranscriptCapture() {
  clearTimeout(incidentTranscriptRestartTimer);
  clearTimeout(incidentTranscriptFlushTimer);
  incidentTranscriptShouldRun = false;
  incidentTranscriptStarting = false;

  if (!incidentTranscriptRecognition) return;

  try {
    incidentTranscriptRecognition.stop();
  } catch (error) {}
}

function stopIncidentMediaCapture() {
  stopIncidentSnapshotLoop();
  stopIncidentTranscriptCapture();
  stopIncidentVideoRecording();

  if (incidentMediaStream) {
    incidentMediaStream.getTracks().forEach(track => track.stop());
    incidentMediaStream = null;
  }

  const video = document.getElementById('incidentPreviewVideo');
  if (video) {
    video.pause();
    video.srcObject = null;
  }

  updateIncidentPreviewPlaceholder('Camera preview stopped', 'Live camera sharing ended on this device.');
  updateIncidentPreviewState();
}

function pushIncidentTranscript(text) {
  const transcript = String(text || '').trim();
  if (!transcript) return;

  const lastEntry = incidentTranscriptHistory[incidentTranscriptHistory.length - 1];
  if (lastEntry && lastEntry.text === transcript) {
    incidentTranscriptTail = transcript;
    return;
  }

  const entry = {
    text: transcript,
    capturedAt: Date.now(),
    source: 'speech'
  };

  incidentTranscriptHistory.push(entry);
  incidentTranscriptQueue.push(entry);
  if (incidentTranscriptHistory.length > INCIDENT_TRANSCRIPT_HISTORY_LIMIT) {
    incidentTranscriptHistory.shift();
  }

  incidentTranscriptTail = transcript;
  setIncidentCardState('incidentTranscriptCard', 'active', 'Transcript is updating', transcript);
  scheduleIncidentTranscriptFlush();
}

function scheduleIncidentTranscriptRestart() {
  clearTimeout(incidentTranscriptRestartTimer);
  if (!incidentTranscriptShouldRun || !isSosFlowActive()) return;

  incidentTranscriptRestartTimer = setTimeout(() => {
    startIncidentTranscriptCapture();
  }, 900);
}

function startIncidentTranscriptCapture() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  incidentTranscriptShouldRun = true;

  if (!SpeechRecognition) {
    incidentTranscriptSupported = false;
    setIncidentCardState(
      'incidentTranscriptCard',
      'warning',
      'Transcript unavailable',
      'This browser does not support live speech recognition, so only camera preview can be shared.'
    );
    return;
  }

  if (!incidentTranscriptRecognition) {
    incidentTranscriptRecognition = new SpeechRecognition();
    incidentTranscriptRecognition.continuous = true;
    incidentTranscriptRecognition.interimResults = true;
    incidentTranscriptRecognition.lang = 'en-IN';

    incidentTranscriptRecognition.onstart = () => {
      incidentTranscriptStarting = false;
      incidentTranscriptRunning = true;
      setIncidentCardState('incidentTranscriptCard', 'active', 'Listening for live transcript', incidentTranscriptTail);
    };

    incidentTranscriptRecognition.onresult = event => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript.trim();
        if (!transcript) continue;

        if (event.results[i].isFinal) {
          pushIncidentTranscript(transcript);
        } else {
          interimText = transcript;
        }
      }

      if (interimText) {
        setIncidentCardState('incidentTranscriptCard', 'active', 'Listening for live transcript', interimText);
      }
    };

    incidentTranscriptRecognition.onerror = event => {
      incidentTranscriptStarting = false;
      incidentTranscriptRunning = false;

      if (!incidentTranscriptShouldRun) return;

      if (event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture') {
        incidentTranscriptShouldRun = false;
        setIncidentCardState(
          'incidentTranscriptCard',
          'error',
          'Transcript permission blocked',
          'Allow microphone access in the browser to share live speech updates.'
        );
        return;
      }

      setIncidentCardState(
        'incidentTranscriptCard',
        'warning',
        'Transcript reconnecting',
        `Speech recognition paused with "${event.error}". SafeHer will try again automatically.`
      );

      if (event.error !== 'aborted') {
        scheduleIncidentTranscriptRestart();
      }
    };

    incidentTranscriptRecognition.onend = () => {
      incidentTranscriptStarting = false;
      incidentTranscriptRunning = false;

      if (!incidentTranscriptShouldRun || !isSosFlowActive()) {
        return;
      }

      setIncidentCardState('incidentTranscriptCard', 'warning', 'Transcript reconnecting', incidentTranscriptTail);
      scheduleIncidentTranscriptRestart();
    };
  }

  incidentTranscriptSupported = true;

  if (incidentTranscriptRunning || incidentTranscriptStarting || !isSosFlowActive()) {
    return;
  }

  try {
    incidentTranscriptStarting = true;
    incidentTranscriptRecognition.start();
  } catch (error) {
    incidentTranscriptStarting = false;
    if (error && error.name === 'InvalidStateError') {
      return;
    }

    setIncidentCardState(
      'incidentTranscriptCard',
      'warning',
      'Transcript unavailable right now',
      'Browser speech recognition could not start. SafeHer will keep trying while the SOS flow is active.'
    );
  }
}

async function flushIncidentTranscriptBatch(force = false) {
  clearTimeout(incidentTranscriptFlushTimer);
  if (!incidentSession || !incidentSession.id || !incidentSession.token || !incidentTranscriptQueue.length) {
    return;
  }

  const pendingEntries = incidentTranscriptQueue.slice(0, force ? incidentTranscriptQueue.length : Math.min(incidentTranscriptQueue.length, 5));
  if (!pendingEntries.length) return;

  try {
    const response = await fetch('/api/sos/transcript', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incidentId: incidentSession.id,
        token: incidentSession.token,
        entries: pendingEntries,
      }),
    });

    if (!response.ok) {
      return;
    }

    incidentTranscriptQueue = incidentTranscriptQueue.slice(pendingEntries.length);
  } catch (error) {}

  if (incidentTranscriptQueue.length) {
    scheduleIncidentTranscriptFlush();
  }
}

function scheduleIncidentTranscriptFlush() {
  clearTimeout(incidentTranscriptFlushTimer);
  if (!incidentSession || !incidentTranscriptQueue.length) {
    return;
  }

  incidentTranscriptFlushTimer = setTimeout(() => {
    flushIncidentTranscriptBatch();
  }, INCIDENT_TRANSCRIPT_FLUSH_DELAY_MS);
}

function captureIncidentSnapshotData() {
  const video = document.getElementById('incidentPreviewVideo');
  if (!video || !video.videoWidth || !video.videoHeight) {
    return '';
  }

  const width = Math.min(SNAPSHOT_CAPTURE_WIDTH, video.videoWidth);
  const height = Math.max(1, Math.round((video.videoHeight / video.videoWidth) * width));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (!context) return '';
  context.drawImage(video, 0, 0, width, height);
  return canvas.toDataURL('image/jpeg', 0.76);
}

async function uploadIncidentSnapshot(force = false) {
  if (!incidentSession || !incidentSession.id || !incidentSession.token || incidentUploadInFlight) {
    return;
  }

  const now = Date.now();
  if (!force && now - incidentLastSnapshotAt < INCIDENT_SNAPSHOT_INTERVAL_MS - 300) {
    return;
  }

  const imageData = captureIncidentSnapshotData();
  if (!imageData) {
    return;
  }

  incidentUploadInFlight = true;
  try {
    const response = await fetch('/api/sos/frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incidentId: incidentSession.id,
        token: incidentSession.token,
        imageData,
      }),
    });

    if (response.ok) {
      incidentLastSnapshotAt = now;
      setIncidentCardState(
        'incidentCaptureCard',
        'success',
        'Live preview is streaming',
        'Fresh snapshots are being sent to the secure incident viewer.'
      );
    }
  } catch (error) {
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Preview upload interrupted',
      error instanceof Error ? error.message : 'SafeHer could not upload the latest snapshot right now.'
    );
  } finally {
    incidentUploadInFlight = false;
  }
}

async function uploadIncidentVideoBlob(blob) {
  if (!blob || !blob.size || !incidentSession || !incidentSession.id || !incidentSession.token || incidentVideoUploadInFlight) {
    return;
  }

  incidentVideoUploadInFlight = true;
  try {
    const videoData = await blobToDataUrl(blob);
    if (!videoData) return;

    const response = await fetch('/api/sos/video', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incidentId: incidentSession.id,
        token: incidentSession.token,
        videoData,
      }),
    });

    if (response.ok) {
      setIncidentCardState(
        'incidentCaptureCard',
        'success',
        'Live preview is streaming',
        'Fresh snapshots and rolling video clips are reaching the secure incident viewer.'
      );
    }
  } catch (error) {
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Video clip upload interrupted',
      error instanceof Error ? error.message : 'SafeHer could not upload the latest video clip right now.'
    );
  } finally {
    incidentVideoUploadInFlight = false;
  }
}

function stopIncidentVideoRecording() {
  if (!incidentVideoRecorder) {
    return;
  }

  try {
    if (incidentVideoRecorder.state !== 'inactive') {
      incidentVideoRecorder.stop();
    }
  } catch (error) {}

  incidentVideoRecorder = null;
}

function startIncidentVideoRecording() {
  if (
    incidentVideoRecorder ||
    !incidentSession ||
    !incidentSession.id ||
    !incidentSession.token ||
    !incidentMediaStream ||
    !window.MediaRecorder
  ) {
    return;
  }

  const hasLiveVideoTrack = incidentMediaStream.getVideoTracks().some(track => track.readyState === 'live');
  if (!hasLiveVideoTrack) {
    return;
  }

  const mimeType = getSupportedIncidentVideoMimeType();
  try {
    incidentVideoRecorder = mimeType
      ? new MediaRecorder(incidentMediaStream, {
          mimeType,
          videoBitsPerSecond: 900000,
          audioBitsPerSecond: 96000,
        })
      : new MediaRecorder(incidentMediaStream);
  } catch (error) {
    incidentVideoRecorder = null;
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Rolling video unavailable',
      'This browser can show the live preview here, but it could not start secure rolling video uploads for contacts.'
    );
    return;
  }

  incidentVideoRecorder.ondataavailable = event => {
    if (event.data && event.data.size > 0) {
      uploadIncidentVideoBlob(event.data);
    }
  };

  incidentVideoRecorder.onerror = () => {
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Rolling video paused',
      'SafeHer will keep sending still snapshots even if the rolling video clip recorder stops.'
    );
  };

  incidentVideoRecorder.onstop = () => {
    incidentVideoRecorder = null;
  };

  try {
    incidentVideoRecorder.start(INCIDENT_VIDEO_CHUNK_MS);
    setIncidentCardState(
      'incidentCaptureCard',
      'success',
      'Live preview ready',
      'Camera, microphone, snapshots, and rolling video clips are preparing for the secure incident viewer.'
    );
  } catch (error) {
    incidentVideoRecorder = null;
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Rolling video unavailable',
      error instanceof Error ? error.message : 'SafeHer could not start rolling video clip uploads on this browser.'
    );
  }
}

function startIncidentSnapshotLoop() {
  if (incidentSnapshotTimer || !incidentSession) return;

  incidentSnapshotTimer = setInterval(() => {
    uploadIncidentSnapshot();
  }, INCIDENT_SNAPSHOT_INTERVAL_MS);
}

async function prepareIncidentMediaCapture() {
  setIncidentPanelVisibility(true);

  if (incidentPreparing) return;
  if (incidentMediaStream) {
    attachIncidentStream();
    setIncidentCardState(
      'incidentCaptureCard',
      'success',
      'Live preview ready',
      'Camera preview is active and ready to upload to the secure incident viewer.'
    );
    startIncidentTranscriptCapture();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    setIncidentCardState(
      'incidentCaptureCard',
      'warning',
      'Camera preview unavailable',
      'This browser does not support camera capture here. Alerts can still be sent through email and Telegram.'
    );
    startIncidentTranscriptCapture();
    return;
  }

  incidentPreparing = true;
  setIncidentCardState(
    'incidentCaptureCard',
    'warning',
    'Requesting camera and microphone',
    'Allow browser permission so SafeHer can start local preview and build the secure viewer.'
  );

  try {
    incidentMediaStream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: SNAPSHOT_CAPTURE_WIDTH },
        height: { ideal: 540 },
      },
      audio: true,
    });
    attachIncidentStream();
    setIncidentCardState(
      'incidentCaptureCard',
      'success',
      'Live preview ready',
      'Camera and microphone are active. SafeHer will begin streaming snapshots after the SOS alert is sent.'
    );
  } catch (primaryError) {
    try {
      incidentMediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: SNAPSHOT_CAPTURE_WIDTH },
          height: { ideal: 540 },
        },
        audio: false,
      });
      attachIncidentStream();
      setIncidentCardState(
        'incidentCaptureCard',
        'warning',
        'Camera ready, microphone blocked',
        'Preview is active, but microphone capture was denied. Transcript updates depend on speech-recognition support.'
      );
    } catch (fallbackError) {
      updateIncidentPreviewPlaceholder(
        'Camera permission required',
        'Allow camera access in the browser so SafeHer can share a live viewer with your contacts.'
      );
      setIncidentCardState(
        'incidentCaptureCard',
        'error',
        'Camera preview blocked',
        fallbackError instanceof Error ? fallbackError.message : 'SafeHer could not access the camera on this device.'
      );
    }
  } finally {
    incidentPreparing = false;
    updateIncidentPreviewState();
    startIncidentTranscriptCapture();
  }
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
  incidentLastTriggerReason = reason || 'SOS Triggered';
  renderSentContacts();
  updateRecipientMeta();

  document.getElementById('sos-idle').style.display = 'none';
  document.getElementById('sos-countdown').style.display = 'block';
  document.getElementById('sos-alerted').style.display = 'none';
  document.getElementById('sos-safe').style.display = 'none';
  document.getElementById('cdLbl').textContent = incidentLastTriggerReason;

  setIncidentPanelVisibility(true);
  setIncidentViewerLink(incidentSession?.viewerUrl || '');
  prepareIncidentMediaCapture();

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
  const automationContacts = getAutomationReadyRecipients();
  if (!automationContacts.length) {
    return {
      ok: false,
      provider: 'no-automation-contacts',
      dispatched: 0,
      message: 'Add at least one saved contact with an email address or Telegram Chat ID to enable automatic live sharing.',
      recipients: [],
    };
  }

  const initialFrameData = captureIncidentSnapshotData();
  const queuedBeforeDispatch = incidentTranscriptQueue.length;
  const initialTranscripts = incidentTranscriptQueue.slice();

  setIncidentCardState(
    'incidentDispatchCard',
    'active',
    'Dispatching alerts',
    'SafeHer is creating the secure incident viewer and sending it to your trusted contacts.'
  );

  try {
    const response = await fetch('/api/sos/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: buildAlertMessage(),
        recipients: automationContacts.map(contact => ({
          contactId: contact.id,
          label: contact.label,
          dialNumber: contact.dialNumber,
          email: contact.email,
          telegramChatId: contact.telegramChatId,
        })),
        meta: {
          userName: getCurrentUserName(),
          location: ALERT_LOCATION,
          vehicle: ALERT_VEHICLE,
          trigger: incidentLastTriggerReason,
          transcriptPreview: incidentTranscriptTail,
          media: {
            hasCameraPreview: Boolean(initialFrameData),
            transcriptSupported: incidentTranscriptSupported,
          },
        },
        initialTranscripts,
        initialFrameData,
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

    if (payload.incident) {
      incidentSession = payload.incident;
      incidentTranscriptQueue = incidentTranscriptQueue.slice(queuedBeforeDispatch);
      setIncidentViewerLink(payload.viewerUrl || payload.incident.viewerUrl || '');
      startIncidentSnapshotLoop();
      startIncidentVideoRecording();
      await flushIncidentTranscriptBatch(true);
      await uploadIncidentSnapshot(true);
    }

    if (payload.ok) {
      setIncidentCardState(
        'incidentDispatchCard',
        'success',
        'Viewer link shared',
        payload.message || 'Trusted contacts received the secure incident viewer.'
      );
    } else {
      setIncidentCardState(
        'incidentDispatchCard',
        payload.provider === 'unconfigured' ? 'warning' : 'error',
        payload.provider === 'unconfigured' ? 'Automation not configured' : 'Alert dispatch failed',
        payload.message || 'SafeHer could not deliver the online alert.'
      );
    }

    return payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not reach the SOS server.';
    setIncidentCardState('incidentDispatchCard', 'error', 'Alert dispatch failed', message);

    return {
      ok: false,
      provider: 'network-error',
      dispatched: 0,
      message,
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

async function finalizeIncidentAsSafe() {
  if (!incidentSession || !incidentSession.id || !incidentSession.token) {
    return null;
  }

  try {
    await flushIncidentTranscriptBatch(true);
    const response = await fetch('/api/sos/finish', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        incidentId: incidentSession.id,
        token: incidentSession.token,
        status: 'safe',
        note: `${getCurrentUserName()} marked herself safe from the SOS page.`,
      }),
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (error) {
      payload = null;
    }
    return payload;
  } catch (error) {
    return null;
  }
}

async function sosSafe() {
  clearInterval(cdInterval);
  const hadDispatch = Boolean(incidentSession);
  const safeResult = await finalizeIncidentAsSafe();

  stopIncidentMediaCapture();
  stopVoiceRecognition();

  ['sos-countdown', 'sos-alerted'].forEach(id => {
    const section = document.getElementById(id);
    if (section) section.style.display = 'none';
  });

  document.getElementById('sos-idle').style.display = 'none';
  document.getElementById('sos-safe').style.display = 'block';

  setIncidentCardState('incidentCaptureCard', 'success', 'Capture stopped', 'Camera preview and transcript capture have stopped on this device.');
  setIncidentCardState('incidentTranscriptCard', 'idle', 'Transcript ended', incidentTranscriptTail);
  setIncidentCardState(
    'incidentDispatchCard',
    safeResult && safeResult.ok ? 'success' : hadDispatch ? 'warning' : 'idle',
    safeResult && safeResult.ok ? 'Safe update sent' : hadDispatch ? 'Safe update pending' : 'Countdown cancelled',
    safeResult?.message ||
      (hadDispatch
        ? 'Contacts were alerted earlier. If the safe update could not be sent, they can still open the viewer link you already shared.'
        : 'No automated alert was sent because the countdown was cancelled before dispatch.')
  );
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stopVoiceRecognition();
    return;
  }

  if (voiceEnabled && isIdleViewActive()) {
    startVoiceRecognition();
  }

  if (incidentTranscriptShouldRun && isSosFlowActive()) {
    startIncidentTranscriptCapture();
  }
});

window.addEventListener('beforeunload', () => {
  stopVoiceRecognition();
  clearInterval(cdInterval);
  clearInterval(holdInterval);
  stopIncidentMediaCapture();
});

document.addEventListener('DOMContentLoaded', () => {
  renderCustomEmergencyNumbers();
  renderSentContacts();
  updateRecipientMeta();
  initVoiceRecognition();
  setIncidentPanelVisibility(false);
  setIncidentViewerLink('');
});
