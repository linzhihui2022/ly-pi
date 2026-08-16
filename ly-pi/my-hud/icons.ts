/**
 * Nerd Font icons used by my-hud.
 */

const icons = {
  project: "\uf07b ",
  model: "\uf135 ",
  context_0: "\uf244 ",
  context_25: "\uf243 ",
  context_50: "\uf242 ",
  context_75: "\uf241 ",
  context_100: "\uf240 ",
  branch: "\uf09b ",
  input: "\uf062 ",
  output: "\uf063 ",
  cacheRead: "\uf1b2 ",
  cost: "\uf157",
  cacheRate: "\uf080 ",
  terminal: "\uf120  ",
  shield: "\uf132 ",
  log: "\uf02d ",
  thinkingHidden: "\uf070 ",
  thinkingVisible: "\uf06e ",
} as const;

export type IconName = keyof typeof icons;

export function icon(name: IconName): string {
  return icons[name];
}
