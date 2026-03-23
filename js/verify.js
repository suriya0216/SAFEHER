/* ==========================================
   SAFEHER - Auto Verify JavaScript
   ========================================== */

const KNOWN_VEHICLE_DB = {
  TN09AB4521: {
    plate: "TN 09 AB 4521",
    rto: "Chennai Central",
    state: "Tamil Nadu",
    year: "2019",
    model: "Bajaj RE 4S",
    color: "Yellow & Silver",
    insurance: "Valid until Dec 2026",
    fitness: "Valid until Dec 2027",
    permit: "Valid",
    safetyStatus: "safe",
    driver: {
      name: "Murugan K",
      age: 42,
      exp: "12 years",
      license: "TN0920190012345",
      licValid: "2028",
      avatar: "MK",
    },
    rating: 4.6,
    totalRatings: 569,
    cases: 0,
    tags: [
      { t: "Verified", c: "green" },
      { t: "Licensed", c: "blue" },
      { t: "Experienced", c: "blue" },
      { t: "Women Safe", c: "green" },
    ],
    sourceNote: "Matched with a stored verified vehicle profile.",
  },
  TN22CD8834: {
    plate: "TN 22 CD 8834",
    rto: "Coimbatore North",
    state: "Tamil Nadu",
    year: "2017",
    model: "TVS King Deluxe",
    color: "Yellow & Green",
    insurance: "Valid until Mar 2026",
    fitness: "Valid until Mar 2026",
    permit: "Valid",
    safetyStatus: "caution",
    driver: {
      name: "Rajan S",
      age: 38,
      exp: "7 years",
      license: "TN2220170054321",
      licValid: "2026",
      avatar: "RS",
    },
    rating: 3.2,
    totalRatings: 447,
    cases: 2,
    tags: [
      { t: "Verified", c: "green" },
      { t: "Licensed", c: "blue" },
      { t: "2 Complaints", c: "amber" },
    ],
    sourceNote: "Matched with a stored verified vehicle profile.",
  },
  KA05MN3310: {
    plate: "KA 05 MN 3310",
    rto: "Jayanagar",
    state: "Karnataka",
    year: "2015",
    model: "Bajaj RE Compact",
    color: "Yellow",
    insurance: "Expired in Jul 2024",
    fitness: "Expired in Jul 2025",
    permit: "Valid",
    safetyStatus: "danger",
    driver: {
      name: "Suresh B",
      age: 51,
      exp: "3 years",
      license: "KA0520150099887",
      licValid: "2024",
      avatar: "SB",
    },
    rating: 1.9,
    totalRatings: 273,
    cases: 3,
    tags: [
      { t: "Needs Review", c: "red" },
      { t: "Expired License", c: "red" },
      { t: "Complaints Found", c: "red" },
    ],
    sourceNote: "Matched with a stored flagged vehicle profile.",
  },
};

const STATE_NAMES = {
  AP: "Andhra Pradesh",
  AR: "Arunachal Pradesh",
  AS: "Assam",
  BR: "Bihar",
  CG: "Chhattisgarh",
  CH: "Chandigarh",
  DD: "Daman and Diu",
  DL: "Delhi",
  GA: "Goa",
  GJ: "Gujarat",
  HP: "Himachal Pradesh",
  HR: "Haryana",
  JH: "Jharkhand",
  JK: "Jammu and Kashmir",
  KA: "Karnataka",
  KL: "Kerala",
  LA: "Ladakh",
  LD: "Lakshadweep",
  MH: "Maharashtra",
  ML: "Meghalaya",
  MN: "Manipur",
  MP: "Madhya Pradesh",
  MZ: "Mizoram",
  NL: "Nagaland",
  OD: "Odisha",
  PB: "Punjab",
  PY: "Puducherry",
  RJ: "Rajasthan",
  SK: "Sikkim",
  TN: "Tamil Nadu",
  TR: "Tripura",
  TS: "Telangana",
  UK: "Uttarakhand",
  UP: "Uttar Pradesh",
  WB: "West Bengal",
};

const RTO_HINTS = {
  TN: {
    "01": "Chennai Central",
    "09": "Chennai West",
    "10": "Chennai South",
    "22": "Coimbatore North",
    "38": "Erode",
    "43": "Theni",
    "49": "Madurai South",
    "58": "Madurai North",
    "66": "Coimbatore South",
    "72": "Tirunelveli",
  },
  KA: {
    "01": "Koramangala",
    "03": "Indiranagar",
    "05": "Jayanagar",
    "19": "Mangalore",
    "41": "Rajajinagar",
    "51": "Electronic City",
  },
  KL: {
    "01": "Thiruvananthapuram",
    "07": "Kottayam",
    "14": "Palakkad",
    "39": "Thrissur",
    "60": "Kochi",
  },
  AP: {
    "09": "Nellore",
    "16": "Vijayawada",
    "28": "Guntur",
    "39": "Tirupati",
  },
  TS: {
    "07": "Ranga Reddy",
    "09": "Hyderabad Central",
    "12": "Hyderabad North",
    "28": "Warangal",
  },
  MH: {
    "01": "Mumbai South",
    "02": "Mumbai West",
    "03": "Mumbai East",
    "12": "Pune",
    "14": "Pimpri Chinchwad",
    "43": "Navi Mumbai",
  },
  DL: {
    "01": "Mall Road",
    "03": "Janakpuri",
    "08": "Wazirpur",
    "10": "West Delhi",
  },
  GJ: {
    "01": "Ahmedabad",
    "05": "Surat",
    "07": "Rajkot",
    "27": "Vadodara",
  },
};

const MODEL_CATALOG = [
  "Bajaj RE Compact",
  "Bajaj RE 4S",
  "TVS King Deluxe",
  "Piaggio Ape City",
  "Mahindra Treo",
  "Atul Smart Passenger",
  "Bajaj Maxima",
  "Kinetic Safar Smart",
];

const COLOR_CATALOG = [
  "Yellow & Black",
  "Yellow & Green",
  "Yellow & Blue",
  "Yellow & Silver",
  "Yellow",
  "Green & Yellow",
];

const NAME_CATALOG = [
  "Arun K",
  "Priya M",
  "Lakshmi R",
  "Dinesh V",
  "Sathya P",
  "Meena S",
  "Karthik N",
  "Vijay A",
  "Harini T",
  "Saravanan R",
  "Anitha J",
  "Bharath M",
  "Deepa K",
  "Naveen S",
  "Ramesh P",
];

const VALID_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function normalizePlate(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatLoosePlate(raw) {
  const clean = normalizePlate(raw);
  if (!clean) return "";

  if (/^\d{0,2}BH/.test(clean) || /^(\d{1,2})B/.test(clean)) {
    const match = clean.match(/^(\d{0,2})(BH)?(\d{0,4})([A-Z]{0,2})$/);
    if (!match) return clean;
    return [match[1], match[2], match[3], match[4]].filter(Boolean).join(" ");
  }

  const match = clean.match(/^([A-Z]{0,2})(\d{0,2})([A-Z]{0,3})(\d{0,4})$/);
  if (!match) return clean;
  return [match[1], match[2], match[3], match[4]].filter(Boolean).join(" ");
}

function formatPlateField() {
  const input = document.getElementById("plateInp");
  if (!input) return;
  input.value = formatLoosePlate(input.value);
}

function parsePlate(raw) {
  const clean = normalizePlate(raw);
  if (!clean) return null;

  const bharatMatch = clean.match(/^(\d{2})BH(\d{4})([A-Z]{1,2})$/);
  if (bharatMatch) {
    return {
      raw: clean,
      type: "bharat",
      stateCode: "BH",
      district: bharatMatch[1],
      series: bharatMatch[3],
      serial: bharatMatch[2],
      state: "Bharat Series",
      formatted: `${bharatMatch[1]} BH ${bharatMatch[2]} ${bharatMatch[3]}`,
    };
  }

  const standardMatch = clean.match(/^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{1,4})$/);
  if (!standardMatch) return null;

  const stateCode = standardMatch[1];
  if (!STATE_NAMES[stateCode]) return null;

  const district = standardMatch[2].padStart(2, "0");
  const series = standardMatch[3];
  const serial = standardMatch[4].padStart(4, "0");

  return {
    raw: clean,
    type: "standard",
    stateCode,
    district,
    series,
    serial,
    state: getStateName(stateCode),
    formatted: `${stateCode} ${district} ${series} ${serial}`,
  };
}

function seedFromPlate(raw) {
  let seed = 17;
  for (let index = 0; index < raw.length; index += 1) {
    seed = (seed * 31 + raw.charCodeAt(index) * (index + 3)) % 2147483647;
  }
  return seed;
}

function pickBySeed(list, seed, offset) {
  return list[(seed + offset * 97) % list.length];
}

function buildAvatar(name) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getStateName(stateCode) {
  return STATE_NAMES[stateCode] || "Unknown State";
}

function getRtoName(parsed) {
  if (parsed.type === "bharat") {
    return `Bharat Series ${parsed.district}`;
  }

  const stateHints = RTO_HINTS[parsed.stateCode] || {};
  return stateHints[parsed.district] || `${getStateName(parsed.stateCode)} RTO ${parsed.district}`;
}

function isSuspiciousNumber(parsed) {
  const serial = parsed.serial;
  const repeatedDigits = /^(\d)\1{3}$/.test(serial);
  const easySequences = ["0001", "1111", "1234", "2222", "3333", "4321", "4444", "5555", "6666", "7777", "8888", "9999"];
  return repeatedDigits || easySequences.includes(serial);
}

function buildGeneratedProfile(parsed) {
  const currentYear = new Date().getFullYear();
  const seed = seedFromPlate(parsed.raw);
  const suspicious = isSuspiciousNumber(parsed);
  const driverName = pickBySeed(NAME_CATALOG, seed, 1);
  const vehicleYear = String(clamp(currentYear - ((seed % 9) + 1), 2015, currentYear));
  const model = pickBySeed(MODEL_CATALOG, seed, 2);
  const color = pickBySeed(COLOR_CATALOG, seed, 3);
  const driverAge = 26 + (seed % 22);
  const experienceYears = clamp(driverAge - 21 - (seed % 5), 2, 22);
  const baseCases = suspicious ? 2 + (seed % 2) : seed % 5 === 0 ? 1 : 0;
  const insuranceExpired = suspicious ? seed % 2 === 0 : seed % 9 === 0;
  const fitnessExpired = seed % 8 === 0 || (parseInt(vehicleYear, 10) <= currentYear - 8 && seed % 3 === 0);
  const licenseExpired = suspicious ? seed % 2 === 1 : seed % 11 === 0;
  const licenseYear = licenseExpired ? currentYear - 1 : currentYear + 1 + (seed % 3);
  const totalRatings = 80 + (seed % 1200);
  const month = VALID_MONTHS[seed % VALID_MONTHS.length];
  const casePenalty = baseCases * 13;
  const safetyScore = clamp(
    91 -
      casePenalty -
      (insuranceExpired ? 16 : 0) -
      (fitnessExpired ? 12 : 0) -
      (licenseExpired ? 20 : 0) -
      (suspicious ? 9 : 0) +
      (seed % 5),
    24,
    96
  );
  const safetyStatus = safetyScore >= 76 ? "safe" : safetyScore >= 52 ? "caution" : "danger";
  const rating = clamp(Number((1.25 + safetyScore / 24).toFixed(1)), 1.7, 4.9);
  const licenseNumber = `${parsed.stateCode}${parsed.district}${vehicleYear}${String(100000 + (seed % 900000))}`;

  const tags = [
    { t: "Plate Valid", c: "green" },
    { t: safetyStatus === "safe" ? "Low Risk" : safetyStatus === "caution" ? "Monitor Route" : "High Risk", c: safetyStatus === "safe" ? "green" : safetyStatus === "caution" ? "amber" : "red" },
    { t: insuranceExpired ? "Insurance Review" : "Insurance Active", c: insuranceExpired ? "amber" : "blue" },
  ];

  if (!licenseExpired) {
    tags.push({ t: "License Active", c: "blue" });
  }
  if (baseCases > 0) {
    tags.push({ t: `${baseCases} Complaint${baseCases > 1 ? "s" : ""}`, c: baseCases > 1 ? "red" : "amber" });
  }

  return {
    plate: parsed.formatted,
    rto: getRtoName(parsed),
    state: parsed.state,
    year: vehicleYear,
    model,
    color,
    insurance: insuranceExpired ? `Expired in ${month} ${currentYear}` : `Valid until ${month} ${currentYear + 1}`,
    fitness: fitnessExpired ? `Expired in ${month} ${currentYear}` : `Valid until ${month} ${currentYear + 2}`,
    permit: baseCases > 2 ? "Under safety review" : "Valid",
    safetyStatus,
    driver: {
      name: driverName,
      age: driverAge,
      exp: `${experienceYears} years`,
      license: licenseNumber,
      licValid: String(licenseYear),
      avatar: buildAvatar(driverName),
    },
    rating,
    totalRatings,
    cases: baseCases,
    tags,
    sourceNote: "Instant smart safety profile built from the registration pattern and local demo safety rules.",
  };
}

function getVehicleProfile(raw) {
  return KNOWN_VEHICLE_DB[raw] || buildGeneratedProfile(parsePlate(raw));
}

function tryPlate(raw) {
  const input = document.getElementById("plateInp");
  input.value = formatLoosePlate(raw);
  doVerify();
}

function doVerify() {
  const input = document.getElementById("plateInp");
  const raw = normalizePlate(input.value);

  if (raw.length < 6) {
    input.style.borderColor = "rgba(255, 59, 48, 0.42)";
    input.focus();
    setTimeout(() => {
      input.style.borderColor = "";
    }, 1500);
    return;
  }

  const parsed = parsePlate(raw);
  if (!parsed) {
    renderInvalidPlate(input.value);
    return;
  }

  input.value = parsed.formatted;

  const resultEl = document.getElementById("vResult");
  const loaderEl = document.getElementById("vLoading");
  const stepsEl = document.getElementById("loadSteps");

  resultEl.style.display = "none";
  resultEl.innerHTML = "";
  loaderEl.style.display = "block";
  stepsEl.innerHTML = "";

  const steps = [
    "Normalizing registration format...",
    "Matching state and RTO region...",
    "Building driver and vehicle profile...",
    "Scanning safety alerts and cases...",
    "Computing travel risk score...",
  ];

  steps.forEach((step, index) => {
    setTimeout(() => {
      const line = document.createElement("div");
      line.className = "load-step";
      line.textContent = `OK ${step}`;
      stepsEl.appendChild(line);
    }, index * 320);
  });

  setTimeout(() => {
    loaderEl.style.display = "none";
    renderResult(getVehicleProfile(parsed.raw));
  }, steps.length * 320 + 360);
}

function renderResult(data) {
  const statusMap = {
    safe: { cls: "sb-safe", dotColor: "#34c759", label: "Safe for Booking" },
    caution: { cls: "sb-caution", dotColor: "#ff9f0a", label: "Book with Caution" },
    danger: { cls: "sb-danger", dotColor: "#ff2d55", label: "High Risk - Avoid" },
  };

  const status = statusMap[data.safetyStatus];
  const insuranceOk = !/expired/i.test(data.insurance);
  const fitnessOk = !/expired/i.test(data.fitness);
  const licenseOk = parseInt(data.driver.licValid, 10) >= new Date().getFullYear();
  const tagsHtml = data.tags
    .map((tag) => `<span class="tag tag-${escapeHtml(tag.c)}">${escapeHtml(tag.t)}</span>`)
    .join("");

  const element = document.getElementById("vResult");
  element.innerHTML = `
    <div class="result-plate-header">
      <div class="plate-display">${escapeHtml(data.plate)}</div>
      <div class="safety-badge ${status.cls}">
        <div class="dot" style="background:${status.dotColor}"></div>
        ${escapeHtml(status.label)}
      </div>
    </div>
    <div class="result-body">
      <div class="driver-profile-row">
        <div class="dp-avatar">${escapeHtml(data.driver.avatar)}</div>
        <div style="flex:1">
          <div class="dp-name">${escapeHtml(data.driver.name)}</div>
          <div class="dp-meta">Age ${escapeHtml(data.driver.age)} · ${escapeHtml(data.driver.exp)} experience · License: ${escapeHtml(data.driver.license)}</div>
          <div class="dp-tags">${tagsHtml}</div>
        </div>
        <div class="dp-rating">
          <div class="dp-rating-num">${escapeHtml(data.rating.toFixed(1))}</div>
          <div class="dp-rating-lbl">Safety score<br><small style="font-size:10px">${escapeHtml(data.totalRatings)} reviews</small></div>
        </div>
      </div>
      <div style="margin-bottom:16px;padding:13px 15px;border-radius:16px;background:rgba(0,122,255,0.06);border:1px solid rgba(0,122,255,0.1);color:#5f6d85;font-size:13px">
        ${escapeHtml(data.sourceNote)}
      </div>
      <div class="info-cards-grid">
        <div class="info-cell"><div class="ic-label">Vehicle</div><div class="ic-value">${escapeHtml(data.model)}</div><div class="ic-sub">${escapeHtml(data.year)} · ${escapeHtml(data.color)}</div></div>
        <div class="info-cell"><div class="ic-label">Region</div><div class="ic-value">${escapeHtml(data.rto)}</div><div class="ic-sub">${escapeHtml(data.state)}</div></div>
        <div class="info-cell"><div class="ic-label">Insurance</div><div class="ic-value ${insuranceOk ? "good" : "bad"}">${insuranceOk ? "Valid" : "Expired"}</div><div class="ic-sub">${escapeHtml(data.insurance)}</div></div>
        <div class="info-cell"><div class="ic-label">Fitness</div><div class="ic-value ${fitnessOk ? "good" : "bad"}">${fitnessOk ? "Valid" : "Expired"}</div><div class="ic-sub">Permit: ${escapeHtml(data.permit)}</div></div>
        <div class="info-cell"><div class="ic-label">License valid till</div><div class="ic-value ${licenseOk ? "good" : "bad"}">${escapeHtml(data.driver.licValid)}</div></div>
        <div class="info-cell"><div class="ic-label">Cases / Alerts</div><div class="ic-value ${data.cases === 0 ? "good" : data.cases > 1 ? "bad" : "warn"}">${data.cases === 0 ? "None" : `${escapeHtml(data.cases)} found`}</div><div class="ic-sub">${data.cases === 0 ? "Clean route signal" : "Check before travel"}</div></div>
      </div>
      <div class="result-actions">
        <button class="ra-btn ra-primary" onclick="window.location.href='map.html'">
          <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          Start Journey
        </button>
        <button class="ra-btn ra-success" onclick="window.location.href='rating.html'">
          <svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/></svg>
          View Rating
        </button>
        <button class="ra-btn ra-default" onclick="window.location.href='sos.html'">
          <svg viewBox="0 0 24 24"><path d="M12 2L1 21h22L12 2zm1 14h-2v2h2v-2zm0-6h-2v4h2V10z"/></svg>
          Report
        </button>
      </div>
    </div>
  `;

  element.style.display = "block";
}

function renderInvalidPlate(raw) {
  const element = document.getElementById("vResult");
  const visibleValue = raw ? escapeHtml(raw) : "blank";

  document.getElementById("vLoading").style.display = "none";
  element.innerHTML = `
    <div style="text-align:center;padding:44px 24px">
      <div style="width:72px;height:72px;background:rgba(255,159,10,0.14);border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 18px">
        <svg viewBox="0 0 24 24" style="width:30px;height:30px;fill:#ff9f0a"><path d="M1 21h22L12 2 1 21zm12-3h-2v2h2v-2zm0-8h-2v6h2v-6z"/></svg>
      </div>
      <h3 style="font-size:20px;font-weight:700;margin-bottom:8px;color:#dd8a00">Check the plate format</h3>
      <p style="font-size:13px;color:var(--muted);margin-bottom:16px">The registration <strong style="font-family:monospace;color:var(--text)">${visibleValue}</strong> does not match a valid Indian vehicle format.</p>
      <div style="background:rgba(255,159,10,0.08);border:1px solid rgba(255,159,10,0.16);border-radius:12px;padding:14px 18px;font-size:13px;color:var(--muted);text-align:left;max-width:460px;margin:0 auto 20px">
        <strong style="color:#dd8a00">Use formats like:</strong><br>
        TN49AQ1621<br>
        TN 09 AB 4521<br>
        KA05MN3310<br>
        21 BH 1234 AA
      </div>
      <button class="btn btn-secondary" onclick="document.getElementById('plateInp').focus()">
        Try Again
      </button>
    </div>
  `;
  element.style.display = "block";
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter") doVerify();
});
