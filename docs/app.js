import * as L from './logic.js';

// MARK: Zustand & Speicherung

const STORE_KEY = 'kitchenplanner.v1';
let state = loadState();
let foods = [];
let monitor = { stats: {}, shortages: [], suggestions: [], next: null };
const ui = { tab: 'today', day: L.startOfDay(Date.now()), pantrySearch: '', newItem: '', clipboard: loadClipboard() };
let sheet = null; // { pages: [...] }

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return { ...L.emptyState(), ...JSON.parse(raw) };
  } catch { /* leerer Start */ }
  return L.emptyState();
}

// Kopierte Mahlzeit – eigener Schlüssel, damit sie einen Neustart der Home-Bildschirm-App übersteht.
const CLIP_KEY = 'kitchenplanner.clipboard';
function loadClipboard() {
  try { return JSON.parse(localStorage.getItem(CLIP_KEY)) || null; } catch { return null; }
}
function setClipboard(clip) {
  ui.clipboard = clip;
  try { clip ? localStorage.setItem(CLIP_KEY, JSON.stringify(clip)) : localStorage.removeItem(CLIP_KEY); } catch { /* nur im Speicher */ }
}

function applyTheme() {
  const theme = state.settings.theme || 'system';
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.content = dark ? '#000000' : '#f2f2f7'; });
}

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { toast('Speichern fehlgeschlagen'); }
  computeMonitor();
}

function computeMonitor() {
  const snap = L.snapshot(state);
  const now = Date.now();
  monitor.next = L.nextShopping(state.schedule, now);
  monitor.stats = L.consumptionStats(snap.consumption, snap.purchases, snap.trackingStart, now);
  monitor.shortages = L.shortages(snap.stock, monitor.stats, monitor.next, now);
  const onList = new Set(openItems().map((i) => i.productId).filter(Boolean));
  if (state.settings.autoAdd) {
    let added = false;
    for (const s of monitor.shortages) {
      if (onList.has(s.productId)) continue;
      const p = L.findProduct(state, s.productId);
      if (p) { L.shoppingAddGrams(state, p, s.recommendedGrams, 'shortage', s.reason); onList.add(p.id); added = true; }
    }
    if (added) localStorage.setItem(STORE_KEY, JSON.stringify(state));
  }
  const excluded = new Set([...onList, ...monitor.shortages.map((s) => s.productId)]);
  monitor.suggestions = L.suggestions(snap.stock, monitor.stats, excluded);
}

const openItems = () => state.shopping.filter((i) => !i.checked);
const missingShortages = () => {
  const onList = new Set(openItems().map((i) => i.productId));
  return monitor.shortages.filter((s) => !onList.has(s.productId));
};

// MARK: Hilfen

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const parseNum = (s) => {
  const n = parseFloat(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const numValue = (n) => (n ? L.formatNumber(n) : '');
const isoDate = (t) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const isoDateTime = (t) => {
  const d = new Date(t);
  return `${isoDate(t)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const mealTitle = (id) => L.MEALS.find((m) => m.id === id)?.title ?? id;

function toast(text) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.remove(), 2200);
}

function dialog(title, message, buttons) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'dialog-backdrop';
    wrap.innerHTML = `<div class="dialog" role="alertdialog"><h3>${esc(title)}</h3>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="buttons">${buttons.map((b, i) => `<button data-i="${i}" class="${b.destructive ? 'destructive' : ''}">${esc(b.label)}</button>`).join('')}</div></div>`;
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b && e.target !== wrap) return;
      wrap.remove();
      resolve(b ? buttons[+b.dataset.i].value : null);
    });
    document.body.append(wrap);
  });
}

// MARK: Icons (SF-Symbol-ähnlich)

const I = {
  chevronLeft: '<path d="M15 5l-7 7 7 7"/>',
  chevronRight: '<path d="M9 5l7 7-7 7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  plusCircle: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
  barcode: '<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><path d="M8 9v6M10.5 9v6M12.5 9v6M15 9v6M16.5 9v6" stroke-width="1.6"/>',
  pencil: '<rect x="4" y="5" width="15" height="15" rx="4"/><path d="M11 14l9-9"/>',
  fridge: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M6 10h12M9 6v2M9 13v3"/>',
  cabinet: '<rect x="5" y="3" width="14" height="17" rx="2"/><path d="M12 3v17M10 11h.01M14 11h.01M7 20v1M17 20v1"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 7l2.5-2.5M9.5 19.5L12 17l2.5 2.5"/>',
  cart: '<path d="M3 4h2.5l2.2 10.5h10.5L20.5 7H7"/><circle cx="9.5" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>',
  chart: '<path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  gear: '<path d="M10.3 3h3.4l.5 2.4 1.8.8 2.1-1.3 2.4 2.4-1.3 2.1.8 1.8 2.4.5v3.4l-2.4.5-.8 1.8 1.3 2.1-2.4 2.4-2.1-1.3-1.8.8-.5 2.4h-3.4l-.5-2.4-1.8-.8-2.1 1.3-2.4-2.4 1.3-2.1-.8-1.8L3 13.7v-3.4l2.4-.5.8-1.8-1.3-2.1 2.4-2.4 2.1 1.3 1.8-.8z"/><circle cx="12" cy="12" r="3"/>',
  calendar: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  circle: '<circle cx="12" cy="12" r="9"/>',
  checkCircle: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M8 12.5l2.8 2.8L16.5 9.5" stroke="#fff"/>',
  warning: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>',
  arrowDown: '<circle cx="12" cy="12" r="9"/><path d="M12 7v9M8.5 12.5L12 16l3.5-3.5"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 13h8l1-13"/>',
  copy: '<rect x="8.5" y="8.5" width="11" height="11" rx="2.5"/><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2"/>',
  paste: '<rect x="5" y="4.5" width="14" height="16" rx="2.5"/><path d="M9 4.5h6v3H9zM12 11v6M9 14l3 3 3-3"/>',
  minus: '<path d="M6 12h12"/>',
};
const icon = (name, size = 22, width = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
const locIcon = (id) => icon(L.LOCATIONS.find((l) => l.id === id)?.icon ?? 'cabinet', 22, 1.7);

// MARK: Tabs

function render() {
  const views = { today: renderToday, pantry: renderPantry, shopping: renderShopping, settings: renderSettings };
  const missing = missingShortages().length;
  const tabs = [
    ['today', 'chart', 'Heute'], ['pantry', 'fridge', 'Vorrat'],
    ['shopping', 'cart', 'Einkauf'], ['settings', 'gear', 'Einstellungen'],
  ];
  $('#app').innerHTML = `<main class="screen">${views[ui.tab]()}</main>
    <nav class="tabbar">${tabs.map(([id, ic, label]) => `
      <button class="${ui.tab === id ? 'on' : ''}" data-action="tab" data-id="${id}">
        ${icon(ic, 24, 1.9)}<span>${label}</span>
        ${id === 'shopping' && missing ? `<i class="dot">${missing}</i>` : ''}
      </button>`).join('')}</nav>`;
}

function topbar(left, right) {
  return `<div class="topbar"><div>${left}</div><div>${right}</div></div>`;
}

// Heute

function renderToday() {
  const isToday = ui.day === L.startOfDay(Date.now());
  const yesterday = ui.day === L.startOfDay(Date.now()) - L.DAY;
  const title = isToday ? 'Heute' : yesterday ? 'Gestern'
    : new Date(ui.day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  const entries = L.entriesOn(state, ui.day);
  const consumed = entries.reduce((m, e) => L.addMacros(m, e), { ...L.ZERO });
  const g = state.goals;
  const missing = missingShortages();

  const banner = isToday && missing.length ? `
    <button class="banner" data-action="tab" data-id="shopping">
      <span class="icon">${icon('warning', 24)}</span>
      <span class="grow"><b>${missing.length === 1 ? `${esc(missing[0].name)} wird knapp` : `${missing.length} Lebensmittel werden knapp`}</b>
      <div class="secondary" style="font-size:13px;margin-top:2px">${monitor.next ? 'Reicht nicht bis zum Einkauf' : 'Bald leer'} – zur Einkaufsliste</div></span>
      <span class="chevron">${icon('chevronRight', 18)}</span>
    </button>` : '';

  return `
    ${topbar(
      `<div class="pill"><button data-action="day" data-delta="-1" aria-label="Vorheriger Tag">${icon('chevronLeft')}</button>
        <button data-action="day" data-delta="1" aria-label="Nächster Tag" ${isToday ? 'disabled' : ''}>${icon('chevronRight')}</button></div>`,
      `<div class="pill"><button data-action="add" data-intent="log" data-scan="1" aria-label="Scannen">${icon('barcode')}</button>
        <button data-action="add" data-intent="log" aria-label="Hinzufügen">${icon('plus')}</button></div>`)}
    <h1 class="large-title">${esc(title)}</h1>
    ${banner}${clipboardBar()}
    <div class="section"><div class="card macro-card">${macroRing(consumed, g)}</div></div>
    ${L.MEALS.map((meal) => {
      const list = entries.filter((e) => e.meal === meal.id);
      const kcal = list.reduce((s, e) => s + e.kcal, 0);
      return `<div class="section">
        <div class="section-header"><span>${meal.title}</span><span class="header-trail">${kcal > 0 ? `${Math.round(kcal)} kcal` : ''}
          ${list.length ? `<button class="header-button" data-action="copyMeal" data-meal="${meal.id}" aria-label="${meal.title} kopieren">${icon('copy', 18, 1.8)}</button>` : ''}</span></div>
        <div class="card">
          ${list.map((e) => {
            const p = L.findProduct(state, e.productId);
            return `<button class="row" data-action="entry" data-id="${e.id}">
              <div class="grow"><div class="title">${esc(e.productName)}</div>
                <div class="sub">${L.formatAmount(e.grams, p?.gramsPerPiece)}</div>
                ${e.missingGrams > 0.5 ? `<div class="sub orange">${L.formatGrams(e.missingGrams)} nicht aus dem Vorrat</div>` : ''}</div>
              <div style="text-align:right"><div>${Math.round(e.kcal)} kcal</div>
                <div class="trail-small">KH ${Math.round(e.carbs)} · F ${Math.round(e.fat)} · P ${Math.round(e.protein)}</div></div>
            </button>`;
          }).join('')}
          <button class="row icon-row" data-action="add" data-intent="log" data-meal="${meal.id}">
            <span class="row-icon">${icon('plusCircle', 24, 1.7)}</span><span class="accent">Hinzufügen</span>
          </button>
          ${ui.clipboard ? `<button class="row icon-row" data-action="pasteMeal" data-meal="${meal.id}">
            <span class="row-icon">${icon('paste', 24, 1.7)}</span><span class="accent grow">${esc(mealTitle(ui.clipboard.meal))} einfügen</span>
            <span class="trail-small">${ui.clipboard.items.length} ${ui.clipboard.items.length === 1 ? 'Eintrag' : 'Einträge'}</span>
          </button>` : ''}
        </div></div>`;
    }).join('')}`;
}

function clipboardBar() {
  const c = ui.clipboard;
  if (!c) return '';
  const from = c.day === L.startOfDay(Date.now()) ? 'heute'
    : 'vom ' + new Date(c.day).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
  return `<div class="banner clip-bar"><span class="icon accent">${icon('copy', 22, 1.8)}</span>
    <span class="grow"><b>${esc(mealTitle(c.meal))} ${from} kopiert</b>
    <div class="secondary" style="font-size:13px;margin-top:2px">Tag wählen und bei einer Mahlzeit „Einfügen“ tippen</div></span>
    <button class="pill pill-text" data-action="clearClipboard">Fertig</button></div>`;
}

function macroRing(c, g) {
  const r = 52, circ = 2 * Math.PI * r;
  const p = (v, goal) => (goal > 0 ? Math.min(1, v / goal) : 0);
  const over = c.kcal > g.kcal;
  const bar = (title, v, goal, color) => `<div>
    <div class="bar-head"><b>${title}</b><span>noch ${Math.round(Math.max(0, goal - v))} g</span></div>
    <div class="bar"><div style="width:${p(v, goal) * 100}%;background:${v > goal ? 'var(--red)' : color}"></div></div></div>`;
  return `<div class="ring">
      <svg width="122" height="122" viewBox="0 0 122 122">
        <circle cx="61" cy="61" r="${r}" fill="none" stroke="var(--fill-strong)" stroke-width="12"/>
        <circle cx="61" cy="61" r="${r}" fill="none" stroke="${over ? 'var(--red)' : 'var(--accent)'}" stroke-width="12"
          stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - p(c.kcal, g.kcal))}"
          style="transition:stroke-dashoffset .4s"/>
      </svg>
      <div class="center"><div class="big">${L.formatInt(g.kcal - c.kcal)}</div><div class="small">kcal übrig</div></div>
    </div>
    <div class="bars">${bar('Kohlenhydrate', c.carbs, g.carbs, 'var(--orange)')}${bar('Fett', c.fat, g.fat, 'var(--yellow)')}${bar('Protein', c.protein, g.protein, 'var(--blue)')}</div>`;
}

// Vorrat

function renderPantry() {
  const items = state.pantry.filter((i) => i.remainingGrams > 0.5);
  const needle = L.normalize(ui.pantrySearch);
  const header = `${topbar('', `<div class="pill"><button data-action="add" data-intent="pantry" data-scan="1" aria-label="Scannen">${icon('barcode')}</button>
      <button data-action="add" data-intent="pantry" aria-label="Hinzufügen">${icon('plus')}</button></div>`)}
    <h1 class="large-title">Vorrat</h1>`;
  if (!items.length) {
    return `${header}<div class="card empty"><div class="icon">${icon('fridge', 54, 1.4)}</div>
      <h3>Vorrat ist leer</h3><p>Scanne Lebensmittel oder füge lose Ware wie „3 Bananen“ hinzu.</p>
      <button class="primary-button" data-action="add" data-intent="pantry">Lebensmittel hinzufügen</button></div>`;
  }
  const sections = L.LOCATIONS.map((loc) => {
    const group = items
      .filter((i) => i.location === loc.id)
      .map((i) => ({ item: i, product: L.findProduct(state, i.productId) }))
      .filter(({ product }) => product && (!needle || L.normalize(L.displayName(product)).includes(needle)))
      .sort((a, b) => a.product.name.localeCompare(b.product.name));
    if (!group.length) return '';
    return `<div class="section"><div class="section-header" style="justify-content:flex-start">${locIcon(loc.id)}<span>${loc.title}</span></div>
      <div class="card">${group.map(({ item, product }) => pantryRow(item, product)).join('')}</div></div>`;
  }).join('');
  return `${header}
    <label class="search">${icon('search', 18)}<input type="search" placeholder="Vorrat durchsuchen" value="${esc(ui.pantrySearch)}" data-input="pantrySearch"></label>
    <div id="pantry-list">${sections || '<p class="secondary" style="text-align:center">Nichts gefunden.</p>'}</div>`;
}

function pantryRow(item, product) {
  let expiry = '';
  if (item.expiresAt) {
    const days = L.daysBetween(Date.now(), item.expiresAt);
    const text = days < 0 ? 'abgelaufen' : days === 0 ? 'läuft heute ab'
      : 'MHD ' + new Date(item.expiresAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
    expiry = ` · <span class="${days <= 2 ? 'red' : ''}">${text}</span>`;
  }
  const usage = monitor.stats[product.id]?.dailyUsage;
  let badge = '';
  if (usage > 0) {
    const reach = L.stockGrams(state, product.id) / usage;
    const cls = reach <= 2 ? 'red' : reach <= 5 ? 'orange' : 'green';
    badge = `<span class="badge ${cls}">${reach < 1 ? '< 1 Tag' : `~${Math.round(reach)} Tage`}</span>`;
  }
  return `<button class="row" data-action="editPantry" data-id="${item.id}">
    <div class="grow"><div class="title">${esc(L.displayName(product))}</div>
      <div class="sub">${L.formatAmount(item.remainingGrams, product.gramsPerPiece)}${expiry}</div></div>${badge}</button>`;
}

// Einkauf

function renderShopping() {
  const open = openItems();
  const done = state.shopping.filter((i) => i.checked);
  const missing = missingShortages();
  const shortageSection = missing.length ? `<div class="section">
      <div class="section-header red" style="justify-content:flex-start">${icon('warning', 17)}<span>${monitor.next ? 'Reicht nicht bis zum Einkauf' : 'Bald leer'}</span></div>
      <div class="card">${missing.map((s) => `<div class="row">
          <div class="grow"><div class="title"><b>${esc(s.name)}</b></div><div class="sub">${esc(s.reason)}</div></div>
          <button class="chip" style="background:var(--red);color:#fff" data-action="addShortage" data-id="${s.productId}">+ ${L.amountText(s.recommendedGrams, s.gramsPerPiece)}</button>
        </div>`).join('')}
        ${missing.length > 1 ? '<button class="row accent" data-action="addAllShortages">Alle hinzufügen</button>' : ''}</div></div>` : '';
  const suggestionSection = monitor.suggestions.length ? `<div class="section"><div class="section-header">Häufig gekauft</div>
      <div class="card" style="padding:10px 12px"><div class="chips">${monitor.suggestions.map((s) => `
        <button class="suggestion" data-action="addSuggestion" data-id="${s.productId}">
          <b>${icon('plusCircle', 18)}${esc(s.name)}</b><small>${esc(s.reason)}</small></button>`).join('')}</div></div></div>` : '';

  return `${topbar('', `<div class="pill"><button data-action="add" data-intent="shopping" aria-label="Hinzufügen">${icon('plus')}</button></div>`)}
    <h1 class="large-title">Einkauf</h1>
    <div class="section"><div class="card"><button class="row" data-action="schedule">
      <span class="row-icon">${icon('calendar', 26, 1.7)}</span>
      <div class="grow"><div class="sub" style="margin:0 0 2px">Nächster Einkauf</div>
        <div>${monitor.next ? L.weekdayDate(monitor.next) : 'Kein Termin – tippen zum Festlegen'}</div></div>
      <span class="chevron">${icon('chevronRight', 18)}</span></button></div></div>
    ${shortageSection}${suggestionSection}
    <div class="section"><div class="section-header">Einkaufsliste</div><div class="card">
      <form class="row" data-form="newItem">
        <input class="field" placeholder="Artikel hinzufügen, z. B. 3 Bananen" value="${esc(ui.newItem)}" data-input="newItem" enterkeyhint="done">
        <button type="button" class="accent" data-action="add" data-intent="shopping" aria-label="Suchen">${icon('search', 22)}</button>
      </form>
      ${!open.length && !done.length ? '<div class="row secondary">Noch nichts auf der Liste.</div>' : ''}
      ${open.map(shoppingRow).join('')}
    </div></div>
    ${done.length ? `<div class="section"><div class="section-header">Im Wagen</div><div class="card">
      ${done.map(shoppingRow).join('')}
      <button class="row icon-row" data-action="checkout"><span class="check on">${icon('checkCircle', 26)}</span>
        <b class="accent">Einkauf abschließen & in den Vorrat</b></button></div></div>` : ''}`;
}

function shoppingRow(item) {
  const label = { suggestion: 'Vorschlag', shortage: 'Engpass' }[item.source];
  const counter = L.shoppingCounter(state, item);
  const sub = [counter.label, label, item.note].filter(Boolean).join(' · ');
  return `<div class="row icon-row">
    <button class="check ${item.checked ? 'on' : ''}" data-action="toggleItem" data-id="${item.id}" aria-label="Abhaken">${icon(item.checked ? 'checkCircle' : 'circle', 26, 1.6)}</button>
    <button class="grow" style="text-align:left" data-action="toggleItem" data-id="${item.id}">
      <div class="${item.checked ? 'strike' : ''}">${esc(item.name)}</div>
      <div class="sub">${esc(sub)}</div></button>
    <div class="stepper">
      <button data-action="stepItem" data-id="${item.id}" data-delta="-1" aria-label="Weniger">${icon('minus', 16, 2.2)}</button>
      <input inputmode="decimal" value="${numValue(L.shoppingCount(state, item))}" data-input="shopCount" data-id="${item.id}" aria-label="Anzahl ${esc(item.name)}">
      <button data-action="stepItem" data-id="${item.id}" data-delta="1" aria-label="Mehr">${icon('plus', 16, 2.2)}</button>
    </div>
    <button class="secondary" data-action="deleteItem" data-id="${item.id}" aria-label="Löschen">${icon('trash', 18, 1.7)}</button>
  </div>`;
}

// Einstellungen

function renderSettings() {
  const g = state.goals;
  const goalRow = (key, label) => `<label class="row"><span class="grow">${label}</span>
    <input class="num-field" inputmode="decimal" value="${numValue(g[key])}" data-input="goal" data-key="${key}"></label>`;
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const theme = state.settings.theme || 'system';
  return `<div class="topbar"></div><h1 class="large-title">Einstellungen</h1>
    <div class="section"><div class="section-header">Darstellung</div><div class="card" style="padding:12px 16px">
      <div class="segmented">${[['system', 'System'], ['light', 'Hell'], ['dark', 'Dunkel']].map(([id, t]) => `<button class="${theme === id ? 'on' : ''}" data-action="setTheme" data-id="${id}">${t}</button>`).join('')}</div>
    </div><div class="section-footer">„System“ folgt der Einstellung deines iPhones.</div></div>
    <div class="section"><div class="section-header">Tagesziele</div><div class="card">
      ${goalRow('kcal', 'Kalorien (kcal)')}${goalRow('carbs', 'Kohlenhydrate (g)')}${goalRow('fat', 'Fett (g)')}${goalRow('protein', 'Protein (g)')}
      <button class="row accent" data-action="kcalFromMacros">Kalorien aus Makros berechnen</button></div></div>
    <div class="section"><div class="section-header">Einkauf</div><div class="card">
      <button class="row" data-action="schedule"><span class="grow">Einkaufstermin</span>
        <span class="trail">${monitor.next ? L.shortDay(monitor.next) + ', ' + new Date(monitor.next).toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' }) : 'Keiner'}</span>
        <span class="chevron">${icon('chevronRight', 18)}</span></button>
      <label class="row"><span class="grow">Engpässe automatisch auf die Liste</span>
        <span class="toggle"><input type="checkbox" ${state.settings.autoAdd ? 'checked' : ''} data-input="autoAdd"><span></span></span></label>
    </div><div class="section-footer">Knappe Lebensmittel werden beim Öffnen der App angezeigt (Banner auf „Heute“ und Zahl am Einkaufs-Tab).</div></div>
    <div class="section"><div class="section-header">Daten</div><div class="card">
      <button class="row accent" data-action="exportData">Sicherung exportieren</button>
      <label class="row accent tappable">Sicherung importieren<input type="file" accept="application/json" hidden data-input="importData"></label>
    </div><div class="section-footer">Alle Daten liegen nur auf diesem Gerät im Browser-Speicher.</div></div>
    ${standalone ? '' : `<div class="section"><div class="card"><div class="row"><span class="row-icon">${icon('info', 22, 1.8)}</span>
      <div class="grow sub" style="font-size:15px;margin:0">Als App nutzen: In Safari auf „Teilen“ tippen und „Zum Home-Bildschirm“ wählen.</div></div></div></div>`}
    <div class="section"><div class="card"><div class="row sub" style="font-size:13px;margin:0">Produktdaten: Open Food Facts (openfoodfacts.org), Lizenz ODbL.</div></div></div>`;
}

// MARK: Sheets

function openSheet(page) {
  sheet = { pages: [page] };
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const el = document.createElement('section');
  el.className = 'sheet';
  el.id = 'sheet';
  document.body.append(backdrop, el);
  renderSheet();
  requestAnimationFrame(() => { backdrop.classList.add('open'); el.classList.add('open'); });
  backdrop.addEventListener('click', closeSheet);
}

function closeSheet() {
  stopScanner();
  sheet = null;
  const el = $('#sheet'), bd = $('.sheet-backdrop:not(.closing)');
  // Sofort umbenennen, damit ein direkt danach geöffnetes Sheet nicht dieses Element erwischt.
  el?.removeAttribute('id');
  el?.classList.add('closing');
  bd?.classList.add('closing');
  el?.classList.remove('open');
  bd?.classList.remove('open');
  setTimeout(() => { el?.remove(); bd?.remove(); }, 320);
  render();
}

const page = () => sheet?.pages[sheet.pages.length - 1];
function pushPage(p) { stopScanner(); sheet.pages.push(p); renderSheet(true); }
function replacePage(p) { stopScanner(); sheet.pages[sheet.pages.length - 1] = p; renderSheet(true); }
function popPage() { stopScanner(); sheet.pages.pop(); renderSheet(); }

function renderSheet(animate = false) {
  const p = page();
  if (!p) return;
  const views = { add: sheetAdd, scan: sheetScan, action: sheetAction, manual: sheetManual, pantryEdit: sheetPantryEdit, schedule: sheetSchedule, checkout: sheetCheckout };
  const v = views[p.type](p);
  const left = v.left ?? (sheet.pages.length > 1
    ? `<button class="pill" data-action="back" aria-label="Zurück"><span style="width:44px;height:44px;display:grid;place-items:center">${icon('chevronLeft')}</span></button>`
    : '<button class="pill pill-text" data-action="close">Abbrechen</button>');
  $('#sheet').innerHTML = `<header class="sheet-header"><div class="left">${left}</div><h2>${esc(v.title)}</h2><div class="right">${v.right ?? ''}</div></header>
    <div class="sheet-body ${animate ? 'page-enter' : ''}">${v.body}</div>`;
  v.after?.();
}

// Hinzufügen: Suche über eigene Produkte, lose Ware, online

function sheetAdd(p) {
  const titles = { pantry: 'Zum Vorrat hinzufügen', log: 'Essen eintragen', shopping: 'Zur Einkaufsliste' };
  return {
    title: titles[p.intent],
    body: `<label class="search">${icon('search', 18)}<input type="search" placeholder="z. B. Banane, Haferflocken …" value="${esc(p.search)}" data-input="addSearch"></label>
      <div id="add-results">${addResults(p)}</div>`,
  };
}

function addResults(p) {
  const needle = L.normalize(p.search);
  const mine = state.products
    .filter((pr) => !needle || L.normalize(L.displayName(pr)).includes(needle))
    .map((pr) => ({ pr, stock: L.stockGrams(state, pr.id) }))
    .sort((a, b) => (a.stock > 0) !== (b.stock > 0) ? (a.stock > 0 ? -1 : 1) : a.pr.name.localeCompare(b.pr.name));
  const ownNames = new Set(state.products.filter((pr) => !pr.barcode).map((pr) => pr.name));
  const generic = L.searchCatalog(foods, p.search).filter((f) => !ownNames.has(f.name)).slice(0, needle ? 40 : 200);
  const row = (action, id, name, detail, kcal) => `<button class="row" data-action="${action}" data-id="${esc(id)}">
    <div class="grow"><div class="title">${esc(name)}</div>${detail ? `<div class="sub">${esc(detail)}</div>` : ''}</div>
    <span class="trail-small">${Math.round(kcal)} kcal/100 g</span></button>`;
  let online = '';
  if (p.search.trim().length >= 3) {
    const o = p.online;
    online = `<div class="section"><div class="section-header">Online (Open Food Facts)</div><div class="card">
      ${o.status === 'loading' ? '<div class="loading"><div class="spinner"></div>Suche …</div>'
        : o.status === 'done' && o.results.length ? o.results.map((r, i) => row('pickOnline', i, r.brand ? `${r.name} (${r.brand})` : r.name, r.packageGrams ? L.formatGrams(r.packageGrams) : '', r.kcal)).join('')
        : o.status === 'done' ? '<div class="row secondary">Keine Treffer.</div>'
        : o.status === 'error' ? `<div class="row secondary">${navigator.onLine === false ? 'Keine Internetverbindung.' : 'Open Food Facts ist gerade überlastet.'}</div>
          <button class="row accent" data-action="searchOnline">Erneut versuchen</button>`
        : `<button class="row accent" data-action="searchOnline">„${esc(p.search.trim())}“ online suchen</button>`}
      </div></div>`;
  }
  return `${needle ? '' : `<div class="section"><div class="card">
      <button class="row icon-row" data-action="openScan"><span class="row-icon">${icon('barcode', 24, 1.7)}</span><span class="accent">Barcode scannen</span></button>
      <button class="row icon-row" data-action="newManual"><span class="row-icon">${icon('pencil', 24, 1.7)}</span><span class="accent">Eigenes Lebensmittel anlegen</span></button>
    </div></div>`}
    ${mine.length ? `<div class="section"><div class="section-header">Meine Lebensmittel</div><div class="card">
      ${mine.map(({ pr, stock }) => row('pickProduct', pr.id, L.displayName(pr), stock > 0 ? `Im Vorrat: ${L.formatAmount(stock, pr.gramsPerPiece)}` : '', pr.kcal)).join('')}</div></div>` : ''}
    ${generic.length ? `<div class="section"><div class="section-header">Ohne Barcode (lose Ware)</div><div class="card">
      ${generic.map((f) => row('pickGeneric', f.name, f.name, f.piece ? `1 Stück ≈ ${f.piece} g` : f.category, f.kcal)).join('')}</div></div>` : ''}
    ${online}`;
}

async function searchOnline() {
  const p = page();
  const term = p.search.trim();
  p.online = { status: 'loading', results: [] };
  refreshAddResults();
  try {
    const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(term)}&search_simple=1&action=process&json=1&page_size=20&fields=code,product_name,product_name_de,brands,nutriments,product_quantity,quantity`;
    const json = await fetchOFF(url, () => page() === p && p.search.trim() === term);
    if (!json) return;
    if (page() === p && p.search.trim() === term) p.online = { status: 'done', results: L.parseOFFSearch(json) };
  } catch {
    if (page() === p) p.online = { status: 'error', results: [] };
  }
  if (page() === p) refreshAddResults();
}

/**
 * Open Food Facts ist oft überlastet und antwortet dann mit 503 (ohne CORS-Header, also als
 * Netzwerkfehler). Darum mehrfach mit wachsender Pause versuchen. 404 → null.
 * stillWanted() bricht ab, wenn der Nutzer inzwischen etwas anderes sucht.
 */
async function fetchOFF(url, stillWanted = () => true) {
  const delays = [0, 700, 1500, 2500, 4000];
  let lastError;
  for (const delay of delays) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    if (!stillWanted()) return null;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.status === 404) return null;
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

function refreshAddResults() {
  const el = $('#add-results');
  if (el && page()?.type === 'add') el.innerHTML = addResults(page());
}

function actionPage(product, from) {
  return { type: 'action', draft: product, intent: from.intent, meal: from.meal || L.suggestedMeal(), amount: null, unit: null, location: 'fridge', hasExpiry: false, expiry: Date.now() + 7 * L.DAY };
}

// Scannen

function sheetScan(p) {
  return {
    title: 'Scannen',
    body: `<div class="scanner" id="scanner" ${p.camera === 'off' ? 'hidden' : ''}><video id="scan-video" playsinline muted></video><div class="frame"></div>
        <div class="hint">${p.looking ? 'Suche Produkt …' : 'Barcode in den Rahmen halten'}</div></div>
      ${p.camera === 'off' ? `<div class="card empty"><div class="icon">${icon('barcode', 54, 1.4)}</div><h3>Kamera nicht verfügbar</h3>
        <p>${esc(p.cameraError || 'Gib den Barcode manuell ein.')}</p></div>` : ''}
      <form class="manual-code" data-form="manualCode">
        <input inputmode="numeric" placeholder="Barcode eingeben" value="${esc(p.code)}" data-input="manualCode">
        <button ${p.code.length < 8 || p.looking ? 'disabled' : ''} id="code-submit">Suchen</button></form>
      ${p.looking ? '<div class="loading"><div class="spinner"></div>Suche Produkt …</div>' : ''}`,
    after: () => { if (p.camera !== 'off' && !p.looking) startScanner(p); },
  };
}

let scanner = null;

async function startScanner(p) {
  const video = $('#scan-video');
  if (!video || scanner) return;
  if (!navigator.mediaDevices?.getUserMedia) {
    p.camera = 'off';
    p.cameraError = 'Dieser Browser erlaubt keinen Kamerazugriff (HTTPS nötig).';
    return renderSheet();
  }
  const current = { stopped: false, stop: () => {} };
  scanner = current;
  const done = (code) => {
    if (current.stopped) return;
    stopScanner();
    navigator.vibrate?.(40);
    lookupBarcode(code);
  };
  try {
    if ('BarcodeDetector' in window) {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (current.stopped) return stream.getTracks().forEach((t) => t.stop());
      video.srcObject = stream;
      await video.play();
      const detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_e', 'upc_a'] });
      current.stop = () => stream.getTracks().forEach((t) => t.stop());
      const loop = async () => {
        if (current.stopped) return;
        try {
          const codes = await detector.detect(video);
          if (codes[0]?.rawValue) return done(codes[0].rawValue);
        } catch { /* nächstes Bild */ }
        setTimeout(loop, 150);
      };
      loop();
    } else {
      const ZXing = await loadZXing();
      if (current.stopped) return;
      const hints = new Map([[ZXing.DecodeHintType.POSSIBLE_FORMATS,
        [ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8, ZXing.BarcodeFormat.UPC_E, ZXing.BarcodeFormat.UPC_A]]]);
      const reader = new ZXing.BrowserMultiFormatReader(hints, 150);
      current.stop = () => reader.reset();
      await reader.decodeFromConstraints({ video: { facingMode: 'environment' } }, video, (result) => {
        if (result) done(result.getText());
      });
    }
  } catch (err) {
    stopScanner();
    p.camera = 'off';
    p.cameraError = err?.name === 'NotAllowedError'
      ? 'Kamerazugriff wurde nicht erlaubt. Du kannst ihn in den Safari-Einstellungen freigeben oder den Barcode manuell eingeben.'
      : 'Die Kamera konnte nicht gestartet werden. Gib den Barcode manuell ein.';
    if (page() === p) renderSheet();
  }
}

function stopScanner() {
  if (!scanner) return;
  scanner.stopped = true;
  try { scanner.stop(); } catch { /* bereits gestoppt */ }
  scanner = null;
}

let zxingPromise = null;
function loadZXing() {
  zxingPromise ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
    s.onload = () => resolve(window.ZXing);
    s.onerror = () => { zxingPromise = null; reject(new Error('ZXing')); };
    document.head.append(s);
  });
  return zxingPromise;
}

async function lookupBarcode(code) {
  const p = page();
  if (!p || p.type !== 'scan') return;
  const local = state.products.find((pr) => pr.barcode === code);
  if (local) return replacePage(actionPage(local, p));
  p.looking = true;
  p.code = code;
  renderSheet();
  try {
    const json = await fetchOFF(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=code,product_name,product_name_de,brands,nutriments,product_quantity,quantity`, () => page() === p);
    if (page() !== p) return;
    const info = json ? L.parseOFFProduct(json, code) : null;
    if (page() !== p) return;
    if (!info) {
      return replacePage({ type: 'manual', draft: L.newProduct({ barcode: code }), from: p, hint: 'Produkt nicht in Open Food Facts gefunden. Lege es einmalig an – beim nächsten Scan wird es erkannt.' });
    }
    const draft = L.newProduct({ ...info, source: 'openFoodFacts' });
    delete draft.incomplete;
    if (info.incomplete) replacePage({ type: 'manual', draft, from: p, hint: 'Bei Open Food Facts fehlen Nährwerte – bitte ergänzen.' });
    else replacePage(actionPage(draft, p));
  } catch {
    if (page() !== p) return;
    replacePage({ type: 'manual', draft: L.newProduct({ barcode: code }), from: p, hint: 'Open Food Facts ist gerade nicht erreichbar. Scanne später noch einmal oder lege das Produkt manuell an.' });
  }
}

// Menge & Ziel

function sheetAction(p) {
  const pr = p.draft;
  if (p.unit === null) {
    p.unit = L.preferredUnit(pr);
    p.amount = p.unit === 'piece' ? 1
      : p.intent === 'pantry' ? pr.packageGrams || 100
      : p.intent === 'log' ? 100 : pr.packageGrams || 500;
  }
  const titles = { pantry: 'Vorrat', log: 'Gegessen', shopping: 'Einkaufsliste' };
  const confirm = { pantry: 'Hinzufügen', log: 'Eintragen', shopping: 'Auf Liste' };
  const confirmLong = { pantry: 'In den Vorrat legen', log: 'Eintragen', shopping: 'Auf die Einkaufsliste' };
  const quick = [];
  if (pr.packageGrams) quick.push([`Packung (${L.formatGrams(pr.packageGrams)})`, pr.packageGrams, 'gram']);
  if (pr.gramsPerPiece) quick.push(['1 Stück', 1, 'piece'], ['2 Stück', 2, 'piece'], ['3 Stück', 3, 'piece']);
  else quick.push(['50 g', 50, 'gram'], ['100 g', 100, 'gram'], ['200 g', 200, 'gram']);

  let intentSection = '';
  if (p.intent === 'pantry') {
    intentSection = `<div class="section"><div class="section-header">Lagerort</div><div class="card">
      ${L.LOCATIONS.map((l) => `<button class="row icon-row" data-action="setLocation" data-id="${l.id}">
        <span class="row-icon">${locIcon(l.id)}</span><span class="grow">${l.title}</span>
        ${p.location === l.id ? `<span class="accent">${icon('check', 22, 2.4)}</span>` : ''}</button>`).join('')}
      <label class="row"><span class="grow">Mindesthaltbarkeit</span>
        <span class="toggle"><input type="checkbox" ${p.hasExpiry ? 'checked' : ''} data-input="hasExpiry"><span></span></span></label>
      ${p.hasExpiry ? `<label class="row"><span class="grow">Haltbar bis</span><input type="date" class="date-input" value="${isoDate(p.expiry)}" data-input="expiry"></label>` : ''}
    </div></div>`;
  } else if (p.intent === 'log') {
    intentSection = `<div class="section"><div class="section-header">Mahlzeit</div><div class="card">
      <label class="row"><span class="grow">Mahlzeit</span><select class="select" data-input="meal">
        ${L.MEALS.map((m) => `<option value="${m.id}" ${p.meal === m.id ? 'selected' : ''}>${m.title}</option>`).join('')}</select></label>
      <div id="stock-hint">${stockHint(p)}</div></div></div>
      <div class="section"><div class="section-header">Nährwerte dieser Menge</div><div class="card" id="macro-preview">${macroStats(L.macrosFor(pr, L.gramsFor(pr, p.amount, p.unit)))}</div></div>`;
  }

  return {
    title: titles[p.intent],
    right: `<button class="pill pill-text" data-action="confirmAction" ${p.amount > 0 && pr.name ? '' : 'disabled'}>${confirm[p.intent]}</button>`,
    body: `<div class="section"><div class="card">
        <div class="row" style="display:block"><b style="font-size:18px">${esc(pr.name)}</b>
          ${pr.brand && !pr.name.toLowerCase().includes(pr.brand.toLowerCase()) ? `<div class="secondary">${esc(pr.brand)}</div>` : ''}
          <div class="sub">pro 100 g: ${Math.round(pr.kcal)} kcal · KH ${L.formatNumber(pr.carbs)} g · F ${L.formatNumber(pr.fat)} g · P ${L.formatNumber(pr.protein)} g</div></div>
        <button class="row accent" data-action="editNutrition">Nährwerte bearbeiten</button></div></div>
      <div class="section"><div class="card" style="padding:12px 16px">
        <div class="segmented">${['pantry', 'log', 'shopping'].map((i) => `<button class="${p.intent === i ? 'on' : ''}" data-action="setIntent" data-id="${i}">${{ pantry: 'Vorrat', log: 'Gegessen', shopping: 'Einkaufsliste' }[i]}</button>`).join('')}</div>
      </div></div>
      <div class="section"><div class="section-header">Menge</div><div class="card">
        <div class="row"><input class="amount-field" inputmode="decimal" value="${numValue(p.amount)}" data-input="amount" aria-label="Menge">
          ${pr.gramsPerPiece ? `<div class="segmented small">${['gram', 'piece'].map((u) => `<button class="${p.unit === u ? 'on' : ''}" data-action="setUnit" data-id="${u}">${u === 'piece' ? 'Stück' : 'g'}</button>`).join('')}</div>`
            : '<span class="secondary">g</span>'}</div>
        ${p.unit === 'piece' ? `<div class="row sub" id="gram-hint" style="margin:0">≈ ${L.formatGrams(L.gramsFor(pr, p.amount, p.unit))}</div>` : ''}
        <div class="row"><div class="chips">${quick.map(([label, amount, unit]) => `<button class="chip" data-action="quickAmount" data-amount="${amount}" data-unit="${unit}">${label}</button>`).join('')}</div></div>
      </div></div>
      ${intentSection}
      <div class="section"><div class="card"><button class="big-button" data-action="confirmAction" ${p.amount > 0 && pr.name ? '' : 'disabled'}>${confirmLong[p.intent]}</button></div></div>`,
  };
}

function stockHint(p) {
  const pr = p.draft;
  const stock = L.stockGrams(state, pr.id);
  const grams = L.gramsFor(pr, p.amount, p.unit);
  if (stock + 0.5 < grams) {
    return `<div class="row icon-row orange"><span class="row-icon orange">${icon('warning', 22, 1.8)}</span><span class="grow" style="font-size:15px">${stock > 0
      ? `Nur ${L.formatAmount(stock, pr.gramsPerPiece)} im Vorrat – der Rest wird nicht abgezogen.`
      : 'Nicht im Vorrat – es wird nur im Tagebuch eingetragen.'}</span></div>`;
  }
  return `<div class="row icon-row secondary"><span class="row-icon secondary">${icon('arrowDown', 22, 1.6)}</span><span class="grow" style="font-size:15px">Wird vom Vorrat abgezogen (noch ${L.formatAmount(stock - grams, pr.gramsPerPiece)} übrig).</span></div>`;
}

function macroStats(m) {
  return `<div class="stat-row"><div><b>${Math.round(m.kcal)}</b><span>kcal</span></div><div><b>${L.formatNumber(m.carbs)} g</b><span>KH</span></div>
    <div><b>${L.formatNumber(m.fat)} g</b><span>Fett</span></div><div><b>${L.formatNumber(m.protein)} g</b><span>Protein</span></div></div>`;
}

function refreshActionDerived() {
  const p = page();
  const pr = p.draft;
  const grams = L.gramsFor(pr, p.amount, p.unit);
  const hint = $('#gram-hint');
  if (hint) hint.textContent = `≈ ${L.formatGrams(grams)}`;
  const stock = $('#stock-hint');
  if (stock) stock.innerHTML = stockHint(p);
  const macros = $('#macro-preview');
  if (macros) macros.innerHTML = macroStats(L.macrosFor(pr, grams));
  document.querySelectorAll('[data-action="confirmAction"]').forEach((b) => { b.disabled = !(p.amount > 0 && pr.name); });
}

function confirmAction() {
  const p = page();
  const product = L.upsertProduct(state, p.draft);
  const grams = L.gramsFor(product, p.amount, p.unit);
  if (p.intent === 'pantry') L.addToPantry(state, product.id, grams, p.location, p.hasExpiry ? p.expiry : null);
  else if (p.intent === 'log') L.logFood(state, product.id, grams, p.meal);
  else L.shoppingAdd(state, { name: product.name, productId: product.id, quantity: p.amount, unit: p.unit });
  save();
  navigator.vibrate?.(20);
  toast({ pantry: 'Im Vorrat', log: 'Eingetragen', shopping: 'Auf der Einkaufsliste' }[p.intent]);
  if (sheet.pages[0].type === 'pantryEdit' && sheet.pages.length > 1) return closeSheet();
  closeSheet();
}

// Eigenes Lebensmittel / Nährwerte bearbeiten

function sheetManual(p) {
  const d = p.draft;
  p.hasPiece ??= !!d.gramsPerPiece;
  const num = (key, label) => `<label class="row"><span class="grow">${label}</span>
    <input class="num-field" inputmode="decimal" value="${numValue(d[key])}" data-input="draftNum" data-key="${key}"></label>`;
  return {
    title: d.name || 'Neues Lebensmittel',
    right: `<button class="pill pill-text" data-action="manualDone" id="manual-done" ${d.name.trim() ? '' : 'disabled'}>${p.editOnly ? 'Fertig' : 'Weiter'}</button>`,
    body: `${p.hint ? `<div class="section"><div class="card"><div class="row icon-row"><span class="row-icon">${icon('info', 22, 1.8)}</span><span class="grow" style="font-size:15px">${esc(p.hint)}</span></div></div></div>` : ''}
      <div class="section"><div class="section-header">Produkt</div><div class="card">
        <label class="row"><input class="field" placeholder="Name" value="${esc(d.name)}" data-input="draftText" data-key="name"></label>
        <label class="row"><input class="field" placeholder="Marke (optional)" value="${esc(d.brand || '')}" data-input="draftText" data-key="brand"></label>
        ${d.barcode ? `<div class="row"><span class="grow">Barcode</span><span class="trail">${esc(d.barcode)}</span></div>` : ''}
      </div></div>
      <div class="section"><div class="section-header">Nährwerte pro 100 g</div><div class="card">
        ${num('kcal', 'Kalorien (kcal)')}${num('carbs', 'Kohlenhydrate (g)')}${num('fat', 'Fett (g)')}${num('protein', 'Protein (g)')}
      </div></div>
      <div class="section"><div class="card">
        ${num('packageGrams', 'Packungsgröße (g/ml)')}
        <label class="row"><span class="grow">Wird in Stück gezählt</span>
          <span class="toggle"><input type="checkbox" ${p.hasPiece ? 'checked' : ''} data-input="hasPiece"><span></span></span></label>
        ${p.hasPiece ? num('gramsPerPiece', 'Gewicht pro Stück (g)') : ''}
      </div><div class="section-footer">Mit Stückgewicht kannst du z. B. „3 Stück“ statt Gramm eingeben.</div></div>`,
  };
}

// Vorrat bearbeiten

function sheetPantryEdit(p) {
  const item = state.pantry.find((i) => i.id === p.itemId);
  const pr = L.findProduct(state, item.productId);
  return {
    title: pr.name,
    right: '<button class="pill pill-text" data-action="savePantryEdit">Sichern</button>',
    body: `<div class="section"><div class="section-header">Restmenge</div><div class="card">
        ${pr.gramsPerPiece ? `<div class="row"><span class="grow" id="pieces">${L.formatNumber(p.amount / pr.gramsPerPiece)} Stück</span>
          <div class="segmented small"><button data-action="stepPiece" data-delta="-1" aria-label="Weniger">−</button><button data-action="stepPiece" data-delta="1" aria-label="Mehr">+</button></div></div>` : ''}
        <label class="row"><span class="grow">Gramm</span><input class="num-field" inputmode="decimal" value="${numValue(p.amount)}" data-input="editAmount" id="edit-amount"></label>
      </div></div>
      <div class="section"><div class="section-header">Lagerort</div><div class="card" style="padding:12px 16px">
        <div class="segmented">${L.LOCATIONS.map((l) => `<button class="${p.location === l.id ? 'on' : ''}" data-action="editLocation" data-id="${l.id}">${l.title}</button>`).join('')}</div>
      </div></div>
      <div class="section"><div class="card">
        <label class="row"><span class="grow">Mindesthaltbarkeit</span><span class="toggle"><input type="checkbox" ${p.hasExpiry ? 'checked' : ''} data-input="editHasExpiry"><span></span></span></label>
        ${p.hasExpiry ? `<label class="row"><span class="grow">Haltbar bis</span><input type="date" class="date-input" value="${isoDate(p.expiry)}" data-input="editExpiry"></label>` : ''}
      </div></div>
      <div class="section"><div class="card">
        <label class="row"><span class="grow">Mindestbestand (g)</span><input class="num-field" inputmode="decimal" value="${numValue(p.minStock)}" data-input="editMinStock"></label>
      </div><div class="section-footer">Fällt der gesamte Bestand darunter, zeigt die App es als knapp an und schlägt es für die Einkaufsliste vor.</div></div>
      <div class="section"><div class="card">
        <button class="row accent" data-action="eatFromPantry">Davon essen …</button>
        <button class="row accent" data-action="pantryToList">Auf die Einkaufsliste</button>
        <button class="row danger" data-action="removePantry">Aus dem Vorrat entfernen</button>
      </div></div>`,
  };
}

// Einkaufstermin

function sheetSchedule() {
  const s = state.schedule;
  const days = [[1, 'Montag'], [2, 'Dienstag'], [3, 'Mittwoch'], [4, 'Donnerstag'], [5, 'Freitag'], [6, 'Samstag'], [0, 'Sonntag']];
  const next = L.nextShopping(s);
  return {
    title: 'Einkaufstermin',
    left: '<span></span>',
    right: '<button class="pill pill-text" data-action="close">Fertig</button>',
    body: `<div class="section"><div class="card">
        <div class="row"><div class="segmented">${[['none', 'Kein Termin'], ['once', 'Einmalig'], ['weekly', 'Wöchentlich']].map(([m, t]) => `<button class="${s.mode === m ? 'on' : ''}" data-action="scheduleMode" data-id="${m}">${t}</button>`).join('')}</div></div>
        ${s.mode === 'none' ? '<div class="row secondary" style="font-size:15px">Ohne Termin warnt die App nur, wenn etwas in den nächsten Tagen leer wird.</div>' : ''}
        ${s.mode === 'once' ? `<label class="row"><span class="grow">Einkauf am</span><input type="datetime-local" class="date-input" value="${isoDateTime(s.onceDate)}" data-input="onceDate"></label>` : ''}
        ${s.mode === 'weekly' ? `<label class="row"><span class="grow">Wochentag</span><select class="select" data-input="weekday">${days.map(([d, t]) => `<option value="${d}" ${s.weekday === d ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label class="row"><span class="grow">Uhrzeit</span><input type="time" class="date-input" value="${String(s.hour).padStart(2, '0')}:${String(s.minute).padStart(2, '0')}" data-input="time"></label>` : ''}
      </div></div>
      ${next ? `<div class="section"><div class="card"><div class="row"><span class="grow">Nächster Einkauf</span><span class="trail">${L.weekdayDate(next)}</span></div></div>
        <div class="section-footer">Bis dahin prüft die App, ob alle regelmäßig genutzten Lebensmittel reichen, und zeigt dir, was fehlt.</div></div>` : ''}`,
  };
}

// Einkauf abschließen

function sheetCheckout(p) {
  const items = state.shopping.filter((i) => i.checked);
  return {
    title: 'Abschließen',
    right: '<button class="pill pill-text" data-action="doCheckout">Übernehmen</button>',
    body: `<div class="section"><div class="card">${items.map((item) => `<div class="row" style="display:block">
        <div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:8px"><b>${esc(item.name)}</b>
          <span class="secondary">${L.formatNumber(item.quantity)} ${item.unit === 'piece' ? 'Stück' : 'g'}</span></div>
        ${item.productId ? `<div class="segmented">${L.LOCATIONS.map((l) => `<button class="${p.locations[item.id] === l.id ? 'on' : ''}" data-action="checkoutLocation" data-item="${item.id}" data-id="${l.id}">${l.title}</button>`).join('')}</div>`
          : '<div class="sub">Ohne Nährwerte – wird nur von der Liste entfernt.</div>'}
      </div>`).join('')}</div><div class="section-footer">Tipp: Abweichende Mengen kannst du danach im Vorrat korrigieren.</div></div>`,
  };
}

function defaultLocation(item) {
  const last = state.pantry.filter((i) => i.productId === item.productId).sort((a, b) => b.addedAt - a.addedAt)[0];
  if (last) return last.location;
  const pr = L.findProduct(state, item.productId);
  const food = pr && foods.find((f) => f.name === pr.name);
  const pantryCats = ['Getreide & Beilagen', 'Öle & Würzen', 'Nüsse & Snacks', 'Brot & Backwaren', 'Obst'];
  return food && pantryCats.includes(food.category) ? 'pantry' : 'fridge';
}

// MARK: Aktionen

const actions = {
  tab: (d) => { ui.tab = d.id; render(); window.scrollTo(0, 0); },
  day: (d) => { ui.day = L.startOfDay(ui.day + +d.delta * L.DAY + L.DAY / 2); render(); },
  add: (d) => {
    const p = { type: 'add', intent: d.intent, meal: d.meal, search: '', online: { status: 'idle', results: [] } };
    openSheet(p);
    if (d.scan) pushPage({ type: 'scan', intent: d.intent, meal: d.meal, code: '', looking: false });
  },
  close: () => closeSheet(),
  back: () => popPage(),
  openScan: () => { const p = page(); pushPage({ type: 'scan', intent: p.intent, meal: p.meal, code: '', looking: false }); },
  newManual: () => { const p = page(); pushPage({ type: 'manual', draft: L.newProduct({}), from: p }); },
  pickProduct: (d) => pushPage(actionPage(L.findProduct(state, d.id), page())),
  pickGeneric: (d) => {
    const food = foods.find((f) => f.name === d.id);
    const own = state.products.find((pr) => !pr.barcode && pr.name === food.name);
    pushPage(actionPage(own || L.productFromGeneric(food), page()));
  },
  pickOnline: (d) => {
    const info = page().online.results[+d.id];
    const own = info.barcode && state.products.find((pr) => pr.barcode === info.barcode);
    const draft = own || Object.assign(L.newProduct({ ...info, source: 'openFoodFacts' }), { incomplete: undefined });
    pushPage(actionPage(draft, page()));
  },
  searchOnline: () => searchOnline(),
  setIntent: (d) => { page().intent = d.id; renderSheet(); },
  setUnit: (d) => {
    const p = page();
    const grams = L.gramsFor(p.draft, p.amount, p.unit);
    p.unit = d.id;
    p.amount = Math.round(L.amountFor(p.draft, grams, p.unit) * 10) / 10;
    renderSheet();
  },
  quickAmount: (d) => { const p = page(); p.amount = +d.amount; p.unit = d.unit; renderSheet(); },
  setLocation: (d) => { page().location = d.id; renderSheet(); },
  editNutrition: () => pushPage({ type: 'manual', draft: page().draft, editOnly: true }),
  confirmAction: () => confirmAction(),
  manualDone: () => {
    const p = page();
    if (!p.draft.name.trim()) return;
    p.draft.name = p.draft.name.trim();
    if (!p.hasPiece) p.draft.gramsPerPiece = null;
    if (state.products.includes(p.draft)) save();
    if (p.editOnly) return popPage();
    replacePage(actionPage(p.draft, p.from));
  },
  entry: async (d) => {
    const e = state.log.find((x) => x.id === d.id);
    const choice = await dialog(e.productName, 'Eintrag löschen? Die Menge wird zurück in den Vorrat gebucht.', [
      { label: 'Abbrechen', value: null }, { label: 'Löschen', value: 'delete', destructive: true }]);
    if (choice === 'delete') { L.deleteEntry(state, d.id); save(); render(); }
  },
  editPantry: (d) => {
    const item = state.pantry.find((i) => i.id === d.id);
    const pr = L.findProduct(state, item.productId);
    openSheet({ type: 'pantryEdit', itemId: item.id, amount: item.remainingGrams, location: item.location, hasExpiry: !!item.expiresAt, expiry: item.expiresAt || Date.now() + 7 * L.DAY, minStock: pr.minStockGrams || 0 });
  },
  stepPiece: (d) => {
    const p = page();
    const pr = L.findProduct(state, state.pantry.find((i) => i.id === p.itemId).productId);
    p.amount = Math.max(0, p.amount + +d.delta * pr.gramsPerPiece);
    renderSheet();
  },
  editLocation: (d) => { page().location = d.id; renderSheet(); },
  savePantryEdit: () => {
    const p = page();
    const item = state.pantry.find((i) => i.id === p.itemId);
    const pr = L.findProduct(state, item.productId);
    item.remainingGrams = Math.max(0, p.amount);
    item.location = p.location;
    item.expiresAt = p.hasExpiry ? p.expiry : null;
    pr.minStockGrams = p.minStock > 0 ? p.minStock : null;
    save();
    closeSheet();
  },
  eatFromPantry: () => {
    const item = state.pantry.find((i) => i.id === page().itemId);
    pushPage(actionPage(L.findProduct(state, item.productId), { intent: 'log' }));
  },
  pantryToList: () => {
    const item = state.pantry.find((i) => i.id === page().itemId);
    const pr = L.findProduct(state, item.productId);
    L.shoppingAdd(state, { name: pr.name, productId: pr.id, quantity: pr.gramsPerPiece ? 1 : pr.packageGrams || 500, unit: L.preferredUnit(pr) });
    save();
    toast('Auf der Einkaufsliste');
    closeSheet();
  },
  removePantry: async () => {
    const choice = await dialog('Aus dem Vorrat entfernen?', 'Die Kaufhistorie bleibt für Vorschläge erhalten.', [
      { label: 'Abbrechen', value: null }, { label: 'Entfernen', value: 'ok', destructive: true }]);
    if (choice !== 'ok') return;
    state.pantry.find((i) => i.id === page().itemId).remainingGrams = 0;
    save();
    closeSheet();
  },
  schedule: () => openSheet({ type: 'schedule' }),
  scheduleMode: (d) => { state.schedule.mode = d.id; save(); renderSheet(); },
  addShortage: (d) => {
    const s = monitor.shortages.find((x) => x.productId === d.id);
    L.shoppingAddGrams(state, L.findProduct(state, d.id), s.recommendedGrams, 'shortage', s.reason);
    save(); render();
  },
  addAllShortages: () => {
    for (const s of missingShortages()) L.shoppingAddGrams(state, L.findProduct(state, s.productId), s.recommendedGrams, 'shortage', s.reason);
    save(); render();
  },
  addSuggestion: (d) => {
    const s = monitor.suggestions.find((x) => x.productId === d.id);
    L.shoppingAddGrams(state, L.findProduct(state, d.id), s.recommendedGrams, 'suggestion');
    save(); render();
  },
  stepItem: (d) => { L.stepShoppingCount(state, d.id, +d.delta); save(); render(); },
  copyMeal: (d) => {
    const clip = L.copyMeal(state, ui.day, d.meal);
    if (!clip) return;
    setClipboard(clip);
    render();
    toast(`${mealTitle(d.meal)} kopiert`);
  },
  pasteMeal: (d) => {
    if (!ui.clipboard) return;
    const added = L.pasteMeal(state, ui.clipboard, ui.day, d.meal);
    save(); render();
    toast(added.length ? `${added.length} ${added.length === 1 ? 'Eintrag' : 'Einträge'} bei ${mealTitle(d.meal)} eingefügt` : 'Produkte nicht mehr vorhanden');
  },
  clearClipboard: () => { setClipboard(null); render(); },
  setTheme: (d) => { state.settings.theme = d.id; save(); applyTheme(); render(); },
  toggleItem: (d) => { const i = state.shopping.find((x) => x.id === d.id); i.checked = !i.checked; save(); render(); },
  deleteItem: (d) => { state.shopping = state.shopping.filter((x) => x.id !== d.id); save(); render(); },
  checkout: () => {
    const locations = {};
    for (const i of state.shopping.filter((x) => x.checked)) locations[i.id] = defaultLocation(i);
    openSheet({ type: 'checkout', locations });
  },
  checkoutLocation: (d) => { page().locations[d.item] = d.id; renderSheet(); },
  doCheckout: () => {
    L.checkout(state, state.shopping.filter((i) => i.checked).map((i) => i.id), page().locations);
    save();
    toast('Im Vorrat');
    closeSheet();
  },
  kcalFromMacros: () => {
    const g = state.goals;
    g.kcal = Math.round(g.carbs * 4 + g.protein * 4 + g.fat * 9);
    save(); render();
  },
  exportData: () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `kitchen-planner-${isoDate(Date.now())}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

const inputs = {
  pantrySearch: (el) => {
    ui.pantrySearch = el.value;
    const list = $('#pantry-list');
    const html = renderPantry();
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    if (list) list.innerHTML = tmp.querySelector('#pantry-list')?.innerHTML ?? '';
  },
  addSearch: (el) => {
    const p = page();
    p.search = el.value;
    p.online = { status: 'idle', results: [] };
    refreshAddResults();
  },
  newItem: (el) => { ui.newItem = el.value; },
  manualCode: (el) => {
    page().code = el.value.replace(/\D/g, '');
    const b = $('#code-submit');
    if (b) b.disabled = page().code.length < 8;
  },
  amount: (el) => { page().amount = parseNum(el.value); refreshActionDerived(); },
  meal: (el) => { page().meal = el.value; },
  hasExpiry: (el) => { page().hasExpiry = el.checked; renderSheet(); },
  expiry: (el) => { if (el.value) page().expiry = new Date(el.value + 'T12:00').getTime(); },
  draftText: (el) => {
    const p = page();
    p.draft[el.dataset.key] = el.dataset.key === 'brand' ? el.value || null : el.value;
    const done = $('#manual-done');
    if (done) done.disabled = !p.draft.name.trim();
  },
  draftNum: (el) => {
    const v = parseNum(el.value);
    const key = el.dataset.key;
    page().draft[key] = ['packageGrams', 'gramsPerPiece'].includes(key) ? (v > 0 ? v : null) : v;
  },
  hasPiece: (el) => { page().hasPiece = el.checked; renderSheet(); },
  editAmount: (el) => {
    const p = page();
    p.amount = parseNum(el.value);
    const pieces = $('#pieces');
    const pr = L.findProduct(state, state.pantry.find((i) => i.id === p.itemId).productId);
    if (pieces && pr.gramsPerPiece) pieces.textContent = `${L.formatNumber(p.amount / pr.gramsPerPiece)} Stück`;
  },
  editHasExpiry: (el) => { page().hasExpiry = el.checked; renderSheet(); },
  editExpiry: (el) => { if (el.value) page().expiry = new Date(el.value + 'T12:00').getTime(); },
  editMinStock: (el) => { page().minStock = parseNum(el.value); },
  onceDate: (el) => { if (el.value) { state.schedule.onceDate = new Date(el.value).getTime(); save(); renderSheet(); } },
  weekday: (el) => { state.schedule.weekday = +el.value; save(); renderSheet(); },
  time: (el) => {
    const [h, m] = el.value.split(':').map(Number);
    if (Number.isFinite(h)) { state.schedule.hour = h; state.schedule.minute = m || 0; save(); renderSheet(); }
  },
  goal: (el) => { state.goals[el.dataset.key] = parseNum(el.value); save(); },
  autoAdd: (el) => { state.settings.autoAdd = el.checked; save(); },
  shopCount: (el) => { L.setShoppingCount(state, el.dataset.id, parseNum(el.value)); save(); render(); },
  importData: async (el) => {
    const file = el.files?.[0];
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data.products) || !Array.isArray(data.pantry)) throw new Error('format');
      const choice = await dialog('Sicherung importieren?', 'Die aktuellen Daten auf diesem Gerät werden ersetzt.', [
        { label: 'Abbrechen', value: null }, { label: 'Ersetzen', value: 'ok', destructive: true }]);
      if (choice !== 'ok') return;
      state = { ...L.emptyState(), ...data };
      save(); render(); toast('Importiert');
    } catch {
      dialog('Import fehlgeschlagen', 'Die Datei ist keine Kitchen-Planner-Sicherung.', [{ label: 'OK', value: null }]);
    }
  },
};

// Felder, die erst beim Verlassen übernommen werden (sonst springt der Cursor)
const changeOnly = new Set(['onceDate', 'weekday', 'time', 'importData', 'hasExpiry', 'hasPiece', 'editHasExpiry', 'autoAdd', 'meal', 'shopCount']);

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  e.preventDefault();
  actions[el.dataset.action]?.(el.dataset, el, e);
});

document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && !changeOnly.has(el.dataset.input)) inputs[el.dataset.input]?.(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target.closest('[data-input]');
  if (el && changeOnly.has(el.dataset.input)) inputs[el.dataset.input]?.(el, e);
  else if (el?.dataset.input === 'goal') render();
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('[data-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.form === 'manualCode') {
    const code = page()?.code;
    if (code?.length >= 8) { stopScanner(); lookupBarcode(code); }
  } else if (form.dataset.form === 'newItem') {
    addFreeText();
  }
});

/** Freitext wie „3 Bananen“: verknüpft mit eigenem Produkt oder Katalog, sonst reiner Text. */
function addFreeText() {
  const parsed = L.parseFreeText(ui.newItem);
  ui.newItem = '';
  if (!parsed.name) return render();
  const needle = L.normalize(parsed.name);
  let product = state.products.find((p) => L.normalize(p.name) === needle);
  if (!product) {
    const food = foods.find((f) => L.normalize(f.name).startsWith(needle));
    if (food) product = L.upsertProduct(state, L.productFromGeneric(food));
  }
  const unit = parsed.unit ?? (product ? L.preferredUnit(product) : 'piece');
  const quantity = parsed.quantity ?? (unit === 'piece' ? 1 : product?.packageGrams || 500);
  L.shoppingAdd(state, { name: product?.name ?? parsed.name, productId: product?.id ?? null, quantity, unit });
  save();
  render();
  $('[data-input="newItem"]')?.focus();
}

// MARK: Start

async function start() {
  try { foods = await (await fetch('foods.json')).json(); } catch { foods = []; }
  applyTheme();
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  computeMonitor();
  render();
  navigator.storage?.persist?.();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !sheet) { computeMonitor(); render(); }
  });
}

start();
