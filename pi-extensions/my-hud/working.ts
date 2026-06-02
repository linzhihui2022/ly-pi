/**
 * Working messages — casual/funny messages shown while the AI is processing.
 */

export const WORKING_MESSAGES: readonly string[] = [
  "🤔闭嘴，我在思考",
  "🍖CPU烧烤中",
  "⌛️等我一会",
  "🚽你等我一下，我去个厕所",
  "💦你喝口水先",
  "🍚等下吃什么",
  "🦶走两步，没事走两步",
  "🧠脑细胞燃烧中",
  "☕️泡杯茶先",
  "🎣鱼还没上钩",
  "🔄大脑正在重启",
  "🌙我先眯一会",
];

/**
 * Pick a random working message from the list.
 * Each call independently selects; for sticky behavior the caller caches.
 */
export function pickRandomMessage(): string {
  const idx = Math.floor(Math.random() * WORKING_MESSAGES.length);
  return WORKING_MESSAGES[idx];
}
