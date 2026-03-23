/* ==========================================
   SAFEHER - Driver Rating JavaScript
   ========================================== */

const LAST_VERIFIED_PROFILE_KEY = 'safeher_last_verified_profile';
const GOOD_TAGS = ['Safe driver', 'Followed route', 'Respectful', 'No phone use', 'Punctual', 'Comfortable', 'Good lighting'];
const BAD_TAGS = ['Drove fast', 'Wrong route', 'Phone while driving', 'Uncomfortable'];
const REVIEWER_PROFILES = [
  { name: 'Priya S', av: 'PS', color: 'rgba(255,45,85,0.12)', tc: '#ff2d55' },
  { name: 'Kavitha R', av: 'KR', color: 'rgba(175,82,222,0.12)', tc: '#af52de' },
  { name: 'Meena L', av: 'ML', color: 'rgba(52,199,89,0.12)', tc: '#34c759' },
  { name: 'Lakshmi T', av: 'LT', color: 'rgba(255,159,10,0.12)', tc: '#ff9f0a' },
  { name: 'Divya M', av: 'DM', color: 'rgba(0,122,255,0.12)', tc: '#007aff' },
  { name: 'Nivetha A', av: 'NA', color: 'rgba(90,200,250,0.12)', tc: '#5ac8fa' },
  { name: 'Anitha J', av: 'AJ', color: 'rgba(88,86,214,0.12)', tc: '#5856d6' },
];
const REVIEW_DATES = ['2 hours ago', 'Yesterday', '2 days ago', '4 days ago', '1 week ago', '2 weeks ago'];
const STAR_LABELS = ['', 'Very unsafe', 'Unsafe', 'Okay', 'Safe!', 'Excellent!'];
const DEFAULT_PROFILE = {
  plate: 'TN 09 AB 4521',
  rto: 'Chennai Central',
  state: 'Tamil Nadu',
  year: '2019',
  model: 'Bajaj RE 4S',
  color: 'Yellow & Silver',
  insurance: 'Valid until Dec 2026',
  fitness: 'Valid until Dec 2027',
  permit: 'Valid',
  safetyStatus: 'safe',
  driver: {
    name: 'Murugan K',
    age: 42,
    exp: '12 years',
    license: 'TN0920190012345',
    licValid: '2028',
    avatar: 'MK',
  },
  rating: 4.6,
  totalRatings: 569,
  cases: 0,
  tags: [
    { t: 'Verified', c: 'green' },
    { t: 'Licensed', c: 'blue' },
    { t: 'Experienced', c: 'blue' },
    { t: 'Women Safe', c: 'green' },
  ],
  sourceNote: 'Matched with a stored verified vehicle profile.',
};

let activeFilter = 'all';
let selectedStars = 0;
let pickedTags = new Set();
let activeProfile = null;
let ratingBreakdown = [];
let behaviorScores = [];
let tagCloud = [];
let reviewList = [];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function seedFromText(value) {
  const text = String(value || '');
  let seed = 19;
  for (let index = 0; index < text.length; index += 1) {
    seed = (seed * 33 + text.charCodeAt(index) * (index + 7)) % 2147483647;
  }
  return seed || 19;
}

function pickBySeed(list, seed, offset) {
  return list[(seed + offset * 97) % list.length];
}

function getCurrentUserName() {
  try {
    const user = JSON.parse(localStorage.getItem('safeher_user') || '{}');
    return String(user.name || '').trim() || 'SafeHer User';
  } catch (error) {
    return 'SafeHer User';
  }
}

function getStoredProfile() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LAST_VERIFIED_PROFILE_KEY) || '{}');
    if (!parsed || typeof parsed !== 'object' || !parsed.driver || !parsed.plate) {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function persistProfile(profile) {
  try {
    localStorage.setItem(LAST_VERIFIED_PROFILE_KEY, JSON.stringify({
      ...profile,
      savedAt: Date.now(),
    }));
  } catch (error) {}
}

function getActiveProfile() {
  const stored = getStoredProfile();
  return stored || DEFAULT_PROFILE;
}

function buildStarString(rating) {
  const full = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return `${'&#9733;'.repeat(full)}${'&#9734;'.repeat(5 - full)}`;
}

function formatNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number.toLocaleString('en-IN') : '0';
}

function formatCompact(value) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('en-IN', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(number);
}

function mapTagColor(tagColor) {
  switch (tagColor) {
    case 'green':
      return 'tag-green';
    case 'blue':
      return 'tag-blue';
    case 'amber':
      return 'tag-amber';
    case 'red':
      return 'tag-red';
    default:
      return 'tag-blue';
  }
}

function mapCloudType(tagColor) {
  switch (tagColor) {
    case 'green':
      return 'g';
    case 'blue':
      return 'b';
    case 'amber':
      return 'a';
    case 'red':
      return 'r';
    default:
      return 'b';
  }
}

function allocateCounts(total, ratios) {
  const rawCounts = ratios.map(ratio => ratio * total);
  const counts = rawCounts.map(value => Math.floor(value));
  let remainder = total - counts.reduce((sum, value) => sum + value, 0);

  while (remainder > 0) {
    let bestIndex = 0;
    let bestFraction = -1;
    for (let index = 0; index < rawCounts.length; index += 1) {
      const fraction = rawCounts[index] - counts[index];
      if (fraction > bestFraction) {
        bestFraction = fraction;
        bestIndex = index;
      }
    }
    counts[bestIndex] += 1;
    remainder -= 1;
  }

  return counts;
}

function getStatusPalette(profile) {
  if (profile.safetyStatus === 'danger') {
    return {
      accent: '#ff2d55',
      safeRate: 68,
      womenSafety: 2.4,
      ratios: [0.09, 0.13, 0.19, 0.26, 0.33],
    };
  }
  if (profile.safetyStatus === 'caution') {
    return {
      accent: '#ff9f0a',
      safeRate: 84,
      womenSafety: 3.6,
      ratios: [0.25, 0.31, 0.22, 0.14, 0.08],
    };
  }
  return {
    accent: '#34c759',
    safeRate: 97,
    womenSafety: 4.8,
    ratios: [0.55, 0.28, 0.11, 0.04, 0.02],
  };
}

function buildHeroStats(profile) {
  const totalRatingsCount = Math.max(40, Number(profile.totalRatings) || 0);
  const cases = Number(profile.cases) || 0;
  const palette = getStatusPalette(profile);
  const rides = totalRatingsCount * 2 + 120 + seedFromText(profile.plate) % 900;
  const safeRate = clamp(palette.safeRate - cases * 4, 52, 99);
  const womenSafety = clamp(Number((palette.womenSafety - cases * 0.15 + (Number(profile.rating) - 4) * 0.4).toFixed(1)), 1.8, 4.9);

  return [
    { value: formatNumber(rides), label: 'Total rides', color: 'var(--green)' },
    { value: `${safeRate}%`, label: 'Safe journeys', color: 'var(--gold)' },
    { value: formatNumber(cases), label: 'FIRs / cases', color: cases === 0 ? 'var(--green)' : 'var(--red2)' },
    { value: womenSafety.toFixed(1), label: 'Women safety', color: 'var(--blue)' },
  ];
}

function buildRatingBreakdown(profile) {
  const total = Math.max(24, Number(profile.totalRatings) || 0);
  const counts = allocateCounts(total, getStatusPalette(profile).ratios);
  return [
    { stars: 5, count: counts[0], color: '#34c759' },
    { stars: 4, count: counts[1], color: '#5ac8fa' },
    { stars: 3, count: counts[2], color: '#ff9f0a' },
    { stars: 2, count: counts[3], color: '#ff7a45' },
    { stars: 1, count: counts[4], color: '#ff2d55' },
  ];
}

function buildBehaviorScores(profile) {
  const rating = clamp(Number(profile.rating) || 3.8, 1.7, 4.9);
  const cases = Number(profile.cases) || 0;
  const insuranceExpired = /expired/i.test(String(profile.insurance || ''));
  const fitnessExpired = /expired/i.test(String(profile.fitness || ''));

  return [
    { label: 'Route safety', score: Number(clamp(rating + (cases === 0 ? 0.3 : -0.2 * cases), 1.8, 4.9).toFixed(1)) },
    { label: 'Driving manner', score: Number(clamp(rating - cases * 0.15 - (fitnessExpired ? 0.2 : 0), 1.7, 4.9).toFixed(1)) },
    { label: 'Respectful', score: Number(clamp(rating + (profile.safetyStatus === 'safe' ? 0.2 : profile.safetyStatus === 'danger' ? -0.5 : -0.1), 1.8, 4.9).toFixed(1)) },
    { label: 'No diversion', score: Number(clamp(rating + (cases === 0 ? 0.1 : -0.25 * cases), 1.7, 4.9).toFixed(1)) },
    { label: 'Well-lit route', score: Number(clamp(rating + (insuranceExpired ? -0.2 : 0.1), 1.7, 4.9).toFixed(1)) },
    { label: 'Punctual', score: Number(clamp(rating - (profile.safetyStatus === 'caution' ? 0.2 : profile.safetyStatus === 'danger' ? 0.4 : 0), 1.7, 4.9).toFixed(1)) },
  ];
}

function buildTagCloud(profile) {
  const total = Math.max(60, Number(profile.totalRatings) || 0);
  const profileTags = Array.isArray(profile.tags) ? profile.tags : [];
  const items = [];

  profileTags.forEach((tag, index) => {
    const tagName = String(tag.t || '').trim();
    if (!tagName) return;
    items.push({
      tag: tagName,
      count: Math.max(12, Math.round(total * (0.62 - index * 0.08))),
      type: mapCloudType(tag.c),
    });
  });

  if (profile.safetyStatus === 'safe') {
    items.push({ tag: 'Safe driver', count: Math.round(total * 0.55), type: 'g' });
    items.push({ tag: 'Followed route', count: Math.round(total * 0.46), type: 'g' });
    items.push({ tag: 'Comfortable', count: Math.round(total * 0.31), type: 'g' });
  } else if (profile.safetyStatus === 'caution') {
    items.push({ tag: 'Book with caution', count: Math.round(total * 0.38), type: 'a' });
    items.push({ tag: 'Mixed reviews', count: Math.round(total * 0.29), type: 'a' });
    items.push({ tag: 'Route watch', count: Math.round(total * 0.22), type: 'a' });
  } else {
    items.push({ tag: 'Needs review', count: Math.round(total * 0.34), type: 'r' });
    items.push({ tag: 'High risk', count: Math.round(total * 0.28), type: 'r' });
    items.push({ tag: 'Avoid solo ride', count: Math.round(total * 0.19), type: 'r' });
  }

  if ((Number(profile.cases) || 0) > 0) {
    items.push({
      tag: `${profile.cases} complaint${profile.cases > 1 ? 's' : ''}`,
      count: Math.round(total * 0.17),
      type: profile.cases > 1 ? 'r' : 'a',
    });
  } else {
    items.push({ tag: 'No FIRs', count: Math.round(total * 0.21), type: 'g' });
  }

  const seen = new Set();
  return items.filter(item => {
    const key = item.tag.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 10);
}

function getReviewStars(profile) {
  if (profile.safetyStatus === 'danger') return [2, 1, 2, 3, 1];
  if (profile.safetyStatus === 'caution') return [4, 3, 4, 3, 2];
  if ((Number(profile.rating) || 0) >= 4.7) return [5, 5, 5, 4, 5];
  return [5, 5, 4, 5, 4];
}

function buildReviewText(profile, stars, index) {
  const driverFirst = String(profile.driver?.name || 'Driver').split(/\s+/)[0];
  const plate = profile.plate || 'this auto';
  const rto = profile.rto || profile.state || 'the local route';
  const model = profile.model || 'vehicle';
  const cases = Number(profile.cases) || 0;

  if (profile.safetyStatus === 'danger') {
    const dangerTexts = [
      `SafeHer showed warning signs for ${plate}, and the ride felt stressful. I would avoid this vehicle if possible.`,
      `${driverFirst} did not inspire confidence during this trip. I stayed on a call because the situation felt unsafe.`,
      `The plate details matched, but I was uncomfortable for parts of the ride around ${rto}.`,
      `This ${model} needs closer monitoring. I would not recommend it for solo travel at night.`,
      `Too many risk signals were already visible for ${plate}, and my experience was not reassuring.`,
    ];
    return dangerTexts[index % dangerTexts.length];
  }

  if (profile.safetyStatus === 'caution') {
    const cautionTexts = [
      `Verification worked for ${plate}, but I still stayed alert because this profile already had some caution markers.`,
      `The ride with ${driverFirst} was okay overall, though I would still share live tracking for this auto.`,
      `Plate ${plate} matched in SafeHer. No major issue, but the experience felt mixed in a few stretches.`,
      `I reached safely around ${rto}, yet I would book this one only with caution after dark.`,
      cases > 0
        ? `There were ${cases} earlier complaint${cases > 1 ? 's' : ''} in the profile, so I stayed careful during the trip.`
        : `The ride was acceptable, but not smooth enough for me to call it fully comfortable.`,
    ];
    return cautionTexts[index % cautionTexts.length];
  }

  const safeTexts = [
    `Verified ${plate} before boarding. ${driverFirst} stayed on the expected route near ${rto} and was respectful throughout.`,
    `Driver ${driverFirst} handled the ${model} smoothly. The ride felt safe and the route updates matched SafeHer.`,
    `Plate ${plate} matched instantly. The vehicle was clean and I reached without any route diversion.`,
    `I shared this trip with family after checking ${plate}. ${driverFirst} was punctual and communicated well.`,
    `Comfortable ride around ${rto}. SafeHer verification showed the same details and that gave me confidence.`,
  ];
  return safeTexts[index % safeTexts.length];
}

function buildReviewTags(profile, stars, index) {
  if (stars >= 5) {
    return ['Safe driver', 'Respectful', index % 2 === 0 ? 'Followed route' : 'Punctual'];
  }
  if (stars === 4) {
    return ['Comfortable', 'Followed route'];
  }
  if (stars === 3) {
    return ['Book with caution', 'Route watch'];
  }
  if (profile.safetyStatus === 'danger') {
    return ['High risk', 'Uncomfortable'];
  }
  return ['Drove fast', 'Book with caution'];
}

function buildReviews(profile) {
  const starsList = getReviewStars(profile);
  const seed = seedFromText(profile.plate);
  return starsList.map((stars, index) => {
    const reviewer = pickBySeed(REVIEWER_PROFILES, seed, index);
    return {
      ...reviewer,
      stars,
      date: REVIEW_DATES[index % REVIEW_DATES.length],
      text: buildReviewText(profile, stars, index),
      tags: buildReviewTags(profile, stars, index),
      safe: stars >= 4,
    };
  });
}

function applyProfileHeader(profile) {
  const heroTags = Array.isArray(profile.tags) ? profile.tags : [];
  const heroStats = buildHeroStats(profile);
  const meta = `Auto ${profile.plate} · ${profile.driver.exp} experience · ${profile.rto}`;

  const avatar = document.getElementById('driverHeroAvatar');
  const name = document.getElementById('driverHeroName');
  const metaEl = document.getElementById('driverHeroMeta');
  const tagsEl = document.getElementById('driverHeroTags');
  const scoreEl = document.getElementById('driverHeroScore');
  const starsEl = document.getElementById('driverHeroStars');
  const countEl = document.getElementById('driverHeroCount');
  const statsEl = document.getElementById('driverHeroStats');
  const totalEl = document.getElementById('communityReviewTotal');
  const writeTitle = document.getElementById('writeReviewTitle');
  const journeyTitle = document.getElementById('journeyTitle');
  const journeyMeta = document.getElementById('journeyMeta');
  const successReviewCount = document.getElementById('successReviewCount');
  const successRatingValue = document.getElementById('successRatingValue');
  const successHelpedCount = document.getElementById('successHelpedCount');

  if (avatar) avatar.textContent = profile.driver.avatar || 'SH';
  if (name) name.textContent = profile.driver.name || 'SafeHer Driver';
  if (metaEl) metaEl.textContent = meta;
  if (tagsEl) {
    tagsEl.innerHTML = heroTags.map(tag => `<span class="tag ${mapTagColor(tag.c)}">${escapeHtml(tag.t)}</span>`).join('');
  }
  if (scoreEl) scoreEl.textContent = Number(profile.rating || 0).toFixed(1);
  if (starsEl) starsEl.innerHTML = buildStarString(profile.rating);
  if (countEl) countEl.textContent = `${formatNumber(profile.totalRatings)} ratings`;
  if (statsEl) {
    statsEl.innerHTML = heroStats.map(item => `
      <div class="dhcs-cell">
        <div class="dhcs-val" style="color:${item.color}">${escapeHtml(item.value)}</div>
        <div class="dhcs-lbl">${escapeHtml(item.label)}</div>
      </div>
    `).join('');
  }
  if (totalEl) totalEl.textContent = `${formatNumber(profile.totalRatings)} total`;
  if (writeTitle) writeTitle.textContent = `Rate your ride with ${profile.driver.name}`;
  if (journeyTitle) journeyTitle.textContent = `${profile.rto} route · Verified recently`;
  if (journeyMeta) journeyMeta.textContent = `Auto ${profile.plate} · ${profile.model} · ${profile.state}`;
  if (successReviewCount) successReviewCount.textContent = formatNumber((Number(profile.totalRatings) || 0) + 1);
  if (successRatingValue) successRatingValue.textContent = Number(profile.rating || 0).toFixed(1);
  if (successHelpedCount) successHelpedCount.textContent = formatCompact((Number(profile.totalRatings) || 0) * 4 + 120);
}

function renderBars() {
  const max = Math.max(...ratingBreakdown.map(r => r.count), 1);
  document.getElementById('ratingBars').innerHTML = ratingBreakdown.map(r => `
    <div class="rating-bar-row">
      <span class="rb-lbl">${r.stars}&#9733;</span>
      <div class="rb-track"><div class="rb-fill" style="width:0%;background:${r.color}" data-w="${Math.round(r.count / max * 100)}"></div></div>
      <span class="rb-count">${formatNumber(r.count)}</span>
    </div>
  `).join('');

  setTimeout(() => {
    document.querySelectorAll('.rb-fill').forEach(el => {
      el.style.width = `${el.dataset.w}%`;
    });
  }, 120);
}

function renderBehavior() {
  document.getElementById('behaviorScores').innerHTML = behaviorScores.map(item => {
    const color = item.score >= 4.5 ? '#34c759' : item.score >= 3.5 ? '#ff9f0a' : '#ff2d55';
    return `
      <div class="beh-bar-row">
        <span class="beh-lbl">${escapeHtml(item.label)}</span>
        <div class="beh-track"><div class="beh-fill" style="width:0%;background:${color}" data-w="${Math.round(item.score / 5 * 100)}"></div></div>
        <span class="beh-score" style="color:${color}">${item.score.toFixed(1)}</span>
      </div>
    `;
  }).join('');

  setTimeout(() => {
    document.querySelectorAll('.beh-fill').forEach(el => {
      el.style.width = `${el.dataset.w}%`;
    });
  }, 140);
}

function renderTagCloud() {
  const clsMap = { g: 'tc-g', r: 'tc-r', a: 'tc-a', b: 'tc-b' };
  document.getElementById('tagCloud').innerHTML = tagCloud.map(item =>
    `<div class="tc-item ${clsMap[item.type] || 'tc-b'}">${escapeHtml(item.tag)}<span class="tc-count">${formatNumber(item.count)}</span></div>`
  ).join('');
}

function renderReviews() {
  let list = reviewList.slice();
  if (activeFilter === 5) list = reviewList.filter(review => review.stars === 5);
  else if (activeFilter === 4) list = reviewList.filter(review => review.stars === 4);
  else if (activeFilter === 3) list = reviewList.filter(review => review.stars === 3);
  else if (activeFilter === 'low') list = reviewList.filter(review => review.stars <= 2);
  else if (activeFilter === 'safe') list = reviewList.filter(review => review.safe);

  const warnTags = ['Drove fast', 'Wrong route', 'Phone while driving', 'High risk', 'Uncomfortable', 'Book with caution', 'Route watch', 'Needs review'];
  document.getElementById('reviewList').innerHTML = list.length ? list.map(review => `
    <div class="review-item">
      <div class="rev-top">
        <div class="rev-user">
          <div class="rev-av" style="background:${review.color};color:${review.tc}">${escapeHtml(review.av)}</div>
          <div><div class="rev-name">${escapeHtml(review.name)}</div><div class="rev-date">${escapeHtml(review.date)}</div></div>
        </div>
        <div style="color:var(--gold);font-size:13px">${'&#9733;'.repeat(review.stars)}${'&#9734;'.repeat(5 - review.stars)}</div>
      </div>
      <div class="rev-text">${escapeHtml(review.text)}</div>
      <div class="rev-tags">
        ${review.tags.map(tag => `<span class="rev-tag ${warnTags.includes(tag) ? 'rt-a' : 'rt-g'}">${escapeHtml(tag)}</span>`).join('')}
      </div>
    </div>
  `).join('') : '<div style="padding:16px;text-align:center;font-size:12px;color:var(--muted)">No reviews for this filter</div>';
}

function revFilt(filter, button) {
  activeFilter = filter;
  document.querySelectorAll('.rev-filter-btn').forEach(item => item.classList.remove('active'));
  button.classList.add('active');
  renderReviews();
}

function pickStar(event) {
  const svg = document.getElementById('spSvg');
  const rect = svg.getBoundingClientRect();
  const stars = Math.min(5, Math.max(1, Math.ceil((event.clientX - rect.left) / 44)));
  selectedStars = stars;
  for (let index = 1; index <= 5; index += 1) {
    document.getElementById(`sp${index}`).classList.toggle('lit', index <= stars);
  }
  document.getElementById('spLabel').textContent = STAR_LABELS[stars];
}

function buildTagPicker() {
  document.getElementById('tagPicker').innerHTML = [
    ...GOOD_TAGS.map(tag => ({ tag, kind: 'good' })),
    ...BAD_TAGS.map(tag => ({ tag, kind: 'bad' })),
  ].map(item =>
    `<div class="tp-tag" data-tag="${escapeHtml(item.tag)}" data-kind="${item.kind}" onclick="toggleTag(this)">${escapeHtml(item.tag)}</div>`
  ).join('');
}

function toggleTag(element) {
  const tag = element.dataset.tag;
  const kind = element.dataset.kind;
  if (pickedTags.has(tag)) {
    pickedTags.delete(tag);
    element.className = 'tp-tag';
    return;
  }

  pickedTags.add(tag);
  element.className = kind === 'good' ? 'tp-tag sel-good' : 'tp-tag sel-bad';
}

function submitReview() {
  if (!selectedStars) {
    pickStar({
      clientX: document.getElementById('spSvg').getBoundingClientRect().left + 200,
    });
  }

  const textarea = document.querySelector('.wr-textarea');
  const text = String(textarea?.value || '').trim() || `Shared a ${selectedStars >= 4 ? 'positive' : 'careful'} ride update for ${activeProfile.driver.name}.`;
  const tags = Array.from(pickedTags);
  const review = {
    name: getCurrentUserName(),
    av: getCurrentUserName().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0].toUpperCase()).join('') || 'SU',
    color: 'rgba(0,122,255,0.12)',
    tc: '#007aff',
    stars: selectedStars,
    date: 'Just now',
    text,
    tags: tags.length ? tags.slice(0, 3) : [selectedStars >= 4 ? 'Safe driver' : 'Book with caution'],
    safe: selectedStars >= 4,
  };

  reviewList.unshift(review);
  activeProfile.totalRatings = (Number(activeProfile.totalRatings) || 0) + 1;
  activeProfile.rating = Number((((Number(activeProfile.rating) || 0) * (activeProfile.totalRatings - 1) + selectedStars) / activeProfile.totalRatings).toFixed(1));
  persistProfile(activeProfile);

  applyProfileHeader(activeProfile);
  ratingBreakdown = buildRatingBreakdown(activeProfile);
  renderBars();
  renderReviews();

  document.getElementById('wrForm').style.display = 'none';
  document.getElementById('wrSuccess').style.display = 'block';
}

function resetReview() {
  selectedStars = 0;
  pickedTags.clear();
  document.getElementById('spLabel').textContent = '';
  for (let index = 1; index <= 5; index += 1) {
    document.getElementById(`sp${index}`).classList.remove('lit');
  }
  const textarea = document.querySelector('.wr-textarea');
  if (textarea) textarea.value = '';
  buildTagPicker();
  document.getElementById('wrSuccess').style.display = 'none';
  document.getElementById('wrForm').style.display = 'block';
}

function initializeRatingPage() {
  activeProfile = getActiveProfile();
  ratingBreakdown = buildRatingBreakdown(activeProfile);
  behaviorScores = buildBehaviorScores(activeProfile);
  tagCloud = buildTagCloud(activeProfile);
  reviewList = buildReviews(activeProfile);

  applyProfileHeader(activeProfile);
  renderBars();
  renderBehavior();
  renderTagCloud();
  renderReviews();
  buildTagPicker();
}

document.addEventListener('DOMContentLoaded', initializeRatingPage);
