// ui.js — wires core.js to the page. Classic script (works over file://).
(function () {
  const C = window.SmallTalkCore;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let currentTone = "warm & casual";

  // ---- tabs ---------------------------------------------------------------
  $$(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      const name = tab.dataset.tab;
      $$(".tab").forEach((t) => t.classList.toggle("active", t === tab));
      $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== name));
    });
  });

  // ---- tone chips ---------------------------------------------------------
  $$("#toneGroup .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      $$("#toneGroup .chip").forEach((c) => c.classList.toggle("active", c === chip));
      currentTone = chip.dataset.tone;
    });
  });

  // ---- settings dialog ----------------------------------------------------
  const dialog = $("#settingsDialog");
  const providerSelect = $("#providerSelect");
  const providerNote = $("#providerNote");
  const keyLink = $("#keyLink");
  const apiKeyInput = $("#apiKeyInput");
  const modelInput = $("#modelInput");
  const modelList = $("#modelList");

  // Populate provider dropdown.
  Object.entries(C.PROVIDERS).forEach(([id, cfg]) => {
    const opt = document.createElement("option");
    opt.value = id;
    opt.textContent = cfg.label;
    providerSelect.appendChild(opt);
  });

  function reflectProvider(providerId) {
    const cfg = C.PROVIDERS[providerId];
    providerSelect.value = providerId;
    providerNote.textContent = cfg.note;
    keyLink.href = cfg.keyPage;
    apiKeyInput.value = C.loadApiKey(providerId);
    modelInput.value = C.loadModel(providerId);
    modelList.innerHTML = "";
    cfg.models.forEach((m) => {
      const o = document.createElement("option");
      o.value = m;
      modelList.appendChild(o);
    });
  }

  providerSelect.addEventListener("change", () => reflectProvider(providerSelect.value));

  function openSettings() {
    reflectProvider(C.loadProvider());
    const ctx = C.loadContext();
    $("#ctxName").value = ctx.name || "";
    $("#ctxRole").value = ctx.role || "";
    $("#ctxLocation").value = ctx.location || "";
    $("#ctxInterests").value = ctx.interests || "";
    $("#ctxRecent").value = ctx.recent || "";
    $("#ctxNotes").value = ctx.notes || "";
    dialog.showModal();
  }

  function saveSettings() {
    const providerId = providerSelect.value;
    C.saveProvider(providerId);
    C.saveApiKey(providerId, apiKeyInput.value);
    C.saveModel(providerId, modelInput.value.trim() || C.PROVIDERS[providerId].models[0]);
    C.saveContext({
      name: $("#ctxName").value.trim(),
      role: $("#ctxRole").value.trim(),
      location: $("#ctxLocation").value.trim(),
      interests: $("#ctxInterests").value.trim(),
      recent: $("#ctxRecent").value.trim(),
      notes: $("#ctxNotes").value.trim(),
    });
    dialog.close();
  }

  $("#settingsBtn").addEventListener("click", openSettings);
  $("#closeSettings").addEventListener("click", () => dialog.close());
  $("#saveSettings").addEventListener("click", saveSettings);

  // ---- generation ---------------------------------------------------------
  function buildPrompt(kind, nudge) {
    const ctx = C.loadContext();
    if (kind === "openers") return C.openersPrompt(ctx, nudge);
    if (kind === "intro") return C.introPrompt(ctx, currentTone, nudge);
    if (kind === "respond") {
      const q = $("#questionInput").value.trim();
      if (!q) return { error: "Type what they asked you first." };
      return C.respondPrompt(ctx, q, nudge);
    }
  }

  function renderResults(kind, list) {
    const box = $(`[data-results="${kind}"]`);
    box.innerHTML = "";
    list.forEach((text) => {
      const card = document.createElement("div");
      card.className = "card";
      const p = document.createElement("p");
      p.textContent = text;
      const copy = document.createElement("button");
      copy.className = "copy";
      copy.textContent = "Copy";
      copy.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(text);
          copy.textContent = "Copied";
          copy.classList.add("done");
          setTimeout(() => {
            copy.textContent = "Copy";
            copy.classList.remove("done");
          }, 1200);
        } catch {
          copy.textContent = "!";
        }
      });
      card.append(p, copy);
      box.appendChild(card);
    });
  }

  function setStatus(kind, msg, isError) {
    const el = $(`[data-status="${kind}"]`);
    el.className = "status" + (isError ? " error" : "");
    el.innerHTML = msg;
  }

  async function run(kind, nudge) {
    const built = buildPrompt(kind, nudge);
    if (built.error) {
      setStatus(kind, built.error, true);
      return;
    }
    const providerId = C.loadProvider();
    const apiKey = C.loadApiKey(providerId);
    if (!apiKey) {
      setStatus(kind, 'Add a free API key in <b>Settings</b> to get started.', true);
      openSettings();
      return;
    }

    const genBtn = $(`[data-generate="${kind}"]`);
    const shuffleBtn = $(`[data-shuffle="${kind}"]`);
    genBtn.disabled = true;
    if (shuffleBtn) shuffleBtn.disabled = true;
    setStatus(kind, '<span class="dots">Thinking</span>', false);

    try {
      const list = await C.generate({
        provider: providerId,
        apiKey,
        model: C.loadModel(providerId),
        system: built.system,
        user: built.user,
      });
      renderResults(kind, list);
      setStatus(kind, "");
      if (shuffleBtn) shuffleBtn.hidden = false;
    } catch (e) {
      setStatus(kind, e.message || "Something went wrong.", true);
    } finally {
      genBtn.disabled = false;
      if (shuffleBtn) shuffleBtn.disabled = false;
    }
  }

  $$("[data-generate]").forEach((btn) =>
    btn.addEventListener("click", () => run(btn.dataset.generate, false))
  );
  $$("[data-shuffle]").forEach((btn) =>
    btn.addEventListener("click", () => run(btn.dataset.shuffle, true))
  );

  // Enter key submits the Respond question.
  $("#questionInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") run("respond", false);
  });

  // First-run: nudge toward Settings if there's no key anywhere.
  const hasAnyKey = Object.keys(C.PROVIDERS).some((p) => C.loadApiKey(p));
  if (!hasAnyKey) {
    setStatus("openers", 'First time? Open <b>Settings</b> to add a free API key.', false);
  }
})();
