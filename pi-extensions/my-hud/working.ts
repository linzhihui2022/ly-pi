/**
 * Working messages — casual/funny messages shown while the AI is processing.
 */

export const WORKING_MESSAGES: readonly string[] = [
  "\uef19 闭嘴，我在思考",
  "\ue2a5 CPU烧烤中",
  "\uf252 等我一会",
  "\uef6f 你等我一下，我去个厕所",
  "\udb80\uddaa 你喝口水先",
  "\udb81\udfea 等下吃什么",
  "\uee1d 走两步，没事走两步",
  "\uee9c 脑细胞燃烧中",
  "\udb83\udd9f 泡杯茶先",
  "\uee41 鱼还没上钩",
  "\uf021 大脑正在重启",
  "\udb81\udcb2 我先眯一会",
];

/**
 * Pick a random working message from the list.
 * Each call independently selects; for sticky behavior the caller caches.
 */
export function pickRandomMessage(): string {
  const idx = Math.floor(Math.random() * WORKING_MESSAGES.length);
  return WORKING_MESSAGES[idx];
}
