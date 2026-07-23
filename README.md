# Small Talk Assist

A tiny website that hands you natural, ready-to-say lines for the casual small talk at the start of calls with US teams — so you're not stuck answering in one or two words. Powered by a **free** AI API key (your own), with everything stored only in your browser.

## What it does

- **Openers** — warm, natural lines to kick off a call.
- **Respond** — type what a colleague asked you ("How was your weekend?") and get 4 natural replies that also bounce a light question back.
- **Intro** — short self-introductions for the top of a call, in the tone you pick.
- **Shuffle** — regenerate any set for fresh options.
- **Personal context** — save your role, interests, recent life, etc. so suggestions sound like *you*.

## Setup (2 minutes)

1. **Open `index.html`** — just double-click it. No install, no build step.
2. Click **⚙ Settings**, pick a provider, and paste a free API key:

   | Provider | Free key from | Notes |
   |---|---|---|
   | **OpenRouter** (recommended) | https://openrouter.ai/keys | Works from the browser; one key, several free models. |
   | **Google Gemini** | https://aistudio.google.com/apikey | Generous free tier. |
   | **Groq** | https://console.groq.com/keys | Very fast. May be blocked by the browser (CORS) — if so, use one of the others. |

3. Fill in a bit **About you** (optional but makes suggestions feel personal).
4. **Save**, then hit **Get openers** / **Get replies** / **Get intros**.

## Privacy

Your API key and personal context live in your browser's `localStorage` — nothing is sent anywhere except directly to the AI provider you choose when you generate. Clearing site data removes everything.

## Files

- `index.html` — the page
- `styles.css` — styling (light + dark, auto)
- `core.js` — providers, prompts, and API calls (no DOM — **reusable in a browser extension later**)
- `ui.js` — wires the core to the page

## Turning this into a browser extension later

The generation logic is isolated in `core.js` (`window.SmallTalkCore`) with no DOM dependencies, so a future extension popup can load the same file and reuse `openersPrompt` / `respondPrompt` / `introPrompt` / `generate` directly. You'd add a `manifest.json`, reuse `index.html` (or a slimmer popup) + `styles.css` + `ui.js`, and list the provider hosts under `host_permissions`.

## Troubleshooting

- **"That API key was rejected"** — re-copy the key; make sure it matches the selected provider.
- **"Couldn't reach the provider" / CORS** — some providers block browser calls. OpenRouter and Gemini are the most browser-friendly.
- **"That model isn't available"** — free model IDs change. In Settings, type a current model id (the field accepts any value).
- **"Rate limited"** — free tiers have limits; wait a bit and retry.
