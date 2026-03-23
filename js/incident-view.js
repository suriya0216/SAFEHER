/* ==========================================
   SAFEHER - Incident Viewer JavaScript
   ========================================== */

const VIEW_REFRESH_MS = 4000;
let viewRefreshTimer = null;
let lastRenderedVideoAt = 0;

function getQueryValue(name) {
  return new URLSearchParams(window.location.search).get(name) || '';
}

function formatDateTime(timestamp) {
  if (!timestamp) return 'Waiting for update';

  try {
    return new Date(timestamp * 1000).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch (error) {
    return 'Waiting for update';
  }
}

function updateIncidentHeader(status, freshness) {
  const statusPill = document.getElementById('incidentStatusPill');
  const freshnessPill = document.getElementById('incidentFreshnessPill');
  if (statusPill) {
    statusPill.textContent = status;
    statusPill.className = `incident-pill ${status.toLowerCase().includes('safe') ? 'is-safe' : 'is-live'}`.trim();
  }
  if (freshnessPill) {
    freshnessPill.textContent = freshness;
  }
}

function renderEventList(transcripts) {
  const list = document.getElementById('incidentEventList');
  if (!list) return;

  if (!Array.isArray(transcripts) || !transcripts.length) {
    list.innerHTML = `
      <div class="incident-event">
        <div class="incident-event-time">Waiting</div>
        <div class="incident-event-text">No transcript snippets have been uploaded yet.</div>
      </div>
    `;
    return;
  }

  list.innerHTML = transcripts.map(item => `
    <div class="incident-event">
      <div class="incident-event-time">${formatDateTime(item.capturedAt)}</div>
      <div class="incident-event-text">${String(item.text || '').replace(/[&<>"']/g, char => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
      }[char]))}</div>
    </div>
  `).join('');
}

function renderSnapshot(snapshotUrl) {
  const image = document.getElementById('incidentViewImage');
  const emptyState = document.getElementById('incidentViewEmpty');
  if (!image || !emptyState) return;

  if (!snapshotUrl) {
    image.classList.remove('is-visible');
    image.removeAttribute('src');
    emptyState.classList.remove('is-hidden');
    return;
  }

  image.src = snapshotUrl;
  image.classList.add('is-visible');
  emptyState.classList.add('is-hidden');
}

function renderVideo(videoUrl, updatedAt) {
  const video = document.getElementById('incidentViewVideo');
  const emptyState = document.getElementById('incidentViewVideoEmpty');
  if (!video || !emptyState) return;

  if (!videoUrl) {
    lastRenderedVideoAt = 0;
    video.classList.remove('is-visible');
    video.pause();
    video.removeAttribute('src');
    video.load();
    emptyState.classList.remove('is-hidden');
    return;
  }

  video.classList.add('is-visible');
  emptyState.classList.add('is-hidden');

  if (updatedAt && updatedAt === lastRenderedVideoAt && video.getAttribute('src')) {
    return;
  }

  lastRenderedVideoAt = updatedAt || Math.floor(Date.now() / 1000);
  video.src = videoUrl;
  video.load();
  video.play().catch(() => {});
}

function applyViewPayload(payload) {
  const incident = payload.incident || {};
  const transcripts = Array.isArray(payload.transcripts) ? payload.transcripts : [];

  const personValue = document.getElementById('incidentPersonValue');
  const triggerValue = document.getElementById('incidentTriggerValue');
  const locationValue = document.getElementById('incidentLocationValue');
  const vehicleValue = document.getElementById('incidentVehicleValue');
  const latestTranscript = document.getElementById('incidentLatestTranscript');

  if (personValue) personValue.textContent = incident.userName || 'SafeHer user';
  if (triggerValue) triggerValue.textContent = incident.trigger || 'SOS incident in progress';
  if (locationValue) locationValue.textContent = incident.location || 'Live location not provided';
  if (vehicleValue) vehicleValue.textContent = incident.vehicle ? `Vehicle: ${incident.vehicle}` : 'Vehicle details not provided';
  if (latestTranscript) latestTranscript.textContent = incident.latestTranscript || 'Waiting for voice updates...';

  const videoUpdatedAt = Number(incident.videoUpdatedAt || 0);
  const snapshotUpdatedAt = Number(incident.snapshotUpdatedAt || 0);

  renderVideo(payload.videoUrl || '', videoUpdatedAt);
  renderSnapshot(payload.snapshotUrl || '');
  renderEventList(transcripts);

  const freshness = videoUpdatedAt >= snapshotUpdatedAt && videoUpdatedAt
    ? `Last clip ${formatDateTime(videoUpdatedAt)}`
    : snapshotUpdatedAt
      ? `Last frame ${formatDateTime(snapshotUpdatedAt)}`
      : 'No media yet';
  updateIncidentHeader(
    incident.status === 'safe' ? 'Marked Safe' : 'Live Incident',
    freshness
  );
}

async function fetchIncidentView() {
  const incidentId = getQueryValue('incident');
  const token = getQueryValue('token');

  if (!incidentId || !token) {
    updateIncidentHeader('Invalid Link', 'Missing incident token');
    return;
  }

  try {
    const response = await fetch(`/api/sos/view?incident=${encodeURIComponent(incidentId)}&token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      updateIncidentHeader('Viewer Locked', `Server returned ${response.status}`);
      return;
    }

    const payload = await response.json();
    applyViewPayload(payload);
  } catch (error) {
    updateIncidentHeader('Viewer Offline', error instanceof Error ? error.message : 'Could not load incident updates.');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  fetchIncidentView();
  viewRefreshTimer = setInterval(fetchIncidentView, VIEW_REFRESH_MS);
});

window.addEventListener('beforeunload', () => {
  clearInterval(viewRefreshTimer);
});
