// Kitchen Planner – Geschäftslogik (reine Funktionen auf einem State-Objekt).
// Entspricht PantryService, ConsumptionAnalyzer und ShoppingPlanner der iOS-App.

export const DAY = 86_400_000;

export const LOCATIONS = [
  { id: 'fridge', title: 'Kühlschrank', icon: 'fridge' },
  { id: 'pantry', title: 'Vorratsschrank', icon: 'cabinet' },
  { id: 'freezer', title: 'Tiefkühler', icon: 'snow' },
];

export const MEALS = [
  { id: 'breakfast', title: 'Frühstück' },
  { id: 'lunch', title: 'Mittagessen' },
  { id: 'dinner', title: 'Abendessen' },
  { id: 'snack', title: 'Snacks' },
];

export const DEFAULT_GOALS = { kcal: 2200, carbs: 250, fat: 70, protein: 140 };

export function emptyState() {
  return {
    version: 1,
    products: [],
    pantry: [],
    log: [],
    shopping: [],
    goals: { ...DEFAULT_GOALS },
    schedule: { mode: 'none', onceDate: Date.now() + 3 * DAY, weekday: 6, hour: 10, minute: 0 },
    settings: { autoAdd: false },
  };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// MARK: Formatierung

export function formatNumber(value) {
  const r = Math.round(value * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace('.', ',');
}

export function formatInt(value) {
  return Math.round(value).toLocaleString('de-DE');
}

export function formatGrams(g) {
  if (g >= 1000) return (g / 1000).toFixed(1).replace('.', ',') + ' kg';
  return Math.round(g) + ' g';
}

export function formatAmount(grams, gramsPerPiece) {
  if (!gramsPerPiece) return formatGrams(grams);
  return `${formatNumber(grams / gramsPerPiece)} Stück · ${formatGrams(grams)}`;
}

export function weekdayDate(date) {
  return new Date(date).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

export function shortDay(date) {
  return new Date(date).toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '');
}

export function startOfDay(t) {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

export function suggestedMeal(t = Date.now()) {
  const h = new Date(t).getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 15) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

// MARK: Produkte & Mengen

export function macrosFor(p, grams) {
  const f = grams / 100;
  return { kcal: p.kcal * f, carbs: p.carbs * f, fat: p.fat * f, protein: p.protein * f };
}

export function addMacros(a, b) {
  return { kcal: a.kcal + b.kcal, carbs: a.carbs + b.carbs, fat: a.fat + b.fat, protein: a.protein + b.protein };
}

export const ZERO = { kcal: 0, carbs: 0, fat: 0, protein: 0 };

export function gramsFor(p, amount, unit) {
  return unit === 'piece' ? amount * (p.gramsPerPiece || 100) : amount;
}

export function amountFor(p, grams, unit) {
  return unit === 'piece' ? grams / (p.gramsPerPiece || 100) : grams;
}

export function preferredUnit(p) {
  return p.gramsPerPiece ? 'piece' : 'gram';
}

export function displayName(p) {
  if (p.brand && !p.name.toLowerCase().includes(p.brand.toLowerCase())) return `${p.name} (${p.brand})`;
  return p.name;
}

export function newProduct(fields) {
  return {
    id: uid(), barcode: null, name: '', brand: null, kcal: 0, carbs: 0, fat: 0, protein: 0,
    packageGrams: null, gramsPerPiece: null, isGeneric: false, source: 'manual', minStockGrams: null,
    createdAt: Date.now(), ...fields,
  };
}

export function productFromGeneric(food) {
  return newProduct({
    name: food.name, kcal: food.kcal, carbs: food.carbs, fat: food.fat, protein: food.protein,
    gramsPerPiece: food.piece || null, isGeneric: true, source: 'catalog',
  });
}

export function findProduct(state, id) {
  return state.products.find((p) => p.id === id);
}

/** Vorhandenes Produkt mit gleichem Barcode bzw. (lose Ware) gleichem Namen – sonst neu anlegen. */
export function upsertProduct(state, candidate) {
  const existing = candidate.barcode
    ? state.products.find((p) => p.barcode === candidate.barcode)
    : state.products.find((p) => !p.barcode && p.name === candidate.name);
  if (existing) return existing;
  state.products.push(candidate);
  return candidate;
}

export function stockGrams(state, productId) {
  return state.pantry
    .filter((i) => i.productId === productId)
    .reduce((sum, i) => sum + Math.max(0, i.remainingGrams), 0);
}

// MARK: Vorrat & Tagebuch

export function addToPantry(state, productId, grams, location, expiresAt = null, date = Date.now()) {
  const item = { id: uid(), productId, initialGrams: grams, remainingGrams: grams, location, addedAt: date, expiresAt };
  state.pantry.push(item);
  return item;
}

/** Zuerst, was früher abläuft, dann das Älteste. */
export function consumptionOrder(a, b) {
  if (a.expiresAt && b.expiresAt && a.expiresAt !== b.expiresAt) return a.expiresAt - b.expiresAt;
  if (a.expiresAt && !b.expiresAt) return -1;
  if (!a.expiresAt && b.expiresAt) return 1;
  return a.addedAt - b.addedAt;
}

export function logFood(state, productId, grams, meal, date = Date.now()) {
  const product = findProduct(state, productId);
  let open = grams;
  const deductions = [];
  const items = state.pantry
    .filter((i) => i.productId === productId && i.remainingGrams > 0.5)
    .sort(consumptionOrder);
  for (const item of items) {
    if (open <= 0) break;
    const take = Math.min(item.remainingGrams, open);
    item.remainingGrams -= take;
    open -= take;
    deductions.push({ pantryItemId: item.id, grams: take, location: item.location });
  }
  const m = macrosFor(product, grams);
  const entry = {
    id: uid(), date, meal, productId, productName: product.name, grams,
    ...m, deductions, missingGrams: Math.max(0, open),
  };
  state.log.push(entry);
  return entry;
}

/** Löscht einen Eintrag und bucht die abgezogenen Mengen zurück. */
export function deleteEntry(state, entryId) {
  const entry = state.log.find((e) => e.id === entryId);
  if (!entry) return;
  for (const d of entry.deductions) {
    const item = state.pantry.find((i) => i.id === d.pantryItemId);
    if (item) item.remainingGrams += d.grams;
    else if (findProduct(state, entry.productId)) addToPantry(state, entry.productId, d.grams, d.location);
  }
  state.log = state.log.filter((e) => e.id !== entryId);
}

export function entriesOn(state, day) {
  const start = startOfDay(day);
  const end = start + DAY;
  return state.log.filter((e) => e.date >= start && e.date < end).sort((a, b) => a.date - b.date);
}

export function consumedOn(state, day) {
  return entriesOn(state, day).reduce((m, e) => addMacros(m, e), { ...ZERO });
}

// MARK: Verbrauchsanalyse

export const WINDOW_DAYS = 28;

export function weight(daysAgo) {
  return daysAgo < 7 ? 1 : daysAgo < 14 ? 0.75 : 0.5;
}

export function consumptionStats(consumption, purchases, trackingStart, now = Date.now()) {
  const today = startOfDay(now);
  const windowStart = today - (WINDOW_DAYS - 1) * DAY;
  const firstDay = Math.max(windowStart, startOfDay(trackingStart ?? today));
  const observedDays = Math.max(1, daysBetween(firstDay, today) + 1);
  let weightSum = 0;
  for (let i = 0; i < observedDays; i++) weightSum += weight(i);

  const ago = (t) => {
    const d = daysBetween(t, today);
    return d >= 0 && d < WINDOW_DAYS ? d : null;
  };

  const weighted = {}, days = {}, bought = {};
  for (const e of consumption) {
    const a = ago(e.date);
    if (a === null || a >= observedDays) continue;
    weighted[e.productId] = (weighted[e.productId] || 0) + e.grams * weight(a);
    (days[e.productId] ||= new Set()).add(a);
  }
  for (const p of purchases) {
    if (ago(p.date) === null) continue;
    (bought[p.productId] ||= []).push(p);
  }

  const result = {};
  for (const id of new Set([...Object.keys(weighted), ...Object.keys(bought)])) {
    const list = bought[id] || [];
    const amounts = list.map((p) => p.grams).sort((a, b) => a - b);
    result[id] = {
      productId: id,
      dailyUsage: (weighted[id] || 0) / weightSum,
      usageDays: days[id]?.size || 0,
      purchaseCount: list.length,
      typicalPurchaseGrams: amounts.length ? amounts[Math.floor(amounts.length / 2)] : null,
    };
  }
  return result;
}

export function snapshot(state) {
  const sortedLog = [...state.log].sort((a, b) => a.date - b.date);
  return {
    stock: state.products.map((p) => ({
      productId: p.id, name: p.name, stockGrams: stockGrams(state, p.id),
      gramsPerPiece: p.gramsPerPiece, packageGrams: p.packageGrams, minStockGrams: p.minStockGrams,
    })),
    consumption: sortedLog.map((e) => ({ productId: e.productId, date: e.date, grams: e.grams })),
    purchases: state.pantry.map((i) => ({ productId: i.productId, date: i.addedAt, grams: i.initialGrams })),
    trackingStart: sortedLog[0]?.date ?? null,
  };
}

// MARK: Einkaufsplanung

export const REGULAR_USAGE_DAYS = 2;
export const SOON_EMPTY_DAYS = 2;
export const COVER_DAYS = 7;

export function roundUp(grams, pkg, piece) {
  if (grams <= 0) return 0;
  if (pkg > 0) return Math.ceil(grams / pkg) * pkg;
  if (piece > 0) return Math.ceil(grams / piece) * piece;
  return Math.ceil(grams / 50) * 50;
}

export function amountText(grams, piece) {
  return piece > 0 ? `${formatNumber(grams / piece)} Stück` : formatGrams(grams);
}

export function shortages(stock, stats, nextShopping, now = Date.now()) {
  const result = [];
  for (const item of stock) {
    const s = stats[item.productId];
    const usage = s?.dailyUsage || 0;
    const regular = (s?.usageDays || 0) >= REGULAR_USAGE_DAYS && usage > 0;
    const daysLeft = usage > 0 ? item.stockGrams / usage : Infinity;
    const depletion = Number.isFinite(daysLeft) ? now + daysLeft * DAY : null;

    let kind = null, reason = '';
    if (regular && nextShopping && nextShopping > now) {
      const daysUntil = (nextShopping - now) / DAY;
      if (item.stockGrams < usage * daysUntil) {
        kind = 'untilShopping';
        reason = `Noch ${amountText(item.stockGrams, item.gramsPerPiece)}, Verbrauch ~${amountText(usage, item.gramsPerPiece)}/Tag – reicht nicht bis ${shortDay(nextShopping)}.`;
      }
    } else if (regular && daysLeft <= SOON_EMPTY_DAYS) {
      kind = 'soonEmpty';
      reason = daysLeft < 1 ? 'Heute voraussichtlich leer.' : `In ca. ${Math.round(daysLeft)} Tagen leer.`;
    }
    if (!kind && item.minStockGrams && item.stockGrams < item.minStockGrams) {
      kind = 'belowMinimum';
      reason = `Unter Mindestbestand (${amountText(item.minStockGrams, item.gramsPerPiece)}).`;
    }
    if (!kind) continue;

    const target = usage * COVER_DAYS + (item.minStockGrams || 0);
    const needed = Math.max(target - item.stockGrams, s?.typicalPurchaseGrams || 0, item.minStockGrams || 0);
    result.push({
      productId: item.productId, name: item.name, kind, stockGrams: item.stockGrams, dailyUsage: usage,
      depletionDate: depletion, recommendedGrams: roundUp(needed, item.packageGrams, item.gramsPerPiece),
      gramsPerPiece: item.gramsPerPiece, reason,
    });
  }
  return result.sort((a, b) => (a.depletionDate ?? Infinity) - (b.depletionDate ?? Infinity));
}

export function suggestions(stock, stats, excluded, limit = 12) {
  const byId = Object.fromEntries(stock.map((s) => [s.productId, s]));
  return Object.values(stats)
    .filter((s) => !excluded.has(s.productId))
    .filter((s) => s.purchaseCount >= 2 || s.usageDays >= 4)
    .map((s) => {
      const item = byId[s.productId];
      if (!item) return null;
      const reach = s.dailyUsage > 0 ? item.stockGrams / s.dailyUsage : Infinity;
      if (reach > 10) return null;
      const grams = roundUp(Math.max(s.typicalPurchaseGrams || 0, s.dailyUsage * COVER_DAYS), item.packageGrams, item.gramsPerPiece);
      if (grams <= 0) return null;
      const reason = s.purchaseCount >= 2 ? `${s.purchaseCount}× in 4 Wochen gekauft` : `an ${s.usageDays} Tagen gegessen`;
      return { productId: s.productId, name: item.name, recommendedGrams: grams, gramsPerPiece: item.gramsPerPiece, reason, score: s.purchaseCount * 2 + s.usageDays };
    })
    .filter(Boolean)
    .sort((a, b) => (a.score !== b.score ? b.score - a.score : a.name.localeCompare(b.name)))
    .slice(0, limit);
}

/** Nächster Einkaufstermin ab `now` (weekday: 0 = Sonntag … 6 = Samstag). */
export function nextShopping(schedule, now = Date.now()) {
  if (schedule.mode === 'once') return schedule.onceDate > now ? schedule.onceDate : null;
  if (schedule.mode !== 'weekly') return null;
  const d = new Date(now);
  for (let i = 0; i <= 7; i++) {
    const c = new Date(d.getFullYear(), d.getMonth(), d.getDate() + i, schedule.hour, schedule.minute);
    if (c.getDay() === schedule.weekday && c.getTime() > now) return c.getTime();
  }
  return null;
}

// MARK: Einkaufsliste

export function shoppingAdd(state, { name, productId = null, quantity, unit, source = 'manual', note = null }) {
  const product = productId ? findProduct(state, productId) : null;
  const existing = product && state.shopping.find((i) => !i.checked && i.productId === productId);
  if (existing) {
    if (existing.unit === unit) existing.quantity += quantity;
    else {
      const g = itemGrams(state, existing) + gramsFor(product, quantity, unit);
      existing.quantity = amountFor(product, g, existing.unit);
    }
    if (note) existing.note = note;
    return existing;
  }
  const item = { id: uid(), name, productId, quantity, unit, checked: false, source, note, addedAt: Date.now() };
  state.shopping.push(item);
  return item;
}

export function shoppingAddGrams(state, product, grams, source, note = null) {
  const unit = preferredUnit(product);
  const quantity = Math.round(amountFor(product, grams, unit) * 10) / 10;
  return shoppingAdd(state, { name: product.name, productId: product.id, quantity, unit, source, note });
}

export function itemGrams(state, item) {
  const p = item.productId && findProduct(state, item.productId);
  if (p) return gramsFor(p, item.quantity, item.unit);
  return item.unit === 'gram' ? item.quantity : item.quantity * 100;
}

export function checkout(state, ids, locations) {
  for (const id of ids) {
    const item = state.shopping.find((i) => i.id === id);
    if (item?.productId && findProduct(state, item.productId)) {
      addToPantry(state, item.productId, itemGrams(state, item), locations[id] || 'fridge');
    }
  }
  state.shopping = state.shopping.filter((i) => !ids.includes(i.id));
}

/** Zerlegt „3 Bananen“, „500 g Hackfleisch“, „1,5 kg Kartoffeln“ oder „Milch“. */
export function parseFreeText(text) {
  const t = text.trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(g|kg|stk\.?|stück|x)?\s+(.+)$/i);
  if (!m) return { name: t, quantity: null, unit: null };
  const n = parseFloat(m[1].replace(',', '.'));
  const u = (m[2] || '').toLowerCase();
  if (u === 'g') return { name: m[3], quantity: n, unit: 'gram' };
  if (u === 'kg') return { name: m[3], quantity: n * 1000, unit: 'gram' };
  return { name: singular(m[3]), quantity: n, unit: 'piece' };
}

export function singular(word) {
  const irregular = { eier: 'Ei', äpfel: 'Apfel', brötchen: 'Brötchen', tomaten: 'Tomate', zwiebeln: 'Zwiebel', gurken: 'Gurke', karotten: 'Karotte', kartoffeln: 'Kartoffeln' };
  const hit = irregular[word.toLowerCase()];
  if (hit) return hit;
  if (word.endsWith('nen')) return word.slice(0, -1);
  return word;
}

// MARK: Katalog-Suche

export function normalize(s) {
  return s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export function searchCatalog(foods, term) {
  const needle = normalize(term);
  if (!needle) return foods;
  return foods
    .filter((f) => normalize(f.name).includes(needle) || normalize(f.category).includes(needle))
    .sort((a, b) => {
      const pa = normalize(a.name).startsWith(needle), pb = normalize(b.name).startsWith(needle);
      return pa !== pb ? (pa ? -1 : 1) : a.name.localeCompare(b.name);
    });
}

// MARK: Open Food Facts

function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function parseQuantity(text) {
  if (!text) return null;
  const m = text.toLowerCase().replace(',', '.').match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|ml|cl|l)\b/);
  if (!m) return null;
  const n = parseFloat(m[1]);
  return m[2] === 'kg' || m[2] === 'l' ? n * 1000 : m[2] === 'cl' ? n * 10 : n;
}

export function offProductInfo(raw, barcode) {
  const name = [raw.product_name_de, raw.product_name].map((s) => s?.trim()).find((s) => s);
  if (!name) return null;
  const n = raw.nutriments || {};
  const kj = num(n['energy_100g']);
  const kcal = num(n['energy-kcal_100g']) ?? (kj !== null ? kj / 4.184 : null);
  const carbs = num(n['carbohydrates_100g']);
  const fat = num(n['fat_100g']);
  const protein = num(n['proteins_100g']);
  return {
    barcode: barcode ?? raw.code ?? null,
    name,
    brand: raw.brands ? raw.brands.split(',')[0].trim() : null,
    kcal: kcal ?? 0, carbs: carbs ?? 0, fat: fat ?? 0, protein: protein ?? 0,
    packageGrams: num(raw.product_quantity) ?? parseQuantity(raw.quantity),
    incomplete: kcal === null || carbs === null || fat === null || protein === null,
  };
}

export function parseOFFProduct(json, barcode) {
  if (json.status !== 1 || !json.product) return null;
  return offProductInfo(json.product, barcode);
}

export function parseOFFSearch(json) {
  return (json.products || []).map((p) => offProductInfo(p, p.code)).filter(Boolean);
}
