/* ==========================================
   SAFEHER — Driver Rating JavaScript
   ========================================== */

const RATING_BREAKDOWN = [
  { stars: 5, count: 312, color: '#34c759' },
  { stars: 4, count: 198, color: '#5ac8fa' },
  { stars: 3, count: 44,  color: '#ff9f0a' },
  { stars: 2, count: 12,  color: '#ff7a45' },
  { stars: 1, count: 3,   color: '#ff2d55' },
];

const BEHAVIOR_SCORES = [
  { label: 'Route safety',   score: 4.8 },
  { label: 'Driving manner', score: 4.7 },
  { label: 'Respectful',     score: 4.9 },
  { label: 'No diversion',   score: 4.6 },
  { label: 'Well-lit route', score: 4.5 },
  { label: 'Punctual',       score: 4.4 },
];

const TAG_CLOUD = [
  { tag: 'Safe driver',         count: 312, type: 'g' },
  { tag: 'Respectful',          count: 278, type: 'g' },
  { tag: 'Followed route',      count: 243, type: 'g' },
  { tag: 'No phone use',        count: 198, type: 'g' },
  { tag: 'Good lighting',       count: 167, type: 'g' },
  { tag: 'Comfortable',         count: 145, type: 'g' },
  { tag: 'Police-verified',     count: 118, type: 'b' },
  { tag: 'Punctual',            count: 98,  type: 'b' },
  { tag: 'Drove fast',          count: 34,  type: 'a' },
  { tag: 'Phone while driving', count: 12,  type: 'r' },
];

const REVIEWS = [
  { name: 'Priya S',   av: 'PS', color: 'rgba(255,45,85,0.12)',  tc: '#ff2d55', stars: 5, date: '2 hours ago',  text: 'Excellent driver! Followed GST Road exactly. Very respectful. Felt completely safe throughout the journey.', tags: ['Safe driver','Respectful','Followed route'], safe: true },
  { name: 'Kavitha R', av: 'KR', color: 'rgba(175,82,222,0.12)', tc: '#af52de', stars: 5, date: 'Yesterday',    text: 'Turned on interior light when dark, no phone use at all. Amazing ride! Highly recommend for women.', tags: ['Safe driver','No phone use','Good lighting'], safe: true },
  { name: 'Meena L',   av: 'ML', color: 'rgba(52,199,89,0.12)',  tc: '#34c759', stars: 4, date: '2 days ago',   text: 'Good ride. Slight detour due to traffic but informed me. Still felt safe and comfortable.', tags: ['Comfortable','Punctual'], safe: true },
  { name: 'Lakshmi T', av: 'LT', color: 'rgba(255,159,10,0.12)', tc: '#ff9f0a', stars: 3, date: '1 week ago',   text: 'Decent ride but driving was a bit fast on the highway stretch. Route was correct though.', tags: ['Drove fast'], safe: false },
  { name: 'Divya M',   av: 'DM', color: 'rgba(0,122,255,0.12)',  tc: '#007aff', stars: 5, date: '1 week ago',   text: 'Used SafeHer to verify before boarding. Super professional. My parents tracked me live the whole time.', tags: ['Safe driver','Respectful','Police-verified'], safe: true },
];

const GOOD_TAGS = ['Safe driver','Followed route','Respectful','No phone use','Punctual','Comfortable','Good lighting'];
const BAD_TAGS  = ['Drove fast','Wrong route','Phone while driving','Uncomfortable'];

let activeFilter  = 'all';
let selectedStars = 0;
let pickedTags    = new Set();

/* ── Render rating bars ── */
function renderBars() {
  const max = Math.max(...RATING_BREAKDOWN.map(r => r.count));
  document.getElementById('ratingBars').innerHTML = RATING_BREAKDOWN.map(r => `
    <div class="rating-bar-row">
      <span class="rb-lbl">${r.stars}★</span>
      <div class="rb-track"><div class="rb-fill" style="width:0%;background:${r.color}" data-w="${Math.round(r.count/max*100)}"></div></div>
      <span class="rb-count">${r.count}</span>
    </div>
  `).join('');

  setTimeout(() => {
    document.querySelectorAll('.rb-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 120);
}

/* ── Render behavior ── */
function renderBehavior() {
  document.getElementById('behaviorScores').innerHTML = BEHAVIOR_SCORES.map(b => {
    const col = b.score >= 4.5 ? '#34c759' : b.score >= 3.5 ? '#ff9f0a' : '#ff2d55';
    return `
      <div class="beh-bar-row">
        <span class="beh-lbl">${b.label}</span>
        <div class="beh-track"><div class="beh-fill" style="width:0%;background:${col}" data-w="${Math.round(b.score/5*100)}"></div></div>
        <span class="beh-score" style="color:${col}">${b.score}</span>
      </div>
    `;
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.beh-fill').forEach(el => {
      el.style.width = el.dataset.w + '%';
    });
  }, 140);
}

/* ── Render tag cloud ── */
function renderTagCloud() {
  const clsMap = { g: 'tc-g', r: 'tc-r', a: 'tc-a', b: 'tc-b' };
  document.getElementById('tagCloud').innerHTML = TAG_CLOUD.map(t =>
    `<div class="tc-item ${clsMap[t.type]}">${t.tag}<span class="tc-count">${t.count}</span></div>`
  ).join('');
}

/* ── Render reviews ── */
function renderReviews() {
  let list = REVIEWS;
  if      (activeFilter === 5)      list = REVIEWS.filter(r => r.stars === 5);
  else if (activeFilter === 4)      list = REVIEWS.filter(r => r.stars === 4);
  else if (activeFilter === 3)      list = REVIEWS.filter(r => r.stars === 3);
  else if (activeFilter === 'low')  list = REVIEWS.filter(r => r.stars <= 2);
  else if (activeFilter === 'safe') list = REVIEWS.filter(r => r.safe);

  const warnTags = ['Drove fast', 'Wrong route', 'Phone while driving'];

  document.getElementById('reviewList').innerHTML = list.length
    ? list.map(r => `
        <div class="review-item">
          <div class="rev-top">
            <div class="rev-user">
              <div class="rev-av" style="background:${r.color};color:${r.tc}">${r.av}</div>
              <div><div class="rev-name">${r.name}</div><div class="rev-date">${r.date}</div></div>
            </div>
            <div style="color:var(--gold);font-size:13px">${'★'.repeat(r.stars)}${'☆'.repeat(5-r.stars)}</div>
          </div>
          <div class="rev-text">${r.text}</div>
          <div class="rev-tags">
            ${r.tags.map(t => `<span class="rev-tag ${warnTags.includes(t) ? 'rt-a' : 'rt-g'}">${t}</span>`).join('')}
          </div>
        </div>
      `).join('')
    : '<div style="padding:16px;text-align:center;font-size:12px;color:var(--muted)">No reviews for this filter</div>';
}

function revFilt(f, btn) {
  activeFilter = f;
  document.querySelectorAll('.rev-filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderReviews();
}

/* ── Star picker ── */
const STAR_LABELS = ['', 'Very unsafe', 'Unsafe', 'Okay', 'Safe!', 'Excellent!'];

function pickStar(e) {
  const svg  = document.getElementById('spSvg');
  const rect = svg.getBoundingClientRect();
  const n    = Math.min(5, Math.max(1, Math.ceil((e.clientX - rect.left) / 44)));
  selectedStars = n;
  for (let i = 1; i <= 5; i++) {
    document.getElementById('sp' + i).classList.toggle('lit', i <= n);
  }
  document.getElementById('spLabel').textContent = STAR_LABELS[n];
}

/* ── Tag picker ── */
function buildTagPicker() {
  document.getElementById('tagPicker').innerHTML = [
    ...GOOD_TAGS.map(t => ({ t, k: 'good' })),
    ...BAD_TAGS.map(t  => ({ t, k: 'bad'  })),
  ].map(({ t, k }) =>
    `<div class="tp-tag" data-tag="${t}" data-kind="${k}" onclick="toggleTag(this)">${t}</div>`
  ).join('');
}

function toggleTag(el) {
  const tag  = el.dataset.tag;
  const kind = el.dataset.kind;
  if (pickedTags.has(tag)) {
    pickedTags.delete(tag);
    el.className = 'tp-tag';
  } else {
    pickedTags.add(tag);
    el.className = kind === 'good' ? 'tp-tag sel-good' : 'tp-tag sel-bad';
  }
}

/* ── Submit ── */
function submitReview() {
  if (!selectedStars) {
    /* auto-select 5 stars */
    pickStar({ clientX: document.getElementById('spSvg').getBoundingClientRect().left + 200 });
  }
  document.getElementById('wrForm').style.display    = 'none';
  document.getElementById('wrSuccess').style.display = 'block';
}

function resetReview() {
  selectedStars = 0;
  pickedTags.clear();
  document.getElementById('spLabel').textContent = '';
  for (let i = 1; i <= 5; i++) {
    document.getElementById('sp' + i).classList.remove('lit');
  }
  buildTagPicker();
  document.getElementById('wrSuccess').style.display = 'none';
  document.getElementById('wrForm').style.display    = 'block';
}

/* ── Init ── */
document.addEventListener('DOMContentLoaded', () => {
  renderBars();
  renderBehavior();
  renderTagCloud();
  renderReviews();
  buildTagPicker();
});
