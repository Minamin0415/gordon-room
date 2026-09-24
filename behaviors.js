import { GADGETS } from './gadgets.js';

// 自発行動はここに追加します。UIや保存処理に触れずに増やせます。
// frames は sprites.js の画像名を表示順に並べます。繰り返すとその画像を長めに見せられます。
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
    id: 'tailFlick', frames: ['idle', 'tail', 'tail', 'idle'], durationMs: 2800, returnsTo: 'base', caption: '尻尾がぴこっと動いた',
    when: c => !c.sleeping,
    weight: c => c.mood < 50 ? 1 : 4
  },
  {
    id: 'think', frames: ['idle', 'annoyed', 'annoyed', 'idle'], durationMs: 3600, returnsTo: 'base', caption: '考えごとをしている',
    when: c => !c.sleeping,
    weight: c => c.mood < 50 ? 8 : 2
  },
  {
    id: 'sit', frames: ['idle', 'sit', 'sit', 'sit', 'idle'], durationMs: 4800, returnsTo: 'base', caption: '少し腰を下ろした', nightStageAfter: 1,
    when: c => !c.sleeping,
    weight: c => 1 + (c.energy < 50 ? 7 : 0) + (c.time === 'late' ? 5 : 0)
  },
  {
    id: 'doze', frames: ['sit', 'rest', 'sit', 'rest', 'sit'], durationMs: 4300, returnsTo: 'base', caption: 'うとうとしている', nightStageAfter: 2,
    when: c => !c.sleeping && (c.energy < 50 || c.time === 'late'),
    weight: c => 1 + (c.energy < 50 ? 5 : 0) + (c.time === 'late' ? 5 : 0)
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
    when: c => !c.sleeping && c.ownedGadgets?.includes(gadget.id)
  })))
];

export function nextBehaviorDelay(random = Math.random, debug = false) {
  // ?debug=1 では目視確認しやすい3〜8秒。通常は行動終了後も最低30秒空ける。
  return debug ? 3000 + Math.floor(random() * 5000) : 30000 + Math.floor(random() * 60000);
}

export function chooseBehavior(context, random = Math.random) {
  // 眠る夜は「座る→うとうと→寝る」を順番に進める。開始時刻はランダムな待機タイマーに任せる。
  if (context.time === 'late' && context.sleepEligible && context.idleMs >= 90000) {
    const next = BEHAVIORS.find(behavior => behavior.nightStageAfter === context.nightStage + 1 && behavior.when(context));
    if (next) return next;
  }

  const candidates = BEHAVIORS.filter(behavior => behavior.returnsTo !== 'sleep' && behavior.when(context))
    .map(behavior => ({ behavior, weight: Math.max(0, behavior.weight(context)) }))
    .filter(entry => entry.weight > 0);
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
