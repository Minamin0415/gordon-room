// image は家具になじむ小物イラスト（部屋・一覧で共有）。
// usePose は sprites.js の人物＋道具の一体型ドット絵。用途別に独立して差し替えられます。
// 近づく→座って取る→使う→反応する→戻す。手に持つ姿は一体型スプライトです。
function useSteps({ approach, reach, use, react, usePose, emote, effect }) {
  return [
    { pose: 'walk', phase: 'approach', durationMs: 680, caption: approach },
    { pose: 'sit', phase: 'reach', durationMs: 720, caption: reach },
    { pose: usePose, phase: 'use', durationMs: 1350, caption: use, effect },
    { pose: usePose, phase: 'use', durationMs: 1050, caption: use },
    { pose: usePose, phase: 'react', durationMs: 900, caption: react, emote },
    { pose: 'idle', phase: 'return', durationMs: 700, caption: '' }
  ];
}

export const GADGETS = [
  {
    id: 'radio', name: '小型ラジオ', description: '小さな音と、少しのノイズ。',
    image: './assets/gadgets/room-radio.svg', usePose: 'workRadio',
    acquireDialogue: '……ラジオか。まあ、置いとけ。', ownedDialogue: 'それはもうある。たまに聴いてる。',
    roomDecoration: { left: '5%', bottom: '17%', rotate: '-5deg' },
    usableIdleActions: [
      { id: 'radio_tune', caption: 'ラジオの周波数を合わせている',
        steps: useSteps({ approach: 'ラジオの方へ歩いた', reach: 'ラジオを手に取った', use: 'ダイヤルを回している', react: '音を確かめている', usePose: 'workRadio', emote: '♪', effect: 'radio' }),
        reactionLines: ['……この局、まだ入るのか。', 'ノイズにも味があるな。'], weight: c => c.time === 'late' ? 1 : 2 },
      { id: 'radio_listen', caption: 'ノイズに耳を傾けている',
        steps: useSteps({ approach: 'ラジオに近づいた', reach: 'ラジオを持ち上げた', use: '耳を寄せている', react: '何か聞こえたらしい', usePose: 'workRadio', emote: '？', effect: 'radio' }),
        reactionLines: ['……今、何か言ったか？', 'いや、ただのノイズか。'], weight: () => 2 }
    ]
  },
  {
    id: 'caliper', name: 'デジタルノギス', description: '測る必要のない物まで測る。',
    image: './assets/gadgets/room-caliper.svg', usePose: 'workCaliper',
    acquireDialogue: '何でこれを俺に寄越した？', ownedDialogue: 'ああ、ノギスなら持ってる。……使ってるぞ。',
    roomDecoration: { left: '8%', bottom: '23%', rotate: '-8deg' },
    usableIdleActions: [
      { id: 'caliper_measure', caption: '木箱の寸法を測っている',
        steps: useSteps({ approach: '木箱の方へ歩いた', reach: 'ノギスを手に取った', use: '木箱を測っている', react: '数字を二度見した', usePose: 'workCaliper', emote: '？', effect: 'caliper' }),
        reactionLines: ['……だから何ミリなんだ、これ。', '昨日より縮んでるわけねぇよな。'], weight: c => c.interest >= 75 ? 4 : 2 },
      { id: 'caliper_lamp', caption: 'ランプの支柱を測っている',
        steps: useSteps({ approach: 'ランプへ近づいた', reach: 'ノギスを構えた', use: '支柱を測っている', react: '妙に納得した', usePose: 'workCaliper', emote: '！', effect: 'caliper' }),
        reactionLines: ['……測る必要はない。分かってる。'], weight: () => 1 }
    ]
  },
  {
    id: 'labelMaker', name: '古いラベルライター', description: '妙な物に名前をつけたがる。',
    image: './assets/gadgets/room-label-maker.svg', usePose: 'workLabelMaker',
    acquireDialogue: '……まだ動くのか、これ。', ownedDialogue: 'もうあるだろ。木箱を見てみろ。',
    roomDecoration: { right: '8%', bottom: '18%', rotate: '6deg' },
    usableIdleActions: [
      { id: 'label_maker_use', caption: '何かのラベルを作っている',
        steps: useSteps({ approach: 'ラベルライターへ向かった', reach: '機械を膝に乗せた', use: '文字を打っている', react: '出来上がりを眺めた', usePose: 'workLabelMaker', emote: '✦', effect: 'labelMaker' }),
        reactionLines: ['……何に貼るかは、これから考える。'], weight: () => 2 },
      { id: 'label_maker_stick', caption: '木箱にラベルを貼っている',
        steps: useSteps({ approach: '木箱に近づいた', reach: 'ラベルを持ち上げた', use: '木箱に貼っている', react: '少し得意そうだ', usePose: 'workLabelMaker', emote: '♪', effect: 'labelMaker' }),
        reactionLines: ['「俺の」。これで間違わねぇ。'], weight: () => 1 }
    ]
  }
];

export const GADGET_BY_ID = Object.fromEntries(GADGETS.map(gadget => [gadget.id, gadget]));
