// core.js — provider + prompt logic, framework-free so an extension popup can reuse it.
// No DOM access here; ui.js wires this to the page.
// Classic script (no ES modules) so the page also works when opened via file://.

(function (global) {
  // ---- free, OpenAI-compatible providers ----------------------------------
  // All of these accept the OpenAI chat-completions request shape, so one code
  // path covers them — only the URL, auth header, and model list differ.
  // Model IDs on free tiers change often; each provider lets you type a custom
  // model if the defaults get retired.
  const PROVIDERS = {
    openrouter: {
      label: "OpenRouter (free models)",
      url: "https://openrouter.ai/api/v1/chat/completions",
      keyPage: "https://openrouter.ai/keys",
      note: "Recommended — works from the browser. Free key, several free models.",
      models: [
        "meta-llama/llama-3.3-70b-instruct:free",
        "google/gemini-2.0-flash-exp:free",
        "deepseek/deepseek-chat-v3-0324:free",
      ],
    },
    gemini: {
      label: "Google Gemini (free)",
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      keyPage: "https://aistudio.google.com/apikey",
      note: "Generous free tier. Get a key from Google AI Studio.",
      models: ["gemini-2.0-flash", "gemini-2.5-flash"],
    },
    groq: {
      label: "Groq (free, fast)",
      url: "https://api.groq.com/openai/v1/chat/completions",
      keyPage: "https://console.groq.com/keys",
      note: "Very fast. If the browser blocks it (CORS), use OpenRouter or Gemini.",
      models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    },
  };

  const STORE = {
    apiKey: "sta.apiKey", // stored per-provider: sta.apiKey.<provider>
    context: "sta.context",
    provider: "sta.provider",
    model: "sta.model", // stored per-provider: sta.model.<provider>
  };

  // ---- persistence --------------------------------------------------------

  function loadContext() {
    try {
      return JSON.parse(localStorage.getItem(STORE.context)) || {};
    } catch {
      return {};
    }
  }
  function saveContext(ctx) {
    localStorage.setItem(STORE.context, JSON.stringify(ctx));
  }

  function loadProvider() {
    const p = localStorage.getItem(STORE.provider);
    return PROVIDERS[p] ? p : "openrouter";
  }
  function saveProvider(p) {
    if (PROVIDERS[p]) localStorage.setItem(STORE.provider, p);
  }

  function loadApiKey(provider) {
    return localStorage.getItem(`${STORE.apiKey}.${provider}`) || "";
  }
  function saveApiKey(provider, key) {
    localStorage.setItem(`${STORE.apiKey}.${provider}`, (key || "").trim());
  }

  function loadModel(provider) {
    return (
      localStorage.getItem(`${STORE.model}.${provider}`) ||
      PROVIDERS[provider].models[0]
    );
  }
  function saveModel(provider, model) {
    localStorage.setItem(`${STORE.model}.${provider}`, model);
  }

  // ---- prompt building ----------------------------------------------------

  function contextBlock(ctx) {
    const lines = [];
    if (ctx.name) lines.push(`Name: ${ctx.name}`);
    if (ctx.role) lines.push(`Role: ${ctx.role}`);
    if (ctx.location) lines.push(`Location: ${ctx.location}`);
    if (ctx.interests) lines.push(`Interests / hobbies: ${ctx.interests}`);
    if (ctx.recent) lines.push(`Recent life (weekend, trips, plans): ${ctx.recent}`);
    if (ctx.notes) lines.push(`Other notes: ${ctx.notes}`);
    if (!lines.length) return "(No personal context provided yet.)";
    return lines.join("\n");
  }

  const BASE_SYSTEM = `You help someone who freezes up during the casual small talk at the start of video calls with US-based colleagues. They tend to answer in one or two words and feel awkward. Your job is to hand them natural, ready-to-say lines.

Rules for every suggestion:
- Sound like a real person speaking on a call, not written text. Contractions, warmth, easy rhythm.
- Keep it short: one to two sentences, the length someone actually says out loud.
- Feel natural to US work culture (weekends, weather, sports, Friday/Monday energy, holidays, "how's it going") without being try-hard or corny.
- Weave in the person's real context when it fits, so the line sounds like them — never invent facts beyond what's given.
- No emojis. No hashtags. No stage directions or quotation marks around the lines.

Output format: reply with ONLY a JSON array of strings and nothing else. Example: ["first line", "second line"]`;

  function openersPrompt(ctx, nudge) {
    return {
      system: BASE_SYSTEM,
      user: `Give me 6 small-talk opener lines I could say to kick off a call — the kind that gets a friendly back-and-forth going. Mix a few generic-but-warm openers with a few drawn from my context.

My context:
${contextBlock(ctx)}
${nudge ? "\nGive me a fresh, different set from before." : ""}`,
    };
  }

  function respondPrompt(ctx, question, nudge) {
    return {
      system: BASE_SYSTEM,
      user: `A colleague just asked me: "${question}"

Give me 4 natural ways to answer out loud. Each should sound like me, use my context where it fits, stay to one or two sentences, and — where natural — bounce a light question back so the conversation keeps going.

My context:
${contextBlock(ctx)}
${nudge ? "\nGive me a fresh, different set from before." : ""}`,
    };
  }

  function introPrompt(ctx, tone, nudge) {
    return {
      system: BASE_SYSTEM,
      user: `Write 3 versions of a short self-introduction I can say at the start of a call when meeting people or introducing myself to the group. Tone: ${tone}. Each version 2-3 sentences, natural spoken aloud, using my context.

My context:
${contextBlock(ctx)}
${nudge ? "\nGive me a fresh, different set from before." : ""}`,
    };
  }

  // ---- response parsing ---------------------------------------------------

  // Free models don't always honor JSON mode, so parse leniently:
  // strip code fences, try JSON, then fall back to splitting lines.
  function parseSuggestions(text) {
    if (!text) return [];
    let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/,"").trim();

    // Try a clean JSON parse first.
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return clean(j);
      if (Array.isArray(j?.suggestions)) return clean(j.suggestions);
    } catch {}

    // Try to pull the first [...] block out of surrounding prose.
    const m = t.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (Array.isArray(j)) return clean(j);
      } catch {}
    }

    // Fall back: numbered or bulleted lines.
    const lines = t
      .split("\n")
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      .map((l) => l.replace(/^["']|["']$/g, "").trim())
      .filter((l) => l.length > 1);
    return clean(lines);
  }

  function clean(arr) {
    return arr
      .map((s) => String(s).trim().replace(/^["']|["']$/g, "").trim())
      .filter(Boolean);
  }

  // ---- API call -----------------------------------------------------------

  async function generate({ provider, apiKey, model, system, user }) {
    const cfg = PROVIDERS[provider];
    if (!cfg) throw new Error("Unknown provider.");
    if (!apiKey) throw new Error("Add your free API key in Settings first.");

    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    // OpenRouter likes these; harmless elsewhere.
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://smalltalk.local";
      headers["X-Title"] = "Small Talk Assist";
    }

    let res;
    try {
      res = await fetch(cfg.url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.9,
          max_tokens: 700,
        }),
      });
    } catch {
      throw new Error(
        "Couldn't reach the provider. This is often a CORS block — try OpenRouter or Gemini, or check your connection."
      );
    }

    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.error?.message || err?.message || "";
      } catch {}
      if (res.status === 401 || res.status === 403)
        throw new Error("That API key was rejected. Check it in Settings.");
      if (res.status === 429)
        throw new Error("Rate limited on the free tier — wait a bit and retry.");
      if (res.status === 404)
        throw new Error("That model isn't available. Pick another in Settings.");
      if (res.status >= 500)
        throw new Error("The provider had a hiccup. Try again shortly.");
      throw new Error(detail || `Request failed (${res.status}).`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const list = parseSuggestions(text);
    if (!list.length) throw new Error("No usable suggestions came back. Try again.");
    return list;
  }

  global.SmallTalkCore = {
    PROVIDERS,
    loadContext,
    saveContext,
    loadProvider,
    saveProvider,
    loadApiKey,
    saveApiKey,
    loadModel,
    saveModel,
    openersPrompt,
    respondPrompt,
    introPrompt,
    generate,
  };
})(window);
