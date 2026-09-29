// 行動データは画像ファイル名ではなく、ここにある姿勢名を参照します。
// 仮の画像を使う姿勢は src だけ新画像へ替えれば全行動に反映されます。
export const SPRITES = {
  idle: { src: './assets/gordon/gordon-idle.png', alt: '立っているゴードン' },
  walk: { src: './assets/gordon/gordon-walk.png', alt: '部屋を少し歩くゴードン' },
  hat: { src: './assets/gordon/gordon-hat.png', alt: '手で帽子のつばを直すゴードン' },
  tail: { src: './assets/gordon/gordon-tail.png', alt: '尻尾を持ち上げたゴードン' },
  look: { src: './assets/gordon/gordon-look.png', alt: 'こちらを見てサングラスに手をかけるゴードン' },
  annoyed: { src: './assets/gordon/gordon-annoyed.png', alt: '腕を組んで不機嫌そうなゴードン' },
  feed: { src: './assets/gordon/gordon-feed.png', alt: '弁当を食べるゴードン' },
  pet: { src: './assets/gordon/gordon-pet.png', alt: '帽子をなでられているゴードン' },
  sit: { src: './assets/gordon/gordon-sit.png', alt: '一人で腰を下ろしているゴードン' },
  work: { src: './assets/gordon/gordon-work.png', alt: '座って手元の小物をいじるゴードン' },
  workRadio: { src: './assets/gordon/gordon-radio.png', alt: 'ラジオのつまみを回すゴードン' },
  workCaliper: { src: './assets/gordon/gordon-caliper.png', alt: 'ノギスで木箱を測るゴードン' },
  workLabelMaker: { src: './assets/gordon/gordon-label-maker.png', alt: 'ラベルライターを操作するゴードン' },
  rest: { src: './assets/gordon/gordon-rest.png', alt: '横になって目を閉じたゴードン' },
  // 以下は将来の専用スプライト用の差し替え口。今は既存の表情を流用します。
  yawn: { src: './assets/gordon/gordon-rest.png', alt: '眠そうなゴードン' },
  happy: { src: './assets/gordon/gordon-look.png', alt: '少し機嫌のよいゴードン' },
  sad: { src: './assets/gordon/gordon-annoyed.png', alt: 'しょんぼりしたゴードン' },
  surprised: { src: './assets/gordon/gordon-look.png', alt: '驚いたゴードン' },
  called: { src: './assets/gordon/gordon-look.png', alt: '呼ばれてこちらを見るゴードン' }
};

export const POSE_ROLES = Object.freeze({
  standing: 'idle', walking: 'walk', eating: 'feed', sitting: 'sit',
  gadget: 'work', sleeping: 'rest', happy: 'happy', sad: 'sad',
  surprised: 'surprised', called: 'called'
});
