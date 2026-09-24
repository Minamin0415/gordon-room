// Pages の別プロジェクトは同じ origin を共有するので、公開パスごとに保存先を分ける。
// ルート公開時は従来のキーを維持し、既存の端末データをそのまま使う。
const APP_PATH = new URL('.', import.meta.url).pathname;
export const STORAGE_KEY = APP_PATH === '/' ? 'gordon-pet-v0' : `gordon-pet-v0:${APP_PATH}`;
const DAY = 24 * 60 * 60 * 1000;
const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));

export function freshState(now = Date.now()) {
  return {
    version: 1,
    hunger: 32, // 0 = 満腹、100 = 空腹
    energy: 58,
    mood: 65,
    interest: 60,
    familiarity: 8,
    lastUpdatedAt: now,
    lastAccessAt: now,
    lastInteractionAt: now,
    petCount: 0,
    tapCount: 0,
    nightWakeCount: 0,
    currentNightWakeCount: 0,
    sleepDay: '',
    asleepTonight: false,
    nightSleepEligible: false,
    nightStage: 0,
    restingUntil: 0,
    ownedGadgets: []
  };
}

export function validState(value) {
  if (!value || value.version !== 1) return false;
  const gauges = ['hunger', 'energy', 'mood', 'interest', 'familiarity'];
  const counts = ['petCount', 'tapCount', 'nightWakeCount', 'currentNightWakeCount'];
  return gauges.every(k => Number.isFinite(value[k]) && value[k] >= 0 && value[k] <= 100)
    && counts.every(k => Number.isSafeInteger(value[k]) && value[k] >= 0)
    && Number.isFinite(value.lastUpdatedAt) && value.lastUpdatedAt > 0
    && Number.isFinite(value.lastAccessAt) && value.lastAccessAt > 0
    && Number.isFinite(value.restingUntil) && value.restingUntil >= 0
    && typeof value.sleepDay === 'string'
    && typeof value.asleepTonight === 'boolean';
}

export function loadState(now = Date.now(), storage = localStorage) {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return freshState(now);
    const parsed = JSON.parse(raw);
    if (!validState(parsed)) return freshState(now);
    // V0の保存データを消さず、新しい自発行動用の項目だけ補います。
    if (parsed.lastInteractionAt === undefined) parsed.lastInteractionAt = parsed.lastAccessAt;
    if (parsed.nightSleepEligible === undefined) parsed.nightSleepEligible = parsed.asleepTonight;
    if (parsed.nightStage === undefined) parsed.nightStage = parsed.asleepTonight ? 3 : 0;
    if (parsed.ownedGadgets === undefined) parsed.ownedGadgets = [];
    if (!Number.isFinite(parsed.lastInteractionAt) || parsed.lastInteractionAt <= 0
      || typeof parsed.nightSleepEligible !== 'boolean'
      || !Number.isInteger(parsed.nightStage) || parsed.nightStage < 0 || parsed.nightStage > 3
      || !Array.isArray(parsed.ownedGadgets) || parsed.ownedGadgets.length > 100
      || parsed.ownedGadgets.some(id => typeof id !== 'string' || id.length > 60)) return freshState(now);
    parsed.ownedGadgets = [...new Set(parsed.ownedGadgets)];
    return parsed;
  } catch {
    return freshState(now);
  }
}

export function saveState(state, storage = localStorage) {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// 長期間開かなくても、状態には下限と上限があり、取り返しがつかなくならない。
export function advanceTime(state, now = Date.now()) {
  if (now <= state.lastUpdatedAt) return state;
  const days = Math.min((now - state.lastUpdatedAt) / DAY, 365);
  state.hunger = clamp(Math.min(78, state.hunger + days * 7));
  state.energy = clamp(Math.max(38, state.energy - days * 3));
  state.mood = clamp(Math.max(48, state.mood - days * 2));
  state.interest = clamp(Math.max(38, state.interest - days * 3));
  state.lastUpdatedAt = now;
  if (state.restingUntil && now >= state.restingUntil) state.restingUntil = 0;
  return state;
}

export function change(state, key, amount) {
  state[key] = clamp(state[key] + amount);
}
