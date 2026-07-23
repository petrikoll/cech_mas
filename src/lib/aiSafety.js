const SENSITIVE_KEYS = new Set(['firstname','lastname','fullname','name','birthdate','datumnarozeni','personalid','rodnecislo','address','adresa','street','ulice','phone','telefon','email','datovaschranka']);
const normalizeKey = (key) => String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function sanitizeAiInput(value) {
  if (Array.isArray(value)) return value.map(sanitizeAiInput);
  if (!value || typeof value !== 'object') return value;
  return Object.entries(value).reduce((result, [key, item]) => {
    if (!SENSITIVE_KEYS.has(normalizeKey(key))) result[key] = sanitizeAiInput(item);
    return result;
  }, {});
}

function redactClientIdentifiers(value, client = {}) {
  let text = String(value || '');
  const identifiers = [client.fullName, client.jmeno, client.prijmeni, client.datumNarozeni, client.telefon, client.email, client.datovaSchranka, client.adresa, [client.ulice, client.cisloPopisne].filter(Boolean).join(' ')]
    .map((item) => String(item || '').trim()).filter((item) => item.length >= 3).sort((a, b) => b.length - a.length);
  identifiers.forEach((identifier) => { text = text.replaceAll(identifier, '[identifikační údaj odstraněn]'); });
  return text;
}

function parseAiJson(value) {
  return JSON.parse(String(value || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, ''));
}

function containsClientIdentifier(value, client = {}) {
  const normalized = String(value || '').toLocaleLowerCase('cs');
  return [client.fullName, client.jmeno, client.prijmeni, client.datumNarozeni]
    .map((item) => String(item || '').trim().toLocaleLowerCase('cs')).filter((item) => item.length >= 3)
    .some((item) => normalized.includes(item));
}

function validateRecordOutput(output, { consultationType, client } = {}) {
  if (!output || typeof output !== 'object') throw new Error('AI nevrátila platný objekt zápisu.');
  const recordText = String(output.recordText || '').trim();
  if (recordText.length < 20) throw new Error('AI vrátila prázdný nebo příliš krátký zápis.');
  if (containsClientIdentifier(recordText, client)) throw new Error('AI výstup obsahuje zakázaný osobní údaj klienta.');
  const warnings = Array.isArray(output.warnings) ? output.warnings.map(String) : [];
  if (output.consultationType && String(output.consultationType) !== String(consultationType || '')) {
    warnings.push('AI vrátila jiný typ podpory, byl ponechán typ z formuláře.');
  }
  return { recordText, warnings };
}

function validatePlanOutput(output, source) {
  if (!output || typeof output !== 'object') throw new Error('AI nevrátila platnou strukturu individuálního plánu.');
  const sourceGoals = Array.isArray(source?.goals) ? source.goals : [];
  const outputGoals = Array.isArray(output.goals) ? output.goals : [];
  if (sourceGoals.length !== outputGoals.length) throw new Error('AI změnila počet cílů individuálního plánu.');
  sourceGoals.forEach((goal, index) => {
    const next = outputGoals[index] || {};
    if (String(next.goalId || '') !== String(goal.goalId || '')) throw new Error('AI změnila identifikátor cíle.');
    if (String(next.deadline || '') !== String(goal.deadline || '')) throw new Error('AI změnila termín cíle.');
    if (!String(next.goalDescription || '').trim()) throw new Error('AI nevrátila popis cíle.');
    if (!String(next.actionSteps || '').trim()) throw new Error('AI nevrátila akční kroky cíle.');
    const sourceDescription = String(goal.goalDescription || '').trim();
    const sourceSteps = String(goal.actionSteps || '').trim();
    if (sourceDescription && sourceDescription.length < 80 && String(next.goalDescription).trim().toLocaleLowerCase('cs') === sourceDescription.toLocaleLowerCase('cs')) throw new Error('AI nerozpracovala heslovitý popis cíle.');
    if (sourceSteps && sourceSteps.length < 80 && String(next.actionSteps).trim().toLocaleLowerCase('cs') === sourceSteps.toLocaleLowerCase('cs')) throw new Error('AI nerozpracovala heslovité akční kroky.');
  });
  if (String(output.finalEvaluation || '') !== String(source?.finalEvaluation || '')) throw new Error('AI změnila závěrečné vyhodnocení plánu.');
  return output;
}

export { parseAiJson, redactClientIdentifiers, sanitizeAiInput, validatePlanOutput, validateRecordOutput };
