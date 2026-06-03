# my-hud Cache Rate Display — Design

## Context

`my-hud` is a pi extension that renders an always-on HUD bar above the editor. It currently shows:

- Project name
- Model name (shortened)
- Git branch
- Context window usage %
- Input tokens
- Output tokens
- Cache-read tokens
- Cost (CNY)

The user wants an additional metric: **cache hit rate**, defined as `cacheRead / (cacheRead + input)`.

## Goal

Display the cache hit rate as a percentage next to the existing metrics, without removing the raw `cacheRead` token count.

## Design

### Formula

```
cacheRate = cacheRead / (cacheRead + input)
```

Displayed as a rounded percentage (e.g. `85%`).

Edge case: when `cacheRead + input === 0`, display `0%`.

### UI Placement

Append the new metric after `cost` in the status line:

```
📁project  🚀model  🌿branch  🔋ctx%  ⬆️input  ⬇️output  🧊cacheRead  💰cost  📊cacheRate
```

### Files to Change

| File | Change |
|------|--------|
| `format.ts` | Add `formatCacheRate(input, cacheRead)` pure helper |
| `icons.ts` | Add `cacheRate` icon (`\uf080` bar-chart) |
| `render.ts` | Append cache-rate segment in `buildStatusLine` |

### Color

Use `accent` theme color, consistent with low-context and healthy metrics.

### Testing

`formatCacheRate` is a pure function — unit test the edge cases:

- `(0, 0)` → `"0%"`
- `(100, 0)` → `"0%"`
- `(100, 100)` → `"50%"`
- `(100, 400)` → `"80%"`

## Out of Scope

- Replacing the raw `cacheRead` token count with the rate
- Adding a config toggle to hide the metric
- Color-coding the rate based on thresholds
