const SECTION_MARKER = /\[\[SECTION:(current|history):([^\]]+)\]\]/g;

const normalizeLines = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .split('\n')
  .map((line) => line.trim())
  .filter(Boolean);

const parseBulletList = (lines) => lines
  .map((line) => line.replace(/^[-•]\s*/, '').trim())
  .filter(Boolean);

const toIsoDate = (value) => {
  const match = String(value || '').match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (!match) return '';
  return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
};

const parseTimeline = (lines) => parseBulletList(lines).map((line) => {
  const match = line.match(/^(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})\s*[–-]\s*(.+)$/);
  return match ? { date: toIsoDate(match[1]), label: match[2].trim() } : line;
});

const sectionBody = (source, section) => {
  const markers = [...source.matchAll(SECTION_MARKER)];
  const markerIndex = markers.findIndex((match) => match[1] === section);
  if (markerIndex < 0) return '';
  const start = markers[markerIndex].index + markers[markerIndex][0].length;
  const end = markers[markerIndex + 1]?.index ?? source.length;
  return source.slice(start, end).trim();
};

const CURRENT_HEADINGS = [
  ['status_now', /^Stav nyní:\s*$/i],
  ['nearest_deadlines', /^Nejbližší termíny:\s*$/i],
  ['advisor_actions', /^Co ověřit\s*\/\s*řešit s klientem:\s*$/i],
  ['client_actions', /^Co má udělat klient:\s*$/i],
  ['finance_summary_lines', /^Finance a pohledávky:\s*$/i],
  ['insolvency_evaluation', /^Vyhodnocení oddlužení.*:\s*$/i],
  ['uncertainties', /^Nejistoty pro aktuální práci:\s*$/i],
  ['confidence', /^Jistota výstupu:\s*(.*)$/i]
];

const HISTORY_HEADINGS = [
  ['history_summary', /^Stručný vývoj:\s*$/i],
  ['proceeding_evolution', /^Časová osa:\s*$/i]
];

const collectSections = (text, headings) => {
  const result = {};
  let activeKey = '';
  normalizeLines(text).forEach((line) => {
    const heading = headings.find(([, pattern]) => pattern.test(line));
    if (heading) {
      activeKey = heading[0];
      result[activeKey] = result[activeKey] || [];
      const inline = line.match(heading[1])?.[1];
      if (inline) result[activeKey].push(inline.trim());
      return;
    }
    if (activeKey) result[activeKey].push(line);
  });
  return result;
};

export const parseLegacyIsirCaseStudy = (value) => {
  const source = String(value || '').trim();
  if (!source || !source.includes('[[SECTION:')) return {};

  const current = collectSections(sectionBody(source, 'current'), CURRENT_HEADINGS);
  const history = collectSections(sectionBody(source, 'history'), HISTORY_HEADINGS);
  const result = {};

  if (current.status_now?.length) result.status_now = current.status_now.join('\n\n');
  if (current.nearest_deadlines?.length) result.nearest_deadlines = parseTimeline(current.nearest_deadlines);
  if (current.advisor_actions?.length) result.advisor_actions = parseBulletList(current.advisor_actions);
  if (current.client_actions?.length) result.client_actions = parseBulletList(current.client_actions);
  if (current.finance_summary_lines?.length) result.finance_summary_lines = parseBulletList(current.finance_summary_lines);
  if (current.insolvency_evaluation?.length) result.insolvency_evaluation = current.insolvency_evaluation.join('\n\n');
  if (current.uncertainties?.length) result.uncertainties = parseBulletList(current.uncertainties);
  if (current.confidence?.length) result.confidence = current.confidence.join(' ');
  if (history.history_summary?.length) result.history_summary = history.history_summary.join('\n\n');
  if (history.proceeding_evolution?.length) result.proceeding_evolution = parseTimeline(history.proceeding_evolution);

  return result;
};

const caseStudyCompletenessScore = (value) => {
  const source = String(value || '').trim();
  if (!source) return 0;

  const sectionCount = (source.match(/\[\[SECTION:(?:current|history):/g) || []).length;
  const headingCount = [
    'Stav nyní',
    'Nejbližší termíny',
    'Co ověřit',
    'Co má udělat klient',
    'Finance a pohledávky',
    'Vyhodnocení oddlužení',
    'Nejistoty pro aktuální práci',
    'Časová osa'
  ].filter((heading) => source.includes(heading)).length;

  return (sectionCount * 100000) + (headingCount * 10000) + source.length;
};

export const selectMostCompleteCaseStudy = (...values) => values
  .map((value) => String(value || '').trim())
  .filter(Boolean)
  .sort((left, right) => caseStudyCompletenessScore(right) - caseStudyCompletenessScore(left))[0] || '';
