// core.js — Warmup engine: providers, starter pack, pre-generation pool,
// time-aware prompts. No DOM access; ui.js wires this to the page.
// Classic script (no ES modules) so the page also works over file://.

(function (global) {
  // ---- free, OpenAI-compatible providers ----------------------------------
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
    apiKey: "sta.apiKey",
    context: "sta.context",
    provider: "sta.provider",
    model: "sta.model",
    pool: "sta.pool",
    used: "sta.used",
    onboarded: "sta.onboarded",
  };

  // ---- storage helpers -----------------------------------------------------

  function readJSON(key, fallback) {
    try {
      const v = JSON.parse(localStorage.getItem(key));
      return v == null ? fallback : v;
    } catch {
      return fallback;
    }
  }
  function writeJSON(key, val) {
    localStorage.setItem(key, JSON.stringify(val));
  }

  // Context shape: { name, role, location, interests, notes, recent: [{d:"2026-07-20", t:"back from Goa"}] }
  function loadContext() {
    const ctx = readJSON(STORE.context, {});
    // Migrate legacy string "recent" into dated entries.
    if (typeof ctx.recent === "string" && ctx.recent.trim()) {
      ctx.recent = [{ d: todayISO(), t: ctx.recent.trim() }];
      writeJSON(STORE.context, ctx);
    }
    if (!Array.isArray(ctx.recent)) ctx.recent = [];
    return ctx;
  }
  function saveContext(ctx) {
    writeJSON(STORE.context, ctx);
  }
  function addRecent(text) {
    const ctx = loadContext();
    ctx.recent.unshift({ d: todayISO(), t: text.trim() });
    ctx.recent = ctx.recent.slice(0, 12);
    saveContext(ctx);
    return ctx;
  }
  function removeRecent(index) {
    const ctx = loadContext();
    ctx.recent.splice(index, 1);
    saveContext(ctx);
    return ctx;
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
    return localStorage.getItem(`${STORE.model}.${provider}`) || PROVIDERS[provider].models[0];
  }
  function saveModel(provider, model) {
    localStorage.setItem(`${STORE.model}.${provider}`, model);
  }
  function hasAnyKey() {
    return Object.keys(PROVIDERS).some((p) => loadApiKey(p));
  }
  function isOnboarded() {
    return localStorage.getItem(STORE.onboarded) === "1";
  }
  function setOnboarded() {
    localStorage.setItem(STORE.onboarded, "1");
  }

  // ---- time awareness ------------------------------------------------------

  const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  function todayISO(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dateLine(d = new Date()) {
    return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }
  function partOfDay(d = new Date()) {
    const h = d.getHours();
    if (h < 5) return "late night";
    if (h < 12) return "morning";
    if (h < 17) return "afternoon";
    if (h < 21) return "evening";
    return "night";
  }

  // nth weekday-of-month helper (n=1..4, or -1 for last)
  function nthWeekday(year, month, weekday, n) {
    if (n > 0) {
      const first = new Date(year, month, 1);
      const offset = (weekday - first.getDay() + 7) % 7;
      return new Date(year, month, 1 + offset + (n - 1) * 7);
    }
    const last = new Date(year, month + 1, 0);
    const offset = (last.getDay() - weekday + 7) % 7;
    return new Date(year, month + 1, 0 - offset);
  }

  function usHolidays(year) {
    return [
      { name: "New Year's Day", date: new Date(year, 0, 1) },
      { name: "MLK Day", date: nthWeekday(year, 0, 1, 3) },
      { name: "Memorial Day", date: nthWeekday(year, 4, 1, -1) },
      { name: "July 4th", date: new Date(year, 6, 4) },
      { name: "Labor Day", date: nthWeekday(year, 8, 1, 1) },
      { name: "Halloween", date: new Date(year, 9, 31) },
      { name: "Thanksgiving", date: nthWeekday(year, 10, 4, 4) },
      { name: "Christmas", date: new Date(year, 11, 25) },
    ];
  }

  // Returns { name, days } for a US holiday within `window` days, else null.
  function upcomingHoliday(windowDays = 12, now = new Date()) {
    const all = [...usHolidays(now.getFullYear()), ...usHolidays(now.getFullYear() + 1)];
    const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    for (const h of all) {
      const days = Math.round((h.date.getTime() - t0) / 86400000);
      if (days >= 0 && days <= windowDays) return { name: h.name, days };
    }
    return null;
  }

  function timeBlock() {
    const now = new Date();
    const ctx = loadContext();
    const lines = [
      `Today for me: ${WEEKDAYS[now.getDay()]}, ${MONTHS[now.getMonth()]} ${now.getDate()} — it's ${partOfDay(now)} my time${ctx.location ? ` in ${ctx.location}` : ""}. My colleagues are in US time zones, so it's likely a different part of the day for them.`,
    ];
    const hol = upcomingHoliday();
    if (hol) {
      lines.push(hol.days === 0 ? `Today is ${hol.name} in the US.` : `${hol.name} in the US is ${hol.days} day${hol.days === 1 ? "" : "s"} away — fair game for small talk.`);
    }
    return lines.join("\n");
  }

  // ---- personal context block ----------------------------------------------

  function contextBlock(ctx) {
    const lines = [];
    if (ctx.name) lines.push(`Name: ${ctx.name}`);
    if (ctx.role) lines.push(`Role: ${ctx.role}`);
    if (ctx.location) lines.push(`Location: ${ctx.location}`);
    if (ctx.interests) lines.push(`Interests / hobbies: ${ctx.interests}`);
    if (ctx.recent && ctx.recent.length) {
      const items = ctx.recent.slice(0, 6).map((r) => `${r.d}: ${r.t}`).join("; ");
      lines.push(`Recent life (dated, newest first — prefer the newest): ${items}`);
    }
    if (ctx.notes) lines.push(`Other notes: ${ctx.notes}`);
    if (!lines.length) return "(No personal context provided yet — keep lines universally natural.)";
    return lines.join("\n");
  }

  // ---- prompts ---------------------------------------------------------------

  const BASE_SYSTEM = `You help someone who freezes up during the casual small talk at the start of video calls with US-based colleagues. They tend to answer in one or two words and feel awkward. Your job is to hand them natural, ready-to-say lines.

Rules for every suggestion:
- Sound like a real person speaking on a call, not written text. Contractions, warmth, easy rhythm.
- Keep it short: one to two sentences, the length someone actually says out loud.
- Feel natural to US work culture without being try-hard or corny. Use the date/weekday/holiday info when it genuinely fits.
- Weave in the person's real context when it fits, so the line sounds like them — never invent facts beyond what's given. Prefer their newest recent-life entries; ignore stale ones.
- No emojis. No hashtags. No stage directions or surrounding quotation marks.

Output format: reply with ONLY a JSON array of strings and nothing else. Example: ["first line", "second line"]`;

  function openersPrompt(ctx, nudge) {
    return {
      system: BASE_SYSTEM,
      user: `Give me 8 small-talk opener lines I could say to kick off a call — the kind that gets a friendly back-and-forth going. Mix generic-but-warm openers with a few drawn from my context and the day/time.

${timeBlock()}

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

${timeBlock()}

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

  // ---- starter pack (works with zero API key) --------------------------------
  // Curated lines; day tags pick weekday-appropriate ones first.
  // tags: mon (weekend recap), fri (weekend plans), mid (weekdays), any

  const STARTER_OPENERS = [
    { t: "mon", s: "Morning! How was the weekend — anything good, or mostly recharge mode?" },
    { t: "mon", s: "Happy Monday — did the weekend feel long enough, or over in a blink?" },
    { t: "mon", s: "Hope the weekend treated you well — did you get up to anything fun?" },
    { t: "fri", s: "Happy Friday! Any weekend plans, or keeping it open?" },
    { t: "fri", s: "We made it to Friday — anything fun lined up for the weekend?" },
    { t: "fri", s: "Friday energy today. Are you a big-plans person or a do-nothing-weekend person?" },
    { t: "mid", s: "Hey! How's the week treating you so far?" },
    { t: "mid", s: "How's it going over there — busy week or a calm one?" },
    { t: "mid", s: "We're about at the midweek mark — how's yours going?" },
    { t: "mid", s: "I feel like this week is flying by — is it just me?" },
    { t: "any", s: "How's your day going so far — just getting started over there, right?" },
    { t: "any", s: "It's already evening on my side, so you're getting my most caffeinated hours. How's your morning?" },
    { t: "any", s: "The weather finally turned nice here — how's it looking on your side?" },
    { t: "any", s: "Anything good on your calendar this week, or heads-down mostly?" },
    { t: "any", s: "Coffee number two over here. How's your morning going?" },
    { t: "any", s: "Any shows or games keeping you up lately? I need recommendations." },
    { t: "any", s: "How's everyone doing today?" },
    { t: "any", s: "Before we dive in — how's life outside of work treating you?" },
  ];

  const CHIP_QUESTIONS = [
    { q: "How was your weekend?", days: [1, 2] },
    { q: "How's it going?", days: [0, 1, 2, 3, 4, 5, 6] },
    { q: "Any plans for the weekend?", days: [4, 5] },
    { q: "How's the weather there?", days: [0, 1, 2, 3, 4, 5, 6] },
    { q: "Did you catch the game?", days: [1, 2] },
  ];

  const STARTER_ANSWERS = {
    "How was your weekend?": [
      "Pretty relaxed, honestly — I mostly recharged and caught up on a show. How about yours?",
      "It went by way too fast, but I got some good downtime in. Did you get up to anything fun?",
      "Nice and low-key — a bit of cooking, a bit of catching up with friends. Yours?",
      "Busy in a good way — errands and family stuff, but I'm not complaining. How was yours?",
    ],
    "How's it going?": [
      "Pretty good! It's been a steady week so far — how about you?",
      "Can't complain — coffee's kicked in and the calendar looks manageable today. You?",
      "Good, good — it's evening here so I'm on the home stretch. How's your day starting?",
      "Doing well! Actually looking forward to this one. How are things on your side?",
    ],
    "Any plans for the weekend?": [
      "Keeping it pretty open — probably a slow morning and a long walk. What about you?",
      "A friend's thing on Saturday, then absolutely nothing on Sunday, which I'm protecting. You?",
      "Catching up on sleep is the headline plan. Anything fun on your end?",
      "Might finally try that place everyone keeps recommending. What are you up to?",
    ],
    "How's the weather there?": [
      "It's been properly warm here lately — real summer. What's it like over there?",
      "We've had some rain, which honestly I don't mind. How's it looking on your side?",
      "Beautiful today, actually — makes it harder to stay at the desk. How about there?",
      "Sticky and humid — classic for this time of year here. Are you getting real summer too?",
    ],
    "Did you catch the game?": [
      "I caught the highlights — looked like a wild one. Did you watch it live?",
      "I missed it live and I've been dodging spoilers all morning. Was it good?",
      "I did! That last stretch was something. What did you think?",
      "Not that one — I'm more of an F1 person, honestly. Was it worth the hype?",
    ],
  };

  // Chips ordered by how relevant they are to today's weekday.
  function chipsForToday(now = new Date()) {
    const day = now.getDay();
    return [...CHIP_QUESTIONS]
      .map((c, i) => ({ ...c, rank: (c.days.includes(day) ? 0 : 1) * 10 + i }))
      .sort((a, b) => a.rank - b.rank)
      .map((c) => c.q);
  }

  // Deterministic-ish daily rotation so starter content changes each day.
  function daySeed(now = new Date()) {
    return now.getFullYear() * 372 + (now.getMonth() + 1) * 31 + now.getDate();
  }
  function rotate(arr, by) {
    if (!arr.length) return arr;
    const k = by % arr.length;
    return arr.slice(k).concat(arr.slice(0, k));
  }

  function starterOpeners(now = new Date()) {
    const day = now.getDay();
    const tag = day === 1 ? "mon" : day === 5 ? "fri" : day === 0 || day === 6 ? "any" : "mid";
    const primary = STARTER_OPENERS.filter((o) => o.t === tag).map((o) => o.s);
    const rest = STARTER_OPENERS.filter((o) => o.t !== tag && o.t === "any").map((o) => o.s);
    const others = STARTER_OPENERS.filter((o) => o.t !== tag && o.t !== "any").map((o) => o.s);
    return rotate(primary, daySeed(now)).concat(rotate(rest, daySeed(now)), rotate(others, daySeed(now)));
  }

  function starterAnswers(question) {
    const exact = STARTER_ANSWERS[question];
    if (exact) return rotate(exact, daySeed());
    return null; // custom typed questions need the API
  }

  // ---- template intros (instant, no API) --------------------------------------

  function introTemplates(ctx, tone) {
    const name = ctx.name || "";
    const role = ctx.role || "";
    const loc = ctx.location || "";
    const firstInterest = (ctx.interests || "").split(",")[0].trim();

    const who = name ? `I'm ${name}` : "I'm on the team";
    const roleBit = role ? (name ? `, ${role.toLowerCase().startsWith("the ") ? role : role}` : ` — ${role}`) : "";
    const locBit = loc ? ` based in ${loc}` : "";
    const hobbyBit = firstInterest ? ` Outside work you'll usually find me into ${firstInterest}.` : "";

    if (tone === "professional") {
      return [
        `Hi everyone — ${who}${roleBit}${locBit}. Looking forward to working with you all on this.`,
        `Hello, ${who}${roleBit}${locBit ? `,${locBit}` : ""}. Glad to be joining — feel free to reach out to me anytime.`,
        `Hi all — ${who}${roleBit}. I'll be working closely with this group${locBit ? ` from ${loc}` : ""}, so you'll see a lot of me.`,
      ];
    }
    if (tone === "brief") {
      return [
        `Hi all — ${name || "hello"}${role ? `, ${role}` : ""}. Great to meet everyone.`,
        `Hey everyone${name ? ` — ${name} here` : ""}${role ? `, on the ${role.toLowerCase().includes("engineer") ? "engineering" : role} side` : ""}. Excited to get going.`,
        `${name ? `${name}` : "Hi"}${role ? `, ${role}` : ""}${locBit}. Happy to be here.`,
      ];
    }
    // warm & casual (default)
    return [
      `Hey everyone — ${who}${roleBit}${locBit}.${hobbyBit} Really glad to be working with you all.`,
      `Hi! ${who}${roleBit}${locBit ? `,${locBit}` : ""}.${hobbyBit} Excited to put faces to names.`,
      `Hey all — ${who}${roleBit}. I'm${locBit || " remote"}, so apologies in advance for my time zone math.${hobbyBit}`,
    ];
  }

  // ---- used-line tracking -----------------------------------------------------

  function usedMap() {
    return readJSON(STORE.used, {});
  }
  function markUsed(text) {
    const m = usedMap();
    m[text] = Date.now();
    // prune >14 days
    const cutoff = Date.now() - 14 * 86400000;
    for (const k of Object.keys(m)) if (m[k] < cutoff) delete m[k];
    writeJSON(STORE.used, m);
  }
  function isUsed(text) {
    const t = usedMap()[text];
    return t != null && Date.now() - t < 7 * 86400000;
  }
  function filterUsed(list) {
    const fresh = list.filter((s) => !isUsed(s));
    return fresh.length >= 3 ? fresh : list;
  }

  // ---- pre-generation pool ------------------------------------------------------
  // pool = { date, openers: [..], respond: { question: [..] }, intro: { tone: [..] }, cursors: {} }

  function loadPool() {
    const p = readJSON(STORE.pool, null);
    if (!p || p.date !== todayISO()) {
      return { date: todayISO(), openers: [], respond: {}, intro: {}, cursors: {} };
    }
    p.cursors = p.cursors || {};
    p.respond = p.respond || {};
    p.intro = p.intro || {};
    return p;
  }
  function savePool(p) {
    writeJSON(STORE.pool, p);
  }

  function poolGet(kind, subkey) {
    const p = loadPool();
    if (kind === "openers") return p.openers;
    if (kind === "respond") return p.respond[subkey] || [];
    if (kind === "intro") return p.intro[subkey] || [];
    return [];
  }
  function poolSet(kind, subkey, items) {
    const p = loadPool();
    if (kind === "openers") p.openers = items;
    else if (kind === "respond") p.respond[subkey] = items;
    else if (kind === "intro") p.intro[subkey] = items;
    savePool(p);
  }

  // Instantly return n lines for display: AI pool first, starter fallback,
  // rotating a cursor so shuffle always shows something new with zero wait.
  function take(kind, subkey, n) {
    const p = loadPool();
    const key = `${kind}:${subkey || ""}`;
    let source = poolGet(kind, subkey);
    let fromAI = true;
    if (!source.length) {
      fromAI = false;
      if (kind === "openers") source = starterOpeners();
      else if (kind === "respond") source = starterAnswers(subkey) || [];
      else if (kind === "intro") source = introTemplates(loadContext(), subkey);
    }
    source = filterUsed(source);
    if (!source.length) return { lines: [], fromAI };
    const cur = p.cursors[key] || 0;
    const lines = [];
    for (let i = 0; i < Math.min(n, source.length); i++) {
      lines.push(source[(cur + i) % source.length]);
    }
    p.cursors[key] = (cur + n) % source.length;
    savePool(p);
    return { lines, fromAI };
  }

  // How many AI lines remain unshown-ish for a bucket (to decide refills).
  function poolDepth(kind, subkey) {
    return poolGet(kind, subkey).length;
  }

  // ---- response parsing -----------------------------------------------------

  function parseSuggestions(text) {
    if (!text) return [];
    let t = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    try {
      const j = JSON.parse(t);
      if (Array.isArray(j)) return clean(j);
      if (Array.isArray(j?.suggestions)) return clean(j.suggestions);
    } catch {}
    const m = t.match(/\[[\s\S]*\]/);
    if (m) {
      try {
        const j = JSON.parse(m[0]);
        if (Array.isArray(j)) return clean(j);
      } catch {}
    }
    const lines = t
      .split("\n")
      .map((l) => l.replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "").trim())
      .map((l) => l.replace(/^["']|["']$/g, "").trim())
      .filter((l) => l.length > 1);
    return clean(lines);
  }
  function clean(arr) {
    return arr.map((s) => String(s).trim().replace(/^["']|["']$/g, "").trim()).filter(Boolean);
  }

  // ---- API call ---------------------------------------------------------------

  async function generate({ provider, apiKey, model, system, user }) {
    const cfg = PROVIDERS[provider];
    if (!cfg) throw new Error("Unknown provider.");
    if (!apiKey) throw new Error("Add your free API key in Settings first.");

    const headers = {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    };
    if (provider === "openrouter") {
      headers["HTTP-Referer"] = "https://smalltalk-assist.vercel.app";
      headers["X-Title"] = "Warmup";
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
      throw new Error("Couldn't reach the provider — often a CORS block. Try OpenRouter or Gemini.");
    }

    if (!res.ok) {
      let detail = "";
      try {
        const err = await res.json();
        detail = err?.error?.message || err?.message || "";
      } catch {}
      if (res.status === 401 || res.status === 403) throw new Error("That API key was rejected. Check it in Settings.");
      if (res.status === 429) throw new Error("Rate limited on the free tier — wait a bit and retry.");
      if (res.status === 404) throw new Error("That model isn't available. Pick another in Settings.");
      if (res.status >= 500) throw new Error("The provider had a hiccup. Try again shortly.");
      throw new Error(detail || `Request failed (${res.status}).`);
    }

    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content || "";
    const list = parseSuggestions(text);
    if (!list.length) throw new Error("No usable suggestions came back. Try again.");
    return list;
  }

  // ---- background refill --------------------------------------------------------
  // Fire-and-forget: tops up a pool bucket via the API. Never throws to the UI.

  const refilling = new Set();

  async function refill(kind, subkey) {
    const key = `${kind}:${subkey || ""}`;
    if (refilling.has(key)) return false;
    const provider = loadProvider();
    const apiKey = loadApiKey(provider);
    if (!apiKey) return false;

    const ctx = loadContext();
    let prompt;
    if (kind === "openers") prompt = openersPrompt(ctx, poolDepth(kind, subkey) > 0);
    else if (kind === "respond") prompt = respondPrompt(ctx, subkey, poolDepth(kind, subkey) > 0);
    else if (kind === "intro") prompt = introPrompt(ctx, subkey, poolDepth(kind, subkey) > 0);
    else return false;

    refilling.add(key);
    try {
      const list = await generate({
        provider,
        apiKey,
        model: loadModel(provider),
        system: prompt.system,
        user: prompt.user,
      });
      const existing = poolGet(kind, subkey);
      const merged = [...new Set([...list, ...existing])].slice(0, 24);
      poolSet(kind, subkey, merged);
      return true;
    } catch (e) {
      console.debug("[warmup] background refill failed:", e.message);
      return false;
    } finally {
      refilling.delete(key);
    }
  }

  // Warm the pools shortly after load, staggered to respect free-tier limits.
  function warmPools() {
    if (!hasAnyKey()) return;
    const chips = chipsForToday();
    const jobs = [
      () => poolDepth("openers") < 6 && refill("openers"),
      () => poolDepth("respond", chips[0]) < 3 && refill("respond", chips[0]),
      () => poolDepth("respond", chips[1]) < 3 && refill("respond", chips[1]),
    ];
    jobs.forEach((job, i) => setTimeout(job, 400 + i * 2000));
  }

  global.SmallTalkCore = {
    PROVIDERS,
    CHIP_QUESTIONS,
    loadContext,
    saveContext,
    addRecent,
    removeRecent,
    loadProvider,
    saveProvider,
    loadApiKey,
    saveApiKey,
    loadModel,
    saveModel,
    hasAnyKey,
    isOnboarded,
    setOnboarded,
    dateLine,
    chipsForToday,
    starterAnswers,
    introTemplates,
    markUsed,
    isUsed,
    take,
    poolDepth,
    refill,
    warmPools,
    generate,
    openersPrompt,
    respondPrompt,
    introPrompt,
    parseSuggestions,
    poolSet,
  };
})(window);
