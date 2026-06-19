# pi-pet

A virtual ASCII cat pet for Pi. Lives in your terminal, reacts to your coding sessions, and asks for attention when hungry, sad, or tired.

## Commands

| Command | Effect |
|---|---|
| `/pet` or `/pet status` | Show your pet's current state and ASCII art |
| `/pet feed` | Feed your pet (hunger −30, energy −2) |
| `/pet play` | Play with your pet (mood +20, energy −10, hunger +5) |
| `/pet sleep` | Let your pet rest (energy +40, hunger +5) |
| `/pet rename <name>` | Rename your pet |
| `/pet help` | Show available commands |

## Events

The pet reacts to your Pi activity:

- Each time Pi finishes a turn (agent_end), the pet gets a small positive boost (+3 mood, +1 energy, +1 hunger reduction)
- Real-time decay applies every hour whether Pi is running or not: hunger +2, mood −1, energy −1.5

## State

Pet state is persisted to `~/.pi/pet-state.json` and survives Pi restarts. Default pet is a baby cat named "Mochi" with 80/80/80 stats.

## Configuration

Optional config file at `~/.pi/pet-config.json`:

```json
{
  "enabled": true,
  "petName": "Mochi",
  "decay": {
    "hungerPerHour": 2,
    "moodPerHour": 1,
    "energyPerHour": 1.5
  },
  "notices": {
    "enabled": true,
    "minIntervalMinutes": 5
  }
}
```

Set `enabled: false` to disable the pet entirely.

## Development

```bash
cd pi-extensions/pi-pet
bun install
bun run typecheck
bun run test       # 35 tests, 100% coverage
bun run build
bun run deploy     # deploys to ~/.pi/agent/extensions/pi-pet/
```
