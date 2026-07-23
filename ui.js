// ui.js — Warmup interactions. Classic script (works over file://).
// Animation policy: WAAPI on transform/opacity only; pointer work is rAF-throttled.
(function () {
  const C = window.SmallTalkCore;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE_POINTER = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

  let activeTab = "openers";
  let activeChip = null;
  let activeTone = "warm";
  let typedMode = false;

  // ---------------------------------------------------------------- helpers

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function setStatus(kind, html, isError) {
    const el = $(`[data-status="${kind}"]`);
    if (!el) return;
    el.className = "status" + (isError ? " error" : "");
    el.innerHTML = html || "";
  }

  async function copyText(text, btn) {
    try {
      await navigator.clipboard.writeText(text);
      if (btn) {
        btn.textContent = "copied";
        btn.classList.add("done");
        setTimeout(() => {
          btn.textContent = "copy";
          btn.classList.remove("done");
        }, 1200);
      } else {
        toast("Copied");
      }
    } catch {
      toast("Couldn't copy");
    }
  }

  // ------------------------------------------------------------- animations

  function animateIn(nodes, { fromY = 12, stagger = 45, dur = 380 } = {}) {
    if (REDUCED) return;
    nodes.forEach((n, i) => {
      n.animate(
        [
          { opacity: 0, transform: `translateY(${fromY}px)` },
          { opacity: 1, transform: "translateY(0)" },
        ],
        { duration: dur, delay: i * stagger, easing: EASE, fill: "backwards" }
      );
    });
  }

  function animateOut(nodes, { stagger = 25, dur = 140 } = {}) {
    if (REDUCED || !nodes.length) return Promise.resolve();
    const anims = nodes.map((n, i) =>
      n.animate(
        [
          { opacity: 1, transform: "translateY(0)" },
          { opacity: 0, transform: "translateY(-8px)" },
        ],
        { duration: dur, delay: i * stagger, easing: "ease-in", fill: "forwards" }
      )
    );
    return Promise.all(anims.map((a) => a.finished)).catch(() => {});
  }

  // Swap a results container's content with a buttery out→in sequence.
  async function swapResults(container, build) {
    await animateOut($$(".card", container));
    container.innerHTML = "";
    build(container);
    animateIn($$(".card", container));
  }

  // ------------------------------------------------------ pointer glow/tilt

  let rafPending = false;
  function onCardPointerMove(e) {
    const card = e.target.closest(".card");
    if (!card || rafPending) return;
    rafPending = true;
    const { clientX, clientY } = e;
    requestAnimationFrame(() => {
      rafPending = false;
      const r = card.getBoundingClientRect();
      const x = clientX - r.left;
      const y = clientY - r.top;
      card.style.setProperty("--mx", `${x}px`);
      card.style.setProperty("--my", `${y}px`);
      // whisper of tilt — max ~1.2deg, transform-only
      const rx = ((y / r.height) - 0.5) * -2.4;
      const ry = ((x / r.width) - 0.5) * 2.4;
      card.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      card.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
    });
  }
  function onCardPointerLeave(e) {
    const card = e.target.closest(".card");
    if (!card) return;
    card.style.setProperty("--rx", "0deg");
    card.style.setProperty("--ry", "0deg");
  }
  if (FINE_POINTER && !REDUCED) {
    document.addEventListener("pointermove", onCardPointerMove, { passive: true });
    document.addEventListener("pointerout", onCardPointerLeave, { passive: true });
  }

  // ------------------------------------------------------------------ cards

  function makeCard(text, list, index) {
    const card = document.createElement("article");
    card.className = "card";
    card.tabIndex = 0;
    if (C.isUsed(text)) card.classList.add("used");

    const p = document.createElement("p");
    p.textContent = text;

    const actions = document.createElement("div");
    actions.className = "card-actions";

    const copyBtn = document.createElement("button");
    copyBtn.className = "mini";
    copyBtn.textContent = "copy";
    copyBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      copyText(text, copyBtn);
    });

    const saidBtn = document.createElement("button");
    saidBtn.className = "mini";
    saidBtn.textContent = "said it";
    saidBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      C.markUsed(text);
      card.classList.add("used");
      toast("Noted — won't suggest that one again this week");
    });

    actions.append(copyBtn, saidBtn);
    card.append(p, actions);

    const openFocus = () => focusOpen(list, index);
    card.addEventListener("click", openFocus);
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter") openFocus();
    });
    return card;
  }

  function buildCards(container, lines) {
    lines.forEach((text, i) => container.appendChild(makeCard(text, lines, i)));
  }

  // ------------------------------------------------------------- tab system

  const tabInk = $("#tabInk");
  function moveInk(tabEl) {
    const parent = tabEl.parentElement.getBoundingClientRect();
    const r = tabEl.getBoundingClientRect();
    tabInk.style.transform = `translateX(${r.left - parent.left}px) scaleX(${r.width / 40})`;
  }

  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", async () => {
      if (tab.dataset.tab === activeTab) return;
      activeTab = tab.dataset.tab;
      $$(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on);
      });
      moveInk(tab);

      const current = $(`[data-panel]:not([hidden])`);
      const next = $(`[data-panel="${activeTab}"]`);
      if (current && current !== next) {
        if (!REDUCED) {
          await current.animate(
            [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }],
            { duration: 130, easing: "ease-in", fill: "forwards" }
          ).finished.catch(() => {});
        }
        current.hidden = true;
      }
      next.hidden = false;
      if (!REDUCED) {
        next.animate(
          [{ opacity: 0, transform: "translateY(10px)" }, { opacity: 1, transform: "translateY(0)" }],
          { duration: 320, easing: EASE }
        );
      }
      renderTab(activeTab, { animate: false });
    });
  });

  window.addEventListener("resize", () => {
    const active = $(".tab.active");
    if (active) requestAnimationFrame(() => moveInk(active));
  });

  // ------------------------------------------------------------- rendering

  function renderOpeners({ animate = true } = {}) {
    const container = $(`[data-results="openers"]`);
    const { lines, fromAI } = C.take("openers", null, 3);
    const build = (c) => buildCards(c, lines);
    if (animate) swapResults(container, build);
    else {
      container.innerHTML = "";
      build(container);
      animateIn($$(".card", container));
    }
    if (!C.hasAnyKey()) {
      setStatus("openers", `Built-in starter lines · <span class="linkish" id="statusKeyLink">add a free key</span> to make them sound like you`);
      const link = $("#statusKeyLink");
      if (link) link.addEventListener("click", openDrawer);
    } else if (!fromAI) {
      setStatus("openers", "Warming up personalized lines in the background…");
      topUp("openers", null, () => activeTab === "openers" && setStatus("openers", ""));
    } else {
      setStatus("openers", "");
    }
  }

  function renderRespond({ animate = true } = {}) {
    const container = $(`[data-results="respond"]`);
    if (typedMode) return; // typed flow renders its own results
    const q = activeChip;
    const { lines, fromAI } = C.take("respond", q, 3);
    const build = (c) => buildCards(c, lines);
    if (animate) swapResults(container, build);
    else {
      container.innerHTML = "";
      build(container);
      animateIn($$(".card", container));
    }
    if (C.hasAnyKey() && !fromAI) topUp("respond", q);
    setStatus("respond", "");
  }

  function renderIntro({ animate = true } = {}) {
    const container = $(`[data-results="intro"]`);
    const toneLabel = { warm: "warm & casual", professional: "friendly but professional", brief: "brief and confident" }[activeTone];
    const { lines, fromAI } = C.take("intro", toneLabel, 3);
    const build = (c) => buildCards(c, lines);
    if (animate) swapResults(container, build);
    else {
      container.innerHTML = "";
      build(container);
      animateIn($$(".card", container));
    }
    const ctx = C.loadContext();
    if (!ctx.name && !ctx.role) {
      setStatus("intro", `These get much better with your name and role — <span class="linkish" id="introKeyLink">add them</span>`);
      const link = $("#introKeyLink");
      if (link) link.addEventListener("click", openDrawer);
    } else {
      setStatus("intro", "");
    }
    if (C.hasAnyKey() && !fromAI) topUp("intro", toneLabel);
  }

  function renderTab(kind, opts) {
    if (kind === "openers") renderOpeners(opts);
    else if (kind === "respond") renderRespond(opts);
    else renderIntro(opts);
  }

  // Fire a background refill; optional callback when fresh lines are in.
  function topUp(kind, subkey, onDone) {
    C.refill(kind, subkey).then((ok) => {
      if (ok && onDone) onDone();
    });
  }

  // --------------------------------------------------------------- shuffles

  $$("[data-shuffle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const kind = btn.dataset.shuffle;
      if (kind === "respond" && typedMode) {
        runTyped(true);
        return;
      }
      renderTab(kind, { animate: true });
      // keep the well full for the *next* shuffle
      if (C.hasAnyKey()) {
        if (kind === "openers" && C.poolDepth("openers") < 6) topUp("openers");
        if (kind === "respond" && activeChip && C.poolDepth("respond", activeChip) < 4) topUp("respond", activeChip);
      }
    });
  });

  // ------------------------------------------------------------------ chips

  function renderChips() {
    const box = $("#chips");
    box.innerHTML = "";
    const chips = C.chipsForToday();
    if (!activeChip) activeChip = chips[0];
    chips.forEach((q) => {
      const b = document.createElement("button");
      b.className = "chip" + (q === activeChip && !typedMode ? " active" : "");
      b.textContent = q;
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => {
        typedMode = false;
        $("#typeRow").hidden = true;
        activeChip = q;
        $$("#chips .chip").forEach((c) => c.classList.toggle("active", c === b));
        renderRespond({ animate: true });
      });
      box.appendChild(b);
    });
  }

  $("#typeToggle").addEventListener("click", () => {
    typedMode = !typedMode;
    $("#typeRow").hidden = !typedMode;
    $$("#chips .chip").forEach((c) => c.classList.remove("active"));
    if (typedMode) {
      $("#questionInput").focus();
      $("#typeToggle").textContent = "back to quick questions";
    } else {
      $("#typeToggle").textContent = "or type what they said";
      $$("#chips .chip").forEach((c) => c.classList.toggle("active", c.textContent === activeChip));
      renderRespond({ animate: true });
    }
  });

  async function runTyped(nudge) {
    const q = $("#questionInput").value.trim();
    if (!q) {
      setStatus("respond", "Type what they said first.", true);
      return;
    }
    const provider = C.loadProvider();
    const apiKey = C.loadApiKey(provider);
    if (!apiKey) {
      setStatus("respond", `Custom questions need a free API key — <span class="linkish" id="respKeyLink">add one</span>`, true);
      const link = $("#respKeyLink");
      if (link) link.addEventListener("click", openDrawer);
      return;
    }
    setStatus("respond", '<span class="dots">Thinking</span>');
    try {
      const prompt = C.respondPrompt(C.loadContext(), q, nudge);
      const lines = await C.generate({
        provider,
        apiKey,
        model: C.loadModel(provider),
        system: prompt.system,
        user: prompt.user,
      });
      const container = $(`[data-results="respond"]`);
      await swapResults(container, (c) => buildCards(c, lines.slice(0, 4)));
      setStatus("respond", "");
    } catch (e) {
      setStatus("respond", e.message, true);
    }
  }

  $("#questionInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") runTyped(false);
  });

  // ------------------------------------------------------------------ tones

  $$("#tones .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#tones .chip").forEach((c) => c.classList.toggle("active", c === chip));
      activeTone = chip.dataset.tone;
      renderIntro({ animate: true });
    });
  });

  // ------------------------------------------------------------- focus mode

  const overlay = $("#focusOverlay");
  const focusLine = $("#focusLine");
  const focusCount = $("#focusCount");
  let focusList = [];
  let focusIdx = 0;
  let focusIsOpen = false;

  function focusRender(direction = 0) {
    const text = focusList[focusIdx];
    focusCount.textContent = `${focusIdx + 1} of ${focusList.length}`;
    if (REDUCED || direction === 0) {
      focusLine.textContent = text;
      if (!REDUCED) {
        focusLine.animate(
          [{ opacity: 0, transform: "translateY(14px) scale(0.99)" }, { opacity: 1, transform: "none" }],
          { duration: 420, easing: EASE }
        );
      }
      return;
    }
    const dx = direction * 26;
    focusLine
      .animate(
        [{ opacity: 1, transform: "translateX(0)" }, { opacity: 0, transform: `translateX(${-dx}px)` }],
        { duration: 140, easing: "ease-in", fill: "forwards" }
      )
      .finished.then(() => {
        focusLine.textContent = text;
        focusLine.animate(
          [{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "translateX(0)" }],
          { duration: 300, easing: EASE, fill: "forwards" }
        );
      })
      .catch(() => {});
  }

  function focusOpen(list, idx) {
    focusList = list;
    focusIdx = idx;
    focusIsOpen = true;
    overlay.classList.add("open");
    focusRender(0);
  }
  function focusClose() {
    focusIsOpen = false;
    overlay.classList.remove("open");
  }
  function focusStep(dir) {
    focusIdx = (focusIdx + dir + focusList.length) % focusList.length;
    focusRender(dir);
  }

  $("#focusPrev").addEventListener("click", () => focusStep(-1));
  $("#focusNext").addEventListener("click", () => focusStep(1));
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) focusClose();
  });

  // ---------------------------------------------------------------- keyboard

  document.addEventListener("keydown", (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "");
    if (focusIsOpen) {
      if (e.key === "Escape") focusClose();
      else if (e.key === "ArrowRight") focusStep(1);
      else if (e.key === "ArrowLeft") focusStep(-1);
      else if (e.key.toLowerCase() === "c") copyText(focusList[focusIdx]);
      return;
    }
    if (typing) return;
    if (e.key.toLowerCase() === "s") {
      const btn = $(`[data-shuffle="${activeTab}"]`);
      if (btn) btn.click();
    }
  });

  // --------------------------------------------------------------- what's new

  function addWhatsNew() {
    const input = $("#whatsnewInput");
    const text = input.value.trim();
    if (!text) return;
    C.addRecent(text);
    input.value = "";
    toast("Noted — I'll weave that in");
    // Fresh context → stale AI pools. Clear and re-warm quietly.
    C.poolSet("openers", null, []);
    C.warmPools();
  }
  $("#whatsnewAdd").addEventListener("click", addWhatsNew);
  $("#whatsnewInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") addWhatsNew();
  });

  // ------------------------------------------------------------------ drawer

  const drawer = $("#settingsDrawer");
  const providerSelect = $("#providerSelect");

  Object.entries(C.PROVIDERS).forEach(([id, cfg]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = cfg.label;
    providerSelect.appendChild(opt);
  });

  function reflectProvider(id) {
    const cfg = C.PROVIDERS[id];
    providerSelect.value = id;
    $("#providerNote").textContent = cfg.note;
    $("#keyLink").href = cfg.keyPage;
    $("#apiKeyInput").value = C.loadApiKey(id);
    $("#modelInput").value = C.loadModel(id);
    const dl = $("#modelList");
    dl.innerHTML = "";
    cfg.models.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      dl.appendChild(o);
    });
  }
  providerSelect.addEventListener("change", () => reflectProvider(providerSelect.value));

  function renderTimeline() {
    const ctx = C.loadContext();
    const ul = $("#timeline");
    ul.innerHTML = "";
    ctx.recent.forEach((r, i) => {
      const li = document.createElement("li");
      const d = document.createElement("span");
      d.className = "tdate";
      const dt = new Date(r.d + "T00:00:00");
      d.textContent = isNaN(dt) ? r.d : dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const t = document.createElement("span");
      t.className = "ttext";
      t.textContent = r.t;
      const del = document.createElement("button");
      del.className = "tdel";
      del.textContent = "✕";
      del.setAttribute("aria-label", "Delete entry");
      del.addEventListener("click", () => {
        C.removeRecent(i);
        renderTimeline();
      });
      li.append(d, t, del);
      ul.appendChild(li);
    });
  }

  $("#timelineAdd").addEventListener("click", () => {
    const ul = $("#timeline");
    if ($("#timelineNewInput")) return;
    const li = document.createElement("li");
    const input = document.createElement("input");
    input.type = "text";
    input.id = "timelineNewInput";
    input.placeholder = "what happened?";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        C.addRecent(input.value.trim());
        renderTimeline();
      } else if (e.key === "Escape") {
        li.remove();
      }
    });
    li.appendChild(input);
    ul.appendChild(li);
    input.focus();
  });

  function openDrawer() {
    reflectProvider(C.loadProvider());
    const ctx = C.loadContext();
    $("#ctxName").value = ctx.name || "";
    $("#ctxRole").value = ctx.role || "";
    $("#ctxLocation").value = ctx.location || "";
    $("#ctxInterests").value = ctx.interests || "";
    $("#ctxNotes").value = ctx.notes || "";
    renderTimeline();
    drawer.showModal();
    if (!REDUCED) {
      drawer.animate(
        [{ transform: "translateX(100%)" }, { transform: "translateX(0)" }],
        { duration: 420, easing: EASE }
      );
    }
  }

  function closeDrawer() {
    if (REDUCED) {
      drawer.close();
      return;
    }
    drawer
      .animate([{ transform: "translateX(0)" }, { transform: "translateX(100%)" }], {
        duration: 320,
        easing: "ease-in",
        fill: "forwards",
      })
      .finished.then(() => drawer.close())
      .catch(() => drawer.close());
  }

  function saveSettings() {
    const id = providerSelect.value;
    const hadKey = C.hasAnyKey();
    C.saveProvider(id);
    C.saveApiKey(id, $("#apiKeyInput").value);
    C.saveModel(id, $("#modelInput").value.trim() || C.PROVIDERS[id].models[0]);
    const ctx = C.loadContext();
    ctx.name = $("#ctxName").value.trim();
    ctx.role = $("#ctxRole").value.trim();
    ctx.location = $("#ctxLocation").value.trim();
    ctx.interests = $("#ctxInterests").value.trim();
    ctx.notes = $("#ctxNotes").value.trim();
    C.saveContext(ctx);
    closeDrawer();
    toast("Saved");
    // Context change → refresh pools + visible content.
    C.poolSet("openers", null, []);
    C.warmPools();
    renderTab(activeTab, { animate: true });
    if (!hadKey && C.hasAnyKey()) setStatus("openers", "Warming up personalized lines in the background…");
  }

  $("#settingsBtn").addEventListener("click", openDrawer);
  $("#closeSettings").addEventListener("click", closeDrawer);
  $("#saveSettings").addEventListener("click", saveSettings);
  drawer.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeDrawer();
  });
  drawer.addEventListener("click", (e) => {
    if (e.target === drawer) closeDrawer();
  });

  // -------------------------------------------------------------- onboarding

  function showApp(entrance) {
    $("#onboard").hidden = true;
    const app = $("#app");
    app.hidden = false;
    $("#dateLine").textContent = C.dateLine().toUpperCase();
    renderChips();
    requestAnimationFrame(() => moveInk($(".tab.active")));
    renderTab("openers", { animate: false });
    C.warmPools();
    if (entrance && !REDUCED) {
      animateIn([$(".kicker"), $(".tabs"), $(".screen-title"), ...$$(`[data-panel="openers"] .card`), $(".whatsnew")].filter(Boolean), {
        fromY: 16,
        stagger: 60,
        dur: 480,
      });
    }
  }

  function initOnboarding() {
    $("#onboard").hidden = false;
    const container = $("#onboardResults");
    const { lines } = C.take("openers", null, 3);
    buildCards(container, lines);
    animateIn([$(".onboard-title"), $(".onboard-sub"), ...$$("#onboardResults .card"), $(".likeyou")], {
      fromY: 18,
      stagger: 80,
      dur: 520,
    });

    $("#obSave").addEventListener("click", () => {
      const key = $("#obKey").value.trim();
      const about = $("#obAbout").value.trim();
      if (key) C.saveApiKey(C.loadProvider(), key);
      if (about) {
        const ctx = C.loadContext();
        ctx.notes = about;
        C.saveContext(ctx);
      }
      C.setOnboarded();
      showApp(true);
      if (key) toast("Warming up personalized lines…");
    });
    $("#obLater").addEventListener("click", () => {
      C.setOnboarded();
      showApp(true);
    });
  }

  // -------------------------------------------------------------------- init

  if (C.isOnboarded()) showApp(true);
  else initOnboarding();
})();
