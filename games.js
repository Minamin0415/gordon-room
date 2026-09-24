// ミニゲームを増やすときは、ここへ id / name / description / create / guess を追加します。
const rank = random => 1 + Math.floor(random() * 13);
const cardLabel = value => ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[value] || String(value);

export const GAMES = [
  {
    id: 'highLow', name: 'HIGH & LOW', description: '次の一枚は、今のカードより上か下か。',
    create(random = Math.random) { return { current: rank(random), next: null, streak: 0, rounds: 0, result: '' }; },
    guess(session, direction, random = Math.random) {
      if (!['high', 'low'].includes(direction) || session.next !== null) return null;
      let next = 1 + Math.floor(random() * 12);
      if (next >= session.current) next++;
      session.next = next;
      session.rounds++;
      const won = direction === 'high' ? next > session.current : next < session.current;
      session.streak = won ? Math.max(0, session.streak) + 1 : Math.min(0, session.streak) - 1;
      session.result = won ? '当たり' : 'はずれ';
      return { won, next, line: won
        ? (session.streak >= 3 ? '……三回も当てたのか。なかなかやる。' : ['へえ。やるじゃねぇか。', '当てたか。……まあ、一回くらいはな。', '……今のは運だろ。'][session.rounds % 3])
        : (session.streak <= -3 ? '今日は勘が鈍いんじゃねぇか？' : ['残念だったな。', 'もう一回だ。'][session.rounds % 2]) };
    },
    advance(session) { if (session.next === null) return; session.current = session.next; session.next = null; session.result = ''; }
  }
];

export const GAME_BY_ID = Object.fromEntries(GAMES.map(game => [game.id, game]));
export { cardLabel };
