// 食べ物を増やすときはここへ追加。二種類以上になると「飯」から選べます。
export const FOODS = [
  { id: 'meal', name: 'いつもの飯', description: '腹ごしらえ。', hungerDelta: -28, moodDelta: 4, dialogueKey: 'feed', sprite: 'feed' }
];

export const FOOD_BY_ID = Object.fromEntries(FOODS.map(food => [food.id, food]));
