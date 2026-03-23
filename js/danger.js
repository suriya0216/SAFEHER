/* ==========================================
   SAFEHER — Danger Zone JavaScript
   ========================================== */

const SCENARIOS = {
  1: {
    bg: 'linear-gradient(135deg,#ff8fa3,#ff5f7f)',
    borderColor: 'rgba(255,45,85,0.28)',
    icon: 'M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2V10z',
    title: 'Danger Zone Entered!',
    sub: 'Your auto has entered a high-risk area',
    loc: 'Near Pallavaram Flyover, Chennai',
    facts: [
      { num: '7',    lbl: 'Incidents reported', col: 'var(--red2)' },
      { num: 'Poor', lbl: 'Street lighting',    col: 'var(--gold)' },
      { num: 'No',   lbl: 'CCTV coverage',      col: 'var(--gold)' },
    ],
    showCountdown: true,
  },
  2: {
    bg: 'linear-gradient(135deg,#ffd77a,#ffb340)',
    borderColor: 'rgba(255,159,10,0.28)',
    icon: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z',
    title: 'Auto Stopped Too Long',
    sub: 'Vehicle stationary in a danger zone for 14+ minutes',
    loc: 'Pallavaram-Thoraipakkam Rd, Chennai',
    facts: [
      { num: '14m',  lbl: 'Stopped duration', col: 'var(--gold)' },
      { num: 'Yes',  lbl: 'Danger zone',      col: 'var(--red2)' },
      { num: '3',    lbl: 'Contacts alerted', col: 'var(--blue)' },
    ],
    showCountdown: false,
  },
  3: {
    bg: 'linear-gradient(135deg,#8fdcff,#4db7ff)',
    borderColor: 'rgba(0,122,255,0.28)',
    icon: 'M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z',
    title: 'Route Deviation Detected',
    sub: 'Auto has left the planned safe route',
    loc: 'Deviated near Chromepet, 2.3 km off course',
    facts: [
      { num: '2.3km', lbl: 'Off route',          col: 'var(--blue)' },
      { num: '2',     lbl: 'Danger zones ahead', col: 'var(--red2)' },
      { num: '5',     lbl: 'Contacts watching',  col: 'var(--green)' },
    ],
    showCountdown: false,
  },
  4: {
    bg: 'linear-gradient(135deg,#ff9aa8,#ff3f66)',
    borderColor: 'rgba(255,45,85,0.36)',
    icon: 'M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm-1 14l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z',
    title: 'Auto-SOS Activated!',
    sub: 'No response received — all contacts and police alerted',
    loc: 'Pallavaram, Chennai — 13.0067°N, 80.1534°E',
    facts: [
      { num: '5',    lbl: 'Contacts alerted',  col: 'var(--green)' },
      { num: '1',    lbl: 'Police notified',   col: 'var(--blue)' },
      { num: 'Live', lbl: 'Location shared',   col: 'var(--green)' },
    ],
    showCountdown: false,
  },
};

let dzTimer = null;
let dzSecs  = 30;

function dzShow(n, btn) {
  // Update active pill
  document.querySelectorAll('.sc-pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');

  document.getElementById('dzSafeMsg').style.display = 'none';
  clearInterval(dzTimer);

  const sc = SCENARIOS[n];

  const factsHtml = sc.facts.map(f =>
    `<div class="dz-fact"><div class="dz-fact-num" style="color:${f.col}">${f.num}</div><div class="dz-fact-lbl">${f.lbl}</div></div>`
  ).join('');

  let actionHtml = '';
  if (sc.showCountdown) {
    dzSecs = 30;
    actionHtml = `
      <div class="dz-cd-box">
        <div class="dz-cd-q">Are you safe right now?</div>
        <div class="dz-cd-hint">No response in <span id="dzSecSpan" style="color:var(--red2);font-weight:700">30</span>s → Auto SOS sent to all contacts</div>
        <div class="dz-cd-ring">
          <svg viewBox="0 0 76 76">
            <circle class="dzcr-bg" cx="38" cy="38" r="33"/>
            <circle class="dzcr-fill" cx="38" cy="38" r="33" id="dzFill"/>
          </svg>
          <div class="dz-cd-inner"><div class="dz-cd-sec" id="dzSecNum">30</div><div class="dz-cd-unit">sec</div></div>
        </div>
        <div class="dz-action-row">
          <button class="dz-unsafe" onclick="dzShowScenario4()">Not Safe — SOS Now</button>
          <button class="dz-safe"   onclick="dzMarkSafe()">I am Safe</button>
        </div>
      </div>
    `;
    // Start countdown
    dzTimer = setInterval(() => {
      dzSecs--;
      const numEl  = document.getElementById('dzSecNum');
      const spanEl = document.getElementById('dzSecSpan');
      const fill   = document.getElementById('dzFill');
      if (numEl)  numEl.textContent  = dzSecs;
      if (spanEl) spanEl.textContent = dzSecs;
      if (fill)   fill.style.strokeDashoffset = 207 * ((30 - dzSecs) / 30);
      if (dzSecs <= 0) { clearInterval(dzTimer); dzShowScenario4(); }
    }, 1000);
  } else {
    actionHtml = `
      <div class="dz-action-row" style="margin-top:14px">
        <button class="dz-unsafe" onclick="dzShowScenario4()">Need Help — SOS Now</button>
        <button class="dz-safe"   onclick="dzMarkSafe()">I am OK</button>
      </div>
    `;
  }

  document.getElementById('dz-content').innerHTML = `
    <div class="warn-card" style="border-color:${sc.borderColor}">
      <div class="warn-header" style="background:${sc.bg}">
        <div class="warn-header-pulse"></div>
        <div class="wh-row">
          <div class="wh-icon">
            <svg viewBox="0 0 24 24"><path d="${sc.icon}"/></svg>
          </div>
          <div>
            <div class="wh-title">${sc.title}</div>
            <div class="wh-sub">${sc.sub}</div>
          </div>
        </div>
        <div class="wh-loc">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          ${sc.loc}
        </div>
      </div>
      <div class="warn-body">
        <div class="dz-facts">${factsHtml}</div>
        ${actionHtml}
        <div class="auto-sos-note">
          <div class="asn-icon"><svg viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></div>
          <div class="asn-text">
            <strong>Auto-SOS is armed</strong>
            If you don't respond, all 5 contacts and nearest police are alerted automatically with your live location and auto registration details.
          </div>
        </div>
      </div>
    </div>
  `;
}

function dzShowScenario4() {
  clearInterval(dzTimer);
  dzShow(4, document.getElementById('dsp4'));
}

function dzMarkSafe() {
  clearInterval(dzTimer);
  document.getElementById('dz-content').innerHTML = '';
  document.getElementById('dzSafeMsg').style.display = 'block';
}

function dzHideSafe() {
  document.getElementById('dzSafeMsg').style.display = 'none';
  dzShow(1, document.getElementById('dsp1'));
}

// Init on page load
document.addEventListener('DOMContentLoaded', () => {
  dzShow(1, document.getElementById('dsp1'));
});
