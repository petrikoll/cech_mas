import { BarChart3, Calculator, FileText, GraduationCap, Network, Scale, Sparkles, Target, Users, Workflow } from 'lucide-react';

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const GOOGLE_SHEET_MACRO_URL = '/api/google-sheets';
const GOOGLE_DRIVE_UPLOAD_URL = import.meta.env?.VITE_GOOGLE_DRIVE_UPLOAD_URL || '';

const TARGETS = {
  ka01Meetings: 0,
  ka01Materials: 0,
  ka01TeamMeetings: 0,
  ka01NetworkSize: 0,
  ka02Plans: 0,
  ka02Consultations: 0,
  ka02SupportedClients: 0
};

const WORKERS = [
  'Sulkov\u00e1',
  'August\u00fdnov\u00e1',
  'Nov\u00e1kov\u00e1',
  'Chovan\u010d\u00e1kov\u00e1',
  'La\u0161tovica',
  '\u0158ezn\u00ed\u010dkov\u00e1'
];

const CLIENT_GENDER_OPTIONS = ['mu\u017e', '\u017eena', 'neuvedeno'];

const CLIENT_EMPLOYMENT_OPTIONS = [
  'zam\u011bstnanci',
  'osoby samostatn\u011b v\u00fdd\u011ble\u010dn\u011b \u010dinn\u00e9',
  'osoby na mate\u0159sk\u00e9 dovolen\u00e9 (p\u0159ed MD zam\u011bstnan\u00e9)',
  'osoby na mate\u0159sk\u00e9 dovolen\u00e9 (p\u0159ed MD OSV\u010c)',
  'kr\u00e1tkodob\u011b nezam\u011bstnan\u00ed \u2013 registrovan\u00ed na \u00daP \u010cR (<12 m\u011bs\u00edc\u016f)',
  'dlouhodob\u011b nezam\u011bstnan\u00ed \u2013 registrovan\u00ed na \u00daP \u010cR (\u226512 m\u011bs\u00edc\u016f)',
  '\u017e\u00e1ci / studenti / u\u010dni (denn\u00ed studium)',
  'osoby ve starobn\u00edm d\u016fchodu, neregistrovan\u00e9 na \u00daP',
  'osoby v invalidn\u00edm d\u016fchodu, neregistrovan\u00e9 na \u00daP',
  'osoby na rodi\u010dovsk\u00e9 dovolen\u00e9',
  'ostatn\u00ed neaktivn\u00ed osoby'
];

const CLIENT_EDUCATION_OPTIONS = [
  'bez vzd\u011bl\u00e1n\u00ed (nedokon\u010den\u00e9 z\u00e1kladn\u00ed vzd\u011bl\u00e1n\u00ed) \u2013 ISCED 0',
  'z\u00e1kladn\u00ed vzd\u011bl\u00e1n\u00ed v\u010d. nedokon\u010den\u00e9ho 2. stupn\u011b Z\u0160 \u2013 ISCED 1\u20132',
  'st\u0159edo\u0161kolsk\u00e9 v\u010d. vyu\u010den\u00ed/maturity/pomaturitn\u00edho studia \u2013 ISCED 3\u20134',
  'vy\u0161\u0161\u00ed odborn\u00e9 / Bc. / Mgr. / Ph.D. \u2013 ISCED 5\u20138',
  'vzd\u011bl\u00e1n\u00ed jinde neuveden\u00e9'
];

const CLIENT_DISADVANTAGE_OPTIONS = [
  'osoby se zdravotn\u00edm posti\u017een\u00edm',
  'n\u00e1rodnostn\u00ed men\u0161iny',
  'st\u00e1tn\u00ed p\u0159\u00edslu\u0161n\u00edci t\u0159et\u00edch zem\u00ed',
  '\u00fa\u010dastn\u00edci zahrani\u010dn\u00edho p\u016fvodu',
  'osoby bez domova nebo osoby vylou\u010den\u00e9 z p\u0159\u00edstupu k bydlen\u00ed',
  'osoby s jin\u00fdm znev\u00fdhodn\u011bn\u00edm',
  'osoby po v\u00fdkonu trestu',
  'osoby ohro\u017een\u00e9 z\u00e1vislost\u00ed',
  'bez znev\u00fdhodn\u011bn\u00ed / neuvedeno'
];

const CLIENT_STATUS_OPTIONS = ['Aktivn\u00ed', 'Ukon\u010den\u00fd', 'Rozpracovan\u00fd', 'Stornovan\u00fd'];
const YES_NO_OPTIONS = ['Ano', 'Ne'];
const KU_SUPPORT_DEFAULT_CODE = 'NONE';
const KU_SUPPORT_DEFAULT_LABEL = 'Nevykazovat do statistik KÚ';
const KU_SUPPORT_TYPE_OPTIONS = [
  { code: KU_SUPPORT_DEFAULT_CODE, group: '', name: KU_SUPPORT_DEFAULT_LABEL },
  { code: 'DAVKY_SUPERDAVKA', group: 'D\u00e1vky', name: 'D\u00e1vka st\u00e1tn\u00ed soci\u00e1ln\u00ed pomoci \u2013 superd\u00e1vka' },
  { code: 'DAVKY_MIMORADNA_OKAMZITA_POMOC', group: 'D\u00e1vky', name: 'Mimo\u0159\u00e1dn\u00e1 okam\u017eit\u00e1 pomoc' },
  { code: 'DAVKY_PRISPEVEK_NA_PECI', group: 'D\u00e1vky', name: 'P\u0159\u00edsp\u011bvek na p\u00e9\u010di' },
  { code: 'DAVKY_PRISPEVEK_NA_MOBILITU', group: 'D\u00e1vky', name: 'P\u0159\u00edsp\u011bvek na mobilitu' },
  { code: 'DAVKY_JINE', group: 'D\u00e1vky', name: 'Jin\u00e9' },
  { code: 'DUCHODY_STAROBNI_DUCHOD', group: 'D\u016fchody a poji\u0161t\u011bn\u00ed', name: 'Starobn\u00ed d\u016fchod' },
  { code: 'DUCHODY_INVALIDNI_DUCHOD', group: 'D\u016fchody a poji\u0161t\u011bn\u00ed', name: 'Invalidn\u00ed d\u016fchod' },
  { code: 'DUCHODY_DUCHODOVE_POJISTENI', group: 'D\u016fchody a poji\u0161t\u011bn\u00ed', name: 'D\u016fchodov\u00e9 poji\u0161t\u011bn\u00ed' },
  { code: 'BYDLENI_SOCIALNI_OBECNI_BYT', group: 'Bydlen\u00ed', name: 'Soci\u00e1ln\u00ed nebo obecn\u00ed byt' },
  { code: 'BYDLENI_JINE_RESENI', group: 'Bydlen\u00ed', name: 'Jin\u00e9 \u0159e\u0161en\u00ed bydlen\u00ed' },
  { code: 'ZDRAVOTNI_KOMPENZACNI_POMUCKY', group: 'Zdravotn\u00ed a kompenza\u010dn\u00ed podpora', name: 'Kompenza\u010dn\u00ed pom\u016fcky' },
  { code: 'ZDRAVOTNI_ZTP_TP', group: 'Zdravotn\u00ed a kompenza\u010dn\u00ed podpora', name: 'ZTP, TP' },
  { code: 'ZDRAVOTNI_PREVOZOVA_SLUZBA', group: 'Zdravotn\u00ed a kompenza\u010dn\u00ed podpora', name: 'P\u0159evozov\u00e1 slu\u017eba' },
  { code: 'ZDRAVOTNI_POBYTOVA_SLUZBA_LDN', group: 'Zdravotn\u00ed a kompenza\u010dn\u00ed podpora', name: 'Pobytov\u00e1 slu\u017eba / LDN' },
  { code: 'ZDRAVOTNI_HOSPIC_PALIATIVNI_PECE', group: 'Zdravotn\u00ed a kompenza\u010dn\u00ed podpora', name: 'Hospic / paliativn\u00ed p\u00e9\u010de' },
  { code: 'SOCIALNI_SLUZBY_PECOVATELSKA', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'Pe\u010dovatelsk\u00e1 slu\u017eba' },
  { code: 'SOCIALNI_SLUZBY_SAS_RODINY', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'SAS pro rodiny s d\u011btmi' },
  { code: 'SOCIALNI_SLUZBY_RANA_PECE', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'Ran\u00e1 p\u00e9\u010de' },
  { code: 'SOCIALNI_SLUZBY_CDZ', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'Centrum du\u0161evn\u00edho zdrav\u00ed' },
  { code: 'SOCIALNI_SLUZBY_DLUHOVA_PORADNA', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'Dluhov\u00e1 poradna' },
  { code: 'SOCIALNI_SLUZBY_OBCANSKO_PRAVNI_PORADNA', group: 'Soci\u00e1ln\u00ed slu\u017eby', name: 'Ob\u010dansko-pr\u00e1vn\u00ed poradna' },
  { code: 'MATERIALNI_POTRAVINOVA_POMOC', group: 'Materi\u00e1ln\u00ed a humanit\u00e1rn\u00ed pomoc', name: 'Potravinov\u00e1 pomoc' },
  { code: 'MATERIALNI_OSACENI', group: 'Materi\u00e1ln\u00ed a humanit\u00e1rn\u00ed pomoc', name: 'O\u0161acen\u00ed' },
  { code: 'MATERIALNI_HUMANITARNI_POMOC_UA', group: 'Materi\u00e1ln\u00ed a humanit\u00e1rn\u00ed pomoc', name: 'Humanit\u00e1rn\u00ed pomoc UA' },
  { code: 'RODINA_OSPOD', group: 'Rodina, d\u011bti a ochrana pr\u00e1v', name: 'OSPOD' },
  { code: 'RODINA_SKOLNI_DOCHAZKA', group: 'Rodina, d\u011bti a ochrana pr\u00e1v', name: '\u0160koln\u00ed doch\u00e1zka / podn\u011bt Z\u0160 nebo M\u0160' },
  { code: 'RODINA_RODINNE_PRAVO', group: 'Rodina, d\u011bti a ochrana pr\u00e1v', name: 'Rodinn\u00e9 pr\u00e1vo' },
  { code: 'RODINA_OMEZENI_SVEPRAVNOSTI', group: 'Rodina, d\u011bti a ochrana pr\u00e1v', name: 'Omezen\u00ed sv\u00e9pr\u00e1vnosti' },
  { code: 'OSTATNI_JINE', group: 'Ostatn\u00ed', name: 'Jin\u00e9' }
];

const COMMON_AI_QUALITY_RULES = [
  'Jsi odborn\u00fd asistent pro zpracov\u00e1n\u00ed intern\u00edch z\u00e1znam\u016f projekt\u016f dluhov\u00e9ho poradenstv\u00ed CECH a MAS.',
  'V\u00fdstupy slou\u017e\u00ed jako podklad pro soci\u00e1ln\u00ed pr\u00e1ci, klientskou dokumentaci a projektovou evidenci.',
  'Pracuj pouze s \u00fadaji, kter\u00e9 jsou v\u00fdslovn\u011b uvedeny ve vstupu.',
  'Nevym\u00fd\u0161lej osoby, diagn\u00f3zy, zam\u011bstn\u00e1n\u00ed, dluhy, motivaci, v\u00fdsledky, rozhodnut\u00ed, term\u00edny ani n\u00e1vazn\u00e9 slu\u017eby.',
  'Neodes\u00edlej ani neopakuj jm\u00e9no, p\u0159\u00edjmen\u00ed ani datum narozen\u00ed klienta a vyh\u00fdbej se zbyte\u010dn\u00e9 nep\u0159\u00edm\u00e9 identifikaci.',
  'Chyb\u011bj\u00edc\u00ed nebo nepodstatn\u00e9 \u00fadaje vynech.',
  'Pi\u0161 \u010desky, v\u011bcn\u011b, profesion\u00e1ln\u011b a auditn\u011b obhajiteln\u011b.'
].join('\n');

const SUPPORT_SPECIFIC_LABELS = {
  contactPlace: 'Misto depistaze', contactMethod: 'Zpusob kontaktu',
  cooperationInterest: 'Zajem o dalsi spolupraci', mappedAreas: 'Dalsi zjistene oblasti', risks: 'Rizika',
  clientResources: 'Zdroje klienta', clientNeeds: 'Potreby klienta', providedInformation: 'Poskytnute informace',
  recommendedProcedure: 'Doporuceny postup', fieldWorkPlace: 'Misto vykonu', visitPurpose: 'Ucel navstevy',
  accompanimentPlace: 'Kam doprovod probehl', accompanimentPurpose: 'Ucel doprovodu', accompanimentResult: 'Vysledek doprovodu',
  crisisType: 'Typ krize', urgency: 'Mira akutnosti', measures: 'Prijata opatreni', followupHelp: 'Predani navazne pomoci',
  contactedFollowupServices: 'Kontaktovana navazna sluzba', evaluationReason: 'Duvod vyhodnoceni/ukonceni', achievedProgress: 'Dosazeny posun',
  unresolvedAreas: 'Nedoresene oblasti', recommendation: 'Doporuceni'
};

function formatSupportSpecificForPrompt(values = {}) {
  const lines = Object.entries(values)
    .filter(([, value]) => String(value || '').trim())
    .map(([key, value]) => (SUPPORT_SPECIFIC_LABELS[key] || key) + ': ' + String(value).trim());
  return lines.length ? lines.join('\n') : 'Nebyla vyplnena zadna specificka pole.';
}

const KA1_CONTEXT = [
  'Vytv\u00e1\u0159\u00ed\u0161 z\u00e1pis individu\u00e1ln\u00ed podpory klienta v r\u00e1mci KA1.',
  'Z\u00e1pis zachycuje poskytnutou podporu, n\u00e1vaznost na individu\u00e1ln\u00ed pl\u00e1n, pr\u016fb\u011bh, v\u00fdsledek a dal\u0161\u00ed krok.',
  'Typ podpory je uzam\u010den\u00fd a nesm\u00ed b\u00fdt zm\u011bn\u011bn, zobecn\u011bn ani nahrazen oblast\u00ed podpory.',
  'Oblast podpory popisuje obsah, ale nenahrazuje typ podpory.',
  'V recordText vytvo\u0159 hotov\u00fd odborn\u00fd z\u00e1pis, ne opis formul\u00e1\u0159e. Neza\u010d\u00ednej \u0159\u00e1dky typu "Datum aktivity:", "Pracovn\u00edk:", "Typ podpory:", "Oblast podpory:" ani "Popis pr\u016fb\u011bhu:".',
  'Pi\u0161 1 a\u017e 2 krat\u0161\u00ed odstavce. Zachovej v\u011bcn\u00fd, auditn\u011b obhajiteln\u00fd styl soci\u00e1ln\u00ed pr\u00e1ce.',
  'Stru\u010dn\u00e9 vstupy m\u016f\u017ee\u0161 jazykov\u011b uhladit a propojit do souvisl\u00fdch v\u011bt, ale nep\u0159id\u00e1vej nov\u00e9 skute\u010dnosti, hodnocen\u00ed, diagn\u00f3zy ani v\u00fdsledky.'
].join('\n');

const KA2_CASE_CONTEXT = [
  'Vytv\u00e1\u0159\u00ed\u0161 z\u00e1pis case managementu v r\u00e1mci KA2.',
  'Z\u00e1pis se t\u00fdk\u00e1 koordinace podpory klienta, zapojen\u00ed akt\u00e9r\u016f, n\u00e1vaznosti na c\u00edl individu\u00e1ln\u00edho pl\u00e1nu a domluven\u00fdch dal\u0161\u00edch krok\u016f.',
  'Zachovej uveden\u00fd c\u00edl IP, oblast podpory a akt\u00e9ry. Nevytv\u00e1\u0159ej nov\u00e9 \u00fakoly, odpov\u011bdnosti, slu\u017eby ani term\u00edny.',
  'V recordText vytvo\u0159 hotov\u00fd odborn\u00fd z\u00e1pis, ne opis formul\u00e1\u0159e. Pi\u0161 souvisle, bez \u0159\u00e1dk\u016f typu "Datum aktivity:", "Pracovn\u00edk:" nebo "Popis pr\u016fb\u011bhu:".'
].join('\n');

const REPORT_PROMPTS = {
  plan: {
    label: 'Individu\u00e1ln\u00ed pl\u00e1n', ka: 'KA1', entityType: 'plans',
    buildSystemPrompt: () => [COMMON_AI_QUALITY_RULES, 'Vytv\u00e1\u0159\u00ed\u0161 nebo upravuje\u0161 individu\u00e1ln\u00ed pl\u00e1n klienta jako intern\u00ed dokument projektu. Pot\u0159eby a bari\u00e9ry uve\u010f pouze tehdy, pokud jsou v\u00fdslovn\u011b obsa\u017eeny v poli Popis situace. Nic psychologicky ani soci\u00e1ln\u011b nedovozuj.'].join('\n\n'),
    buildUserPrompt: ({ fields }) => [
      'Vytvo\u0159 nebo uprav individu\u00e1ln\u00ed pl\u00e1n klienta jako intern\u00ed dokument projektu.',
      'Datum: ' + (fields.date || todayIso()),
      'Popis situace: ' + (fields.situationDescription || fields.currentSituation || ''),
      'C\u00edle: ' + (fields.goals || ''),
      'Pl\u00e1novan\u00e9 kroky: ' + (fields.plannedSteps || ''),
      'Z\u00e1v\u011bre\u010dn\u00e9 vyhodnocen\u00ed: ' + (fields.finalEvaluation || ''),
      'Nep\u0159id\u00e1vej nov\u00e9 skute\u010dnosti, term\u00edny, slu\u017eby, diagn\u00f3zy, zam\u011bstnavatele ani v\u00fdsledky.'
    ].join('\n')
  },
  consultation: {
    label: 'Z\u00e1pis podpory', ka: 'KA1', entityType: 'consultations',
    buildSystemPrompt: ({ fields } = {}) => [
      COMMON_AI_QUALITY_RULES,
      fields?.caseManagementMode ? KA2_CASE_CONTEXT : KA1_CONTEXT,
      'Vra\u0165 pouze JSON podle zadan\u00e9ho sch\u00e9matu. Typ podpory ber jako pevně daný kontext z formuláře a ve v\u00fdstupu jej nep\u0159episuj.'
    ].join('\n\n'),
    buildUserPrompt: ({ fields }) => [
      'Typ podpory: ' + (fields.consultationType || ''),
      'Oblast podpory: ' + (fields.supportArea || ''),
      'Specifick\u00e1 pole podle typu podpory:\n' + formatSupportSpecificForPrompt(fields.supportSpecific || {}),
      'Datum: ' + (fields.date || todayIso()),
      '\u010cas / d\u00e9lka: ' + (fields.durationMinutes || 0) + ' minut',
      'Forma poskytov\u00e1n\u00ed: ' + (fields.place || fields.ka02Place || ''),
      'C\u00edl IP / zak\u00e1zka: ' + (fields.linkedPlanGoalLabel || ''),
      fields.caseManagementMode ? 'Zapojen\u00ed akt\u00e9\u0159i: ' + ((fields.partnerNames || []).join('; ') || 'bez zapojen\u00fdch akt\u00e9r\u016f') : '',
      'Popis pr\u016fb\u011bhu: ' + (fields.topics || ''),
      'Dolo\u017een\u00fd v\u00fdsledek: ' + (fields.outcome || ''),
      'Dal\u0161\u00ed kroky: ' + (fields.nextSteps || ''),
      'Pokud v\u00fdsledek nen\u00ed uveden, nedopl\u0148uj jej jako dosa\u017eenou zm\u011bnu.',
      'V\u00fdstup recordText napi\u0161 jako fin\u00e1ln\u00ed z\u00e1pis do dokumentace: bez odr\u00e1\u017eek, bez markdownu, bez opisov\u00e1n\u00ed n\u00e1zv\u016f pol\u00ed. Pr\u016fb\u011bh a dal\u0161\u00ed krok propoj do p\u0159irozen\u00e9ho textu.'
    ].filter(Boolean).join('\n')
  }
};

const ACTIVE_AI_DOCUMENT_KEYS = ['plan', 'consultation'];

const APP_VIEWS = [
  { id: 'clients', name: 'Klienti', icon: Users, tone: 'indigo' },
  { id: 'ka02', name: 'V\u00fdkony KA1', icon: Target, tone: 'emerald' },
  { id: 'dashboard', name: 'Dashboard', icon: BarChart3, tone: 'slate' },
  { id: 'isir', name: 'ISIR', icon: Scale, tone: 'sky' },
  { id: 'calculator', name: 'Kalkula\u010dka', icon: Calculator, tone: 'amber' },
  { id: 'document-creator', name: 'Tvorba dokument\u016f', icon: FileText, tone: 'indigo' },
  { id: 'ai-tools', name: 'AI Pom\u016fcky', icon: Sparkles, tone: 'violet' },
];

const REPORTING_PERIODS = [
  { value: 'all', label: 'V\u0161echna data', start: '', end: '' },
  { value: '2026-03_2026-08', label: '03/2026 - 08/2026', start: '2026-03-01', end: '2026-08-31' },
  { value: '2026-09_2027-02', label: '09/2026 - 02/2027', start: '2026-09-01', end: '2027-02-28' },
  { value: '2027-03_2027-08', label: '03/2027 - 08/2027', start: '2027-03-01', end: '2027-08-31' },
  { value: '2027-09_2028-02', label: '09/2027 - 02/2028', start: '2027-09-01', end: '2028-02-29' }
];

const emptyClientDraft = {
  jmeno: '', prijmeni: '', datumNarozeni: '', ulice: '', cisloPopisne: '', mesto: '', psc: '', spadoveMesto: '',
  email: '', datovaSchranka: '', telefon: '', pohlavi: '', postaveniNaTrhu: '', vzdelani: '', znevyhodneni: '',
  datumVstupu: todayIso(), datumVystupu: '', stavKlienta: 'Aktivn\u00ed', keyWorker: '', caseManagementPotreba: 'Ne',
  caseManagementDuvod: '', caseManagementOd: '', poznamka: '', situacePoUkonceni: '', projectStatus: 'active',
  rodina: false
};

const emptyGeneratorDraft = {
  selectedKey: 'plan', clientId: '', tpmRecordId: '', linkedPlanGoalId: '', linkedPlanGoalLabel: '',
  worker: WORKERS[0], date: todayIso(), ka02StartTime: '', ka02EndTime: '', ka02Place: '', bulletNotes: '',
  situationDescription: '', goals: '', plannedSteps: '', finalEvaluation: '', planDurationMinutes: '60',
  consultationType: 'Z\u00e1kladn\u00ed soci\u00e1ln\u00ed poradenstv\u00ed', supportArea: '', kuSupportTypeCode: KU_SUPPORT_DEFAULT_CODE, supportSpecific: {}, topics: '', outcome: '', nextSteps: '', durationMinutes: '',
  debtSummary: '', debtCauses: '', debtStage: 'Mapov\u00e1n\u00ed', solutionPlan: '', educationTopic: '', sessionOrder: '1',
  themes: '', mentalState: '', recommendations: '', targetJob: '', cvDurationMinutes: '', experience: '', skills: '',
  position: '', feedback: '', strengths: '', developmentAreas: '', workplace: '', progressSummary: '', aiStyleRating: '3',
  aiStyleFeedback: '', generatedText: '', caseManagementMode: false, selectedPartnerIds: [], registeredPartnerNames: [], manualPartnerNames: [], partnerNames: [], participantCount: 0
};

const emptyFilters = { period: 'all', ka: 'all', worker: 'all' };

export {
  GOOGLE_SHEET_MACRO_URL,
  GOOGLE_DRIVE_UPLOAD_URL,
  TARGETS,
  WORKERS,
  CLIENT_GENDER_OPTIONS,
  CLIENT_EMPLOYMENT_OPTIONS,
  CLIENT_EDUCATION_OPTIONS,
  CLIENT_DISADVANTAGE_OPTIONS,
  CLIENT_STATUS_OPTIONS,
  YES_NO_OPTIONS,
  KU_SUPPORT_DEFAULT_CODE,
  KU_SUPPORT_DEFAULT_LABEL,
  KU_SUPPORT_TYPE_OPTIONS,
  REPORT_PROMPTS,
  ACTIVE_AI_DOCUMENT_KEYS,
  APP_VIEWS,
  REPORTING_PERIODS,
  emptyClientDraft,
  emptyGeneratorDraft,
  emptyFilters
};
