const KA1_NOTE_AI_MODEL = 'gemini-2.5-flash';

const KA1_NOTE_SYSTEM_PROMPT = `Jsi zkušený dluhový poradce a metodik projektů CECH a MAS.

Upravuješ pracovní poznámky do profesionálního zápisu klientské práce v KA1. Piš česky, stručně, věcně a ve třetí osobě. Zachovej důstojnost a autonomii klienta.

Zásadní pravidla:
- Pracuj pouze s doloženými informacemi z aktuálního vstupu a předchozí klientské osy.
- Nic nevymýšlej. Nepřidávej osoby, částky, dokumenty, souhlasy, rozhodnutí, výsledky, termíny ani další kroky, které nejsou ve vstupu.
- Jasně rozlišuj ověřenou skutečnost od tvrzení klienta.
- Nevytvářej falešná očekávání a nezamlčuj rizika.
- Oprav jazyk, srozumitelnost a návaznost přímo ve výsledném zápisu.
- Předchozí osu používej ke kontrole časové a věcné návaznosti. Starší tvrzení automaticky nevydávej za aktuální stav.
- Používej termín „oddlužení“, nikoli nepřesná synonyma.

Metodické minimum podle fáze:
- Fáze A: zakázka klienta, vstupní situace, potřeba stabilizace, dohodnutý další krok a souhlas jen tehdy, je-li doložen.
- Fáze B: způsob mapování, zjištěný výsledek, použité zdroje a další kroky pracovníka i klienta.
- Fáze C: zvolené nebo připravované řešení, vazba na zmapovanou situaci, souhlas jen tehdy, je-li doložen, a navazující kroky.

Vrať pouze JSON podle zadaného schématu. Pole formatted_output je hotový souvislý zápis. Kontrolní pole obsahují nejvýše tři stručné položky a upozorňují jen na skutečně podstatné problémy.`;

const KA1_NOTE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    formatted_output: { type: 'STRING' },
    quality_check: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 },
    recommendations: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 },
    missing_information: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 },
    language_suggestions: { type: 'ARRAY', items: { type: 'STRING' }, maxItems: 3 }
  },
  required: ['formatted_output', 'quality_check', 'recommendations', 'missing_information', 'language_suggestions']
};

const toCompactText = (value, maxLength = 900) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
};

const recordTimestamp = (record) => {
  const date = String(record?.activityDate || record?.payload?.date || '').trim();
  const createdAt = Number(record?.createdAt || record?.updatedAt || 0);
  return `${date.padEnd(10, '0')}|${String(createdAt).padStart(16, '0')}`;
};

function recordBelongsToClient(record, clientId) {
  if (!record || !clientId) return false;
  if (String(record.clientId || '') === String(clientId)) return true;
  return Array.isArray(record.clientIds) && record.clientIds.some((id) => String(id) === String(clientId));
}

function buildKa1TimelineContext(records, clientId, maxItems = 12) {
  const relevant = (Array.isArray(records) ? records : [])
    .filter((record) => recordBelongsToClient(record, clientId) && !record.isSynthetic)
    .sort((a, b) => recordTimestamp(a).localeCompare(recordTimestamp(b), 'cs'))
    .slice(-maxItems);

  if (!relevant.length) return 'Klientská osa zatím neobsahuje žádné předchozí záznamy.';

  return relevant.map((record, index) => {
    const payload = record.payload || {};
    const text = toCompactText(
      record.documentText ||
      payload.caseNote ||
      payload.topics ||
      payload.description ||
      payload.outcome ||
      payload.currentSituation ||
      payload.debtSummary ||
      record.title
    );
    const activityCodes = Array.isArray(payload.activityCodes) ? payload.activityCodes.join(', ') : '';
    return [
      `${index + 1}. Datum: ${record.activityDate || payload.date || 'neuvedeno'}`,
      `KA / typ: ${record.ka || 'neuvedeno'} / ${record.entityType || 'neuvedeno'}`,
      activityCodes ? `Činnosti: ${activityCodes}` : '',
      `Obsah: ${text || 'bez textového obsahu'}`
    ].filter(Boolean).join(' | ');
  }).join('\n');
}

function buildKa1NoteUserPrompt({ draft = {}, phase = {}, records = [], clientId = '' } = {}) {
  const activities = Array.isArray(phase.activities)
    ? phase.activities.filter((activity) => (draft.activityCodes || []).includes(activity.code))
    : [];
  const timeline = buildKa1TimelineContext(records, clientId);

  return [
    'Zpracuj aktuální pracovní poznámky do hotového zápisu KA1 a zkontroluj jejich návaznost na předchozí klientskou osu.',
    '',
    'AKTUÁLNÍ VÝKON',
    `Datum: ${draft.date || 'neuvedeno'}`,
    `Fáze: ${phase.code || draft.phaseCode || 'neuvedeno'} – ${phase.title || 'neuvedeno'}`,
    `Činnosti: ${activities.length ? activities.map((activity) => `${activity.code} – ${activity.title}`).join('; ') : (draft.activityCodes || []).join(', ') || 'neuvedeno'}`,
    `Forma jednání: ${draft.meetingForm || 'neuvedeno'}`,
    `Místo: ${draft.place || 'neuvedeno'}`,
    `Čas: ${draft.startTime || 'neuvedeno'}–${draft.endTime || 'neuvedeno'}`,
    `Pracovní poznámky: ${String(draft.caseNote || '').trim() || 'neuvedeno'}`,
    '',
    'PŘEDCHOZÍ KLIENTSKÁ OSA (chronologicky, identifikační údaje odstraněny)',
    timeline,
    '',
    'Pokud aktuální vstup odporuje předchozí ose nebo nepřesně navazuje, nevymýšlej opravu. Zachovej doložený obsah a problém stručně uveď v quality_check nebo missing_information.'
  ].join('\n');
}

const normalizeReviewItems = (value) =>
  (Array.isArray(value) ? value : [])
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 3);

function validateKa1NoteAiResult(result) {
  const formattedOutput = String(result?.formatted_output || '').trim();
  if (formattedOutput.length < 20) throw new Error('AI nevrátila použitelný návrh zápisu.');
  return {
    formattedOutput,
    qualityCheck: normalizeReviewItems(result.quality_check),
    recommendations: normalizeReviewItems(result.recommendations),
    missingInformation: normalizeReviewItems(result.missing_information),
    languageSuggestions: normalizeReviewItems(result.language_suggestions)
  };
}

export {
  KA1_NOTE_AI_MODEL,
  KA1_NOTE_RESPONSE_SCHEMA,
  KA1_NOTE_SYSTEM_PROMPT,
  buildKa1NoteUserPrompt,
  buildKa1TimelineContext,
  validateKa1NoteAiResult
};
