/**
 * Optional Pi-pet configuration loaded from ~/.pi/pet-config.json.
 */

import fs from "node:fs";
import os from "node:os";
import { join } from "node:path";

export interface PetConfig {
  enabled: boolean;
  petName: string;
  decay: {
    hungerPerHour: number;
    moodPerHour: number;
    energyPerHour: number;
  };
  notices: {
    enabled: boolean;
    minIntervalMinutes: number;
  };
}

const DEFAULTS: PetConfig = {
  enabled: true,
  petName: "Mochi",
  decay: {
    hungerPerHour: 2,
    moodPerHour: 1,
    energyPerHour: 1.5,
  },
  notices: {
    enabled: true,
    minIntervalMinutes: 5,
  },
};

export function loadConfig(): PetConfig {
  try {
    const path = join(os.homedir(), ".pi", "pet-config.json");
    if (!fs.existsSync(path)) return DEFAULTS;
    const raw = fs.readFileSync(path, "utf8");
    const user = JSON.parse(raw) as Partial<PetConfig>;
    return {
      enabled: user.enabled ?? DEFAULTS.enabled,
      petName: user.petName ?? DEFAULTS.petName,
      decay: {
        hungerPerHour: user.decay?.hungerPerHour ?? DEFAULTS.decay.hungerPerHour,
        moodPerHour: user.decay?.moodPerHour ?? DEFAULTS.decay.moodPerHour,
        energyPerHour: user.decay?.energyPerHour ?? DEFAULTS.decay.energyPerHour,
      },
      notices: {
        enabled: user.notices?.enabled ?? DEFAULTS.notices.enabled,
        minIntervalMinutes:
          user.notices?.minIntervalMinutes ?? DEFAULTS.notices.minIntervalMinutes,
      },
    };
  } catch {
    return DEFAULTS;
  }
}
