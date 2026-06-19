export interface SessionRule {
  surface: string;
  pattern: string;
  action: "allow" | "deny";
}

export interface SessionState {
  yolo: boolean;
  yoloAllSub: boolean;
  onAppend?: (rule: SessionRule) => void;

  toggleYolo(): void;
  toggleYoloAllSub(): void;
  addSessionRule(rule: SessionRule): void;
  restoreSessionRules(rules: SessionRule[]): void;
  findSessionRule(surface: string, pattern: string): SessionRule | undefined;
  forEachSessionRuleEntry(callback: (rule: SessionRule) => void): void;
  clear(): void;
}

export function createSessionState(): SessionState {
  let yolo = false;
  let yoloAllSub = false;
  const rules: SessionRule[] = [];

  return {
    get yolo() {
      return yolo;
    },

    get yoloAllSub() {
      return yoloAllSub;
    },

    toggleYolo() {
      yolo = !yolo;
    },

    toggleYoloAllSub() {
      yoloAllSub = !yoloAllSub;
    },

    addSessionRule(rule: SessionRule) {
      rules.push(rule);
      this.onAppend?.(rule);
    },

    restoreSessionRules(restored: SessionRule[]) {
      rules.length = 0;
      for (const rule of restored) {
        rules.push(rule);
      }
    },

    findSessionRule(surface: string, pattern: string) {
      for (let i = rules.length - 1; i >= 0; i--) {
        const rule = rules[i];
        if (rule.surface === surface && rule.pattern === pattern) {
          return rule;
        }
      }
      return undefined;
    },

    forEachSessionRuleEntry(callback: (rule: SessionRule) => void) {
      for (const rule of rules) {
        callback(rule);
      }
    },

    clear() {
      rules.length = 0;
    },
  };
}
