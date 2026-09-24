import { LINES, pick } from './dialogue.js';
import { STORAGE_KEY, freshState, loadState, saveState, advanceTime, change } from './state.js';
import { partOfDay, TIME_NAMES, nightKey, sleepsOnNight } from './time.js';
import { SPRITES } from './sprites.js';
import { chooseBehavior, nextBehaviorDelay } from './behaviors.js';
import { GADGETS, GADGET_BY_ID } from './gadgets.js';
import { GAMES, GAME_BY_ID, cardLabel } from './games.js';
import { FOODS, FOOD_BY_ID } from './foods.js';

const $ = id => document.getElementById(id);
const DEBUG_IDLE = new URLSearchParams(location.search).get('debug') === '1';
const els = {
  gordon: $('gordon'), room: document.querySelector('.room'), emote: $('emote'),
  debug: $('idle-debug'), roomGadgets: $('room-gadgets'), heldGadget: $('held-gadget'),
  activityPanel: $('activity-panel'), activityTitle: $('activity-title'), activityContent: $('activity-content'),
  roomNote: document.querySelector('.room-note'),
  sprite: $('gordon-sprite'),
  effect: $('effect-layer'), cue: $('condition-cue'), speechBox: document.querySelector('.speech'),
  speech: $('speech-text'), speechMark: $('speech-mark'), time: $('time-label'),
  caption: $('state-caption'), hunger: $('hunger-label'), energy: $('energy-label'),
  mood: $('mood-label'), interest: $('interest-label'), save: $('save-label')
};
let state = loadState();
const returnAfterMs = Math.max(0, Date.now() - state.lastAccessAt);
let firstAmbientSinceOpen = true;
let activePanel = null;
let gameSession = null;
let currentGame = null;
let rapidTaps = 0;
let lastTapAt = 0;
let speechTimer;
let reactionTimer;
let effectTimer;
let poseTimer;
let ambientTimer;
let activeAmbient;
els.debug.hidden = !DEBUG_IDLE;

function setSprite(pose, frame = 1, frameCount = 1) {
  const sprite = SPRITES[pose];
  if (DEBUG_IDLE) {
    els.debug.textContent = `idle: ${activeAmbient?.id ?? 'idle'} · frame ${frame}/${frameCount} · ${sprite.src.split('/').at(-1)}`;
  }
  if (els.room.dataset.pose === pose) return;
  els.room.dataset.pose = pose;
  els.sprite.src = sprite.src;
  els.sprite.alt = sprite.alt;
  els.sprite.classList.remove('pose-enter');
  void els.sprite.offsetWidth;
  els.sprite.classList.add('pose-enter');
}

function baseSprite() {
  setSprite(isSleeping() ? 'rest' : 'idle');
}

function showSprite(pose, duration, onFinish) {
  clearTimeout(poseTimer);
  setSprite(pose);
  poseTimer = setTimeout(() => {
    poseTimer = undefined;
    if (onFinish) onFinish();
    else baseSprite();
  }, duration);
}

for (const sprite of Object.values(SPRITES)) {
  const preload = new Image();
  preload.src = sprite.src;
}

function cancelAmbient() {
  clearTimeout(ambientTimer);
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (!activeAmbient) return;
  activeAmbient = undefined;
  clearTimeout(poseTimer);
  poseTimer = undefined;
  delete els.room.dataset.ambient;
  els.roomNote.textContent = '';
  els.heldGadget.hidden = true;
  baseSprite();
}

function scheduleAmbient() {
  clearTimeout(ambientTimer);
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (document.hidden || isSleeping() || activePanel) return;
  const returningWithGadget = returnAfterMs >= 12 * 60 * 60 * 1000
    && firstAmbientSinceOpen && state.ownedGadgets.some(id => GADGET_BY_ID[id]);
  const delay = returningWithGadget ? 3000 + Math.floor(Math.random() * 4000)
    : nextBehaviorDelay(Math.random, DEBUG_IDLE);
  els.room.dataset.nextAmbientAt = String(Date.now() + delay);
  ambientTimer = setTimeout(startAmbient, delay);
}

function finishAmbient(behavior) {
  if (activeAmbient !== behavior) return;
  activeAmbient = undefined;
  delete els.room.dataset.ambient;
  els.roomNote.textContent = '';
  els.heldGadget.hidden = true;
  if (partOfDay() === 'late' && state.nightSleepEligible) {
    if (behavior.nightStageAfter === state.nightStage + 1) state.nightStage = behavior.nightStageAfter;
  }
  baseSprite();
  persist();
  if (behavior.returnsTo !== 'sleep') scheduleAmbient();
}

function playAmbientFrames(behavior) {
  const frames = behavior.frames;
  const frameMs = behavior.durationMs / frames.length;
  let index = 0;
  const advance = () => {
    if (activeAmbient !== behavior) return;
    if (index === frames.length) {
      poseTimer = undefined;
      finishAmbient(behavior);
      return;
    }
    setSprite(frames[index], index + 1, frames.length);
    index++;
    poseTimer = setTimeout(advance, frameMs);
  };
  advance();
}

function startAmbient() {
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (document.hidden || activeAmbient || activePanel) return;
  const now = Date.now();
  advanceTime(state, now);
  syncClock(new Date(now));
  render();
  if (isSleeping() || poseTimer) {
    if (!isSleeping()) scheduleAmbient();
    return;
  }
  const behavior = chooseBehavior({
    sleeping: false, time: partOfDay(new Date(now)), energy: state.energy,
    mood: state.mood, interest: state.interest, sleepEligible: state.nightSleepEligible,
    nightStage: state.nightStage, idleMs: Math.max(0, now - state.lastInteractionAt),
    ownedGadgets: state.ownedGadgets, returnAfterMs, firstAmbientSinceOpen
  });
  if (!behavior) { scheduleAmbient(); return; }
  firstAmbientSinceOpen = false;
  activeAmbient = behavior;
  els.room.dataset.ambient = behavior.id;
  els.roomNote.textContent = behavior.caption;
  if (behavior.requiresGadget) {
    els.heldGadget.innerHTML = GADGET_BY_ID[behavior.requiresGadget].icon;
    els.heldGadget.hidden = false;
  }
  if (behavior.returnsTo === 'sleep') {
    state.asleepTonight = true;
    state.nightStage = behavior.nightStageAfter;
    persist(now);
  }
  playAmbientFrames(behavior);
  if (behavior.returnsTo === 'sleep') render();
}

function noteInteraction(now) {
  cancelAmbient();
  state.lastInteractionAt = now;
  if (!state.asleepTonight) state.nightStage = 0;
}

function say(line) {
  els.speech.classList.remove('appear');
  els.speechBox.classList.remove('is-speaking');
  void els.speech.offsetWidth;
  els.speech.textContent = line;
  els.speech.classList.add('appear');
  els.speechBox.classList.add('is-speaking');
  clearTimeout(speechTimer);
  speechTimer = setTimeout(() => {
    els.speech.classList.remove('appear');
    els.speechBox.classList.remove('is-speaking');
  }, 450);
}

function react(type, mark = '') {
  clearTimeout(reactionTimer);
  els.room.classList.remove('reacting', 'show-emote');
  void els.room.offsetWidth;
  els.room.dataset.reaction = type;
  els.emote.textContent = mark;
  els.room.classList.add('reacting');
  if (mark) els.room.classList.add('show-emote');
  reactionTimer = setTimeout(() => els.room.classList.remove('reacting', 'show-emote'), 1700);
}

function showEffect(type) {
  const symbols = { feed: ['▣', '〰', '〰'], pet: ['♥', '♪', '♡'], rest: ['Z', 'z', 'z'] };
  clearTimeout(effectTimer);
  els.effect.replaceChildren();
  els.effect.dataset.effect = type;
  for (const symbol of symbols[type]) {
    const particle = document.createElement('span');
    particle.className = 'effect';
    particle.textContent = symbol;
    els.effect.append(particle);
  }
  effectTimer = setTimeout(() => els.effect.replaceChildren(), 1900);
}

function press(id) {
  const button = $(id);
  button.classList.remove('pressed');
  void button.offsetWidth;
  button.classList.add('pressed');
  setTimeout(() => button.classList.remove('pressed'), 210);
}

function syncClock(now = new Date()) {
  const part = partOfDay(now);
  if (part === 'late') {
    const key = nightKey(now);
    if (state.sleepDay !== key) {
      state.sleepDay = key;
      state.nightSleepEligible = sleepsOnNight(key);
      state.asleepTonight = false;
      state.nightStage = 0;
      state.currentNightWakeCount = 0;
    }
  } else {
    state.asleepTonight = false;
    state.nightSleepEligible = false;
    state.nightStage = 0;
    state.currentNightWakeCount = 0;
  }
  els.time.textContent = TIME_NAMES[part];
  document.body.dataset.time = part;
}

function isSleeping(now = Date.now()) {
  return state.asleepTonight || state.restingUntil > now;
}

function render() {
  const sleeping = isSleeping();
  document.body.classList.toggle('sleeping', sleeping);
  const condition = sleeping ? 'sleeping' : state.energy < 48 ? 'tired' : state.hunger >= 58 ? 'hungry'
    : state.mood < 50 ? 'moody' : state.interest >= 75 ? 'curious' : 'neutral';
  document.body.dataset.condition = condition;
  els.speechMark.textContent = { sleeping: 'z z', tired: '☾', hungry: '◌', moody: '…', curious: '✦', neutral: '✧' }[condition];
  els.cue.textContent = { tired: '…', hungry: 'ぐぅ…', moody: '…', curious: '？' }[condition] || '';
  els.gordon.setAttribute('aria-label', sleeping ? '寝ているゴードンをタップする' : 'ゴードンをタップする');
  els.hunger.textContent = state.hunger >= 58 ? '腹が減った' : state.hunger <= 22 ? '満腹' : 'ふつう';
  els.energy.textContent = state.energy < 48 ? '少し疲れた' : state.energy >= 78 ? '余裕あり' : 'ふつう';
  els.mood.textContent = state.mood < 50 ? '静か' : state.mood >= 75 ? '悪くない' : 'ふつう';
  els.interest.textContent = state.interest < 48 ? '退屈ぎみ' : state.interest >= 75 ? '興味あり' : 'ふつう';
  els.caption.textContent = sleeping ? 'うとうとしている' : state.hunger >= 58 ? '腹が減っている' : state.energy < 48 ? '少し疲れている' : 'いつもどおり';
  if (!poseTimer) baseSprite();
}

function persist(now = Date.now()) {
  state.lastUpdatedAt = now;
  state.lastAccessAt = now;
  els.save.textContent = saveState(state) ? 'この端末に保存済み' : '保存できませんでした';
}

function wakeForAction() {
  state.restingUntil = 0;
  state.asleepTonight = false;
  state.nightStage = 0;
}

function closePanel(reschedule = true) {
  if (!activePanel) return;
  activePanel = null;
  gameSession = null;
  currentGame = null;
  els.activityPanel.hidden = true;
  els.activityContent.replaceChildren();
  if (reschedule) scheduleAmbient();
}

function openPanel(kind, title) {
  noteInteraction(Date.now());
  activePanel = kind;
  els.activityTitle.textContent = title;
  els.activityPanel.hidden = false;
  els.activityContent.replaceChildren();
  requestAnimationFrame(() => els.activityPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
}

function renderRoomGadgets() {
  els.roomGadgets.replaceChildren();
  for (const id of state.ownedGadgets) {
    const gadget = GADGET_BY_ID[id];
    if (!gadget) continue;
    const prop = document.createElement('span');
    prop.className = 'room-gadget';
    prop.dataset.gadget = gadget.id;
    prop.title = gadget.name;
    prop.innerHTML = gadget.icon;
    for (const [key, value] of Object.entries(gadget.roomDecoration)) prop.style[key] = value;
    els.roomGadgets.append(prop);
  }
}

function renderGadgetPanel() {
  els.activityContent.innerHTML = `<p class="activity-intro">渡した物はこの部屋に残る。気が向けば、勝手に使う。</p><div class="gadget-list"></div>`;
  const list = els.activityContent.querySelector('.gadget-list');
  for (const gadget of GADGETS) {
    const owned = state.ownedGadgets.includes(gadget.id);
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'gadget-choice';
    item.disabled = owned;
    item.dataset.gadgetId = gadget.id;
    item.innerHTML = `<span class="gadget-icon">${gadget.icon}</span><span class="gadget-copy"><strong>${gadget.name}</strong><small>${gadget.description}</small></span><span class="gadget-badge">${owned ? '所持中' : '渡す'}</span>`;
    list.append(item);
  }
}

function openGadgets() {
  press('gadget-btn');
  openPanel('gadgets', 'ガジェット');
  renderGadgetPanel();
}

function acquireGadget(id) {
  const gadget = GADGET_BY_ID[id];
  if (!gadget) return;
  const now = Date.now();
  noteInteraction(now);
  if (state.ownedGadgets.includes(id)) { say(gadget.ownedDialogue); return; }
  advanceTime(state, now);
  wakeForAction();
  state.ownedGadgets.push(id);
  change(state, 'interest', 3);
  say(gadget.acquireDialogue);
  react('tap', '…');
  showSprite('look', 2300);
  renderRoomGadgets();
  renderGadgetPanel();
  render();
  persist(now);
}

function renderGame() {
  if (!currentGame || !gameSession) return;
  const session = gameSession;
  const result = session.next === null ? '次の一枚を予想しろ。' : `${session.result}。次は ${cardLabel(session.next)}。`;
  els.activityContent.innerHTML = `<p class="activity-intro">${currentGame.description}</p><div class="card-table"><div class="playing-card"><small>いま</small><b>${cardLabel(session.current)}</b><span>♠</span></div><span class="card-arrow">→</span><div class="playing-card ${session.next === null ? 'is-back' : ''}"><small>つぎ</small><b>${session.next === null ? '?' : cardLabel(session.next)}</b><span>${session.next === null ? '✧' : '♠'}</span></div></div><p class="game-result" aria-live="polite">${result}</p><div class="game-controls">${session.next === null ? '<button type="button" data-guess="high">HIGH ↑</button><button type="button" data-guess="low">LOW ↓</button>' : '<button type="button" data-next-round>もう一回</button>'}</div>`;
}

function startGame(id) {
  const game = GAME_BY_ID[id];
  if (!game) return;
  const now = Date.now();
  noteInteraction(now);
  advanceTime(state, now);
  wakeForAction();
  currentGame = game;
  gameSession = game.create();
  activePanel = 'game';
  els.activityTitle.textContent = game.name;
  els.activityPanel.hidden = false;
  say('一枚勝負か。いいぜ。');
  showSprite('sit', 1900);
  renderGame();
  render();
  persist(now);
}

function openGames() {
  press('play-btn');
  openPanel('games', 'あそぶ');
  if (GAMES.length === 1) { startGame(GAMES[0].id); return; }
  els.activityContent.innerHTML = `<div class="game-list">${GAMES.map(game => `<button type="button" data-game-id="${game.id}"><strong>${game.name}</strong><small>${game.description}</small></button>`).join('')}</div>`;
}

function guessCard(direction) {
  if (!currentGame || !gameSession) return;
  const now = Date.now();
  noteInteraction(now);
  const outcome = currentGame.guess(gameSession, direction);
  if (!outcome) return;
  change(state, 'interest', 2);
  if (outcome.won) change(state, 'mood', 1);
  say(outcome.line);
  react(outcome.won ? 'annoyed' : 'tap', outcome.won ? '…' : '✦');
  showSprite(outcome.won ? 'annoyed' : 'look', 2000);
  renderGame();
  render();
  persist(now);
}

function tapGordon() {
  closePanel(false);
  const now = Date.now();
  noteInteraction(now);
  advanceTime(state, now);
  syncClock(new Date(now));
  state.tapCount++;
  let reaction = 'tap';
  let mark = '?';
  if (state.asleepTonight && partOfDay(new Date(now)) === 'late') {
    state.nightWakeCount++;
    state.currentNightWakeCount++;
    const index = Math.min(state.currentNightWakeCount, 3) - 1;
    say(LINES.sleepingTap[index]);
    reaction = index === 0 ? 'tap' : index === 1 ? 'annoyed' : 'fedup';
    mark = index === 0 ? '…' : '!';
  } else if (state.restingUntil > now) {
    state.restingUntil = 0;
    say(LINES.restedTap);
    mark = '…';
  } else {
    rapidTaps = now - lastTapAt > 12000 ? 1 : rapidTaps + 1;
    lastTapAt = now;
    change(state, 'interest', 0.5);
    say(rapidTaps >= 6 ? LINES.tapFedUp : rapidTaps >= 3 ? LINES.tapAnnoyed : pick(LINES.tap));
    reaction = rapidTaps >= 6 ? 'fedup' : rapidTaps >= 3 ? 'annoyed' : 'tap';
    mark = rapidTaps >= 6 ? '!' : rapidTaps >= 3 ? '…' : '?';
  }
  react(reaction, mark);
  render();
  showSprite(reaction === 'tap' ? 'look' : 'annoyed', reaction === 'tap' ? 1850 : 2300);
  persist(now);
  scheduleAmbient();
}

function feed(food = FOODS[0]) {
  closePanel(false);
  const now = Date.now();
  noteInteraction(now);
  advanceTime(state, now);
  const category = state.hunger >= 58 ? 'hungry' : state.hunger <= 22 ? 'full' : 'normal';
  if (category !== 'full') {
    change(state, 'hunger', food.hungerDelta);
    change(state, 'mood', food.moodDelta);
  }
  wakeForAction();
  press('feed-btn');
  say(pick(LINES[food.dialogueKey][category]));
  render();
  if (category === 'full') {
    react('annoyed', '…');
    showSprite('annoyed', 1900);
  } else {
    showSprite('sit', 620, () => {
      react('feed');
      showEffect('feed');
      showSprite(food.sprite, 2300);
    });
  }
  persist(now);
  scheduleAmbient();
}

function openFood() {
  if (FOODS.length === 1) { feed(FOODS[0]); return; }
  press('feed-btn');
  openPanel('foods', '飯');
  els.activityContent.innerHTML = `<p class="activity-intro">今日は何を渡す？</p><div class="game-list">${FOODS.map(food => `<button type="button" data-food-id="${food.id}"><strong>${food.name}</strong><small>${food.description}</small></button>`).join('')}</div>`;
}

function pet() {
  closePanel(false);
  const now = Date.now();
  noteInteraction(now);
  advanceTime(state, now);
  const category = state.familiarity < 28 ? 'new' : state.familiarity < 67 ? 'known' : 'close';
  change(state, 'mood', 3);
  change(state, 'familiarity', 2);
  state.petCount++;
  wakeForAction();
  press('pet-btn');
  react('pet', category === 'new' ? '?' : '');
  showEffect('pet');
  say(pick(LINES.pet[category]));
  render();
  showSprite('pet', 2600);
  persist(now);
  scheduleAmbient();
}

function rest() {
  closePanel(false);
  const now = Date.now();
  noteInteraction(now);
  advanceTime(state, now);
  const tired = state.energy < 70;
  if (tired) {
    change(state, 'energy', 24);
    state.restingUntil = now + 20 * 60 * 1000;
  }
  press('rest-btn');
  react(tired ? 'rest' : 'annoyed', tired ? '' : '…');
  showEffect('rest');
  say(pick(LINES.rest[tired ? 'tired' : 'fine']));
  render();
  if (tired) {
    showSprite('sit', 700, () => setSprite('rest'));
  } else showSprite('annoyed', 1900);
  persist(now);
  scheduleAmbient();
}

function reset() {
  if (!window.confirm('ゴードンの状態・回数・ガジェットの所持をすべて初期化します。元には戻せません。よろしいですか？')) return;
  cancelAmbient();
  closePanel(false);
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* 保存不可の環境でも画面は初期化 */ }
  state = freshState();
  rapidTaps = 0;
  lastTapAt = 0;
  els.room.classList.remove('reacting', 'show-emote');
  els.effect.replaceChildren();
  els.heldGadget.hidden = true;
  clearTimeout(poseTimer);
  poseTimer = undefined;
  syncClock();
  say(pick(LINES.reset));
  render();
  renderRoomGadgets();
  persist();
  scheduleAmbient();
}

function tick() {
  const now = Date.now();
  advanceTime(state, now);
  syncClock(new Date(now));
  render();
  persist(now);
  if (!isSleeping(now) && !ambientTimer && !activeAmbient && !activePanel && !document.hidden) scheduleAmbient();
}

els.gordon.addEventListener('click', tapGordon);
$('feed-btn').addEventListener('click', openFood);
$('play-btn').addEventListener('click', openGames);
$('gadget-btn').addEventListener('click', openGadgets);
$('pet-btn').addEventListener('click', pet);
$('rest-btn').addEventListener('click', rest);
$('reset-btn').addEventListener('click', reset);
$('panel-close').addEventListener('click', () => closePanel());
els.activityContent.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.gadgetId) acquireGadget(button.dataset.gadgetId);
  else if (button.dataset.gameId) startGame(button.dataset.gameId);
  else if (button.dataset.foodId) feed(FOOD_BY_ID[button.dataset.foodId]);
  else if (button.dataset.guess) guessCard(button.dataset.guess);
  else if (button.hasAttribute('data-next-round') && currentGame && gameSession) {
    currentGame.advance(gameSession);
    renderGame();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) cancelAmbient();
  else { tick(); scheduleAmbient(); }
});
window.addEventListener('pageshow', () => {
  if (!ambientTimer && !activeAmbient && !activePanel && !isSleeping()) scheduleAmbient();
});
setInterval(tick, 60 * 1000);

advanceTime(state);
document.body.dataset.appVersion = 'games-gadgets-1';
syncClock();
state.lastInteractionAt = Date.now();
say(isSleeping() ? pick(LINES.sleeping) : state.familiarity >= 50 ? pick(LINES.arrivalFamiliar) : pick(LINES.arrival[partOfDay()]));
render();
renderRoomGadgets();
persist();
scheduleAmbient();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
