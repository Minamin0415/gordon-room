import { GADGETS } from './gadgets.js';

// 自発行動はここに追加します。frames は sprites.js の姿勢名です。
// steps を使うと、姿勢・段階・小物・時間を個別に指定できます。
// returnsTo: 'base' は通常待機へ、'sleep' は深夜の睡眠へ戻ります。
export const BASE_BEHAVIORS = [
  {
    id: 'hat', frames: ['idle', 'hat', 'hat', 'idle'], durationMs: 2800, returnsTo: 'base', caption: '帽子を直している',
    when: c => !c.sleeping,
    weight: c => c.time === 'late' ? 1 : 3
  },
  {
    id: 'lookAround', frames: ['idle', 'look', 'look', 'idle'], durationMs: 3300, returnsTo: 'base', caption: '周りを見ている',
    when: c => !c.sleeping,
    weight: c => c.interest >= 75 ? 7 : c.interest < 45 ? 1 : 3
  },
  {
    id: 'lookAtYou', frames: ['idle', 'called', 'called', 'idle'], durationMs: 2800, returnsTo: 'base', caption: 'ふと、こちらを見た', emote: '？',
    when: c => !c.sleeping,
    weight: c => c.time === 'late' ? 1 : 3
  },
  {
    id: 'tailFlick', frames: ['idle', 'tail', 'tail', 'idle'], durationMs: 2800, returnsTo: 'base', caption: '尻尾がぴこっと動いた',
    when: c => !c.sleeping && (c.mood >= 75 || c.happyRecently),
    weight: c => c.happyRecently ? 3 : 1
  },
  {
    id: 'pacing', frames: ['idle', 'walk', 'idle', 'walk', 'idle'], durationMs: 3900, returnsTo: 'base', caption: '部屋を少し歩いた',
    when: c => !c.sleeping && c.energy > 40,
    weight: c => c.interest < 48 ? 5 : c.time === 'late' ? 1 : 3
  },
  {
    id: 'think', frames: ['idle', 'annoyed', 'annoyed', 'idle'], durationMs: 3600, returnsTo: 'base', caption: '考えごとをしている',
    when: c => !c.sleeping,
    weight: c => c.longNeeds?.mood ? 9 : c.mood < 50 ? 5 : 2
  },
  {
    id: 'yawn', frames: ['idle', 'sit', 'yawn', 'sit', 'idle'], durationMs: 4300, returnsTo: 'base', caption: 'あくびをしている', emote: 'ふぁ…',
    when: c => !c.sleeping,
    weight: c => c.longNeeds?.energy ? 8 : c.energy < 58 ? 4 : 1
  },
  {
    id: 'trunkTinker', frames: ['idle', 'walk', 'work', 'work', 'idle'], durationMs: 4300, returnsTo: 'base', caption: '木箱の辺りをいじっている',
    when: c => !c.sleeping && c.energy > 38,
    weight: c => c.interest >= 70 ? 5 : 2
  },
  {
    id: 'stomach', frames: ['idle', 'sad', 'sit', 'sad', 'idle'], durationMs: 3700, returnsTo: 'base', caption: '腹を気にしている', emote: 'ぐぅ…',
    when: c => !c.sleeping && c.hunger >= 58,
    weight: c => c.longNeeds?.hunger ? 9 : 4
  },
  {
    id: 'sit', frames: ['idle', 'sit', 'sit', 'sit', 'idle'], durationMs: 4800, returnsTo: 'base', caption: '少し腰を下ろした', nightStageAfter: 1,
    when: c => !c.sleeping,
    weight: c => 1 + (c.energy < 50 ? 5 : 0) + (c.longNeeds?.energy ? 4 : 0) + (c.time === 'late' ? 5 : 0)
  },
  {
    id: 'doze', frames: ['sit', 'rest', 'sit', 'rest', 'sit'], durationMs: 4300, returnsTo: 'base', caption: 'うとうとしている', nightStageAfter: 2,
    when: c => !c.sleeping && (c.energy < 50 || c.time === 'late'),
    weight: c => 1 + (c.energy < 50 ? 4 : 0) + (c.longNeeds?.energy ? 4 : 0) + (c.time === 'late' ? 6 : 0)
  },
  {
    id: 'sleep', frames: ['sit', 'rest', 'rest'], durationMs: 2100, returnsTo: 'sleep', caption: '眠りについた', nightStageAfter: 3,
    when: c => c.time === 'late' && c.sleepEligible && c.nightStage >= 2 && c.idleMs >= 90000,
    weight: () => 0 // 夜の段階進行で選ぶ
  }
];

export const BEHAVIORS = [
  ...BASE_BEHAVIORS,
  ...GADGETS.flatMap(gadget => gadget.usableIdleActions.map(action => ({
    ...action, requiresGadget: gadget.id, returnsTo: 'base',
    when: c => !c.sleeping && c.ownedGadgets?.includes(gadget.id),
    weight: c => action.weight(c) * (c.longNeeds?.hunger || c.longNeeds?.energy ? .6 : 1)
  })))
];

export function nextBehaviorDelay(random = Math.random, debug = false) {
  // ?debug=1 は目視確認用。通常は動作終了から15〜35秒後に次を選ぶ。
  return debug ? 3000 + Math.floor(random() * 3000) : 15000 + Math.floor(random() * 20000);
}

// 普段の小動作には大きな尻尾の差分を使わない。同じ種類の連続も避ける。
export const MICRO_MOTIONS = [
  { id: 'blink', durationMs: 650 },
  { id: 'glance', pose: 'look', durationMs: 1250 },
  { id: 'shoulder', durationMs: 1600 },
  { id: 'hat', pose: 'hat', durationMs: 1400 }
];
export const nextMicroDelay = (random = Math.random) => 12000 + Math.floor(random() * 13000);
export function chooseMicroMotion(previousId, random = Math.random) {
  const choices = MICRO_MOTIONS.filter(motion => motion.id !== previousId);
  return choices[Math.floor(random() * choices.length)];
}

export function chooseBehavior(context, random = Math.random) {
  // 眠る夜は「座る→うとうと→寝る」を順番に進める。開始時刻はランダムな待機タイマーに任せる。
  if (context.time === 'late' && context.sleepEligible && context.idleMs >= 90000) {
    const next = BEHAVIORS.find(behavior => behavior.nightStageAfter === context.nightStage + 1 && behavior.when(context));
    if (next) return next;
  }

  let candidates = BEHAVIORS.filter(behavior => behavior.returnsTo !== 'sleep' && behavior.when(context))
    .map(behavior => ({ behavior, weight: Math.max(0, behavior.weight(context)) }))
    .filter(entry => entry.weight > 0);
  // 同じ動作が連続しないよう、候補が複数あるときは直前の動作を一回休ませる。
  const last = context.recentIds?.at(-1);
  if (last && candidates.length > 1) candidates = candidates.filter(entry => entry.behavior.id !== last);
  const previous = context.recentIds?.at(-2);
  if (previous) candidates = candidates.map(entry => ({
    ...entry, weight: entry.behavior.id === previous ? entry.weight * .35 : entry.weight
  }));
  // 翌日戻ったときは、持ち物を使う様子が最初の一回に出やすい。
  if (context.returnAfterMs >= 12 * 60 * 60 * 1000 && context.firstAmbientSinceOpen) {
    const gadgetCandidates = candidates.filter(entry => entry.behavior.requiresGadget);
    if (gadgetCandidates.length) return weightedPick(gadgetCandidates, random);
  }
  return weightedPick(candidates, random);
}

function weightedPick(candidates, random) {
  const total = candidates.reduce((sum, entry) => sum + entry.weight, 0);
  if (!total) return null;
  let roll = random() * total;
  for (const entry of candidates) {
    roll -= entry.weight;
    if (roll < 0) return entry.behavior;
  }
  return candidates.at(-1).behavior;
}
