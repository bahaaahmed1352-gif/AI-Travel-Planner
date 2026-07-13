/* ==========================================================================
   VOYA — app.js
   All application logic: mock data, trip generation, map, itinerary,
   budgeting, eSIM store, PDF export, and localStorage persistence.
   ========================================================================== */

/* ---------- MOCK DATA -------------------------------------------------- */
// Each destination has a coordinate (for the map) and a pool of activities
// per trip "type". The planner cycles through this pool to build N days.
const DESTINATIONS = {
  dubai: {
    label: "Dubai",
    coords: [25.2048, 55.2708],
    pool: {
      relax:     ["Sunrise at Jumeirah Beach", "Spa afternoon at a beach resort", "Sunset dhow cruise on the Marina"],
      adventure: ["Desert dune-bashing safari", "Skydive over Palm Jumeirah", "Zipline at Dubai Marina (XLine)"],
      culture:   ["Al Fahidi historic district walk", "Dubai Museum & Al Seef", "Gold & Spice Souk crawl"],
      luxury:    ["Burj Khalifa 'At the Top' Sky", "Private yacht along the Marina", "Dinner at a Michelin-recognised restaurant"]
    }
  },
  abudhabi: {
    label: "Abu Dhabi",
    coords: [24.4539, 54.3773],
    pool: {
      relax:     ["Corniche Beach morning", "Emirates Palace afternoon tea", "Saadiyat Island sunset"],
      adventure: ["Jebel Hafeet mountain drive", "Yas Island go-karting", "Mangrove kayaking tour"],
      culture:   ["Sheikh Zayed Grand Mosque tour", "Louvre Abu Dhabi visit", "Qasr Al Watan palace"],
      luxury:    ["Ferrari World VIP experience", "Private falconry demonstration", "Fine dining at the Corniche"]
    }
  },
  rak: {
    label: "Ras Al Khaimah",
    coords: [25.7895, 55.9432],
    pool: {
      relax:     ["Al Marjan Island beach day", "Hot air balloon at sunrise", "Waterfront café afternoon"],
      adventure: ["Jais Sky Tour zipline (world's longest)", "Via Ferrata on Jebel Jais", "Dune buggy desert tour"],
      culture:   ["Dhayah Fort exploration", "National Museum of RAK", "Old Town heritage walk"],
      luxury:    ["Private mountain-view chalet stay", "Helicopter tour over Jebel Jais", "Al Wadi Desert resort dinner"]
    }
  }
};

// Base budget split (percentages) — used as the starting distribution
// before any eSIM purchases are added on top.
const BASE_BUDGET_SPLIT = {
  Hotels: 0.35,
  Flights: 0.20,
  Activities: 0.20,
  Food: 0.15,
  eSIM: 0.10
};

const ESIM_PACKAGES = [
  { id: "esim-1", data: "1GB", days: 7,  price: 9  },
  { id: "esim-2", data: "3GB", days: 15, price: 19 },
  { id: "esim-3", data: "5GB", days: 30, price: 29 }
];

const USD_TO_AED = 3.673;

/* ---------- STATE -------------------------------------------------------
   Persisted to localStorage so a refresh doesn't lose the user's plan. */
let state = loadState() || {
  trip: null,        // { destination, days, budget, tripType }
  itinerary: null,   // [{ day, items:[{time,title,desc}] }]
  budgetExtra: 0,     // extra USD added by eSIM purchases
  purchasedEsims: []  // ids of purchased packages
};

function loadState(){
  try{
    const raw = localStorage.getItem("voya-state");
    return raw ? JSON.parse(raw) : null;
  }catch(e){ return null; }
}
function saveState(){
  try{ localStorage.setItem("voya-state", JSON.stringify(state)); }catch(e){ /* ignore quota errors */ }
}

/* ---------- DOM SHORTCUTS ------------------------------------------------ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ==========================================================================
   NAVIGATION (mobile menu)
   ========================================================================== */
$("#navToggle").addEventListener("click", () => {
  $("#mainNav").classList.toggle("open");
});
$$(".main-nav a").forEach(a => a.addEventListener("click", () => $("#mainNav").classList.remove("open")));
$("#navCta").addEventListener("click", () => document.querySelector("#planner").scrollIntoView({behavior:"smooth"}));
$("#heroCta").addEventListener("click", () => document.querySelector("#planner").scrollIntoView({behavior:"smooth"}));

/* ==========================================================================
   TRIP PLANNER
   ========================================================================== */
let map = null;          // Leaflet map instance
let mapMarkers = [];      // current markers, cleared/redrawn on each generate

$("#plannerForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const destination = $("#destination").value;
  const days = Math.min(7, Math.max(1, parseInt($("#days").value, 10) || 3));
  const budget = Math.max(200, parseInt($("#budget").value, 10) || 1500);
  const tripType = $("#tripType").value;

  generateTrip({ destination, days, budget, tripType });
});

// Simulates an AI "generate" step: shows a skeleton loading state, then
// builds the itinerary from mock data and renders every dependent section.
function generateTrip(trip){
  const empty = $("#previewEmpty");
  const skeleton = $("#skeletonWrap");
  const result = $("#previewResult");
  const btn = $("#generateBtn");

  empty.hidden = true;
  result.hidden = true;
  skeleton.hidden = false;
  btn.disabled = true;
  btn.textContent = "Generating…";

  setTimeout(() => {
    const itinerary = buildItinerary(trip);

    state.trip = trip;
    state.itinerary = itinerary;
    saveState();

    renderPreview(trip, itinerary);
    renderMap(trip, itinerary);
    renderDayTabs(itinerary);
    renderBudget();

    skeleton.hidden = true;
    result.hidden = false;
    btn.disabled = false;
    btn.textContent = "Generate itinerary";
  }, 900); // simulated processing delay
}

// Cycles through the destination's activity pool to fill `days` days,
// spacing each day across morning / afternoon / evening slots.
function buildItinerary(trip){
  const dest = DESTINATIONS[trip.destination];
  const pool = dest.pool[trip.tripType];
  const slots = ["9:00 AM", "2:00 PM", "7:00 PM"];
  const days = [];

  for(let d = 1; d <= trip.days; d++){
    const items = slots.map((time, i) => {
      const activity = pool[(d - 1 + i) % pool.length];
      return {
        time,
        title: activity,
        desc: `Part of your ${trip.tripType} day ${d} in ${dest.label}. Recommended duration: 2–3 hours.`
      };
    });
    days.push({ day: d, items });
  }
  return days;
}

function renderPreview(trip, itinerary){
  const dest = DESTINATIONS[trip.destination];
  const result = $("#previewResult");
  result.innerHTML = `
    <h3>${dest.label} · ${trip.days}-day ${trip.tripType} trip</h3>
    <div class="summary-row"><span>Destination</span><span class="summary-tag">${dest.label}</span></div>
    <div class="summary-row"><span>Duration</span><span class="summary-tag">${trip.days} day${trip.days>1?"s":""}</span></div>
    <div class="summary-row"><span>Budget</span><span class="summary-tag">$${trip.budget.toLocaleString()}</span></div>
    <div class="summary-row"><span>Activities planned</span><span class="summary-tag">${itinerary.reduce((n,d)=>n+d.items.length,0)}</span></div>
  `;
}

/* ==========================================================================
   INTERACTIVE MAP (Leaflet)
   ========================================================================== */
function renderMap(trip, itinerary){
  const dest = DESTINATIONS[trip.destination];

  if(!map){
    map = L.map("map", { scrollWheelZoom:false }).setView(dest.coords, 11);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 18
    }).addTo(map);
  } else {
    map.setView(dest.coords, 11);
  }

  // Clear old markers before drawing new ones
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  // Spread markers slightly around the destination centre so each day
  // gets a visibly distinct pin (mock geography, not real activity coords).
  itinerary.forEach((dayObj, i) => {
    const offset = 0.02 * (i + 1);
    const lat = dest.coords[0] + (i % 2 === 0 ? offset : -offset);
    const lng = dest.coords[1] + (i % 2 === 0 ? -offset : offset);
    const marker = L.marker([lat, lng]).addTo(map);
    marker.bindPopup(`<strong>Day ${dayObj.day}</strong><br>${dayObj.items[0].title}`);
    mapMarkers.push(marker);
  });

  setTimeout(() => map.invalidateSize(), 200);
}

/* ==========================================================================
   DAY TABS + TIMELINE
   ========================================================================== */
function renderDayTabs(itinerary){
  const tabsWrap = $("#dayTabs");
  tabsWrap.innerHTML = "";
  itinerary.forEach((dayObj, i) => {
    const btn = document.createElement("button");
    btn.className = "day-tab" + (i === 0 ? " active" : "");
    btn.textContent = `Day ${dayObj.day}`;
    btn.addEventListener("click", () => {
      $$(".day-tab").forEach(t => t.classList.remove("active"));
      btn.classList.add("active");
      renderTimeline(dayObj);
    });
    tabsWrap.appendChild(btn);
  });
  renderTimeline(itinerary[0]);
}

function renderTimeline(dayObj){
  const timeline = $("#timeline");
  timeline.innerHTML = "";
  dayObj.items.forEach(item => {
    const row = document.createElement("div");
    row.className = "timeline-item";
    row.innerHTML = `
      <div class="timeline-time">${item.time}</div>
      <div class="timeline-card">
        <h4>${item.title}</h4>
        <p>${item.desc}</p>
        <button class="btn btn-ghost btn-details">View details</button>
      </div>
    `;
    row.querySelector(".btn-details").addEventListener("click", () => openModal(item));
    timeline.appendChild(row);
  });
}

/* ==========================================================================
   MODAL
   ========================================================================== */
function openModal(item){
  $("#modalBody").innerHTML = `
    <h3>${item.title}</h3>
    <p><strong>Time:</strong> ${item.time}</p>
    <p>${item.desc}</p>
    <p style="color:rgba(16,32,46,0.55); font-size:0.85rem;">Tip: book activities the day before to lock in availability.</p>
  `;
  $("#modalBackdrop").hidden = false;
}
$("#modalClose").addEventListener("click", () => $("#modalBackdrop").hidden = true);
$("#modalBackdrop").addEventListener("click", (e) => {
  if(e.target.id === "modalBackdrop") $("#modalBackdrop").hidden = true;
});

/* ==========================================================================
   SMART BUDGETING
   ========================================================================== */
// Recomputes the budget table from state.trip.budget + any eSIM purchases,
// then re-renders both currency columns.
function renderBudget(){
  if(!state.trip) return;
  const body = $("#budgetBody");
  body.innerHTML = "";

  const totalUSD = state.trip.budget + state.budgetExtra;

  Object.entries(BASE_BUDGET_SPLIT).forEach(([category, pct]) => {
    let amountUSD = state.trip.budget * pct;
    // eSIM purchases add directly on top of the eSIM line
    if(category === "eSIM") amountUSD += state.budgetExtra;
    const sharePct = Math.round((amountUSD / totalUSD) * 100);
    const amountAED = amountUSD * USD_TO_AED;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${category}</td>
      <td><span class="share-bar"><span style="width:${sharePct}%"></span></span>${sharePct}%</td>
      <td class="num-col">$${amountUSD.toFixed(0)}</td>
      <td class="num-col">AED ${amountAED.toFixed(0)}</td>
    `;
    body.appendChild(tr);
  });

  $("#totalUSD").textContent = `$${totalUSD.toFixed(0)}`;
  $("#totalAED").textContent = `AED ${(totalUSD * USD_TO_AED).toFixed(0)}`;
}

/* ---------- Currency converter (USD ⇄ AED, live on input) --------------- */
const convUSD = $("#convUSD");
const convAED = $("#convAED");
convUSD.addEventListener("input", () => {
  convAED.value = (parseFloat(convUSD.value || 0) * USD_TO_AED).toFixed(2);
});
convAED.addEventListener("input", () => {
  convUSD.value = (parseFloat(convAED.value || 0) / USD_TO_AED).toFixed(2);
});

/* ==========================================================================
   ESIM STORE
   ========================================================================== */
function renderEsimStore(){
  const grid = $("#esimGrid");
  grid.innerHTML = "";
  ESIM_PACKAGES.forEach(pkg => {
    const owned = state.purchasedEsims.includes(pkg.id);
    const card = document.createElement("div");
    card.className = "esim-card";
    card.innerHTML = `
      <span class="esim-data">${pkg.data}</span>
      <span class="esim-days">${pkg.days} days · UAE-wide coverage</span>
      <span class="esim-price">$${pkg.price}</span>
      <button class="btn ${owned ? "btn-ghost" : "btn-primary"} btn-full buy-btn" ${owned ? "disabled" : ""}>
        ${owned ? "Purchased" : "Buy package"}
      </button>
    `;
    card.querySelector(".buy-btn").addEventListener("click", () => purchaseEsim(pkg));
    grid.appendChild(card);
  });
}

// Simulates a payment: brief "processing" delay, then marks the package as
// owned, adds its cost to the budget, saves state, and shows a toast.
function purchaseEsim(pkg){
  const btn = event.target;
  btn.disabled = true;
  btn.textContent = "Processing…";

  setTimeout(() => {
    state.purchasedEsims.push(pkg.id);
    state.budgetExtra += pkg.price;
    saveState();

    renderEsimStore();
    renderBudget();
    showToast(`✓ ${pkg.data} eSIM purchased — $${pkg.price} added to your budget`);
  }, 700);
}

/* ==========================================================================
   TOAST
   ========================================================================== */
let toastTimer = null;
function showToast(message){
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  requestAnimationFrame(() => toast.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.hidden = true, 250);
  }, 3200);
}

/* ==========================================================================
   PDF EXPORT (html2pdf.js)
   Builds a simplified "boarding pass" style summary and exports it,
   rather than the live page (which has interactive-only elements).
   ========================================================================== */
$("#exportBtn").addEventListener("click", () => {
  if(!state.trip || !state.itinerary){
    showToast("Generate a trip first, then export it");
    return;
  }
  const dest = DESTINATIONS[state.trip.destination];
  const pdfRoot = $("#pdfRoot");

  const daysHtml = state.itinerary.map(d => `
    <h4 style="margin:18px 0 8px;">Day ${d.day}</h4>
    ${d.items.map(i => `<p style="margin:2px 0;"><strong>${i.time}</strong> — ${i.title}</p>`).join("")}
  `).join("");

  const totalUSD = state.trip.budget + state.budgetExtra;
  const budgetRows = Object.entries(BASE_BUDGET_SPLIT).map(([cat, pct]) => {
    let amt = state.trip.budget * pct;
    if(cat === "eSIM") amt += state.budgetExtra;
    return `<tr><td style="padding:6px 0;">${cat}</td><td style="text-align:right;">$${amt.toFixed(0)}</td></tr>`;
  }).join("");

  pdfRoot.innerHTML = `
    <div style="border:2px dashed #12A594; border-radius:12px; padding:24px;">
      <h2 style="color:#0B2A4A; margin:0;">Voya — Trip Plan</h2>
      <p style="color:#555;">${dest.label} · ${state.trip.days}-day ${state.trip.tripType} trip · Budget $${state.trip.budget}</p>
      <hr>
      ${daysHtml}
      <hr>
      <h4>Budget summary</h4>
      <table style="width:100%; border-collapse:collapse;">${budgetRows}
        <tr><td style="padding:6px 0; font-weight:700;">Total</td><td style="text-align:right; font-weight:700;">$${totalUSD.toFixed(0)}</td></tr>
      </table>
    </div>
  `;

  pdfRoot.hidden = false;
  html2pdf().from(pdfRoot).set({
    margin: 10,
    filename: `voya-${state.trip.destination}-trip.pdf`,
    html2canvas: { scale: 2 }
  }).save().then(() => { pdfRoot.hidden = true; });
});

/* ==========================================================================
   INIT — restore any saved trip on page load
   ========================================================================== */
function init(){
  renderEsimStore();

  if(state.trip && state.itinerary){
    renderPreview(state.trip, state.itinerary);
    $("#previewEmpty").hidden = true;
    $("#previewResult").hidden = false;
    renderMap(state.trip, state.itinerary);
    renderDayTabs(state.itinerary);
    renderBudget();

    // Reflect saved form values
    $("#destination").value = state.trip.destination;
    $("#days").value = state.trip.days;
    $("#budget").value = state.trip.budget;
    $("#tripType").value = state.trip.tripType;
  }
}

document.addEventListener("DOMContentLoaded", init);/* أضف هذا السطر داخل دالة init */
function init(){
  // أضف هذا السطر للتأكد من إغلاق المودال عند فتح الصفحة
  $("#modalBackdrop").hidden = true; 
  
  renderEsimStore();
  // ... باقي الكود كما هو
}

