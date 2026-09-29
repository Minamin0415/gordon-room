import { LINES, pick } from './dialogue.js';
import { STORAGE_KEY, freshState, loadState, saveState, advanceTime, change, sustainedNeeds } from './state.js';
import { partOfDay, TIME_NAMES, nightKey, sleepsOnNight } from './time.js';
import { SPRITES } from './sprites.js';
import { BEHAVIORS, chooseBehavior, nextBehaviorDelay, chooseMicroMotion, nextMicroDelay } from './behaviors.js';
import { GADGETS, GADGET_BY_ID } from './gadgets.js';
import { GAMES, GAME_BY_ID, cardLabel } from './games.js';
import { FOODS, FOOD_BY_ID } from './foods.js';

const $ = id => document.getElementById(id);
const DEBUG_IDLE = new URLSearchParams(location.search).get('debug') === '1';
const DEBUG_ACTION = DEBUG_IDLE ? new URLSearchParams(location.search).get('action') : null;
// 確認モードは一周目を固定順にし、動作の見逃し・抽選漏れをなくします。
const DEBUG_TOUR = ['lookAround', 'pacing', 'yawn', 'tailFlick', 'hat', 'think', 'trunkTinker', 'sit', 'doze', 'lookAtYou', 'stomach'];
const els = {
  gordon: $('gordon'), room: document.querySelector('.room'), emote: $('emote'),
  debug: $('idle-debug'), roomGadgets: $('room-gadgets'),
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
let activeAmbientStartedAt = 0;
let microReturnTimer;
let microTimer;
let previousMicroId;
let happyUntil = 0;
let debugTourIndex = 0;
let recentAmbientIds = [];
els.debug.hidden = !DEBUG_IDLE;

function setSprite(pose, frame = 1, frameCount = 1) {
  const sprite = SPRITES[pose] || SPRITES.idle;
  if (DEBUG_IDLE) {
    els.debug.textContent = `idle: ${activeAmbient?.id ?? 'idle'} · ${pose} ${frame}/${frameCount} · ${sprite.src.split('/').at(-1)}`;
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

function clearMicro() {
  const wasActive = Boolean(microReturnTimer);
  clearTimeout(microReturnTimer);
  microReturnTimer = undefined;
  delete els.room.dataset.micro;
  if (wasActive && !poseTimer && !activeAmbient) baseSprite();
}

function scheduleMicro() {
  clearTimeout(microTimer);
  microTimer = undefined;
  delete els.room.dataset.nextMicroAt;
  if (document.hidden) return;
  const delay = nextMicroDelay();
  els.room.dataset.nextMicroAt = String(Date.now() + delay);
  microTimer = setTimeout(microTick, delay);
}

function microTick() {
  scheduleMicro();
  if (document.hidden || activeAmbient || activePanel || poseTimer || microReturnTimer || isSleeping()) return;
  const motion = chooseMicroMotion(previousMicroId);
  previousMicroId = motion.id;
  els.room.dataset.micro = motion.id;
  if (motion.pose) setSprite(motion.pose);
  if (DEBUG_IDLE) console.info('micro:start', motion.id, new Date().toISOString());
  microReturnTimer = setTimeout(() => {
    microReturnTimer = undefined;
    delete els.room.dataset.micro;
    if (!activeAmbient && !poseTimer && !isSleeping()) baseSprite();
  }, motion.durationMs);
}

for (const src of new Set(Object.values(SPRITES).map(sprite => sprite.src))) {
  const preload = new Image();
  preload.src = src;
}

function clearAmbientVisuals() {
  delete els.room.dataset.ambient;
  delete els.room.dataset.phase;
  delete els.room.dataset.gadgetActive;
  els.room.classList.remove('ambient-emote');
  els.roomNote.textContent = '';
}

function cancelAmbient() {
  clearMicro();
  clearTimeout(ambientTimer);
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (!activeAmbient) return;
  if (DEBUG_IDLE) {
    els.room.dataset.lastIdleEnd = new Date().toISOString();
    console.info('idle:end', activeAmbient.id, els.room.dataset.lastIdleEnd, 'interrupted', `${Date.now() - activeAmbientStartedAt}ms`);
  }
  activeAmbient = undefined;
  clearTimeout(poseTimer);
  poseTimer = undefined;
  clearAmbientVisuals();
  clearTimeout(effectTimer);
  els.effect.replaceChildren();
  baseSprite();
}

function scheduleAmbient() {
  clearTimeout(ambientTimer);
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (document.hidden || isSleeping() || activePanel) return;
  const delay = nextBehaviorDelay(Math.random, DEBUG_IDLE);
  els.room.dataset.nextAmbientAt = String(Date.now() + delay);
  ambientTimer = setTimeout(startAmbient, delay);
}

function finishAmbient(behavior) {
  if (activeAmbient !== behavior) return;
  if (DEBUG_IDLE) {
    els.room.dataset.lastIdleEnd = new Date().toISOString();
    console.info('idle:end', behavior.id, els.room.dataset.lastIdleEnd, 'completed', `${Date.now() - activeAmbientStartedAt}ms`);
  }
  activeAmbient = undefined;
  clearAmbientVisuals();
  if (partOfDay() === 'late' && state.nightSleepEligible) {
    if (behavior.nightStageAfter === state.nightStage + 1) state.nightStage = behavior.nightStageAfter;
  }
  baseSprite();
  persist();
  scheduleMicro();
  if (behavior.returnsTo !== 'sleep') scheduleAmbient();
}

function playAmbientFrames(behavior) {
  const steps = behavior.steps || behavior.frames.map(pose => ({
    pose, durationMs: behavior.durationMs / behavior.frames.length
  }));
  let index = 0;
  const advance = () => {
    if (activeAmbient !== behavior) return;
    if (index === steps.length) {
      poseTimer = undefined;
      finishAmbient(behavior);
      return;
    }
    const step = steps[index];
    if (step.phase) els.room.dataset.phase = step.phase;
    if (step.caption !== undefined) els.roomNote.textContent = step.caption;
    if (step.effect) showEffect(step.effect);
    const emote = step.emote || (index === Math.floor(steps.length / 2) ? behavior.emote : '');
    if (emote) {
      els.emote.textContent = emote;
      els.room.classList.remove('ambient-emote');
      void els.emote.offsetWidth;
      els.room.classList.add('ambient-emote');
    }
    if (step.phase === 'react' && behavior.reactionLines && (DEBUG_IDLE || Math.random() < .55)) {
      say(pick(behavior.reactionLines));
    }
    setSprite(step.pose, index + 1, steps.length);
    index++;
    poseTimer = setTimeout(advance, step.durationMs);
  };
  advance();
}

function startAmbient() {
  ambientTimer = undefined;
  delete els.room.dataset.nextAmbientAt;
  if (document.hidden || activeAmbient || activePanel) return;
  clearMicro();
  const now = Date.now();
  advanceTime(state, now);
  syncClock(new Date(now));
  render();
  if (isSleeping() || poseTimer) {
    if (!isSleeping()) scheduleAmbient();
    return;
  }
  const context = {
    sleeping: false, time: partOfDay(new Date(now)), hunger: state.hunger, energy: state.energy,
    mood: state.mood, interest: state.interest, sleepEligible: state.nightSleepEligible,
    nightStage: state.nightStage, idleMs: Math.max(0, now - state.lastInteractionAt),
    ownedGadgets: state.ownedGadgets, longNeeds: sustainedNeeds(state, now), recentIds: recentAmbientIds,
    returnAfterMs, firstAmbientSinceOpen, happyRecently: now < happyUntil
  };
  const forcedBehavior = DEBUG_ACTION ? BEHAVIORS.find(item => item.id === DEBUG_ACTION
    && item.returnsTo !== 'sleep' && (!item.requiresGadget || item.when(context))) : null;
  const tourBehavior = DEBUG_IDLE && !DEBUG_ACTION ? BEHAVIORS.find(item => item.id === DEBUG_TOUR[debugTourIndex]) : null;
  const behavior = forcedBehavior || tourBehavior || chooseBehavior(context);
  if (!behavior) { scheduleAmbient(); return; }
  if (tourBehavior) debugTourIndex++;
  firstAmbientSinceOpen = false;
  activeAmbient = behavior;
  activeAmbientStartedAt = now;
  if (DEBUG_IDLE) {
    els.room.dataset.lastIdleStart = new Date(now).toISOString();
    console.info('idle:start', behavior.id, els.room.dataset.lastIdleStart);
  }
  recentAmbientIds = [...recentAmbientIds, behavior.id].slice(-3);
  els.room.dataset.ambient = behavior.id;
  els.roomNote.textContent = behavior.caption;
  if (behavior.requiresGadget) {
    els.room.dataset.gadgetActive = behavior.requiresGadget;
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
  scheduleMicro();
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
  const symbols = {
    feed: ['▣', '〰', '〰'], pet: ['♥', '♪', '♡'], rest: ['Z', 'z', 'z'],
    radio: ['♪', '〰', '♫'], caliper: ['⌖', '·', '·'], labelMaker: ['▤', '✦', '·']
  };
  clearTimeout(effectTimer);
  els.effect.replaceChildren();
  els.effect.dataset.effect = type;
  for (const symbol of symbols[type] || []) {
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
  const needs = sustainedNeeds(state);
  document.body.classList.toggle('sleeping', sleeping);
  const condition = sleeping ? 'sleeping' : state.energy < 48 ? 'tired' : state.hunger >= 58 ? 'hungry'
    : state.mood < 50 ? 'moody' : state.interest >= 75 ? 'curious' : 'neutral';
  document.body.dataset.condition = condition;
  els.speechMark.textContent = { sleeping: 'z z', tired: '☾', hungry: '◌', moody: '…', curious: '✦', neutral: '✧' }[condition];
  els.cue.textContent = { tired: '…', hungry: 'ぐぅ…', moody: '…', curious: '？' }[condition] || '';
  els.gordon.setAttribute('aria-label', sleeping ? '寝ているゴードンをタップする' : 'ゴードンをタップする');
  els.hunger.textContent = needs.hunger ? '腹ぺこ' : state.hunger >= 58 ? '腹が減った' : state.hunger >= 42 ? '小腹がすいた' : state.hunger <= 22 ? '満腹' : 'ふつう';
  els.energy.textContent = needs.energy ? '休みたい' : state.energy < 48 ? '少し疲れた' : state.energy < 60 ? 'ややだるい' : state.energy >= 78 ? '余裕あり' : 'ふつう';
  els.mood.textContent = needs.mood ? 'むすっと' : state.mood < 50 ? '静か' : state.mood < 60 ? '気難しい' : state.mood >= 75 ? '悪くない' : 'ふつう';
  els.interest.textContent = needs.interest ? '退屈している' : state.interest < 48 ? '退屈ぎみ' : state.interest >= 75 ? '興味あり' : 'ふつう';
  for (const [id, value] of Object.entries({ hunger: 100 - state.hunger, energy: state.energy, mood: state.mood, interest: state.interest })) {
    const meter = $(`${id}-meter`);
    meter.style.setProperty('--fill', `${Math.round(value)}%`);
    meter.setAttribute('aria-valuenow', String(Math.round(value)));
    meter.setAttribute('aria-valuetext', els[id].textContent);
  }
  els.caption.textContent = sleeping ? 'うとうとしている' : needs.hunger ? '食べ物が気になる' : needs.energy ? '休みたいらしい'
    : state.hunger >= 42 ? '小腹がすいた' : state.energy < 60 ? '少しだるそう' : needs.interest ? '何か探している' : 'いつもどおり';
  if (!poseTimer && !microReturnTimer) baseSprite();
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
    const image = document.createElement('img');
    image.src = gadget.image;
    image.alt = '';
    prop.append(image);
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
    item.disabled = owned && !DEBUG_IDLE;
    if (owned && DEBUG_IDLE) item.dataset.gadgetRemoveId = gadget.id;
    else item.dataset.gadgetId = gadget.id;
    item.innerHTML = `<span class="gadget-icon"><img src="${gadget.image}" alt=""></span><span class="gadget-copy"><strong>${gadget.name}</strong><small>${gadget.description}</small></span><span class="gadget-badge">${owned ? DEBUG_IDLE ? '戻す' : '所持中' : '渡す'}</span>`;
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

function removeGadgetForDebug(id) {
  if (!DEBUG_IDLE || !state.ownedGadgets.includes(id)) return;
  state.ownedGadgets = state.ownedGadgets.filter(owned => owned !== id);
  renderRoomGadgets();
  renderGadgetPanel();
  persist();
  scheduleAmbient();
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
  change(state, 'interest', 6);
  happyUntil = now + 120000;
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
  let pose = 'called';
  if (state.asleepTonight && partOfDay(new Date(now)) === 'late') {
    state.nightWakeCount++;
    state.currentNightWakeCount++;
    const index = Math.min(state.currentNightWakeCount, 3) - 1;
    say(LINES.sleepingTap[index]);
    reaction = index === 0 ? 'tap' : index === 1 ? 'annoyed' : 'fedup';
    mark = index === 0 ? '…' : '!';
    pose = index === 0 ? 'yawn' : 'annoyed';
  } else if (state.restingUntil > now) {
    state.restingUntil = 0;
    say(LINES.restedTap);
    mark = '…';
  } else {
    rapidTaps = now - lastTapAt > 12000 ? 1 : rapidTaps + 1;
    lastTapAt = now;
    change(state, 'interest', 0.5);
    if (rapidTaps >= 6) { say(LINES.tapFedUp); reaction = 'fedup'; mark = '!'; pose = 'annoyed'; }
    else if (rapidTaps >= 3) { say(LINES.tapAnnoyed); reaction = 'annoyed'; mark = '…'; pose = 'annoyed'; }
    else {
      const need = Object.entries(sustainedNeeds(state, now)).find(([, long]) => long)?.[0];
      if (need && Math.random() < .7) {
        say(pick(LINES.tapNeed[need]));
        pose = { hunger: 'sad', energy: 'sit', mood: 'sad', interest: 'surprised' }[need];
        mark = { hunger: '…', energy: 'ふぁ…', mood: '…', interest: '？' }[need];
        if (need === 'energy') reaction = 'rest';
      } else say(pick(LINES.tap));
    }
  }
  react(reaction, mark);
  render();
  showSprite(pose, reaction === 'tap' ? 1850 : 2300);
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
    change(state, 'mood', food.moodDelta + 2);
    happyUntil = now + 120000;
  }
  wakeForAction();
  press('feed-btn');
  say(pick(LINES[food.dialogueKey][category]));
  render();
  if (category === 'full') {
    react('annoyed', '…');
    showSprite('annoyed', 1900);
  } else {
    showSprite('sit', 540, () => {
      react('feed');
      showEffect('feed');
      showSprite(food.sprite, 1700, () => {
        if (category === 'hungry') {
          say(pick(LINES.afterFeed));
          showSprite('happy', 850);
        } else baseSprite();
      });
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
  change(state, 'mood', 8);
  change(state, 'familiarity', 2);
  state.petCount++;
  wakeForAction();
  press('pet-btn');
  react('pet', category === 'new' ? '?' : '');
  showEffect('pet');
  say(pick(LINES.pet[category]));
  render();
  showSprite('pet', 1750, () => showSprite('happy', 850));
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
    change(state, 'energy', 29);
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
  recentAmbientIds = [];
  els.room.classList.remove('reacting', 'show-emote');
  els.effect.replaceChildren();
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
  if (button.dataset.gadgetRemoveId) removeGadgetForDebug(button.dataset.gadgetRemoveId);
  else if (button.dataset.gadgetId) acquireGadget(button.dataset.gadgetId);
  else if (button.dataset.gameId) startGame(button.dataset.gameId);
  else if (button.dataset.foodId) feed(FOOD_BY_ID[button.dataset.foodId]);
  else if (button.dataset.guess) guessCard(button.dataset.guess);
  else if (button.hasAttribute('data-next-round') && currentGame && gameSession) {
    currentGame.advance(gameSession);
    renderGame();
  }
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { cancelAmbient(); clearTimeout(microTimer); microTimer = undefined; delete els.room.dataset.nextMicroAt; }
  else { tick(); scheduleAmbient(); scheduleMicro(); }
});
window.addEventListener('pageshow', () => {
  if (!ambientTimer && !activeAmbient && !activePanel && !isSleeping()) scheduleAmbient();
  if (!microTimer) scheduleMicro();
});
setInterval(tick, 60 * 1000);
// 短い小動作も一つのタイマーで管理。操作・大きい動作の後は間を空けます。

advanceTime(state);
document.body.dataset.appVersion = 'quiet-toy-room-1';
syncClock();
state.lastInteractionAt = Date.now();
say(isSleeping() ? pick(LINES.sleeping) : state.familiarity >= 50 ? pick(LINES.arrivalFamiliar) : pick(LINES.arrival[partOfDay()]));
render();
renderRoomGadgets();
persist();
scheduleAmbient();
scheduleMicro();

if ('serviceWorker' in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .then(registration => registration.update()).catch(() => {}));
}
