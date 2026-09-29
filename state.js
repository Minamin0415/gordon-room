// Pages の別プロジェクトは同じ origin を共有するので、公開パスごとに保存先を分ける。
// ルート公開時は従来のキーを維持し、既存の端末データをそのまま使う。
const APP_PATH = new URL('.', import.meta.url).pathname;
export const STORAGE_KEY = APP_PATH === '/' ? 'gordon-pet-v0' : `gordon-pet-v0:${APP_PATH}`;
const HOUR = 60 * 60 * 1000;
const LONG_NEED = 2 * HOUR;
const clamp = (n, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const NEEDS = {
  hunger: { threshold: 58, rate: 5, active: value => value >= 58 },
  energy: { threshold: 48, rate: -2.2, active: value => value <= 48 },
  mood: { threshold: 50, rate: -1.8, active: value => value <= 50 },
  interest: { threshold: 48, rate: -3, active: value => value <= 48 }
};
const emptyNeedSince = () => ({ hunger: 0, energy: 0, mood: 0, interest: 0 });

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
    ownedGadgets: [],
    needSince: emptyNeedSince()
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
    if (parsed.needSince === undefined) parsed.needSince = emptyNeedSince();
    if (!Number.isFinite(parsed.lastInteractionAt) || parsed.lastInteractionAt <= 0
      || typeof parsed.nightSleepEligible !== 'boolean'
      || !Number.isInteger(parsed.nightStage) || parsed.nightStage < 0 || parsed.nightStage > 3
      || !Array.isArray(parsed.ownedGadgets) || parsed.ownedGadgets.length > 100
      || parsed.ownedGadgets.some(id => typeof id !== 'string' || id.length > 60)
      || !parsed.needSince || typeof parsed.needSince !== 'object'
      || Object.keys(NEEDS).some(key => !Number.isFinite(parsed.needSince[key]) || parsed.needSince[key] < 0)) return freshState(now);
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

function trackNeed(state, key, before, previousTime, now) {
  const rule = NEEDS[key];
  if (!rule.active(state[key])) { state.needSince[key] = 0; return; }
  if (rule.active(before)) {
    state.needSince[key] ||= previousTime;
    return;
  }
  const crossing = previousTime + ((rule.threshold - before) / rule.rate) * HOUR;
  state.needSince[key] = Math.min(now, Math.max(previousTime, crossing));
}

export function sustainedNeeds(state, now = Date.now()) {
  return Object.fromEntries(Object.keys(NEEDS)
    .map(key => [key, Boolean(state.needSince?.[key] && now - state.needSince[key] >= LONG_NEED)]));
}

// 数時間で世話のきっかけを作る。何日空けても安全な上下限で止まる。
export function advanceTime(state, now = Date.now()) {
  if (now <= state.lastUpdatedAt) return state;
  state.needSince ||= emptyNeedSince();
  const previousTime = state.lastUpdatedAt;
  const hours = Math.min((now - previousTime) / HOUR, 24 * 365);
  const before = Object.fromEntries(Object.keys(NEEDS).map(key => [key, state[key]]));
  state.hunger = clamp(Math.min(80, state.hunger + hours * NEEDS.hunger.rate));
  state.energy = clamp(Math.max(32, state.energy + hours * NEEDS.energy.rate));
  state.mood = clamp(Math.max(38, state.mood + hours * NEEDS.mood.rate));
  state.interest = clamp(Math.max(35, state.interest + hours * NEEDS.interest.rate));
  for (const key of Object.keys(NEEDS)) trackNeed(state, key, before[key], previousTime, now);

  // 空腹や疲れが長引くと、他の気分にも少し響く。下限は保ち、操作で戻せる。
  const overdueHours = key => state.needSince[key]
    ? Math.max(0, (now - Math.max(previousTime, state.needSince[key] + LONG_NEED)) / HOUR) : 0;
  state.energy = Math.max(32, state.energy - overdueHours('hunger') * .55);
  state.mood = Math.max(38, state.mood - overdueHours('energy') * .45);
  state.interest = Math.max(35, state.interest - overdueHours('mood') * .4);
  for (const key of ['energy', 'mood', 'interest']) trackNeed(state, key, before[key], previousTime, now);
  state.lastUpdatedAt = now;
  if (state.restingUntil && now >= state.restingUntil) state.restingUntil = 0;
  return state;
}

export function change(state, key, amount, now = Date.now()) {
  state.needSince ||= emptyNeedSince();
  const before = state[key];
  state[key] = clamp(state[key] + amount);
  if (NEEDS[key]) trackNeed(state, key, before, now, now);
}
