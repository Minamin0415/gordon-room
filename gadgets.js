// 所持品の絵・台詞・部屋の置き場所・自発行動をまとめて管理します。
const stroke = 'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"';

export const GADGETS = [
  {
    id: 'radio', name: '小型ラジオ', description: '小さな音と、少しのノイズ。',
    icon: `<svg viewBox="0 0 48 48" ${stroke} aria-hidden="true"><path d="M11 20h27v20H11zM15 20l22-11M17 26h12M17 31h10"/><circle cx="34" cy="29" r="3"/><path d="M17 38h2m14 0h2"/></svg>`,
    acquireDialogue: '……ラジオか。まあ、置いとけ。', ownedDialogue: 'それはもうある。たまに聴いてる。',
    roomDecoration: { left: '5%', bottom: '17%', rotate: '-5deg' },
    usableIdleActions: [
      { id: 'radio_tune', frames: ['idle', 'sit', 'look', 'sit', 'idle'], durationMs: 4600, caption: 'ラジオの周波数を合わせている', weight: c => c.time === 'late' ? 1 : 2 },
      { id: 'radio_listen', frames: ['idle', 'look', 'look', 'idle'], durationMs: 3900, caption: 'ノイズに耳を傾けている', weight: () => 2 }
    ]
  },
  {
    id: 'caliper', name: 'デジタルノギス', description: '測る必要のない物まで測る。',
    icon: `<svg viewBox="0 0 48 48" ${stroke} aria-hidden="true"><path d="M8 17h33M13 11v15m5-15v9m21-9v10M10 28h23v8H10zM14 32h8m13-10v17m-5-17v8"/></svg>`,
    acquireDialogue: '何でこれを俺に寄越した？', ownedDialogue: 'ああ、ノギスなら持ってる。……使ってるぞ。',
    roomDecoration: { left: '17%', bottom: '34%', rotate: '11deg' },
    usableIdleActions: [
      { id: 'caliper_measure', frames: ['idle', 'look', 'sit', 'look', 'idle'], durationMs: 4600, caption: '木箱の寸法を測っている', weight: c => c.interest >= 75 ? 4 : 2 },
      { id: 'caliper_lamp', frames: ['idle', 'hat', 'look', 'idle'], durationMs: 3900, caption: 'ランプの支柱を測っている', weight: () => 1 }
    ]
  },
  {
    id: 'labelMaker', name: '古いラベルライター', description: '妙な物に名前をつけたがる。',
    icon: `<svg viewBox="0 0 48 48" ${stroke} aria-hidden="true"><path d="M10 21h27l3 13-5 5H13l-5-5zM16 15h16v6H16zM16 27h16M17 33h14"/><path d="M21 12h8"/></svg>`,
    acquireDialogue: '……まだ動くのか、これ。', ownedDialogue: 'もうあるだろ。木箱を見てみろ。',
    roomDecoration: { right: '8%', bottom: '18%', rotate: '6deg' },
    usableIdleActions: [
      { id: 'label_maker_use', frames: ['idle', 'sit', 'sit', 'look', 'idle'], durationMs: 4700, caption: '何かのラベルを作っている', weight: () => 2 },
      { id: 'label_maker_stick', frames: ['idle', 'look', 'sit', 'idle'], durationMs: 4100, caption: '木箱に「俺の」と貼っている', weight: () => 1 }
    ]
  }
];

export const GADGET_BY_ID = Object.fromEntries(GADGETS.map(gadget => [gadget.id, gadget]));
