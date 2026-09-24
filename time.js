export function partOfDay(date = new Date()) {
  const hour = date.getHours();
  if (hour >= 23 || hour < 5) return 'late';
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

export const TIME_NAMES = { morning: '朝', day: '昼', evening: '夜', late: '深夜' };

// 23時〜翌4時を同じ「夜」として扱う。
export function nightKey(date = new Date()) {
  const copy = new Date(date);
  if (copy.getHours() < 5) copy.setDate(copy.getDate() - 1);
  return `${copy.getFullYear()}-${String(copy.getMonth() + 1).padStart(2, '0')}-${String(copy.getDate()).padStart(2, '0')}`;
}

// 同じ夜の再読み込みで睡眠抽選が変わらないよう、日付から決める。
export function sleepsOnNight(key) {
  let hash = 2166136261;
  for (const char of key) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10 < 6;
}
