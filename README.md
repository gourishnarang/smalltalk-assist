# Warmup

**The first two minutes of a call shouldn't be the hardest.**

Warmup hands you natural, ready-to-say lines for the casual small talk at the start of calls with US teams — *before* you need them. Built for the person who freezes and answers in one or two words.

Live: https://smalltalk-assist.vercel.app

## Why it works

The core design rule: **never make you wait at the moment of need.**

- **Works instantly, no key required** — a curated starter pack of lines, rotated daily and weekday-aware (Monday sounds like a Monday, Friday like a Friday).
- **Pre-generation, not generation** — with a free AI key added, Warmup quietly fills a pool of personalized lines in the background. Shuffle is instant; there is no spinner at the moment of need.
- **Time-aware** — prompts know the date, weekday, your part of day vs. US mornings, and upcoming US holidays.
- **One-tap questions** — the handful of questions US colleagues actually ask ("How was your weekend?"…) are chips, ordered by weekday relevance, with answers ready.
- **"What's new with you?"** — drop a one-liner ("back from Goa") and it's woven into suggestions, dated and recency-weighted.
- **Focus mode** — click any line for a full-screen teleprompter (arrow keys to flip, `c` to copy, `esc` to close).
- **"Said it"** — mark a line as used and it won't come back for a week.

## Setup

1. Open the site (or just double-click `index.html` — no build step, works over `file://`).
2. That's it — starter lines work immediately.
3. Optional, recommended: **⚙ → paste a free API key** so lines sound like *you*:

   | Provider | Free key | Notes |
   |---|---|---|
   | **OpenRouter** (recommended) | https://openrouter.ai/keys | Browser-friendly; one key, several free models. |
   | **Google Gemini** | https://aistudio.google.com/apikey | Generous free tier. |
   | **Groq** | https://console.groq.com/keys | Very fast; may hit browser CORS — use the others if so. |

4. Fill in **About you** (role, city, interests) and keep **Recent** fresh via the "what's new with you?" bar.

## Privacy

Your API key and personal context live in your browser's `localStorage` only. Nothing is sent anywhere except directly to the AI provider you chose, when generating. Clearing site data removes everything.

## Design

The visual system (dark warm charcoal, cream serif, gold) comes from the mockups in [`design/`](design/). Animation policy: `transform`/`opacity` only (compositor-friendly), pointer work rAF-throttled, `prefers-reduced-motion` respected.

Keyboard: `s` shuffle · `←`/`→` flip in focus mode · `c` copy · `esc` close.

## Files

- `index.html` — the page (onboarding, three sections, focus overlay, settings drawer)
- `styles.css` — design system
- `core.js` — providers, starter pack, pre-generation pool, time-aware prompts (`window.SmallTalkCore`, no DOM — reusable in a browser extension)
- `ui.js` — interactions and animation
- `design/` — reference mockups

## Extension path

`core.js` has zero DOM dependencies. A future extension popup reuses it directly: add a `manifest.json`, reuse the styles + a slim popup markup, list provider hosts under `host_permissions`.

## Troubleshooting

- **Key rejected** — re-copy it; make sure it matches the selected provider.
- **CORS / can't reach provider** — OpenRouter and Gemini are the most browser-friendly.
- **Model not available** — free model IDs rotate; type any current model id in Settings.
- **Rate limited** — free tiers throttle; Warmup backs off and starter lines keep working.
