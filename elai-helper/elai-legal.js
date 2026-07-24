const LEGAL_ENDPOINT = "/elai-helper/api/legal-query";
const WHITELIST_CONFIG_URL = "/elai-helper/data/whitelist-merged.json";

const DEFAULT_WHITELIST_FALLBACK = {
  source_sets: {
    always_on_source_ids: [
      "CZ-IZ-182-2006",
      "CZ-OSR-99-1963",
      "CZ-ER-120-2001",
      "CZ-NV-595-2006"
    ]
  },
  sources: [
    { id: "CZ-IZ-182-2006", nazev: "Insolvenční zákon", sbirka: "182/2006 Sb.", tier: "T1" },
    { id: "CZ-OSR-99-1963", nazev: "Občanský soudní řád", sbirka: "99/1963 Sb.", tier: "T1" },
    { id: "CZ-ER-120-2001", nazev: "Exekuční řád", sbirka: "120/2001 Sb.", tier: "T1" },
    { id: "CZ-NV-595-2006", nazev: "Nařízení o nezabavitelných částkách", sbirka: "595/2006 Sb.", tier: "T1" },
    { id: "CZ-OZ-89-2012", nazev: "Občanský zákoník", sbirka: "89/2012 Sb.", tier: "T2" }
  ]
};

const state = {
  whitelistConfig: null,
  whitelistSources: []
};

document.addEventListener("DOMContentLoaded", async () => {
  await loadWhitelistConfig();
  renderLegalSources();
  initLegalModule();
});

function initLegalModule() {
  const legalForm = document.getElementById("legalForm");
  const legalResetBtn = document.getElementById("legalResetBtn");

  if (!legalForm || !legalResetBtn) return;

  legalForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await handleLegalSubmit();
  });

  legalResetBtn.addEventListener("click", () => {
    legalForm.reset();
    setStatus("legalStatus", "Formulář byl vyčištěn.");
    setResult("legalResult", "Zde se po validaci zobrazí odpověď.");
  });
}

async function handleLegalSubmit() {
  const question = getValue("legalQuestion");
  const context = getValue("legalContext");
  const outputType = getValue("legalOutputType");
  const depth = getValue("legalDepth");
  const selectedSources = getSelectedSourceIds();
  const selectedSourceDetails = state.whitelistSources.filter((item) =>
    selectedSources.includes(item.id)
  );

  if (!question) {
    setStatus("legalStatus", "Vyplňte dotaz, bez něj nelze sestavit přesný prompt.");
    return;
  }

  if (!selectedSources.length) {
    setStatus("legalStatus", "Vyberte aspoň jeden povolený zdroj.");
    return;
  }

  const payload = {
    question,
    context,
    outputType,
    depth,
    sources: selectedSources,
    sourceDetails: selectedSourceDetails,
    promptBlueprint: buildPromptBlueprint({
      question,
      context,
      outputType,
      depth,
      sources: selectedSources,
      sourceDetails: selectedSourceDetails
    })
  };

  setStatus("legalStatus", "Odesílám dotaz a čekám na validovanou odpověď...");

  try {
    const response = await fetch(LEGAL_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      const errorMessage = result?.error || `HTTP ${response.status}`;
      throw new Error(errorMessage);
    }

    const validation = validateLegalResponse(result);
    if (!validation.ok) {
      setStatus("legalStatus", `Odpověď zamítnuta validací: ${validation.reason}`);
      setResult(
        "legalResult",
        "AI odpověď nebyla přijata, protože neobsahovala povinnou strukturu nebo citace."
      );
      return;
    }

    setStatus("legalStatus", "Odpověď prošla validací.");
    setResult("legalResult", formatLegalResult(result));
  } catch (error) {
    setStatus("legalStatus", `Dotaz se nepodařilo dokončit: ${error.message}`);
    setResult(
      "legalResult",
      "Backend vrátil chybu nebo nebyl dostupný. Zkontrolujte server a konfiguraci Gemini."
    );
    console.error(error);
  }
}

function buildPromptBlueprint(input) {
  return {
    modelInstruction: [
      "Jsi právní asistent pro insolvenční agendu.",
      "Použij jen poskytnuté zdroje a cituj každé klíčové tvrzení.",
      "Pokud ve zdroji není opora, vrať explicitně: ve zdrojích nenalezeno."
    ],
    outputSchema: {
      odpoved: "string",
      pravniOpora: [{ zakon: "string", paragraf: "string", citace: "string" }],
      miraJistoty: "number(0-1)",
      chybejiciVstupy: ["string"]
    },
    userTask: {
      question: input.question,
      context: input.context,
      outputType: input.outputType,
      depth: input.depth,
      sources: input.sources
    },
    sourceCatalog: {
      selectedSources: input.sourceDetails.map((item) => ({
        id: item.id,
        nazev: item.nazev,
        sbirka: item.sbirka || null,
        tier: item.tier || null,
        source_url: item.source_url || null
      }))
    }
  };
}

function validateLegalResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, reason: "odpověď není validní JSON objekt" };
  }

  if (typeof payload.odpoved !== "string" || !payload.odpoved.trim()) {
    return { ok: false, reason: "chybí pole odpověď" };
  }

  if (!Array.isArray(payload.pravniOpora) || payload.pravniOpora.length === 0) {
    return { ok: false, reason: "chybí povinné citace právní opory" };
  }

  if (typeof payload.miraJistoty !== "number") {
    return { ok: false, reason: "chybí míra jistoty" };
  }

  return { ok: true };
}

function formatLegalResult(result) {
  const lines = [];
  lines.push("ODPOVĚĎ:");
  lines.push(result.odpoved || "");
  lines.push("");
  lines.push("PRÁVNÍ OPORA:");

  for (const item of result.pravniOpora || []) {
    lines.push(
      `- ${item.zakon || "Neuveden zákon"} | ${item.paragraf || "Neuveden paragraf"} | ${
        item.citace || "Bez citace"
      }`
    );
  }

  lines.push("");
  lines.push(`MÍRA JISTOTY: ${result.miraJistoty}`);
  lines.push("");
  lines.push("CHYBĚJÍCÍ VSTUPY:");

  for (const item of result.chybejiciVstupy || []) {
    lines.push(`- ${item}`);
  }

  return lines.join("\n");
}

function getValue(id) {
  const element = document.getElementById(id);
  return element ? String(element.value || "").trim() : "";
}

function setStatus(id, message) {
  const element = document.getElementById(id);
  if (!element) return;

  element.textContent = message;
  element.classList.remove("is-loading", "is-ok", "is-warn", "is-error");

  const normalized = String(message || "").toLowerCase();

  if (
    normalized.includes("čekám") ||
    normalized.includes("nahrávám") ||
    normalized.includes("odesílám")
  ) {
    element.classList.add("is-loading");
    return;
  }

  if (
    normalized.includes("prošla") ||
    normalized.includes("přidána") ||
    normalized.includes("načten")
  ) {
    element.classList.add("is-ok");
    return;
  }

  if (
    normalized.includes("zamítnuta") ||
    normalized.includes("chybí") ||
    normalized.includes("nepodařilo") ||
    normalized.includes("chyba")
  ) {
    element.classList.add("is-error");
    return;
  }

  if (
    normalized.includes("zatím") ||
    normalized.includes("fallback") ||
    normalized.includes("doplněn")
  ) {
    element.classList.add("is-warn");
  }
}

function setResult(id, content) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = content;
}

async function loadWhitelistConfig() {
  try {
    const response = await fetch(WHITELIST_CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const config = await response.json();
    state.whitelistConfig = config;
    state.whitelistSources = normalizeWhitelistSources(config.sources || []);
  } catch (error) {
    state.whitelistConfig = DEFAULT_WHITELIST_FALLBACK;
    state.whitelistSources = normalizeWhitelistSources(DEFAULT_WHITELIST_FALLBACK.sources || []);
    console.error(error);
  }
}

function normalizeWhitelistSources(sources) {
  return sources
    .filter((source) => source && source.id && source.nazev)
    .map((source) => ({
      id: String(source.id),
      nazev: String(source.nazev),
      sbirka: source.sbirka ? String(source.sbirka) : "",
      tier: source.tier ? String(source.tier) : "",
      source_url: source.source_url ? String(source.source_url) : ""
    }));
}

function renderLegalSources() {
  const sourcesList = document.getElementById("legalSourcesList");
  const sourcesMeta = document.getElementById("legalSourcesMeta");
  if (!sourcesList || !sourcesMeta) return;

  sourcesList.innerHTML = "";

  if (!state.whitelistSources.length) {
    sourcesMeta.textContent = "Whitelist není dostupný. Zobrazeno minimální záložní jádro.";
    return;
  }

  const defaultSet = new Set(
    (state.whitelistConfig?.source_sets?.always_on_source_ids || []).map((item) => String(item))
  );

  for (const source of state.whitelistSources) {
    const wrapper = document.createElement("label");
    wrapper.className = "helper-source-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "source";
    checkbox.value = source.id;
    checkbox.checked = defaultSet.size ? defaultSet.has(source.id) : source.tier === "T1";

    const text = document.createElement("span");
    const tierLabel = source.tier ? ` [${source.tier}]` : "";
    const lawCode = source.sbirka ? ` (${source.sbirka})` : "";
    text.textContent = `${source.nazev}${lawCode}${tierLabel}`;

    wrapper.appendChild(checkbox);
    wrapper.appendChild(text);
    sourcesList.appendChild(wrapper);
  }

  sourcesMeta.textContent = `Whitelist načten: ${state.whitelistSources.length} zdrojů.`;
}

function getSelectedSourceIds() {
  return Array.from(document.querySelectorAll('input[name="source"]:checked')).map(
    (item) => item.value
  );
}
