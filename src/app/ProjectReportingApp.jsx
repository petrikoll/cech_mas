import React, { useEffect, useMemo, useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronRight,
  ClipboardCopy,
  Clock,
  Database,
  Download,
  DownloadCloud,
  FileBadge,
  FileSpreadsheet,
  FileText,
  Filter,
  GraduationCap,
  History,
  Lightbulb,
  Loader2,
  MapPin,
  MessageSquare,
  Pencil,
  Phone,
  PieChart,
  Plus,
  Presentation,
  Save,
  Scale,
  Search,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Brain,
  Printer
} from 'lucide-react';
import { onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { addDoc, collection, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import {
  APP_VIEWS,
  GOOGLE_DRIVE_UPLOAD_URL,
  GOOGLE_SHEET_MACRO_URL,
  REPORTING_PERIODS,
  REPORT_PROMPTS,
  TARGETS,
  WORKERS,
  CLIENT_GENDER_OPTIONS,
  CLIENT_EMPLOYMENT_OPTIONS,
  CLIENT_EDUCATION_OPTIONS,
  CLIENT_DISADVANTAGE_OPTIONS,
  CLIENT_STATUS_OPTIONS,
  KU_SUPPORT_DEFAULT_CODE,
  emptyClientDraft,
  emptyFilters,
  emptyGeneratorDraft
} from '../config/projectConfig.js';
import { HELP } from '../config/helpCatalog.js';
import {
  CompactMetric,
  DetailRow,
  EmptyState,
  InfoCard,
  HelpIcon,
  InputField,
  LoadingCard,
  MiniBadge,
  Panel,
  SaveInlineNotice,
  SelectField,
  StatCard,
  TextAreaField,
  TopMetric
} from '../components/ui.jsx';
import { appId, auth, db, hasFirebaseConfig } from '../lib/firebase.js';
import { parseAiJson, redactClientIdentifiers, sanitizeAiInput, validatePlanOutput, validateRecordOutput } from '../lib/aiSafety.js';
import { buildClientCaseAiPrompt, filterClientCaseAiRecords } from '../lib/clientCaseSummary.js';
import {
  KA1_NOTE_AI_MODEL,
  KA1_NOTE_RESPONSE_SCHEMA,
  KA1_NOTE_SYSTEM_PROMPT,
  buildKa1NoteUserPrompt,
  validateKa1NoteAiResult
} from '../lib/ka1NoteAi.js';
import { buildHorizontalPrinciplesAiPrompt, buildHorizontalPrinciplesFallbackText, buildZorTexts } from '../lib/zorSummary.js';
import {
  buildLegacyPerformanceDetail,
  buildLegacyPerformanceSummary,
  normalizePerformanceTime
} from '../lib/legacyPerformancePresentation.js';
import { mapPaymentPlanRowToRecord } from '../lib/paymentPlans.js';
import AiDocumentPanel from './AiDocumentPanel.jsx';
import Ka02View from './Ka02View.jsx';
import ProjectSwitcher from '../components/ProjectSwitcher.jsx';
import { useProject } from '../context/ProjectContext.jsx';
import sfLogoImage from '../assets/eu-spolufinancovano-logo.png';
import {
  buildAddress,
  buildAllRecordsBackupHtml,
  buildClientFolderHtml,
  buildDriveUploadPayload,
  buildFallbackGeneratedText,
  buildAiStyleMemoryRecord,
  buildGeneratorRecord,
  buildStyleMemoryContext,
  buildIndicators,
  buildPartnerStats,
  buildKa02Record,
  buildKa03Record,
  buildManualClientId,
  buildMonitoringBundleHtml,
  buildRecordHtmlDocument,
  buildSelectedJourneyPrintHtml,
  cleanGeneratedText,
  computedIndicatorsMap,
  copyToClipboard,
  downloadCsv,
  downloadHtmlDocument,
  enrichClient,
  extractGeminiText,
  getClientSupportBreakdown,
  getClientStats,
  groupRecordsByType,
  loadLocalRecords,
  mapSheetRowToClient,
  saveLocalRecords,
  slugify,
  todayIso,
  truncate
} from '../lib/projectUtils.js';

const Ka01View = React.lazy(() => import('./Ka01View.jsx'));
const Ka2CaseManagementView = React.lazy(() => import('./Ka2CaseManagementView.jsx'));
const ReportingView = React.lazy(() => import('./ReportingView.jsx'));

const LazyViewFallback = () => (
  <LoadingCard text="Načítám modul..." />
);

const KA02_AI_DOCUMENT_KEYS = ['plan', 'consultation'];
const KA02_STRUCTURED_FORM_KEYS = ['consultation'];
const SUPERVISION_TYPE_OPTIONS = ['individuální', 'skupinová'];
const KA1_SUPPORT_SPECIFIC_SHEET_COLUMNS = [
  ['contactPlace', 'misto_depistaze'],
  ['contactMethod', 'zpusob_kontaktu'],
  ['cooperationInterest', 'zajem_o_spolupraci'],
  ['physicalSignedFiled', 'zapis_fyzicky_podepsan_zalozen'],
  ['mappedAreas', 'hlavni_zjistene_oblasti'],
  ['risks', 'rizika'],
  ['clientResources', 'zdroje_klienta'],
  ['clientNeeds', 'potreby_klienta'],
  ['providedInformation', 'poskytnute_informace'],
  ['recommendedProcedure', 'doporuceny_postup'],
  ['fieldWorkPlace', 'misto_vykonu'],
  ['visitPurpose', 'ucel_navstevy'],
  ['accompanimentPlace', 'kam_doprovod'],
  ['accompanimentPurpose', 'ucel_doprovodu'],
  ['accompanimentResult', 'vysledek_doprovodu'],
  ['crisisType', 'typ_krize'],
  ['urgency', 'mira_akutnosti'],
  ['measures', 'prijata_opatreni'],
  ['followupHelp', 'predani_navazne_pomoci'],
  ['contactedFollowupServices', 'kontaktovana_navazna_sluzba'],
  ['evaluationReason', 'duvod_vyhodnoceni_ukonceni'],
  ['achievedProgress', 'dosazeny_posun'],
  ['unresolvedAreas', 'nedoresene_oblasti'],
  ['recommendation', 'doporuceni'],
];
const mapKA1SupportSpecificToSheetColumns = (supportSpecific = {}) =>
  KA1_SUPPORT_SPECIFIC_SHEET_COLUMNS.reduce((accumulator, [key, column]) => {
    accumulator[column] = supportSpecific?.[key] ?? '';
    return accumulator;
  }, {});
const mapSheetColumnsToKA1SupportSpecific = (row = {}) =>
  KA1_SUPPORT_SPECIFIC_SHEET_COLUMNS.reduce((accumulator, [key, column]) => {
    const value = asSheetText(row[column]).trim();
    if (value) accumulator[key] = key === 'physicalSignedFiled' ? /^(ano|true|1)$/i.test(value) : value;
    return accumulator;
  }, {});
const isDepistageType = (value) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes('depist');
const isPhysicalSignedFiledOutreach = (draft = {}) =>
  draft.selectedKey === 'consultation' &&
  !draft.caseManagementMode &&
  isDepistageType(draft.consultationType) &&
  Boolean(draft.supportSpecific?.physicalSignedFiled);
const buildPhysicalSignedFiledOutreachText = () => [
  'Zápis k depistáži byl fyzicky podepsán a založen do klientské dokumentace.',
  'Elektronický záznam slouží pouze k evidenci základních údajů o aktivitě v programu.',
  'Podrobný obsah aktivity je uveden ve fyzicky založeném zápisu.'
].join(' ');
const APP_VERSION_LABEL = 'verze 2026-07-10';
const AI_MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gemini-2.5-flash-lite', label: 'Gemini 2.5 Flash Lite' },
  { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash Lite' }
];
const DEFAULT_AI_MODEL = 'gemini-2.5-flash';

const KA01_ACTIVITY_AI_CONTEXT = [
  'Tvorba s\u00edt\u011b sleduje rozvoj a udr\u017eov\u00e1n\u00ed partnersk\u00e9 spolupr\u00e1ce na \u00fazem\u00ed aktivn\u00edho projektu.',
  'Z\u00e1znam zachycuje individu\u00e1ln\u00ed nebo skupinovou sch\u016fzku partner\u016f, p\u0159\u00edpadn\u011b poradu realiza\u010dn\u00edho t\u00fdmu.',
  'Popisuj pouze dolo\u017een\u00fd obsah jedn\u00e1n\u00ed, jeho v\u00fdsledek a dohodnut\u00e9 dal\u0161\u00ed kroky.',
  'Nezmi\u0148uj n\u00e1bor klient\u016f, distribuci materi\u00e1l\u016f ani obsah star\u00e9ho projektu, pokud nebyly v\u00fdslovn\u011b zad\u00e1ny.'
].join('\n');

const KA01_AI_OUTPUT_RULES = [
  'Pi\u0161 \u010desky, v\u011bcn\u011b a auditn\u011b obhajiteln\u011b.',
  'Rozsah p\u0159izp\u016fsob typu a obsahu aktivity. Obvykle napi\u0161 3 a\u017e 6 dokon\u010den\u00fdch v\u011bt, u porady realiza\u010dn\u00edho t\u00fdmu 5 a\u017e 8 v\u011bt.',
  'Nevym\u00fd\u0161lej osoby, rozhodnut\u00ed, \u00fakoly, odpov\u011bdnosti ani term\u00edny. Chyb\u011bj\u00edc\u00ed informace nep\u0159id\u00e1vej.',
  'Nevracej JSON, Markdown ani seznam n\u00e1zv\u016f pol\u00ed. Vra\u0165 pouze hotov\u00fd text z\u00e1pisu.'
].join('\n');

const getKa01PhaseGuidance = () =>
  'Z\u00e1pis formuluj jako konkr\u00e9tn\u00ed krok v rozvoji nebo udr\u017eov\u00e1n\u00ed spolupracuj\u00edc\u00ed s\u00edt\u011b.';
const getKa01ActivityTypeGuidance = (type) => {
  const normalized = String(type || '').trim().toLocaleLowerCase('cs');
  if (normalized === 'porada') {
    return [
      'Jde o interní poradu realizačního týmu projektu, nikoli o schůzku partnerské sítě.',
      'Zvol kultivovanější, plynulý a o něco květnatější administrativní styl. Text má působit jako kvalitní zápis z porady, ne jako stručný seznam bodů.',
      'Rozveď souvislosti mezi projednanými tématy, ale nepřidávej nová fakta, osoby, rozhodnutí, odpovědnosti ani termíny.',
      'Zachyť projednaná témata, podstatné závěry a konkrétní úkoly. U úkolů uveď odpovědnost a termín pouze tehdy, jsou-li v datech.',
      'Na konci uveď domluvený termín a témata dalšího jednání, pokud byla zadána.'
    ].join('\n');
  }
  if (normalized === 'koordina\u010dn\u00ed setk\u00e1n\u00ed') {
    return 'Zd\u016frazni koordinaci zapojen\u00fdch akt\u00e9r\u016f, sd\u00edlen\u00ed informac\u00ed, rozd\u011blen\u00ed rol\u00ed a dohodnut\u00fd postup. Nevyd\u00e1vej setk\u00e1n\u00ed za poradu realiza\u010dn\u00edho t\u00fdmu.';
  }
  if (normalized.includes('roz\u0161\u00ed\u0159en\u00ed') || normalized.includes('udr\u017een\u00ed s\u00edt\u011b')) {
    return 'Popi\u0161, zda \u0161lo o nav\u00e1z\u00e1n\u00ed nov\u00e9 spolupr\u00e1ce nebo udr\u017een\u00ed st\u00e1vaj\u00edc\u00edho vztahu, jak\u00fd byl p\u0159\u00ednos kontaktu pro partnerskou s\u00ed\u0165 a jak\u00fd konkr\u00e9tn\u00ed krok byl dohodnut.';
  }
  if (normalized === 'skupinov\u00e1') {
    return 'Jde o skupinov\u00e9 jedn\u00e1n\u00ed v\u00edce akt\u00e9r\u016f s\u00edt\u011b. Shr\u0148 spole\u010dn\u00e1 t\u00e9mata, dosa\u017een\u00e9 shody nebo rozd\u00edln\u00e9 postoje a navazuj\u00edc\u00ed \u00fakoly pouze podle zadan\u00fdch dat.';
  }
  if (normalized === 'individu\u00e1ln\u00ed') {
    return 'Jde o dvoustrann\u00e9 jedn\u00e1n\u00ed s jedn\u00edm akt\u00e9rem. Popi\u0161 \u00fa\u010del kontaktu, projednanou oblast spolupr\u00e1ce, v\u00fdsledek a navazuj\u00edc\u00ed krok.';
  }
  return 'Popi\u0161 \u00fa\u010del aktivity, zapojen\u00e9 akt\u00e9ry, projednan\u00fd obsah, dolo\u017een\u00fd v\u00fdsledek a dal\u0161\u00ed postup.';
};
const parseTimeToMinutes = (value) => {
  const match = String(value || '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
};

const formatDurationFromTimes = (startTime, endTime) => {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);
  if (startMinutes == null || endMinutes == null) return '';
  const durationMinutes = endMinutes >= startMinutes ?endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  if (durationMinutes <= 0) return '';
  const hours = Math.floor(durationMinutes / 60);
  const minutes = durationMinutes % 60;
  if (hours && minutes) return `${hours} hod. ${minutes} min.`;
  if (hours) return `${hours} ${hours === 1 ?'hodina' : hours < 5 ?'hodiny' : 'hodin'}`;
  return `${minutes} min.`;
};

const KA01_HALF_HOUR_OPTIONS = Array.from({ length: 48 }, (_, index) => {
  const hour = Math.floor(index / 2);
  const minute = index % 2 === 0 ? '00' : '30';
  return `${hour}:${minute}`;
});

const getKa01TimeSuggestions = (value) => {
  const query = String(value || '').trim();
  if (!query) {
    const preferredStartIndex = KA01_HALF_HOUR_OPTIONS.indexOf('7:00');
    const ordered = preferredStartIndex >= 0
      ? [
          ...KA01_HALF_HOUR_OPTIONS.slice(preferredStartIndex),
          ...KA01_HALF_HOUR_OPTIONS.slice(0, preferredStartIndex)
        ]
      : KA01_HALF_HOUR_OPTIONS;
    return ordered;
  }

  const hourOnlyMatch = query.match(/^(\d{1,2})$/);
  if (hourOnlyMatch) {
    const hour = Number(hourOnlyMatch[1]);
    if (hour >= 0 && hour <= 23) {
      return [`${hour}:00`, `${hour}:30`];
    }
  }

  const normalized = query.replace('.', ':');
  return KA01_HALF_HOUR_OPTIONS.filter((item) => item.startsWith(normalized)).slice(0, 24);
};

const KA01_ACTOR_CUSTOM = '__custom__';
const KA01_ACTOR_ROLE_FIELDS = [
  'roleRecruitment',
  'roleClientReferral',
  'roleMaterialDistribution',
  'roleJobOpportunities',
  'roleTpm',
  'roleHpp',
  'roleFollowupService',
  'roleDebtSocialSupport',
  'roleInfoSharingWithConsent',
  'roleCoordinationMeetings',
  'roleWorkplaceAdaptation',
  'roleOther'
];
const KA01_EMPTY_ACTOR_ROLES = KA01_ACTOR_ROLE_FIELDS.reduce((accumulator, field) => {
  accumulator[field] = false;
  return accumulator;
}, {});
const isCheckedValue = (value) => {
  if (value === true) return true;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') return ['true', 'ano', '1', 'yes'].includes(value.trim().toLowerCase());
  return false;
};
const KA01_PLACE_CUSTOM = '__custom__';
const KA01_PLACE_OPTIONS = [
  { value: 'Ondr\u00e1\u0161ov', label: 'Ondr\u00e1\u0161ov' },
  { value: 'Sedm Dvor\u016f', label: 'Sedm Dvor\u016f' },
  { value: '\u010cabov\u00e1', label: '\u010cabov\u00e1' },
  { value: 'Nov\u00e9 Valte\u0159ice', label: 'Nov\u00e9 Valte\u0159ice' },
  { value: 'Norber\u010dany', label: 'Norber\u010dany' },
  { value: 'Star\u00e1 Libav\u00e1', label: 'Star\u00e1 Libav\u00e1' },
  { value: 'Trhavice', label: 'Trhavice' },
  { value: 'Nov\u00e1 V\u00e9ska', label: 'Nov\u00e1 V\u00e9ska' },
  { value: KA01_PLACE_CUSTOM, label: 'Jin\u00e9 m\u00edsto (ru\u010dn\u011b)' }
];
const KA01_DEFAULT_ACTOR_REGISTRY = [];

const buildEmptyKa01ActorEntry = () => ({ actorType: '', customName: '' });
const getKa01ActorDisplayName = (entry) => {
  if (!entry) return '';
  if (entry.actorType === KA01_ACTOR_CUSTOM) return String(entry.customName || '').trim();
  return String(entry.actorType || '').trim();
};
const normalizeKa01ActorEntries = (entries) => {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const selectedEntries = safeEntries
    .map((entry) => ({
      actorType: String(entry?.actorType || ''),
      customName: String(entry?.customName || '')
    }))
    .filter((entry) => entry.actorType === KA01_ACTOR_CUSTOM || Boolean(getKa01ActorDisplayName(entry)));

  return [...selectedEntries, buildEmptyKa01ActorEntry()];
};
const serializeKa01ActorEntries = (entries) =>
  normalizeKa01ActorEntries(entries)
    .map((entry) => getKa01ActorDisplayName(entry))
    .filter(Boolean)
    .join(', ');
const parseKa01ActorEntries = (participantsText, knownActorOptionValues = []) => {
  const text = String(participantsText || '').trim();
  if (!text) return [buildEmptyKa01ActorEntry()];

  const knownOptionValues = new Set(
    (Array.isArray(knownActorOptionValues) ? knownActorOptionValues : [])
      .map((value) => String(value || '').trim())
      .filter((value) => value && value !== KA01_ACTOR_CUSTOM)
  );
  const entries = text
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) =>
      knownOptionValues.has(item)
        ? { actorType: item, customName: '' }
        : { actorType: KA01_ACTOR_CUSTOM, customName: item }
    );

  return normalizeKa01ActorEntries(entries);
};
const parseKa01PlaceValue = (placeText) => {
  const value = String(placeText || '').trim();
  if (!value) return { placeType: '', customPlace: '' };
  const knownPlaceValues = new Set(KA01_PLACE_OPTIONS.map((item) => item.value).filter((item) => item !== KA01_PLACE_CUSTOM));
  if (knownPlaceValues.has(value)) {
    return { placeType: value, customPlace: '' };
  }
  return { placeType: KA01_PLACE_CUSTOM, customPlace: value };
};

const inspectAiOutputCompleteness = (text, { finishReason = '' } = {}) => {
  const normalized = cleanGeneratedText(text || '');
  const reasons = [];
  if (!normalized) return { isSuspicious: false, reasons };

  if (finishReason === 'MAX_TOKENS') {
    reasons.push('Gemini ukončil odpověď kvůli limitu délky.');
  }

  const ending = normalized.slice(-160).trim();
  const lastWord = ending.split(/\s+/).filter(Boolean).pop() || '';
  const hasSentenceEnding = /[.!?)]["'”’]*$/.test(ending);
  const endsWithDanglingPunctuation = /[,;:([/-]$/.test(ending);
  const endsWithDanglingWord = /^(a|i|k|s|v|z|do|na|po|pro|při|ve|ze|že|aby|kdyby|pokud|protože|který|která|které|nebo|zejména)$/i.test(lastWord);
  const openParentheses = (normalized.match(/\(/g) || []).length > (normalized.match(/\)/g) || []).length;

  if (normalized.length > 900 && !hasSentenceEnding) {
    reasons.push('Text nekončí ukončenou větou.');
  }
  if (endsWithDanglingPunctuation || endsWithDanglingWord) {
    reasons.push('Text končí rozpracovanou formulací.');
  }
  if (openParentheses) {
    reasons.push('Text má neuzavřenou závorku.');
  }

  return { isSuspicious: reasons.length > 0, reasons };
};

const AI_SAFETY_BASE = 'Jsi odborný asistent pro zpracování interních záznamů projektů dluhového poradenství CECH a MAS. Pracuj pouze s výslovně uvedenými údaji. Nevymýšlej osoby, diagnózy, výsledky, rozhodnutí, termíny ani služby. Piš česky, věcně, profesionálně a auditně obhajitelně.';

const KA2_NETWORK_SYSTEM_PROMPT = `${AI_SAFETY_BASE}

Vytváříš projektový zápis aktivity KA2 – Tvorba sítě. Zápis se netýká individuální klientské podpory, ale rozvoje, koordinace, udržení nebo rozšíření partnerské sítě. Všechny obsahové informace čerpej z jediného vstupního pole Popis. Rozděl je do polí description, outcome a nextSteps. Nevymýšlej osoby, rozhodnutí, úkoly, odpovědnosti ani termíny. Pokud pro některé pole není ve vstupním Popisu podklad, vrať v něm text Neuvedeno. Vrať pouze JSON podle zadaného schématu.`;

const fetchGemini = async (url, options) => {
  const response = await fetch(url, options);
  if (response.ok) return response;

  const modelMatch = String(url || '').match(/\/models\/([^/:]+):/);
  const primaryModel = modelMatch?.[1] || DEFAULT_AI_MODEL;
  const fallbackModel = import.meta.env.VITE_GEMINI_FALLBACK_MODEL || '';
  if (!fallbackModel || fallbackModel === primaryModel || url.includes(`/models/${fallbackModel}:`)) return response;

  const fallbackUrl = url.replace(`/models/${primaryModel}:`, `/models/${fallbackModel}:`);
  if (fallbackUrl === url) return response;
  console.warn(`Gemini model ${primaryModel} selhal, používám náhradní model ${fallbackModel}.`);
  return fetch(fallbackUrl, options);
};

const buildSafeGeneratorUserPrompt = (config, client, fields) => {
  const safeClient = sanitizeAiInput(client || {});
  const safeFields = sanitizeAiInput(fields || {});
  return redactClientIdentifiers(config.buildUserPrompt({ client: safeClient, fields: safeFields }), client);
};

const KA02_ACTIVITY_AI_CONTEXT = `
KA2 je v této aplikaci zaměřena na case management, koordinaci podpory klienta a tvorbu či udržování partnerské sítě.

Při generování zápisů v KA2 pracuj zejména s tím, co bylo skutečně projednáno, kteří aktéři byli zapojeni, jaký byl výsledek jednání a jaký navazující krok byl domluven.

Kontext používej pouze k návaznosti a věcnému zasazení textu. Nepřidávej nové instituce, služby, dohody, úkoly ani termíny, pokud nejsou uvedené v aktuálním záznamu.
`.trim();

const CURRENT_ACTIVITY_ENTITY_TYPES = new Set([
  'network_activities',
  'plans',
  'consultations',
  'debt_cases',
  'therapy_sessions',
  'cv_outputs',
  'job_simulators',
  'tpm_records',
  'employment_records',
  'mentoring_records'
]);
const ZOR_ACTIVITY_ENTITY_TYPES = new Set([
  ...CURRENT_ACTIVITY_ENTITY_TYPES,
  'education_records',
  'supervision_records'
]);
const CLIENT_JOURNEY_ENTITY_TYPES = new Set([
  'plans',
  'consultations',
  'debt_cases',
  'therapy_sessions',
  'cv_outputs',
  'job_simulators',
  'tpm_records',
  'mentoring_records',
  'employment_records',
  'mentor_report_document'
]);

const CLIENT_JOURNEY_META = {
  project_entry: { stage: 'Vstup', label: 'Zařazení klienta', tone: 'slate', icon: Calendar },
  plans: { stage: 'KA02', label: 'Plán rozvoje', tone: 'blue', icon: Target },
  consultations: { stage: 'KA02', label: 'Konzultace', tone: 'blue', icon: MessageSquare },
  debt_cases: { stage: 'KA02', label: 'Dluhové poradenství', tone: 'blue', icon: Scale },
  therapy_sessions: { stage: 'KA02', label: 'Terapie', tone: 'blue', icon: Brain },
  job_simulators: { stage: 'KA02', label: 'Pracovní simulátor', tone: 'blue', icon: Presentation },
};

const JOURNEY_TONE_CLASSES = {
  slate: {
    dot: 'bg-slate-400',
    badge: 'border-slate-200 bg-slate-50 text-slate-700',
    panel: 'border-slate-200 bg-white'
  },
  blue: {
    dot: 'bg-blue-500',
    badge: 'border-blue-200 bg-blue-50 text-blue-700',
    panel: 'border-blue-100 bg-blue-50/40'
  },
  amber: {
    dot: 'bg-amber-500',
    badge: 'border-amber-200 bg-amber-50 text-amber-700',
    panel: 'border-amber-100 bg-amber-50/40'
  },
  emerald: {
    dot: 'bg-emerald-500',
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    panel: 'border-emerald-100 bg-emerald-50/40'
  }
};

function formatDateLabel(value) {
  if (!value) return 'Bez data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('cs-CZ').format(parsed);
}

function parseDateForSort(value) {
  if (!value) return 0;
  if (typeof value?.toDate === 'function') return value.toDate().getTime();
  const normalized = String(value).trim();
  const isoDate = new Date(normalized);
  if (!Number.isNaN(isoDate.getTime())) return isoDate.getTime();
  const czechDate = normalized.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if (czechDate) {
    const [, day, month, year] = czechDate;
    return new Date(Number(year), Number(month) - 1, Number(day)).getTime();
  }
  return 0;
}

function compareTimelineRecordsDesc(a, b) {
  if (a.entityType === 'project_entry' && b.entityType !== 'project_entry') return 1;
  if (b.entityType === 'project_entry' && a.entityType !== 'project_entry') return -1;
  const dateDiff = parseDateForSort(b.activityDate) - parseDateForSort(a.activityDate);
  if (dateDiff !== 0) return dateDiff;
  const createdDiff = Number(b.createdAt || 0) - Number(a.createdAt || 0);
  if (createdDiff !== 0) return createdDiff;
  return String(a.title || '').localeCompare(String(b.title || ''), 'cs');
}

function timeToMinutesForSupport(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getGeneratorSupportMinutes(draft) {
  if (draft.selectedKey === 'plan') return Number(draft.planDurationMinutes || 0);
  if (draft.selectedKey === 'cv') return Number(draft.cvDurationMinutes || 0);
  const startMinutes = timeToMinutesForSupport(draft.ka02StartTime);
  const endMinutes = timeToMinutesForSupport(draft.ka02EndTime);
  if (startMinutes !== null && endMinutes !== null) {
    const duration = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
    if (duration > 0) return duration;
  }
  return Number(draft.durationMinutes || 0);
}

function formatSupportDuration(minutes) {
  const value = Number(minutes || 0);
  if (!Number.isFinite(value) || value <= 0) return 'není zadána';
  const hours = value / 60;
  const hoursLabel = Number.isInteger(hours) ? String(hours) : String(hours).replace('.', ',');
  return `${value} minut (${hoursLabel} h)`;
}

function formatSupportMinutes(value) {
  const totalMinutes = Math.max(0, Math.round(Number(value || 0)));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours && minutes) return `${hours} h ${minutes} min`;
  if (hours) return `${hours} h`;
  return `${minutes} min`;
}

function getEffectiveGeneratorKa(config, draft = {}) {
  if (draft?.caseManagementMode) return 'KA2';
  return config?.ka || '';
}

function buildExactGeneratorFacts(config, draft) {
  const effectiveKa = getEffectiveGeneratorKa(config, draft);
  return [
    'AKTUÁLNÍ AKTIVITA – závazná data z formuláře:',
    `Typ dokumentu: ${config.label}`,
    `KA: ${effectiveKa}`,
    `Datum aktivity: ${draft.date || todayIso()}`,
    `Pracovník: ${draft.worker || 'Neuvedeno'}`,
    `Délka podpory: ${formatSupportDuration(getGeneratorSupportMinutes(draft))}`,
    '',
    'Tato část je jediný zdroj faktů pro aktuální zápis. Datum, KA ani délku podpory neměň, nepřepisuj a nenahrazuj odhadem.'
  ].join('\n');
}

function getClientJourneyMeta(record) {
  const payload = record.payload || {};
  const recordKa = String(record.ka || '').toUpperCase();
  const isKa1 = recordKa === 'KA1' || recordKa === 'KA01';
  const isKa2 = recordKa === 'KA2' || recordKa === 'KA02' || Boolean(payload.caseManagementMode);

  if (record.entityType === 'plans') {
    return { stage: 'KA1', label: 'Individuální plán rozvoje', tone: 'emerald', icon: Target };
  }

  if (record.entityType === 'consultations') {
    if (isKa2) {
      return {
        stage: 'KA2',
        label: payload.consultationType || 'Case management',
        tone: 'blue',
        icon: MessageSquare
      };
    }

    if (isKa1) {
      return {
        stage: 'KA1',
        label: payload.consultationType || 'Individuální podpora',
        tone: 'emerald',
        icon: MessageSquare
      };
    }
  }

  return CLIENT_JOURNEY_META[record.entityType] || {
    stage: record.ka || 'Dokument',
    label: record.entityType || 'Záznam',
    tone: 'slate',
    icon: FileText
  };
}
function buildClientJourneySummary(record) {
  if (record.isLegacyReadOnly || record.sourceSystem === 'LEGACY_XLSM') {
    return buildLegacyPerformanceSummary(record);
  }

  if (record.entityType === 'project_entry') {
    return record.summary || 'Klient byl zařazen do projektu a otevřela se jeho klientská cesta.';
  }

  const payload = record.payload || {};
  const specificSummary = {
    plans: record.situationDescription || payload.situationDescription || payload.currentSituation || payload.plannedSteps,
    consultations: payload.topics || payload.outcome || payload.nextSteps,
    debt_cases: payload.debtSummary || payload.solutionPlan || payload.educationTopic,
    therapy_sessions: payload.themes || payload.recommendations || payload.mentalState,
    cv_outputs: payload.targetJob || payload.skills || payload.experience,
    job_simulators: payload.position || payload.feedback || payload.committee,
    tpm_records: [payload.employer, payload.workplace].filter(Boolean).join(' • '),
    mentoring_records: payload.progressSummary || payload.nextSupportSteps || payload.barriers,
    employment_records: [payload.employmentType, payload.employmentStatus, payload.sustainabilitySupport].filter(Boolean).join(' • '),
    mentor_report_document: record.documentText
  }[record.entityType];

  const textSource = specificSummary || record.documentText || JSON.stringify(payload || {});
  return truncate(cleanGeneratedText(textSource || 'Bez doplňujícího shrnutí.'), 220);
}

function formatCaseSummaryDate(value) {
  if (!value) return '';
  const dateValue = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ').format(dateValue);
}

function safeParsePlanGoals(value) {
  if (Array.isArray(value)) return value;
  if (!value) return [];
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function getPlanGoals(planRecord) {
  if (!planRecord) return [];
  const directGoals = safeParsePlanGoals(planRecord.goals);
  if (directGoals.length) return directGoals;
  const payloadGoals = safeParsePlanGoals(planRecord.payload?.goals);
  if (payloadGoals.length) return payloadGoals;
  const structuredGoals = safeParsePlanGoals(planRecord.payload?.structuredGoals);
  if (structuredGoals.length) return structuredGoals;
  return safeParsePlanGoals(planRecord.cile_json || planRecord.payload?.cile_json);
}


const GOAL_DEADLINE_WARNING_DAYS = 30;

function parseGoalDeadline(value) {
  const time = parseDateForSort(value);
  if (!time) return 0;
  const date = new Date(time);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function isGoalEvaluatedOrClosed(goal, planRecord = null) {
  return Boolean(goal?.isCompleted) ||
    Boolean(String(goal?.goalEvaluation || '').trim()) ||
    Boolean(String(planRecord?.finalEvaluation || planRecord?.payload?.finalEvaluation || '').trim());
}

function getGoalDescription(goal, index) {
  return cleanGeneratedText(goal?.goalDescription || goal?.description || goal?.title || `Cíl ${index + 1}`);
}

function buildGoalDeadlineAlerts({ clients = [], records = [], warningDays = GOAL_DEADLINE_WARNING_DAYS, referenceDate = todayIso() }) {
  const clientById = new Map(clients.map((client) => [client.id, client]));
  const latestPlanByClient = new Map();
  records
    .filter((record) => record.entityType === 'plans' && record.clientId && clientById.has(record.clientId))
    .forEach((record) => {
      const current = latestPlanByClient.get(record.clientId);
      const recordTime = parseDateForSort(record.activityDate || record.updatedAt || record.createdAt);
      const currentTime = current ? parseDateForSort(current.activityDate || current.updatedAt || current.createdAt) : 0;
      if (!current || recordTime >= currentTime) latestPlanByClient.set(record.clientId, record);
    });

  const today = parseGoalDeadline(referenceDate) || parseGoalDeadline(todayIso());
  const dayMs = 24 * 60 * 60 * 1000;
  const approaching = [];
  const overdue = [];

  latestPlanByClient.forEach((planRecord, clientId) => {
    const client = clientById.get(clientId);
    getPlanGoals(planRecord).forEach((goal, index) => {
      const deadlineTime = parseGoalDeadline(goal.targetDate || goal.deadline || goal.term || '');
      if (!deadlineTime || isGoalEvaluatedOrClosed(goal, planRecord)) return;
      const daysUntil = Math.ceil((deadlineTime - today) / dayMs);
      const item = {
        clientId,
        clientName: client?.fullName || planRecord.clientName || clientId,
        goalLabel: truncate(getGoalDescription(goal, index), 90),
        deadline: new Date(deadlineTime).toISOString().slice(0, 10),
        daysUntil
      };
      if (daysUntil < 0) overdue.push({ ...item, daysOverdue: Math.abs(daysUntil) });
      else if (daysUntil <= warningDays) approaching.push(item);
    });
  });

  approaching.sort((a, b) => a.daysUntil - b.daysUntil || a.clientName.localeCompare(b.clientName, 'cs'));
  overdue.sort((a, b) => b.daysOverdue - a.daysOverdue || a.clientName.localeCompare(b.clientName, 'cs'));
  return { approaching, overdue, total: approaching.length + overdue.length };
}

function normalizePlanGoalForAi(goal, index) {
  return {
    goalId: goal.goalId || goal.id || `goal-${index + 1}`,
    goalDescription: cleanGeneratedText(goal.goalDescription || ''),
    actionSteps: cleanGeneratedText(goal.actionSteps || ''),
    deadline: goal.deadline || goal.targetDate || '',
    isCompleted: Boolean(goal.isCompleted),
    goalEvaluation: cleanGeneratedText(goal.goalEvaluation || '')
  };
}

function buildStructuredPlanForAi(record) {
  const payload = record.payload || {};
  return {
    situationDescription: cleanGeneratedText(record.situationDescription || payload.situationDescription || ''),
    goals: getPlanGoals(record).map(normalizePlanGoalForAi),
    finalEvaluation: cleanGeneratedText(record.finalEvaluation || payload.finalEvaluation || '')
  };
}

function buildStructuredPlanFallback(rawValue, sourceRecord) {
  const structured = buildStructuredPlanForAi(sourceRecord);
  return {
    ...structured,
    acceptedPlanText: cleanGeneratedText(rawValue || '') || buildPersonalDevelopmentPlanText(sourceRecord, null)
  };
}

function parseStructuredPlanAiResult(rawValue, sourceRecord) {
  const rawText = cleanGeneratedText(rawValue || '')
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('AI nevrátila strukturovaný návrh plánu ve formátu JSON.');

  let parsed;
  try {
    parsed = JSON.parse(rawText.slice(start, end + 1));
  } catch (error) {
    throw new Error('AI vrátila neplatný JSON pro individuální plán.');
  }
  const sourceGoals = getPlanGoals(sourceRecord);
  const aiGoals = Array.isArray(parsed.goals) ? parsed.goals : [];
  validatePlanOutput(
    { ...parsed, goals: aiGoals.map((goal) => ({ ...goal, deadline: goal.deadline ?? goal.targetDate ?? '' })) },
    { goals: sourceGoals.map((goal, index) => ({ goalId: String(goal.goalId || goal.id || `goal-${index + 1}`), goalDescription: goal.goalDescription || '', actionSteps: Array.isArray(goal.actionSteps) ? goal.actionSteps.join('\n') : goal.actionSteps || '', deadline: goal.deadline ?? goal.targetDate ?? '' })), finalEvaluation: sourceRecord.finalEvaluation || sourceRecord.payload?.finalEvaluation || '' }
  );
  const sourceGoalById = new Map(
    sourceGoals.map((goal, index) => [String(goal.goalId || goal.id || `goal-${index + 1}`), { goal, index }])
  );

  const goals = sourceGoals.map((sourceGoal, index) => {
    const goalId = String(sourceGoal.goalId || sourceGoal.id || `goal-${index + 1}`);
    const aiGoal = aiGoals.find((goal) => String(goal.goalId || '') === goalId) || aiGoals[index] || {};
    return {
      ...sourceGoal,
      goalId,
      goalDescription: cleanGeneratedText(aiGoal.goalDescription || sourceGoal.goalDescription || ''),
      actionSteps: cleanGeneratedText(aiGoal.actionSteps || sourceGoal.actionSteps || ''),
      targetDate: sourceGoal.targetDate || null,
      isCompleted: Boolean(sourceGoal.isCompleted),
      goalEvaluation: sourceGoal.isCompleted ? cleanGeneratedText(aiGoal.goalEvaluation || sourceGoal.goalEvaluation || '') : sourceGoal.goalEvaluation || ''
    };
  });

  return {
    situationDescription: cleanGeneratedText(parsed.situationDescription || sourceRecord.situationDescription || sourceRecord.payload?.situationDescription || ''),
    goals,
    finalEvaluation: cleanGeneratedText(sourceRecord.finalEvaluation || sourceRecord.payload?.finalEvaluation || ''),
    acceptedPlanText: cleanGeneratedText(parsed.acceptedPlanText || '')
  };
}

function buildAcceptedPlanTextFromStructuredDraft(structuredDraft) {
  const lines = ['Individuální plán rozvoje klienta.', '', 'Popis situace:', structuredDraft.situationDescription || '', '', 'Cíle a kroky:'];
  (structuredDraft.goals || []).forEach((goal, index) => {
    lines.push(`${index + 1}. Cíl: ${goal.goalDescription || ''}`);
    lines.push(`Akční kroky: ${goal.actionSteps || ''}`);
    if (goal.targetDate || goal.deadline) lines.push(`Termín: ${String(goal.targetDate || goal.deadline).slice(0, 10)}`);
  });
  if (structuredDraft.finalEvaluation) lines.push('', 'Závěrečné vyhodnocení:', structuredDraft.finalEvaluation);
  return lines.join('\n').trim();
}

function buildPlanRecordWithStructuredDraft(record, structuredDraft, client = null) {
  const payload = record.payload || {};
  const updatedRecord = {
    ...record,
    situationDescription: structuredDraft.situationDescription,
    goals: structuredDraft.goals,
    finalEvaluation: structuredDraft.finalEvaluation || '',
    acceptedPlanText: structuredDraft.acceptedPlanText || '',
    payload: {
      ...payload,
      situationDescription: structuredDraft.situationDescription,
      goals: structuredDraft.goals,
      structuredGoals: structuredDraft.goals,
      finalEvaluation: structuredDraft.finalEvaluation || '',
      acceptedPlanText: structuredDraft.acceptedPlanText || '',
      structuredPersonalDevelopmentPlan: true
    }
  };
  return {
    ...updatedRecord,
    documentText: structuredDraft.acceptedPlanText || buildPersonalDevelopmentPlanText(updatedRecord, client)
  };
}
function buildPersonalDevelopmentPlanText(planRecord, client = null) {
  if (!planRecord) return '';
  const payload = planRecord.payload || {};
  const acceptedPlanText = cleanGeneratedText(planRecord.acceptedPlanText || payload.acceptedPlanText || '');
  if (acceptedPlanText) return acceptedPlanText;
  const goals = getPlanGoals(planRecord);
  const lines = [
    'Individuální plán rozvoje',
    '',
    `Klient: ${client?.fullName || planRecord.clientName || 'Neuvedeno'}`,
    `Datum plánu: ${formatDateLabel(planRecord.activityDate)}`,
    `Pracovník: ${planRecord.worker || 'Neuvedeno'}`,
    '',
    'Popis situace',
    planRecord.situationDescription || payload.situationDescription || 'Neuvedeno',
    '',
    '',
    'Cíle a plánované kroky'
  ];

  if (goals.length) {
    goals.forEach((goal, index) => {
      const targetDate = formatCaseSummaryDate(goal.targetDate);
      lines.push(`${index + 1}. ${cleanGeneratedText(goal.goalDescription || 'Bez popisu cíle.')}`);
      if (goal.actionSteps) lines.push(`   Kroky: ${cleanGeneratedText(goal.actionSteps)}`);
      if (targetDate) lines.push(`   Termín: ${targetDate}`);
      lines.push(`   Stav: ${goal.isCompleted ? 'splněn' : 'otevřen'}`);
      if (goal.goalEvaluation) lines.push(`   Vyhodnocení: ${cleanGeneratedText(goal.goalEvaluation)}`);
    });
  } else {
    lines.push('Cíle zatím nejsou doplněné.');
  }

  const finalEvaluation = planRecord.finalEvaluation || payload.finalEvaluation || '';
  if (finalEvaluation) {
    lines.push('', 'Závěrečné vyhodnocení', cleanGeneratedText(finalEvaluation));
  }

  const documentText = cleanGeneratedText(planRecord.documentText || '');
  if (documentText && !documentText.includes('První cíl:')) {
    lines.push('', 'Text zápisu', documentText);
  }

  return lines.join('\n');
}

function buildClientIndicatorRows(timeline) {
  const records = timeline.filter((record) => !record.isSynthetic);
  const countByType = (entityType) => records.filter((record) => record.entityType === entityType).length;
  const hasAny = (entityTypes) => records.some((record) => entityTypes.includes(record.entityType));
  const supportRecords = records.filter((record) => ['consultations', 'case_management'].includes(record.entityType));

  return [
    { ka: 'KA1', label: 'Individuální plány', target: TARGETS.ka02Plans, value: countByType('plans'), note: countByType('plans') ? 'evidováno' : 'neevidováno' },
    { ka: 'KA1', label: 'Individuální podpora', target: TARGETS.ka02Consultations, value: supportRecords.length, note: supportRecords.length ? 'počet zápisů podpory' : 'bez zápisu podpory' },
    { ka: 'KA1/KA2', label: 'Klient se zaznamenanou podporou', target: TARGETS.ka02SupportedClients, value: hasAny(['plans', 'consultations', 'case_management']) ? 1 : 0, note: 'unikátní klient s plánem nebo podporou' }
  ];
}

function buildClientIndicatorTable(timeline) {
  const rows = buildClientIndicatorRows(timeline);
  return [
    '| KA | Indikátor | Cíl projektu | Hodnota za klienta | Dopad / poznámka |',
    '|---|---|---:|---:|---|',
    ...rows.map((row) => `| ${row.ka} | ${row.label} | ${row.target} | ${row.value} | ${row.note} |`)
  ].join('\n');
}

function buildClientCaseQualityWarnings(client, timeline) {
  const records = timeline.filter((record) => !record.isSynthetic);
  const entryTime = parseDateForSort(client.datumVstupu || client.datumZarazeni || '');
  const warnings = [];
  const planRecords = records.filter((record) => record.entityType === 'plans');
  const goals = planRecords.flatMap(getPlanGoals);
  const activityRecords = records.filter((record) => record.entityType !== 'plans');

  if (!planRecords.length) warnings.push('Chybí individuální plán rozvoje.');
  if (planRecords.length > 1) warnings.push(`Klient má více uložených plánů osobního rozvoje (${planRecords.length}). Ověřit, který je aktuální.`);
  if (!goals.length) warnings.push('Individuální plán rozvoje neobsahuje konkrétní cíle.');
  if (activityRecords.length && !planRecords.length) warnings.push('Existují navazující aktivity, ale chybí individuální plán rozvoje.');
  if (entryTime) {
    const beforeEntry = records.filter((record) => parseDateForSort(record.activityDate) && parseDateForSort(record.activityDate) < entryTime);
    if (beforeEntry.length) warnings.push(`Některé podpory jsou evidované před vstupem klienta do projektu (${beforeEntry.length} záznamů).`);
  }

  const unsupportedGoalLinks = activityRecords.filter((record) => !record.linkedPlanGoalId && !record.payload?.linkedPlanGoalId);
  if (unsupportedGoalLinks.length) warnings.push(`Některé navazující podpory nemají vazbu na cíl IPR (${unsupportedGoalLinks.length} záznamů).`);


  const completedGoals = goals.filter((goal) => goal.isCompleted);
  const goalsMissingEvaluation = completedGoals.filter((goal) => !String(goal.goalEvaluation || '').trim());
  if (goalsMissingEvaluation.length) warnings.push(`Některé splněné cíle nemají vyplněné hodnocení (${goalsMissingEvaluation.length}).`);
  if (goals.length && goals.every((goal) => goal.isCompleted) && !planRecords.some((record) => String(record.finalEvaluation || record.payload?.finalEvaluation || '').trim())) {
    warnings.push('Všechny cíle jsou označené jako splněné, ale chybí závěrečné vyhodnocení plánu.');
  }

  return warnings;
}

function buildClientCaseSummary(client, timeline, supportBreakdown) {
  const planRecords = timeline.filter((record) => record.entityType === 'plans');
  const planRecord =
    planRecords
      .slice()
      .reverse()
      .find((record) => getPlanGoals(record).some((goal) => String(goal.goalDescription || '').trim())) ||
    planRecords[planRecords.length - 1] ||
    null;
  const goals = getPlanGoals(planRecord);
  const activityRecords = timeline.filter((record) => !record.isSynthetic && record.entityType !== 'plans');
  const byType = activityRecords.reduce((acc, record) => {
    const meta = getClientJourneyMeta(record);
    const key = `${meta.stage} - ${meta.label}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const completedGoals = goals.filter((goal) => goal.isCompleted).length;
  const evaluatedGoals = goals.filter((goal) => goal.isCompleted && String(goal.goalEvaluation || '').trim()).length;
  const allGoalsEvaluated = goals.length > 0 && goals.every((goal) => goal.isCompleted && String(goal.goalEvaluation || '').trim());
  const finalEvaluation = String(planRecord?.finalEvaluation || planRecord?.payload?.finalEvaluation || '').trim();

  const lines = [
    `Souhrn zakázky klienta - ${client.fullName}`,
    '',
    'Základní údaje',
    `- Status: ${client.projectStatusLabel || 'neuvedeno'}`,
    `- Vstup do projektu: ${formatDateLabel(client.datumVstupu || client.datumZarazeni || '')}`,
    `- Postavení na trhu práce: ${client.postaveniNaTrhu || 'neuvedeno'}`,
    `- Vzdělání: ${client.vzdelani || 'neuvedeno'}`,
    `- Znevýhodnění / bariéry z registru: ${client.znevyhodneni || 'neuvedeno'}`,
    '',
    'Individuální plán rozvoje',
    `- Popis situace: ${planRecord?.situationDescription || planRecord?.payload?.situationDescription || 'zatím neuvedeno'}`,
    `- Cíle: ${goals.length} celkem, ${completedGoals} splněno, ${evaluatedGoals} vyhodnoceno`,
    '',
    'Cíle'
  ];

  if (goals.length) {
    goals.forEach((goal, index) => {
      const targetDate = formatCaseSummaryDate(goal.targetDate);
      lines.push(`${index + 1}. ${cleanGeneratedText(goal.goalDescription || 'Bez popisu cíle.')}`);
      lines.push(`   Stav: ${goal.isCompleted ? 'splněn' : 'otevřen'}${targetDate ? `, termín: ${targetDate}` : ''}`);
      if (goal.isCompleted && String(goal.goalEvaluation || '').trim()) {
        lines.push(`   Vyhodnocení cíle: ${cleanGeneratedText(goal.goalEvaluation)}`);
      }
    });
  } else {
    lines.push('- Plán zatím neobsahuje konkrétní cíle.');
  }

  lines.push('', 'Realizované záznamy');
  if (Object.keys(byType).length) {
    Object.entries(byType).forEach(([label, count]) => lines.push(`- ${label}: ${count}x`));
  } else {
    lines.push('- Zatím nejsou uložené navazující aktivity.');
  }
  lines.push(
    `- Celkový rozsah podpory: ${(supportBreakdown.totalHours || 0).toFixed(1)} h`,
    `- Počet dokumentů / záznamů: ${supportBreakdown.totalDocuments || activityRecords.length}`
  );

  if (activityRecords.length) {
    lines.push('', 'Stručná časová osa');
    activityRecords.slice(-12).forEach((record) => {
      const meta = getClientJourneyMeta(record);
      lines.push(`- ${formatDateLabel(record.activityDate)} - ${meta.label}: ${buildClientJourneySummary(record)}`);
    });
    if (activityRecords.length > 12) {
      lines.push(`- ... další záznamy: ${activityRecords.length - 12}`);
    }
  }

  lines.push('', 'Závěrečné vyhodnocení cílů');
  if (finalEvaluation) {
    lines.push(finalEvaluation);
  } else if (allGoalsEvaluated) {
    lines.push('Všechny cíle jsou označené jako splněné a vyhodnocené. Závěrečné slovní vyhodnocení ještě není doplněné v plánu osobního rozvoje.');
  } else {
    lines.push('Závěrečné vyhodnocení zatím není kompletní, protože nejsou splněné a vyhodnocené všechny cíle v plánu osobního rozvoje.');
  }

  return lines.join('\n');
}

function buildAiClientCaseSummaryPrompt(client, timeline, supportBreakdown) {
  const deterministicSummary = redactClientIdentifiers(buildClientCaseSummary(sanitizeAiInput(client), timeline, supportBreakdown), client);
  return buildClientCaseAiPrompt(deterministicSummary);
}

function buildClientJourneyDetail(record, client = null) {
  if (record.isLegacyReadOnly || record.sourceSystem === 'LEGACY_XLSM') {
    return buildLegacyPerformanceDetail(record);
  }

  if (record.entityType === 'project_entry') {
    return record.summary || 'Klient byl zařazen do projektu.';
  }

  if (record.entityType === 'plans') {
    return buildPersonalDevelopmentPlanText(record, client);
  }

  const documentText = cleanGeneratedText(record.documentText || '');
  if (documentText) return documentText;

  const payloadEntries = Object.entries(record.payload || {})
    .filter(([, value]) => value !== '' && value !== null && value !== undefined)
    .map(([key, value]) => `${key}: ${Array.isArray(value) ?value.join(', ') : String(value)}`);

  return payloadEntries.join('\n') || 'Zápis neobsahuje další detail.';
}

function buildPreviousRecordContext(record, index = 0) {
  if (!record) return '';
  const dateLabel = formatDateLabel(record.activityDate);
  const summary = buildClientJourneySummary(record);
  const documentPreview = truncate(cleanGeneratedText(record.documentText || ''), 650);
  return [
    `${index + 1}. ${dateLabel} | ${record.title || 'Bez názvu'}`,
    summary ?`Shrnutí: ${summary}` : '',
    documentPreview ?`Krátká ukázka textu: ${documentPreview}` : ''
  ]
    .filter(Boolean)
    .join('\n');
}

function buildPreviousRecordsContext(records = []) {
  const items = Array.isArray(records) ? records.filter(Boolean).slice(0, 3) : [];
  if (!items.length) return '';
  return [
    'KONTEXT Z PŘEDCHOZÍCH ZÁZNAMŮ – pouze pro pochopení návaznosti, nesmí být použit jako nový fakt aktuální aktivity.',
    items.map((record, index) => buildPreviousRecordContext(record, index)).join('\n\n'),
    '',
    'Pravidla pro použití kontextu: můžeš napsat obecnou návaznost typu „v návaznosti na dříve řešenou situaci“, ale nepřebírej z kontextu konkrétní úkony, instituce, výsledky, dohody, termíny ani další kroky, pokud nejsou výslovně uvedeny v aktuální aktivitě.'
  ].join('\n');
}

function isDateWithinPeriod(dateValue, period) {
  if (!period || period.value === 'all') return true;
  if (!dateValue) return false;
  const valueTime = parseDateForSort(dateValue);
  const startTime = parseDateForSort(period.start);
  const endTime = parseDateForSort(period.end);
  if (!valueTime || !startTime || !endTime) return false;
  return valueTime >= startTime && valueTime <= endTime;
}

function buildArchivedZorText() {
  return '';
}

function extractPlanSections(text) {
  const normalized = cleanGeneratedText(text || '');
  const headingMap = {
    'Identifikace klienta': 'clientIdentification',
    'Východzí situace klienta': 'currentSituation',
    'Výchozí situace klienta': 'currentSituation',
    'Silné stránky a zdroje klienta': 'strengthsResources',
    'Bariéry vstupu na trh práce': 'barriers',
    'Identifikované bariéry vstupu na trh práce': 'barriers',
    'Hlavní cíl spolupráce': 'mainGoal',
    'Dílčí cíle': 'subGoals',
    'Dílčí cíle spolupráce': 'subGoals',
    'Plánované kroky podpory': 'plannedSteps',
    'Zapojení dalších služeb nebo aktérů': 'otherServices',
    'Zapojení dalších služeb': 'otherServices',
    'Vyhodnocování a aktualizace plánu': 'evaluationUpdates'
  };

  const sections = {};
  let currentKey = '';
  normalized.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    const mappedKey = headingMap[trimmed];
    if (mappedKey) {
      currentKey = mappedKey;
      if (!sections[currentKey]) sections[currentKey] = '';
      return;
    }
    if (currentKey) {
      sections[currentKey] = sections[currentKey]
        ? `${sections[currentKey]} ${trimmed}`.trim()
        : trimmed;
    }
  });
  return sections;
}

function formatDateForDocument(value) {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('cs-CZ').format(parsed);
}

function buildPlanTemplatePayload(client, draft, generatedText) {
  const sections = extractPlanSections(generatedText);
  const clientIdentification =
    sections.clientIdentification ||
    [
      `Klient ${client.fullName}.`,
      client.postaveniNaTrhu ?`Postavení na trhu práce: ${client.postaveniNaTrhu}.` : '',
      client.vzdelani ?`Vzdělání: ${client.vzdelani}.` : '',
      client.znevyhodneni ?`Znevýhodnění: ${client.znevyhodneni}.` : ''
    ]
      .filter(Boolean)
      .join(' ');

  return {
    filename: `plan-osobniho-rozvoje-${slugify(client.fullName)}.docx`,
    clientIdentification,
    currentSituation: sections.currentSituation || draft.currentSituation || '',
    strengthsResources: sections.strengthsResources || 'Silné stránky a zdroje klienta budou dále průběžně doplňovány v rámci spolupráce.',
    barriers: sections.barriers || draft.barriers || '',
    mainGoal: sections.mainGoal || draft.goals || '',
    subGoals: sections.subGoals || draft.goals || '',
    plannedSteps: sections.plannedSteps || draft.plannedSteps || '',
    otherServices: sections.otherServices || 'Zapojení dalších služeb bude upřesňováno dle aktuálních potřeb klienta.',
    evaluationUpdates: sections.evaluationUpdates || 'Plán bude průběžně vyhodnocován a podle potřeby aktualizován.',
    planDate: formatDateForDocument(draft.date),
    workerSignature: draft.worker || ''
  };
}

const VIEW_THEMES = {
  clients: {
    page: 'bg-[radial-gradient(circle_at_top_left,#f7dfb9_0,#f3ead9_32%,#eee7d8_58%,#e8edf0_100%)]',
    header: 'border-amber-200 bg-amber-50/90',
    accent: 'bg-amber-300/25',
    label: 'text-amber-700'
  },
  ka02: {
    page: 'bg-[radial-gradient(circle_at_top_left,#d7f2df_0,#eef4dc_36%,#edf2e6_62%,#e8eef0_100%)]',
    header: 'border-emerald-200 bg-emerald-50/85',
    accent: 'bg-emerald-300/25',
    label: 'text-emerald-700'
  },
  ka2case: {
    page: 'bg-[radial-gradient(circle_at_top_left,#dbeafe_0,#eaf2f8_36%,#edf2f4_62%,#e8edf0_100%)]',
    header: 'border-blue-200 bg-blue-50/85',
    accent: 'bg-blue-300/25',
    label: 'text-blue-700'
  },
  ka01: {
    page: 'bg-[radial-gradient(circle_at_top_left,#eadff5_0,#f1ebf5_36%,#eeeaf1_62%,#e9edf0_100%)]',
    header: 'border-violet-200 bg-violet-50/85',
    accent: 'bg-violet-300/20',
    label: 'text-violet-700'
  },
  education: {
    page: 'bg-[radial-gradient(circle_at_top_left,#fef3c7_0,#f5ead2_36%,#eee8dc_62%,#e8edf0_100%)]',
    header: 'border-amber-200 bg-amber-50/85',
    accent: 'bg-amber-300/20',
    label: 'text-amber-700'
  },
  ka03: {
    page: 'bg-[radial-gradient(circle_at_top_left,#ffd7ba_0,#f7e5d2_34%,#eee4d8_62%,#e8edf1_100%)]',
    header: 'border-orange-200 bg-orange-50/85',
    accent: 'bg-orange-300/25',
    label: 'text-orange-700'
  },
  dashboard: {
    page: 'bg-[radial-gradient(circle_at_top_left,#e2e8f0_0,#edf1f4_36%,#f1eee8_66%,#ebe8e3_100%)]',
    header: 'border-slate-300 bg-slate-100/90',
    accent: 'bg-slate-400/15',
    label: 'text-slate-700'
  }
};

const NAV_THEMES = {
  clients: {
    active: 'border-amber-300 bg-amber-600 text-white shadow-sm shadow-amber-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
  },
  ka02: {
    active: 'border-emerald-300 bg-emerald-600 text-white shadow-sm shadow-emerald-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800'
  },
  ka2case: {
    active: 'border-blue-300 bg-blue-600 text-white shadow-sm shadow-blue-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-800'
  },
  ka01: {
    active: 'border-violet-300 bg-violet-600 text-white shadow-sm shadow-violet-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-800'
  },
  education: {
    active: 'border-amber-300 bg-amber-600 text-white shadow-sm shadow-amber-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-amber-300 hover:bg-amber-50 hover:text-amber-800'
  },
  dashboard: {
    active: 'border-slate-400 bg-slate-700 text-white shadow-sm shadow-slate-300/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-slate-400 hover:bg-slate-100 hover:text-slate-800'
  },
  statistics: {
    active: 'border-cyan-300 bg-cyan-700 text-white shadow-sm shadow-cyan-200/70',
    idle: 'border-stone-200 bg-white/80 text-stone-600 hover:border-cyan-300 hover:bg-cyan-50 hover:text-cyan-800'
  }
};

function asSheetText(value) {
  if (value == null) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  return String(value);
}

function asSheetWorker(value) {
  const text = asSheetText(value).trim();
  return text === 'test-user' ? '' : text;
}

function asSheetDate(value) {
  const text = asSheetText(value).trim();
  if (!text) return '';
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const czechMatch = text.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4})/);
  if (czechMatch) {
    const [, day, month, year] = czechMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function parseSheetJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeStatisticsRow(row = {}) {
  const status = asSheetText(row.status).trim().toLowerCase();
  return {
    id: asSheetText(row.statistika_id || row.id),
    sourceRecordId: asSheetText(row.zdrojovy_zaznam_id),
    clientId: asSheetText(row.client_id),
    clientName: asSheetText(row.client_name),
    date: asSheetDate(row.datum || row.created_at),
    period: asSheetText(row.obdobi),
    type: asSheetText(row.typ_statistiky),
    code: asSheetText(row.kod),
    group: asSheetText(row.skupina) || 'Ostatní',
    name: asSheetText(row.nazev) || asSheetText(row.hodnota_text) || asSheetText(row.kod),
    valueText: asSheetText(row.hodnota_text),
    status,
    createdAt: asSheetText(row.created_at),
    updatedAt: asSheetText(row.updated_at)
  };
}

function isActiveStatistic(row = {}) {
  const status = String(row.status || '').toLowerCase();
  return !status.includes('smaz') && !status.includes('neaktiv');
}

function isDateWithinRange(dateValue, dateFrom, dateTo) {
  const valueTime = parseDateForSort(dateValue);
  const fromTime = parseDateForSort(dateFrom);
  const toTime = parseDateForSort(dateTo);
  if (!valueTime || !fromTime || !toTime) return false;
  return valueTime >= fromTime && valueTime <= toTime;
}

function buildKuStatisticsOverview(statisticsRows = [], { dateFrom = '', dateTo = '' } = {}) {
  const activeRows = statisticsRows
    .map(normalizeStatisticsRow)
    .filter((row) =>
      row.type === 'FORMA_POMOCI_KU' &&
      row.code &&
      row.clientId &&
      isActiveStatistic(row) &&
      isDateWithinRange(row.date, dateFrom, dateTo)
    );

  const grouped = new Map();
  activeRows.forEach((row) => {
    const key = `${row.group}|||${row.code}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        group: row.group,
        code: row.code,
        name: row.name,
        clients: new Map(),
        records: 0
      });
    }
    const item = grouped.get(key);
    item.records += 1;
    item.clients.set(row.clientId, row.clientName || row.clientId);
  });

  const rows = Array.from(grouped.values())
    .map((item) => ({
      ...item,
      clientCount: item.clients.size,
      clientNames: Array.from(item.clients.values()).sort((a, b) => a.localeCompare(b, 'cs'))
    }))
    .sort((a, b) => a.group.localeCompare(b.group, 'cs') || a.name.localeCompare(b.name, 'cs'));

  const groups = rows.reduce((accumulator, item) => {
    if (!accumulator[item.group]) accumulator[item.group] = [];
    accumulator[item.group].push(item);
    return accumulator;
  }, {});

  const uniqueClients = new Set(activeRows.map((row) => row.clientId));
  return {
    rows,
    groups,
    totalUniqueClients: uniqueClients.size,
    totalRecords: activeRows.length,
    dateFrom,
    dateTo
  };
}

function buildKuStatisticsDocumentText(overview) {
  const lines = [
    'Přehled konkrétních forem pomoci lidem v rámci projektu',
    `Období: ${formatDateLabel(overview.dateFrom)} – ${formatDateLabel(overview.dateTo)}`,
    '',
    `Celkový počet unikátních osob: ${overview.totalUniqueClients}`,
    `Počet statistických záznamů: ${overview.totalRecords}`,
    ''
  ];

  if (!overview.rows.length) {
    lines.push('Ve zvoleném období nejsou evidovány žádné aktivní položky typu podpory dle KÚ.');
    return lines.join('\n');
  }

  Object.entries(overview.groups).forEach(([group, items]) => {
    lines.push(group);
    items.forEach((item) => {
      lines.push(`- ${item.name}: ${item.clientCount} ${item.clientCount === 1 ? 'osoba' : item.clientCount >= 2 && item.clientCount <= 4 ? 'osoby' : 'osob'}`);
    });
    const groupTotal = new Set(items.flatMap((item) => Array.from(item.clients.keys()))).size;
    lines.push(`Celkem ${group.toLowerCase()}: ${groupTotal} ${groupTotal === 1 ? 'osoba' : groupTotal >= 2 && groupTotal <= 4 ? 'osoby' : 'osob'}`);
    lines.push('');
  });

  return lines.join('\n');
}

function hoursToMinutes(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).trim();
  const timeMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const [, hours, minutes] = timeMatch;
    return Number(hours) * 60 + Number(minutes);
  }
  const number = Number(text.replace(',', '.'));
  return Number.isFinite(number) ? Math.round(number * 60) : 0;
}

function stringifyPlanGoals(goals) {
  if (!Array.isArray(goals)) return '';
  return goals
    .map((goal, index) => {
      const title = goal.goalDescription || goal.description || goal.title || goal.text || '';
      const steps = Array.isArray(goal.actionSteps) ? goal.actionSteps.join('\n') : goal.actionSteps || goal.steps || '';
      const deadline = goal.deadline || goal.targetDate || goal.term || '';
      return ['C?l ' + (index + 1) + ': ' + title, steps ? 'Ak?n? kroky: ' + steps : '', deadline ? 'Term?n: ' + deadline : ''].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n\n');
}

function mapSheetRecordsToAppRecords({ individualPlans = [], performances = [], meetings = [], networkMeetings = [], partners = [], education = [], supervision = [], paymentPlans = [] }, clientIndex = {}) {
  const clientName = (clientId) => clientIndex[clientId]?.fullName || clientId || '';
  const statusOk = (row) => !String(row.status || '').toLowerCase().includes('smaz');
  const records = [];

  individualPlans.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.plan_id);
    const clientId = asSheetText(row.klient_id);
    if (!id || !clientId) return;
    const goals = parseSheetJson(row.cile_json, []);
    const storedDurationText = asSheetText(row.pocet_minut).trim();
    const storedDurationMinutes = Number(storedDurationText.replace(',', '.'));
    records.push({
      id,
      remoteSource: 'google-sheet',
      entityType: 'plans',
      ka: 'KA1',
      title: 'Individuální plán - ' + clientName(clientId),
      activityDate: asSheetDate(row.updated_at || row.created_at),
      worker: asSheetWorker(row.pracovnik || row.updated_by || row.created_by),
      clientId,
      clientIds: [clientId],
      clientName: clientName(clientId),
      documentText: asSheetText(row.accepted_plan_text),
      goals: Array.isArray(goals) ? goals : [],
      payload: {
        currentSituation: asSheetText(row.popis_situace),
        situationDescription: asSheetText(row.popis_situace),
        goals: Array.isArray(goals) ? goals : [],
        structuredGoals: Array.isArray(goals) ? goals : [],
        plannedSteps: stringifyPlanGoals(goals),
        finalEvaluation: asSheetText(row.zaverecne_vyhodnoceni),
        acceptedPlanText: asSheetText(row.accepted_plan_text),
        durationMinutes: storedDurationText && Number.isFinite(storedDurationMinutes) && storedDurationMinutes >= 0 ? storedDurationMinutes : 60
      },
      indicatorFlags: { ka02Plans: true },
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  performances.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.vykon_id || row.performance_id);
    const clientId = asSheetText(row.klient_id || row.client_id);
    if (!id || !clientId) return;
    const specific = parseSheetJson(row.specificka_pole_json, {});
    const supportSpecific = { ...(specific.supportSpecific || {}), ...mapSheetColumnsToKA1SupportSpecific(row) };
    const activityCodes = parseSheetJson(row.activity_codes_json, []);
    const durationMinutes = Number(row.duration_minutes);
    const sourceSystem = asSheetText(row.source_system || 'NEW_APP').toUpperCase();
    records.push({
      id,
      remoteSource: 'google-sheet',
      sourceSystem,
      isLegacyReadOnly: sourceSystem === 'LEGACY_XLSM',
      entityType: 'consultations',
      ka: 'KA1',
      title: asSheetText(row.typ_podpory) ||
        (Array.isArray(activityCodes) && activityCodes.length ? activityCodes.join(', ') : 'Zápis podpory') +
        ' - ' + clientName(clientId),
      activityDate: asSheetDate(row.datum || row.date || row.created_at),
      worker: asSheetWorker(row.pracovnik || row.worker_name || row.worker_id),
      clientId,
      clientIds: [clientId],
      clientName: clientName(clientId),
      documentText: asSheetText(row.dokument_text || row.case_note),
      documentUrl: asSheetText(row.document_url),
      linkedPlanGoalId: asSheetText(row.cil_ip_id),
      linkedPlanGoalLabel: asSheetText(row.cil_ip),
      payload: {
        ...specific,
        startTime: normalizePerformanceTime(row.cas_od || row.start_time),
        endTime: normalizePerformanceTime(row.cas_do || row.end_time),
        durationMinutes: Number.isFinite(durationMinutes) && durationMinutes > 0
          ? durationMinutes
          : hoursToMinutes(row.pocet_hodin),
        consultationType: asSheetText(row.typ_podpory),
        supportArea: asSheetText(row.tema_podpory || row.phase_code),
        activityCodes,
        meetingForm: asSheetText(row.meeting_form),
        supportSpecific,
        topics: asSheetText(row.popis || row.case_note || row.tema_podpory),
        outcome: asSheetText(row.vysledek),
        nextSteps: asSheetText(row.dalsi_krok),
        place: asSheetText(row.place || row.forma_poskytovani),
        legacySource: sourceSystem === 'LEGACY_XLSM' ? {
          fileName: asSheetText(row.legacy_source_file_name),
          sheetName: asSheetText(row.legacy_source_sheet),
          anchor: asSheetText(row.legacy_source_anchor)
        } : null,
        linkedPlanGoalId: asSheetText(row.cil_ip_id),
        linkedPlanGoalLabel: asSheetText(row.cil_ip),
        caseManagementMode: false
      },
      indicatorFlags: { ka02Consultations: true },
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  meetings.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.meeting_id);
    const clientId = asSheetText(row.klient_id);
    if (!id || !clientId) return;
    const registeredPartnerNames = asSheetText(row.partneri).split(';').map((item) => item.trim()).filter(Boolean);
    const participantNames = (asSheetText(row.ucastnici) || asSheetText(row.partneri)).split(';').map((item) => item.trim()).filter(Boolean);
    const registeredNameSet = new Set(registeredPartnerNames);
    const manualPartnerNames = participantNames.filter((name) => !registeredNameSet.has(name));

    records.push({
      id,
      remoteSource: 'google-sheet',
      entityType: 'consultations',
      ka: 'KA2',
      title: asSheetText(row.typ_podpory) || 'Case management - ' + clientName(clientId),
      activityDate: asSheetDate(row.datum || row.created_at),
      worker: asSheetText(row.pracovnik),
      clientId,
      clientIds: [clientId],
      clientName: clientName(clientId),
      documentText: asSheetText(row.dokument_text),
      documentUrl: asSheetText(row.document_url),
      linkedPlanGoalId: asSheetText(row.cil_ip_id),
      linkedPlanGoalLabel: asSheetText(row.cil_ip),
      payload: {
        startTime: asSheetText(row.cas_od),
        endTime: asSheetText(row.cas_do),
        durationMinutes: hoursToMinutes(row.pocet_hodin),
        consultationType: asSheetText(row.typ_podpory),
        supportArea: asSheetText(row.tema_podpory),
        topics: asSheetText(row.popis),
        outcome: asSheetText(row.vysledek),
        nextSteps: asSheetText(row.dalsi_krok),
        place: asSheetText(row.forma_poskytovani),
        linkedPlanGoalId: asSheetText(row.cil_ip_id),
        linkedPlanGoalLabel: asSheetText(row.cil_ip),
        selectedPartnerIds: asSheetText(row.partner_ids).split(/[;,]/).map((item) => item.trim()).filter(Boolean),
        registeredPartnerNames,
        manualPartnerNames,
        partnerNames: participantNames,
        partners: participantNames.join('; '),
        participantCount: Number(asSheetText(row.pocet_akteru) || 0),
        caseManagementMode: true
      },
      indicatorFlags: { ka02Consultations: true },
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  networkMeetings.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.schuzka_site_id);
    if (!id) return;
    const hasContent = [row.typ_schuzky, row.obsah_jednani, row.vystup, row.dokument_text].some((value) => asSheetText(value).trim());
    if (!hasContent) return;
    records.push({
      id,
      remoteSource: 'google-sheet',
      entityType: 'network_activities',
      ka: 'KA2',
      title: asSheetText(row.typ_schuzky) || 'Z\u00e1znam tvorby s\u00edt\u011b',
      activityDate: asSheetDate(row.datum || row.created_at),
      worker: asSheetText(row.pracovnik),
      clientIds: [],
      documentText: asSheetText(row.dokument_text || row.vystup || row.obsah_jednani),
      payload: {
        type: asSheetText(row.typ_schuzky),
        startTime: asSheetText(row.cas_od),
        endTime: asSheetText(row.cas_do),
        place: asSheetText(row.misto),
        participants: [row.partneri, row.rt_clenove, row.dalsi_osoby].map(asSheetText).filter(Boolean).join(', '),
        notes: asSheetText(row.obsah_jednani),
        outcome: asSheetText(row.vystup),
        description: asSheetText(row.dokument_text || row.vystup),
        nextSteps: asSheetText(row.dalsi_kroky),
        partnerIds: asSheetText(row.partner_ids).split(',').map((value) => value.trim()).filter(Boolean),
        partnerNames: asSheetText(row.partneri).split(',').map((value) => value.trim()).filter(Boolean),
        rtMembers: asSheetText(row.rt_clenove).split(',').map((value) => value.trim()).filter(Boolean),
        otherPeople: asSheetText(row.dalsi_osoby).split(',').map((value) => value.trim()).filter(Boolean)
      },
      indicatorFlags: { ka01NetworkActivity: true },
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  partners.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.partner_id);
    const name = asSheetText(row.nazev_subjektu || row.subjekt || row.name);
    if (!id && !name) return;
    records.push({
      id: id || 'partner-' + name,
      remoteSource: 'google-sheet',
      entityType: 'actor_registry',
      ka: 'KA2',
      title: 'Registr akt?ra - ' + (name || id),
      activityDate: asSheetDate(row.datum_zapojeni || row.updated_at || row.created_at),
      worker: asSheetText(row.pracovnik || row.updated_by),
      clientIds: [],
      payload: {
        name,
        actorType: asSheetText(row.typ_aktera),
        networkOrigin: asSheetText(row.puvod_site),
        joinedNetworkDate: asSheetDate(row.datum_zapojeni),
        contactName: asSheetText(row.kontaktni_osoba),
        contactRole: asSheetText(row.funkce),
        phone: asSheetText(row.telefon),
        email: asSheetText(row.email),
        cooperationStatus: asSheetText(row.status) || 'zapojen? akt?r'
      },
      indicatorFlags: { ka01ActorRegistry: true },
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  education.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.vzdelavani_id);
    const title = asSheetText(row.nazev_vzdelavani);
    if (!id && !title) return;
    const workers = [
      row.jmeno_pracovnika1 || row.jmeno_pracovnika,
      row.jmeno_pracovnika2,
      row.jmeno_pracovnika3
    ].map(asSheetWorker).filter(Boolean);
    records.push({
      id: id || 'vzdelavani-' + title,
      remoteSource: 'google-sheet',
      entityType: 'education_records',
      ka: 'VZDELAVANI',
      title: title || 'Vzdělávání',
      activityDate: asSheetDate(row.datum || row.created_at),
      worker: workers[0] || '',
      clientIds: [],
      documentText: title || '',
      payload: {
        date: asSheetDate(row.datum || row.created_at),
        hours: asSheetText(row.pocet_hodin),
        title,
        accreditationNumber: asSheetText(row.cislo_akreditace),
        worker: workers[0] || '',
        workers
      },
      indicatorFlags: {},
      createdAt: Date.parse(asSheetText(row.created_at)) || 0,
      updatedAt: Date.parse(asSheetText(row.updated_at)) || 0
    });
  });

  supervision.filter(statusOk).forEach((row) => {
    const id = asSheetText(row.sepervize_id);
    const type = asSheetText(row.typ_supervize);
    if (!id && !type) return;
    const workers = [row.jmeno_pracovnika1, row.jmeno_pracovnika2, row.jmeno_pracovnika3]
      .map(asSheetWorker)
      .filter(Boolean);
    records.push({
      id: id || 'supervize-' + type + '-' + asSheetDate(row.datum),
      remoteSource: 'google-sheet',
      entityType: 'supervision_records',
      ka: 'SUPERVIZE',
      title: type ? 'Supervize - ' + type : 'Supervize',
      activityDate: asSheetDate(row.datum),
      worker: workers[0] || '',
      clientIds: [],
      documentText: type || '',
      payload: {
        date: asSheetDate(row.datum),
        hours: asSheetText(row.pocet_hodin),
        type,
        workers
      },
      indicatorFlags: {},
      createdAt: Date.parse(asSheetText(row.datum)) || 0,
      updatedAt: Date.parse(asSheetText(row.datum)) || 0
    });
  });

  paymentPlans.filter(statusOk).forEach((row) => {
    const record = mapPaymentPlanRowToRecord(row, clientIndex);
    if (record) records.push(record);
  });

  return records.sort(compareTimelineRecordsDesc);
}

function normalizeClientDateForSheet(value) {
  if (!value) return '';
  const text = String(value).trim();
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const [, year, month, day] = isoMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const czechMatch = text.match(/^(\d{1,2})[.\/]\s*(\d{1,2})[.\/]\s*(\d{4})$/);
  if (czechMatch) {
    const [, day, month, year] = czechMatch;
    return `${year}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }
  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return '';
}

function mapClientDraftToSheetClient(draft, klientId = '', fallbackProjectId = '') {
  const caseManagementPotreba = draft.caseManagementPotreba || 'Ne';
  return {
    klient_id: klientId,
    project_id: draft.projectId || fallbackProjectId,
    source_system: draft.sourceSystem || 'NEW_APP',
    jmeno: String(draft.jmeno || '').trim(),
    prijmeni: String(draft.prijmeni || '').trim(),
    datum_narozeni: normalizeClientDateForSheet(draft.datumNarozeni),
    ulice: String(draft.ulice || '').trim(),
    cislo_popisne: String(draft.cisloPopisne || '').trim(),
    mesto: String(draft.mesto || '').trim(),
    psc: String(draft.psc || '').trim(),
    email: String(draft.email || '').trim(),
    datova_schranka: String(draft.datovaSchranka || '').trim(),
    telefon: String(draft.telefon || '').trim(),
    pohlavi: draft.pohlavi || '',
    postaveni_na_trhu_prace: draft.postaveniNaTrhu || '',
    dosazene_vzdelani: draft.vzdelani || '',
    znevyhodneni: draft.znevyhodneni || '',
    datum_vstupu_do_projektu: normalizeClientDateForSheet(draft.datumVstupu),
    datum_vystupu_z_projektu: normalizeClientDateForSheet(draft.datumVystupu),
    stav_klienta: draft.stavKlienta || 'Aktivn\u00ed',
    klicovy_pracovnik: draft.keyWorker || '',
    case_management_potreba: caseManagementPotreba,
    case_management_duvod: caseManagementPotreba === 'Ano' ? String(draft.caseManagementDuvod || '').trim() : '',
    case_management_od: caseManagementPotreba === 'Ano' ? normalizeClientDateForSheet(draft.caseManagementOd) : '',
    poznamka: String(draft.poznamka || '').trim(),
    rodina: draft.rodina ? 'Ano' : 'Ne',
    drive_folder_url: draft.driveFolderUrl || '',
    monitoring_list_url: draft.monitoringListUrl || ''
  };
}

const optionItems = (values, placeholder) => [
  { value: '', label: placeholder },
  ...values.map((value) => ({ value, label: value }))
];

const isGarantWorker = (value) =>
  String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().includes('garant');

const formatClientShortId = (client) => {
  const clientNumber = String(client?.clientNumber || '').trim();
  if (clientNumber) return clientNumber;
  const technicalId = String(client?.id || '').replace(/^client-/i, '').trim();
  const numericPart = technicalId.match(/\d+/g)?.at(-1) || '';
  if (numericPart) return numericPart.slice(-6);
  return technicalId.length > 6 ? technicalId.slice(-6).toUpperCase() : technicalId || '—';
};

function ClientRegistrationFields({ draft, setDraft, compact = false }) {
  const update = (key, value) => setDraft((previous) => ({ ...previous, [key]: value }));

  if (compact) {
    const sectionTitle = 'text-[10px] font-extrabold uppercase tracking-[0.18em] text-slate-500';
    const sectionBox = 'space-y-2 rounded-xl border border-indigo-100 bg-white/70 p-3';

    return (
      <div className="space-y-3">
        <div className={sectionBox}>
          <div className={sectionTitle}>Základní údaje</div>
          <InputField label="Jméno" value={draft.jmeno} onChange={(value) => update('jmeno', value)} required />
          <InputField label="Příjmení" value={draft.prijmeni} onChange={(value) => update('prijmeni', value)} required />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <InputField label="Datum narození" type="date" value={draft.datumNarozeni} onChange={(value) => update('datumNarozeni', value)} />
            <SelectField label="Pohlaví" value={draft.pohlavi} onChange={(value) => update('pohlavi', value)} options={optionItems(CLIENT_GENDER_OPTIONS, 'Vyberte pohlaví')} />
          </div>
        </div>

        <div className={sectionBox}>
          <div className={sectionTitle}>Adresa a kontakt</div>
          <InputField label="Ulice" value={draft.ulice} onChange={(value) => update('ulice', value)} />
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            <InputField label="Číslo popisné" value={draft.cisloPopisne} onChange={(value) => update('cisloPopisne', value)} />
            <InputField label="PSČ" value={draft.psc} onChange={(value) => update('psc', value)} />
          </div>
          <InputField label="Město / obec" value={draft.mesto} onChange={(value) => update('mesto', value)} />
          <InputField label="Telefon" type="tel" value={draft.telefon} onChange={(value) => update('telefon', value)} />
          <InputField label="E-mail" type="email" value={draft.email} onChange={(value) => update('email', value)} />
          <InputField label="Datová schránka" value={draft.datovaSchranka} onChange={(value) => update('datovaSchranka', value)} />
        </div>

        <div className={sectionBox}>
          <div className={sectionTitle}>Monitorovací údaje</div>
          <SelectField label="Postavení na trhu práce" help={HELP.clientsEmployment} value={draft.postaveniNaTrhu} onChange={(value) => update('postaveniNaTrhu', value)} options={optionItems(CLIENT_EMPLOYMENT_OPTIONS, 'Vyberte postavení')} />
          <SelectField label="Dosažené vzdělání" help={HELP.clientsEducation} value={draft.vzdelani} onChange={(value) => update('vzdelani', value)} options={optionItems(CLIENT_EDUCATION_OPTIONS, 'Vyberte vzdělání')} />
          <SelectField label="Typ znevýhodnění" help={HELP.clientsDisadvantage} value={draft.znevyhodneni} onChange={(value) => update('znevyhodneni', value)} options={optionItems(CLIENT_DISADVANTAGE_OPTIONS, 'Vyberte znevýhodnění')} />
        </div>

        <div className={sectionBox}>
          <div className={sectionTitle}>Zařazení v projektu</div>
          <SelectField label="Stav klienta" help={HELP.clientsStatus} value={draft.stavKlienta} onChange={(value) => update('stavKlienta', value)} options={optionItems(CLIENT_STATUS_OPTIONS, 'Vyberte stav')} />
          <InputField label="Datum vstupu do projektu" help={HELP.clientsEntryDate} type="date" value={draft.datumVstupu} onChange={(value) => update('datumVstupu', value)} />
          <InputField label="Datum výstupu z projektu" help={HELP.clientsExitDate} type="date" value={draft.datumVystupu} onChange={(value) => update('datumVystupu', value)} />
          <TextAreaField label="Poznámka" help={HELP.clientsNote} value={draft.poznamka} onChange={(value) => update('poznamka', value)} rows={2} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InputField label="Jméno" value={draft.jmeno} onChange={(value) => update('jmeno', value)} required />
        <InputField label="Příjmení" value={draft.prijmeni} onChange={(value) => update('prijmeni', value)} required />
        <InputField label="Datum narození" type="date" value={draft.datumNarozeni} onChange={(value) => update('datumNarozeni', value)} />
        <SelectField label="Pohlaví" value={draft.pohlavi} onChange={(value) => update('pohlavi', value)} options={optionItems(CLIENT_GENDER_OPTIONS, 'Vyberte pohlaví')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InputField label="Ulice" value={draft.ulice} onChange={(value) => update('ulice', value)} />
        <InputField label="Číslo popisné" value={draft.cisloPopisne} onChange={(value) => update('cisloPopisne', value)} />
        <InputField label="Město / obec" value={draft.mesto} onChange={(value) => update('mesto', value)} />
        <InputField label="PSČ" value={draft.psc} onChange={(value) => update('psc', value)} />
        <InputField label="Telefon" type="tel" value={draft.telefon} onChange={(value) => update('telefon', value)} />
        <InputField label="E-mail" type="email" value={draft.email} onChange={(value) => update('email', value)} />
        <InputField label="Datová schránka" value={draft.datovaSchranka} onChange={(value) => update('datovaSchranka', value)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Postavení na trhu práce" help={HELP.clientsEmployment} value={draft.postaveniNaTrhu} onChange={(value) => update('postaveniNaTrhu', value)} options={optionItems(CLIENT_EMPLOYMENT_OPTIONS, 'Vyberte postavení')} />
        <SelectField label="Dosažené vzdělání" help={HELP.clientsEducation} value={draft.vzdelani} onChange={(value) => update('vzdelani', value)} options={optionItems(CLIENT_EDUCATION_OPTIONS, 'Vyberte vzdělání')} />
        <SelectField label="Typ znevýhodnění" help={HELP.clientsDisadvantage} value={draft.znevyhodneni} onChange={(value) => update('znevyhodneni', value)} options={optionItems(CLIENT_DISADVANTAGE_OPTIONS, 'Vyberte znevýhodnění')} />
        <SelectField label="Stav klienta" help={HELP.clientsStatus} value={draft.stavKlienta} onChange={(value) => update('stavKlienta', value)} options={optionItems(CLIENT_STATUS_OPTIONS, 'Vyberte stav')} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <InputField label="Datum vstupu do projektu" help={HELP.clientsEntryDate} type="date" value={draft.datumVstupu} onChange={(value) => update('datumVstupu', value)} />
        <InputField label="Datum výstupu z projektu" help={HELP.clientsExitDate} type="date" value={draft.datumVystupu} onChange={(value) => update('datumVystupu', value)} />
      </div>

      <TextAreaField label="Poznámka" help={HELP.clientsNote} value={draft.poznamka} onChange={(value) => update('poznamka', value)} rows={2} />
    </div>
  );
}

const createKa01Draft = () => ({
  date: todayIso(),
  tpmDate: todayIso(),
  employmentDate: todayIso(),
  worker: '',
  assessmentClientId: '',
  formalCriteriaMet: true,
  contentCriteriaCount: '1',
  motivationLevel: 'střední',
  decision: 'accepted',
  waitingList: false,
  rationale: '',
  networkType: 'koordinační setkání',
  networkParticipants: '',
  networkActorEntries: [buildEmptyKa01ActorEntry()],
  networkPlaceType: '',
  networkPlaceCustom: '',
  networkPlace: '',
  networkCount: '0',
  networkStartTime: '',
  networkEndTime: '',
  networkNotes: '',
  networkOutcome: '',
  networkNextSteps: '',
  networkDescription: ''
});

const createKa01ActorDraft = () => ({
  id: '',
  name: '',
  networkOrigin: '',
  actorType: 'obec / město',
  ico: '',
  municipality: '',
  web: '',
  contactTitle: '',
  contactFirstName: '',
  contactLastName: '',
  contactName: '',
  contactRole: '',
  phone: '',
  email: '',
  communicationNote: '',
  cooperationStatus: 'potenciální aktér',
  joinedNetworkDate: '',
  lastContactDate: '',
  inactivityReason: '',
  ownerWorker: 'Garant projektu',
  roleRecruitment: false,
  roleClientReferral: false,
  roleMaterialDistribution: false,
  roleInfoSharingWithConsent: false,
  roleCoordinationMeetings: false,
  roleJobOpportunities: false,
  roleTpm: false,
  roleHpp: false,
  roleWorkplaceAdaptation: false,
  roleFollowupService: false,
  roleDebtSocialSupport: false,
  roleOther: false,
  roleOtherText: '',
  plannedActor: false,
  priority: 'střední',
  plannedOutreachMonth: '',
  outreachDate: '',
  outreachResult: '',
  formalJoinDate: '',
  cooperationBarrierNote: ''
});

const createKa02Draft = () => ({
  date: todayIso(),
  worker: 'Sociální pracovník',
  selectedClientId: '',
  phaseCode: 'A',
  activityCodes: [],
  meetingForm: 'Osobně',
  place: '',
  startTime: '',
  endTime: '',
  caseNote: '',
  planVersion: '1',
  currentSituation: '',
  goals: '',
  barriers: '',
  plannedSteps: '',
  planDurationMinutes: '60',
  consultationType: 'Základní sociální poradenství',
  durationMinutes: '',
  topics: '',
  outcome: '',
  nextSteps: '',
  debtSummary: '',
  debtCauses: '',
  debtStage: 'Mapování',
  solutionPlan: '',
  hasRepaymentArrangement: false,
  educationTopic: '',
  therapyOrder: '1',
  therapyThemes: '',
  therapyMentalState: '',
  therapyRecommendations: '',
  targetJob: '',
  cvDurationMinutes: '',
  experience: '',
  skills: '',
  simulatorLabel: '',
  simulatorPosition: '',
  simulatorParticipants: '',
  simulatorCommittee: '',
  simulatorFeedback: ''
});

const createKa03Draft = () => ({
  date: todayIso(),
  worker: 'Mentor/Kouč',
  selectedClientId: '',
  tpmClientId: '',
  employmentClientId: '',
  tpmLinkedPlanGoalId: '',
  tpmLinkedPlanGoalLabel: '',
  employmentLinkedPlanGoalId: '',
  employmentLinkedPlanGoalLabel: '',
  employer: '',
  workplace: '',
  startDate: todayIso(),
  endDate: '',
  plannedMonths: '4',
  actualMonths: '0',
  mentoringFrequency: '1x za 14 dní',
  progressSummary: '',
  barriers: '',
  nextSupportSteps: '',
  employmentType: '',
  employmentStartDate: todayIso(),
  employmentEndDate: '',
  employmentPlannedMonths: '12',
  employmentActualMonths: '0',
  employmentStatus: 'active',
  sustainabilitySupport: '',
  mentorReportTitle: '',
  mentorReportText: ''
});

const hasContentValue = (value) => {
  if (value == null || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (typeof value === 'number') return Number.isFinite(value) && value !== 0;
  if (Array.isArray(value)) return value.some(hasContentValue);
  if (typeof value === 'object') return Object.values(value).some(hasContentValue);
  return Boolean(value);
};

const hasContentInFields = (draft, fields) => fields.some((field) => hasContentValue(draft?.[field]));

const CLIENT_DRAFT_CONTENT_FIELDS = [
  'jmeno', 'prijmeni', 'datumNarozeni', 'ulice', 'cisloPopisne', 'mesto', 'psc', 'spadoveMesto',
  'email', 'datovaSchranka', 'telefon', 'pohlavi', 'postaveniNaTrhu', 'vzdelani', 'znevyhodneni',
  'datumVystupu', 'caseManagementDuvod', 'caseManagementOd', 'poznamka', 'situacePoUkonceni'
];

const GENERATOR_DRAFT_CONTENT_FIELDS = [
  'bulletNotes', 'currentSituation', 'goals', 'barriers', 'plannedSteps', 'supportArea',
  'ka02StartTime', 'ka02EndTime', 'durationMinutes', 'topics', 'outcome', 'nextSteps',
  'debtSummary', 'debtCauses', 'solutionPlan', 'educationTopic', 'themes', 'mentalState',
  'recommendations', 'targetJob', 'cvDurationMinutes', 'experience', 'skills', 'position',
  'feedback', 'strengths', 'developmentAreas', 'workplace', 'progressSummary', 'aiStyleFeedback',
  'generatedText', 'selectedPartnerIds', 'registeredPartnerNames', 'manualPartnerNames', 'partnerNames',
  'supportSpecific'
];

const KA01_DRAFT_CONTENT_FIELDS = [
  'rationale', 'networkParticipants', 'networkActorEntries', 'networkPlaceType', 'networkPlaceCustom',
  'networkPlace', 'networkStartTime', 'networkEndTime', 'networkNotes', 'networkOutcome',
  'networkNextSteps', 'networkDescription'
];

const KA01_ACTOR_DRAFT_CONTENT_FIELDS = [
  'id', 'name', 'networkOrigin', 'ico', 'municipality', 'web', 'contactTitle', 'contactFirstName',
  'contactLastName', 'contactName', 'contactRole', 'phone', 'email', 'communicationNote',
  'joinedNetworkDate', 'lastContactDate', 'inactivityReason', 'roleOtherText', 'plannedOutreachMonth',
  'outreachDate', 'outreachResult', 'formalJoinDate', 'cooperationBarrierNote'
];

const KA02_DRAFT_CONTENT_FIELDS = [
  'activityCodes', 'place', 'startTime', 'endTime', 'caseNote',
  'currentSituation', 'goals', 'barriers', 'plannedSteps', 'durationMinutes', 'topics', 'outcome',
  'nextSteps', 'debtSummary', 'debtCauses', 'solutionPlan', 'educationTopic', 'therapyThemes',
  'therapyMentalState', 'therapyRecommendations', 'targetJob', 'cvDurationMinutes', 'experience',
  'skills', 'simulatorLabel', 'simulatorPosition', 'simulatorParticipants', 'simulatorCommittee',
  'simulatorFeedback'
];

const KA03_DRAFT_CONTENT_FIELDS = [
  'employer', 'workplace', 'endDate', 'progressSummary', 'barriers', 'nextSupportSteps',
  'employmentEndDate', 'sustainabilitySupport', 'mentorReportText'
];

const hasUnsavedGeneratorDraftContent = (draft) =>
  hasContentInFields(draft, GENERATOR_DRAFT_CONTENT_FIELDS) ||
  (hasContentValue(draft?.ka02Place) && !(draft?.caseManagementMode && draft.ka02Place === 'ambulantní'));

const GLOBAL_WORKER_STORAGE_KEY = 'cechMasReporting.globalWorker';

function readStoredGlobalWorker() {
  if (typeof window === 'undefined') return WORKERS[0];
  try {
    const storedWorker = window.localStorage.getItem(GLOBAL_WORKER_STORAGE_KEY);
    return WORKERS.includes(storedWorker) ? storedWorker : WORKERS[0];
  } catch {
    return WORKERS[0];
  }
}

function storeGlobalWorker(worker) {
  if (typeof window === 'undefined' || !WORKERS.includes(worker)) return;
  try {
    window.localStorage.setItem(GLOBAL_WORKER_STORAGE_KEY, worker);
  } catch {
    // Ukládání do localStorage může být v některých režimech prohlížeče blokované.
  }
}

function App() {
  const { activeProjectId, activeProject, setActiveProjectId } = useProject();
  const [mainView, setMainView] = useState('clients');
  const [searchQuery, setSearchQuery] = useState('');
  const [user, setUser] = useState(null);
  const [records, setRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [isClientRegistryAvailable, setIsClientRegistryAvailable] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [firebaseAuthError, setFirebaseAuthError] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientDraft, setClientDraft] = useState(emptyClientDraft);
  const [showClientEditForm, setShowClientEditForm] = useState(false);
  const [clientEditDraft, setClientEditDraft] = useState(emptyClientDraft);
  const [globalWorker, setGlobalWorker] = useState(readStoredGlobalWorker);
  const [generatorDraft, setGeneratorDraft] = useState(() => ({ ...emptyGeneratorDraft, worker: readStoredGlobalWorker() }));
  const [selectedAiModel, setSelectedAiModel] = useState(DEFAULT_AI_MODEL);
  const [generatedText, setGeneratedText] = useState('');
  const [lastGeneratedText, setLastGeneratedText] = useState('');
  const [generationNotice, setGenerationNotice] = useState('');
  const [aiGenerationStatus, setAiGenerationStatus] = useState('idle');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [backupStatus, setBackupStatus] = useState({ state: 'idle', message: 'Záloha zatím nebyla vytvořena.' });
  const [isBackupActionRunning, setIsBackupActionRunning] = useState(false);
  const [saveNotice, setSaveNotice] = useState(null);
  const [saveButtonNotices, setSaveButtonNotices] = useState({});
  const pendingRecordSaveSignaturesRef = useRef(new Set());
  const pendingClientSaveSignaturesRef = useRef(new Set());
  const generatedOutputSaveLockRef = useRef(false);
  const [isProvisioningClientFolder, setIsProvisioningClientFolder] = useState(false);
  const [isSummarizingCase, setIsSummarizingCase] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [clientCaseSummary, setClientCaseSummary] = useState('');
  const [goalAlertsExpanded, setGoalAlertsExpanded] = useState(false);
  const [dashboardFilters, setDashboardFilters] = useState({ period: 'all', ka: 'all', worker: 'all' });
  const [statisticsRows, setStatisticsRows] = useState([]);
  const [statisticsFilters, setStatisticsFilters] = useState({ dateFrom: '', dateTo: '' });
  const [isExportingKuStatistics, setIsExportingKuStatistics] = useState(false);
  const [zorTexts, setZorTexts] = useState(null);
  const [isGeneratingZor, setIsGeneratingZor] = useState(false);
  const [expandedJourneyRecordIds, setExpandedJourneyRecordIds] = useState([]);
  const [selectedJourneyPrintIds, setSelectedJourneyPrintIds] = useState([]);
  const [journeyPlanDrafts, setJourneyPlanDrafts] = useState({});
  const [journeyPlanStructuredDrafts, setJourneyPlanStructuredDrafts] = useState({});
  const [generatingJourneyPlanId, setGeneratingJourneyPlanId] = useState('');
  const [editingKa01NetworkRecordId, setEditingKa01NetworkRecordId] = useState('');
  const [editingGeneratedRecordId, setEditingGeneratedRecordId] = useState('');
  const [editingKa03RecordId, setEditingKa03RecordId] = useState('');
  const [expandedKa01NetworkRecordIds, setExpandedKa01NetworkRecordIds] = useState([]);
  const [ka01NetworkTimeError, setKa01NetworkTimeError] = useState('');
  const [ka01AttendanceSelection, setKa01AttendanceSelection] = useState({});
  const ka01NetworkSaveLockRef = useRef(false);
  const ka01NetworkPendingIdRef = useRef('');

  useEffect(() => {
    storeGlobalWorker(globalWorker || WORKERS[0]);
  }, [globalWorker]);

  useEffect(() => {
    const nextWorker = globalWorker || WORKERS[0];
    setGeneratorDraft((prev) => (prev.worker === nextWorker ? prev : { ...prev, worker: nextWorker }));
    setKa01Draft((prev) => (prev.worker === nextWorker ? prev : { ...prev, worker: nextWorker }));
    setKa02Draft((prev) => (prev.worker === nextWorker ? prev : { ...prev, worker: nextWorker }));
  }, [globalWorker]);

  const [ka01Draft, setKa01Draft] = useState({
    date: todayIso(),
    tpmDate: todayIso(),
    employmentDate: todayIso(),
    worker: '',
    assessmentClientId: '',
    formalCriteriaMet: true,
    contentCriteriaCount: '1',
    motivationLevel: 'střední',
    decision: 'accepted',
    waitingList: false,
    rationale: '',
    networkType: 'koordina\u010dn\u00ed setk\u00e1n\u00ed',
    networkParticipants: '',
    networkActorEntries: [buildEmptyKa01ActorEntry()],
    networkPlaceType: '',
    networkPlaceCustom: '',
    networkPlace: '',
    networkCount: '0',
    networkStartTime: '',
    networkEndTime: '',
    networkNotes: '',
    networkOutcome: '',
    networkNextSteps: '',
    networkDescription: ''
  });
  const [ka01ActorDraft, setKa01ActorDraft] = useState({
    id: '',
    name: '',
    networkOrigin: '',
    actorType: 'obec / m\u011bsto',
    ico: '',
    municipality: '',
    web: '',
    contactTitle: '',
    contactFirstName: '',
    contactLastName: '',
    contactName: '',
    contactRole: '',
    phone: '',
    email: '',
    communicationNote: '',
    cooperationStatus: 'potenciální aktér',
    joinedNetworkDate: '',
    lastContactDate: '',
    inactivityReason: '',
    ownerWorker: 'Garant projektu',
    roleRecruitment: false,
    roleClientReferral: false,
    roleMaterialDistribution: false,
    roleInfoSharingWithConsent: false,
    roleCoordinationMeetings: false,
    roleJobOpportunities: false,
    roleTpm: false,
    roleHpp: false,
    roleWorkplaceAdaptation: false,
    roleFollowupService: false,
    roleDebtSocialSupport: false,
    roleOther: false,
    roleOtherText: '',
    plannedActor: false,
    priority: 'střední',
    plannedOutreachMonth: '',
    outreachDate: '',
    outreachResult: '',
    formalJoinDate: '',
    cooperationBarrierNote: ''
  });

  const [ka02Draft, setKa02Draft] = useState({
    date: todayIso(),
    worker: 'Sociální pracovník',
    selectedClientId: '',
    phaseCode: 'A',
    activityCodes: [],
    meetingForm: 'Osobně',
    place: '',
    startTime: '',
    endTime: '',
    caseNote: '',
    planVersion: '1',
    currentSituation: '',
    goals: '',
    barriers: '',
    plannedSteps: '',
    planDurationMinutes: '60',
    consultationType: 'Z\u00e1kladn\u00ed soci\u00e1ln\u00ed poradenstv\u00ed',
    durationMinutes: '',
    topics: '',
    outcome: '',
    nextSteps: '',
    debtSummary: '',
    debtCauses: '',
    debtStage: 'Mapování',
    solutionPlan: '',
    hasRepaymentArrangement: false,
    educationTopic: '',
    therapyOrder: '1',
    therapyThemes: '',
    therapyMentalState: '',
    therapyRecommendations: '',
    targetJob: '',
    cvDurationMinutes: '',
    experience: '',
    skills: '',
    simulatorLabel: '',
    simulatorPosition: '',
    simulatorParticipants: '',
    simulatorCommittee: '',
    simulatorFeedback: ''
  });

  const [ka03Draft, setKa03Draft] = useState({
    date: todayIso(),
    worker: 'Mentor/Kouč',
    selectedClientId: '',
    tpmClientId: '',
    employmentClientId: '',
    tpmLinkedPlanGoalId: '',
    tpmLinkedPlanGoalLabel: '',
    employmentLinkedPlanGoalId: '',
    employmentLinkedPlanGoalLabel: '',
    employer: '',
    workplace: '',
    startDate: todayIso(),
    endDate: '',
    plannedMonths: '4',
    actualMonths: '0',
    mentoringFrequency: '1x za 14 dní',
    progressSummary: '',
    barriers: '',
    nextSupportSteps: '',
    employmentType: '',
    employmentStartDate: todayIso(),
    employmentEndDate: '',
    employmentPlannedMonths: '12',
    employmentActualMonths: '0',
    employmentStatus: 'active',
    sustainabilitySupport: '',
    mentorReportTitle: '',
    mentorReportText: ''
  });
  const [educationDraft, setEducationDraft] = useState({
    date: todayIso(),
    hours: '',
    title: '',
    accreditationNumber: '',
    worker1: readStoredGlobalWorker(),
    worker2: '',
    worker3: ''
  });
  const [supervisionDraft, setSupervisionDraft] = useState({
    date: todayIso(),
    hours: '',
    type: 'individuální',
    worker1: readStoredGlobalWorker(),
    worker2: '',
    worker3: ''
  });
  const isIndividualSupervision = supervisionDraft.type === 'individuální';

  useEffect(() => {
    if (!hasFirebaseConfig || !auth) {
      setUser({ uid: 'local-user' });
      return undefined;
    }

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
        setFirebaseAuthError('');
      } catch (error) {
        console.error('Auth error:', error);
        setFirebaseAuthError('Firebase Authentication není připravené. Ve Firebase zapni Authentication > Sign-in method > Anonymous.');
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return undefined;
    if (!hasFirebaseConfig || !db) {
      setRecords(loadLocalRecords());
      return undefined;
    }

    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'projectRecords');
    const unsubscribe = onSnapshot(
      recordsRef,
      (snapshot) => {
        const loaded = snapshot.docs.map((docSnapshot) => ({
          id: docSnapshot.id,
          ...docSnapshot.data()
        }));
        loaded.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        setRecords(loaded);
      },
      (error) => {
        console.error('Firestore snapshot error:', error);
      }
    );

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    const fetchClients = async () => {
      setIsLoadingClients(true);
      setSheetError('');
      try {
        const clientsUrl = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
        clientsUrl.searchParams.set('action', 'listClients');
        clientsUrl.searchParams.set('project_id', activeProjectId);
        clientsUrl.searchParams.set('actor_id', globalWorker || WORKERS[0]);
        const response = await fetch(clientsUrl.toString());
        if (!response.ok) {
          throw new Error('Nepodařilo se načíst klientský registr.');
        }

        const json = await response.json();
        if (json?.ok === false) throw new Error(json.error || 'Nepodařilo se načíst klientský registr.');
        let rows = [];
        if (Array.isArray(json)) rows = json;
        else if (json && Array.isArray(json.clients)) rows = json.clients;
        else if (json && Array.isArray(json.data)) rows = json.data;
        else if (json && Array.isArray(json.items)) rows = json.items;

        const parsed = rows
          .map((row, index) => mapSheetRowToClient(row, index))
          .filter((client) => client?.projectId === activeProjectId);

        if (parsed.length > 0) {
          setIsClientRegistryAvailable(true);
          setClients(parsed);
          setSelectedClientId(parsed[0].id);
          setGeneratorDraft((prev) => ({ ...prev, clientId: parsed[0].id }));
          setKa01Draft((prev) => ({ ...prev, assessmentClientId: parsed[0].id }));
          setKa02Draft((prev) => ({ ...prev, selectedClientId: parsed[0].id }));
          setKa03Draft((prev) => ({
            ...prev,
            selectedClientId: parsed[0].id,
            tpmClientId: parsed[0].id,
            employmentClientId: parsed[0].id,
            tpmDate: prev.tpmDate || todayIso(),
            employmentDate: prev.employmentDate || todayIso()
          }));
        } else {
          setIsClientRegistryAvailable(true);
          setClients([]);
          setSelectedClientId('');
        }
      } catch (error) {
        console.error('Google Sheets load error:', error);
        setIsClientRegistryAvailable(false);
        setClients([]);
        setSelectedClientId('');
        setGeneratorDraft((prev) => ({ ...prev, clientId: '' }));
        setKa01Draft((prev) => ({ ...prev, assessmentClientId: '' }));
        setKa02Draft((prev) => ({ ...prev, selectedClientId: '' }));
        setKa03Draft((prev) => ({
          ...prev,
          selectedClientId: '',
          tpmClientId: '',
          employmentClientId: '',
          tpmDate: prev.tpmDate || todayIso(),
          employmentDate: prev.employmentDate || todayIso()
        }));
        setSheetError('Načtení klientského registru selhalo. Ukládání klientských dat je zablokováno, aby nevznikly chybně přiřazené záznamy.');
      } finally {
        setIsLoadingClients(false);
      }
    };

    fetchClients();
  }, [activeProjectId, globalWorker]);

  const projectClients = useMemo(
    () => clients.filter((client) => client.projectId === activeProjectId),
    [clients, activeProjectId]
  );

  const clientIndex = useMemo(() => {
    const map = {};
    projectClients.forEach((client) => {
      map[client.id] = client;
    });
    return map;
  }, [projectClients]);


  useEffect(() => {
    if (!GOOGLE_SHEET_MACRO_URL || clients.length === 0) return undefined;
    let cancelled = false;

    const fetchAction = async (action) => {
      const url = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
      url.searchParams.set('action', action);
      url.searchParams.set('project_id', activeProjectId);
      url.searchParams.set('actor_id', globalWorker || WORKERS[0]);
      const response = await fetch(url.toString());
      if (!response.ok) throw new Error('Google Sheet akce ' + action + ' selhala.');
      const json = await response.json();
      if (json.ok === false) throw new Error(json.error || 'Google Sheet akce ' + action + ' selhala.');
      return json;
    };

    const fetchSheetRecords = async () => {
      try {
        const [plans, performances, meetings, networkMeetings, partners, education, supervision, paymentPlans, statistics] = await Promise.all([
          fetchAction('listIndividualPlans'),
          fetchAction('listPerformances'),
          fetchAction('listMeetings'),
          fetchAction('listNetworkMeetings'),
          fetchAction('listPartners'),
          fetchAction('listEducation').catch((error) => {
            console.warn('Education records load skipped:', error);
            return { education: [], educations: [], vzdelavani: [] };
          }),
          fetchAction('listSupervision').catch((error) => {
            console.warn('Supervision records load skipped:', error);
            return { supervision: [], supervisions: [], supervize: [] };
          }),
          fetchAction('listPaymentPlans').catch((error) => {
            console.warn('Payment plans load skipped:', error);
            return { paymentPlans: [] };
          }),
          fetchAction('listStatistics').catch((error) => {
            console.warn('Statistics records load skipped:', error);
            return { statistics: [] };
          })
        ]);
        if (cancelled) return;
        setStatisticsRows(statistics.statistics || []);
        const remoteRecords = mapSheetRecordsToAppRecords({
          individualPlans: plans.individualPlans || [],
          performances: performances.performances || [],
          meetings: meetings.meetings || [],
          networkMeetings: networkMeetings.networkMeetings || [],
          partners: partners.partners || [],
          education: education.education || education.educations || education.vzdelavani || [],
          supervision: supervision.supervision || supervision.supervisions || supervision.supervize || [],
          paymentPlans: paymentPlans.paymentPlans || []
        }, clientIndex).map((record) => ({
          ...record,
          projectId: activeProjectId,
          sourceSystem: record.sourceSystem || 'LEGACY_OR_NEW_API'
        }));
        setRecords((prev) => {
          const remoteIds = new Set(remoteRecords.map((record) => record.id));
          const localOnly = prev.filter(
            (record) =>
              record.projectId === activeProjectId &&
              !record.remoteSource &&
              !remoteIds.has(record.id)
          );
          const merged = [...remoteRecords, ...localOnly].sort(compareTimelineRecordsDesc);
          if (!hasFirebaseConfig || !db) saveLocalRecords(merged);
          return merged;
        });
        setSheetError('');
      } catch (error) {
        if (cancelled) return;
        console.error('Google Sheets records load error:', error);
        setSheetError('Klienti se na?etli, ale nepoda?ilo se na??st ulo?en? z?znamy ze Sheetu.');
      }
    };

    fetchSheetRecords();
    return () => {
      cancelled = true;
    };
  }, [clients, clientIndex, activeProjectId, globalWorker]);

  const currentWorker = globalWorker || WORKERS[0];
  const canSeeAllClients = isGarantWorker(currentWorker);
  const accessibleClients = useMemo(() => projectClients, [projectClients]);

  const clientSelectionPool = accessibleClients;

  const selectedClient = selectedClientId ?clientIndex[selectedClientId] : null;

  const goalDeadlineAlerts = useMemo(
    () => buildGoalDeadlineAlerts({ clients: accessibleClients, records, warningDays: GOAL_DEADLINE_WARNING_DAYS }),
    [accessibleClients, records]
  );

  const goalAlertPreviewItems = useMemo(
    () => [...goalDeadlineAlerts.overdue, ...goalDeadlineAlerts.approaching].slice(0, 3),
    [goalDeadlineAlerts]
  );

  const generateKa1PerformanceNote = async ({ draft, selectedClient: client, selectedPhase, records: timelineRecords }) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    if (!apiKey) {
      throw new Error('Gemini API klíč není nastavený. AI návrh nyní nelze vytvořit.');
    }

    const userPrompt = redactClientIdentifiers(
      buildKa1NoteUserPrompt({
        draft: sanitizeAiInput(draft),
        phase: sanitizeAiInput(selectedPhase),
        records: sanitizeAiInput(timelineRecords),
        clientId: client?.id || ''
      }),
      client
    );
    const response = await fetchGemini(
      `https://generativelanguage.googleapis.com/v1beta/models/${KA1_NOTE_AI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: KA1_NOTE_SYSTEM_PROMPT }] },
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 5000,
            responseMimeType: 'application/json',
            responseSchema: KA1_NOTE_RESPONSE_SCHEMA
          }
        })
      }
    );
    const responseBody = await response.json();
    if (!response.ok) {
      throw new Error(responseBody?.error?.message || `AI požadavek selhal se stavem ${response.status}.`);
    }
    const parsed = parseAiJson(extractGeminiText(responseBody));
    return validateKa1NoteAiResult(parsed);
  };

  const hasUnsavedFormContent = () =>
    (showClientForm && hasContentInFields(clientDraft, CLIENT_DRAFT_CONTENT_FIELDS)) ||
    (showClientEditForm && hasContentInFields(clientEditDraft, CLIENT_DRAFT_CONTENT_FIELDS)) ||
    hasUnsavedGeneratorDraftContent(generatorDraft) ||
    hasContentValue(generatedText) ||
    hasContentInFields(ka01Draft, KA01_DRAFT_CONTENT_FIELDS) ||
    hasContentInFields(ka01ActorDraft, KA01_ACTOR_DRAFT_CONTENT_FIELDS) ||
    hasContentInFields(ka02Draft, KA02_DRAFT_CONTENT_FIELDS) ||
    hasContentInFields(ka03Draft, KA03_DRAFT_CONTENT_FIELDS);

  const resetFormDrafts = () => {
    const nextClientId = selectedClientId || clientSelectionPool[0]?.id || '';
    const nextWorker = currentWorker || WORKERS[0];

    setShowClientForm(false);
    setClientDraft({ ...emptyClientDraft, datumVstupu: todayIso() });
    setShowClientEditForm(false);
    setClientEditDraft(emptyClientDraft);
    setGeneratorDraft({
      ...emptyGeneratorDraft,
      worker: nextWorker,
      clientId: nextClientId
    });
    setGeneratedText('');
    setLastGeneratedText('');
    setGenerationNotice('');
    setAiGenerationStatus('idle');
    setCopied(false);
    setClientCaseSummary('');
    setJourneyPlanDrafts({});
    setJourneyPlanStructuredDrafts({});
    setGeneratingJourneyPlanId('');
    setEditingKa01NetworkRecordId('');
    setEditingGeneratedRecordId('');
    setEditingKa03RecordId('');
    setExpandedKa01NetworkRecordIds([]);
    setKa01NetworkTimeError('');
    setKa01AttendanceSelection({});
    setKa01Draft({
      ...createKa01Draft(),
      worker: nextWorker,
      assessmentClientId: nextClientId
    });
    setKa01ActorDraft(createKa01ActorDraft());
    setKa02Draft({
      ...createKa02Draft(),
      worker: nextWorker,
      selectedClientId: nextClientId
    });
    setKa03Draft({
      ...createKa03Draft(),
      selectedClientId: nextClientId,
      tpmClientId: nextClientId,
      employmentClientId: nextClientId
    });
  };

  const confirmAndResetBeforeViewChange = () => {
    if (hasUnsavedFormContent()) {
      const confirmed = window.confirm('Ve formulářích jsou neuložené údaje. Při přechodu na jiný list se rozepsané formuláře vymažou. Pokračovat?');
      if (!confirmed) return false;
    }
    resetFormDrafts();
    return true;
  };

  const switchMainView = (nextView) => {
    if (!nextView || nextView === mainView) return true;
    if (!confirmAndResetBeforeViewChange()) return false;
    setMainView(nextView);
    return true;
  };

  const switchActiveProject = (nextProjectId) => {
    if (!nextProjectId || nextProjectId === activeProjectId) return true;
    if (hasUnsavedFormContent()) {
      const confirmed = window.confirm(
        'Ve formulářích jsou neuložené údaje. Při přepnutí projektu se rozepsané formuláře vymažou. Pokračovat?'
      );
      if (!confirmed) return false;
    }
    resetFormDrafts();
    setClients([]);
    setRecords([]);
    setSelectedClientId('');
    setSearchQuery('');
    setActiveProjectId(nextProjectId);
    return true;
  };


  useEffect(() => {
    if (clientSelectionPool.length === 0) {
      setSelectedClientId('');
      setGeneratorDraft((prev) => ({ ...prev, clientId: '' }));
      setKa01Draft((prev) => ({ ...prev, assessmentClientId: '' }));
      setKa02Draft((prev) => ({ ...prev, selectedClientId: '' }));
      setKa03Draft((prev) => ({ ...prev, selectedClientId: '', tpmClientId: '', employmentClientId: '' }));
      return;
    }
    if (!selectedClientId || !clientSelectionPool.some((client) => client.id === selectedClientId)) {
      const nextClientId = clientSelectionPool[0].id;
      setSelectedClientId(nextClientId);
      setGeneratorDraft((prev) => ({ ...prev, clientId: nextClientId }));
      setKa01Draft((prev) => ({ ...prev, assessmentClientId: nextClientId }));
      setKa02Draft((prev) => ({ ...prev, selectedClientId: nextClientId }));
      setKa03Draft((prev) => ({ ...prev, selectedClientId: nextClientId, tpmClientId: nextClientId, employmentClientId: nextClientId }));
    }
  }, [clientSelectionPool, selectedClientId]);

  useEffect(() => {
    if (!selectedClientId) return;
    setGeneratorDraft((prev) => ({
      ...prev,
      clientId: selectedClientId,
      linkedPlanGoalId: '',
      linkedPlanGoalLabel: ''
    }));
    setKa01Draft((prev) => ({ ...prev, assessmentClientId: selectedClientId }));
    setKa02Draft((prev) => ({ ...prev, selectedClientId }));
    setKa03Draft((prev) => ({
      ...prev,
      selectedClientId,
      tpmClientId: selectedClientId,
      employmentClientId: selectedClientId
    }));
  }, [selectedClientId]);

  useEffect(() => {
    setSelectedJourneyPrintIds([]);
  }, [selectedClientId]);

  const recordsByType = useMemo(() => groupRecordsByType(records), [records]);

  const selectedReportingPeriod = useMemo(
    () => REPORTING_PERIODS.find((item) => item.value === dashboardFilters.period) || REPORTING_PERIODS[0],
    [dashboardFilters.period]
  );

  const storedActivityRecords = useMemo(
    () => records.filter((record) => CURRENT_ACTIVITY_ENTITY_TYPES.has(record.entityType)),
    [records]
  );

  const filteredRecords = useMemo(() => {
    return storedActivityRecords.filter((record) => {
      const matchesPeriod = isDateWithinPeriod(record.activityDate || '', selectedReportingPeriod);
      const matchesKa = dashboardFilters.ka === 'all' || record.ka === dashboardFilters.ka;
      const matchesWorker = dashboardFilters.worker === 'all' || record.worker === dashboardFilters.worker;
      return matchesPeriod && matchesKa && matchesWorker;
    });
  }, [dashboardFilters, selectedReportingPeriod, storedActivityRecords]);

  const filteredClientList = useMemo(() => {
    const normalizeSearchValue = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
    const term = normalizeSearchValue(searchQuery);
    if (!term) return accessibleClients;
    return accessibleClients.filter((client) => normalizeSearchValue(client.prijmeni).includes(term));
  }, [accessibleClients, searchQuery]);

  const computedIndicators = useMemo(() => {
    return buildIndicators({
      clients: accessibleClients,
      records: filteredRecords
    });
  }, [accessibleClients, filteredRecords]);

  const professionalDevelopmentRecords = useMemo(() => {
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    return records.filter((record) => {
      if (!['education_records', 'supervision_records'].includes(record.entityType)) return false;

      const payload = record.payload || {};
      const activityDate = record.activityDate || payload.date || '';
      if (!isDateWithinPeriod(activityDate, selectedReportingPeriod)) return false;
      if (dashboardFilters.worker === 'all') return true;

      const workers = Array.isArray(payload.workers)
        ? payload.workers
        : [
          record.worker,
          payload.worker,
          payload.workerName,
          payload.jmeno_pracovnika,
          payload.jmenoPracovnika
        ].filter(Boolean);

      return workers.some((worker) => normalize(worker) === normalize(dashboardFilters.worker));
    });
  }, [dashboardFilters.worker, records, selectedReportingPeriod]);

  const dashboardOverview = useMemo(() => {
    const normalize = (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

    const contextRecordsByClient = new Map(clients.map((client) => [client.id, []]));
    records.forEach((record) => {
      const clientIds = Array.isArray(record.clientIds) ? record.clientIds : record.clientId ? [record.clientId] : [];
      clientIds.forEach((clientId) => {
        if (!contextRecordsByClient.has(clientId)) contextRecordsByClient.set(clientId, []);
        contextRecordsByClient.get(clientId).push(record);
      });
    });

    const filteredRecordsByClient = new Map(clients.map((client) => [client.id, []]));
    const supportMinutesByClient = new Map();
    filteredRecords.forEach((record) => {
      const clientIds = Array.isArray(record.clientIds) ? record.clientIds : record.clientId ? [record.clientId] : [];
      const minutes = Number(record.payload?.durationMinutes || 0);
      clientIds.forEach((clientId) => {
        if (!filteredRecordsByClient.has(clientId)) filteredRecordsByClient.set(clientId, []);
        filteredRecordsByClient.get(clientId).push(record);
        if (minutes > 0) supportMinutesByClient.set(clientId, (supportMinutesByClient.get(clientId) || 0) + minutes);
      });
    });

    const hoursFor = (clientId) => (supportMinutesByClient.get(clientId) || 0) / 60;
    const supportedClients = clients.filter((client) => hoursFor(client.id) > 0);
    const longTermClients = supportedClients.filter((client) => hoursFor(client.id) >= 40);
    const shortTermClients = supportedClients.filter((client) => hoursFor(client.id) < 40);

    const hasMinimumData = (client) =>
      Boolean(client.id && client.fullName && client.datumNarozeni && client.datumVstupu);
    const hasCompleteMonitoringData = (client) =>
      Boolean(
        client.monitoringListUrl && client.datumNarozeni && client.pohlavi && client.postaveniNaTrhu &&
        client.vzdelani && client.znevyhodneni && client.datumVstupu && client.mesto && client.psc
      );

    const longEligible = longTermClients.filter(hasCompleteMonitoringData);
    const shortEligible = shortTermClients.filter(hasMinimumData);
    const areaMatches = (record, aliases) => {
      const area = normalize(record.payload?.supportArea);
      return aliases.some((alias) => area.includes(normalize(alias)));
    };
    const isCompletedGoal = (goal) => {
      const value = goal?.isCompleted;
      return value === true || ['ano', 'true', '1', 'splnen', 'splneno'].includes(normalize(value));
    };
    const evaluatedLongGoal = (clientId, aliases) => {
      const plans = (contextRecordsByClient.get(clientId) || []).filter((record) => record.entityType === 'plans');
      const activities = (filteredRecordsByClient.get(clientId) || []).filter(
        (record) => record.entityType !== 'plans' && areaMatches(record, aliases)
      );
      return activities.some((activity) => {
        const goalId = String(activity.linkedPlanGoalId || activity.payload?.linkedPlanGoalId || '');
        if (!goalId || goalId === 'one-time-order') return false;
        return plans.some((plan) => {
          const finalEvaluation = String(plan.finalEvaluation || plan.payload?.finalEvaluation || '').trim();
          const goal = getPlanGoals(plan).find(
            (item, index) => String(item.goalId || item.id || ('goal-' + (index + 1))) === goalId
          );
          return Boolean(goal && isCompletedGoal(goal) && (String(goal.goalEvaluation || '').trim() || finalEvaluation));
        });
      });
    };
    const completedShortOrder = (clientId, aliases) =>
      (filteredRecordsByClient.get(clientId) || []).some((record) => {
        if (record.entityType === 'plans' || !areaMatches(record, aliases)) return false;
        const outcome = String(record.payload?.outcome || record.documentText || '').trim();
        const goalId = String(record.linkedPlanGoalId || record.payload?.linkedPlanGoalId || '');
        return Boolean(outcome && (!goalId || goalId === 'one-time-order'));
      });
    const countLongGoal = (aliases) => longTermClients.filter((client) => evaluatedLongGoal(client.id, aliases)).length;
    const countShortGoal = (aliases) => shortTermClients.filter((client) => completedShortOrder(client.id, aliases)).length;
    const countSocialInclusionGoal = () => shortTermClients.filter((client) => {
      const distinctAreas = new Set(
        (filteredRecordsByClient.get(client.id) || [])
          .filter((record) => {
            const ka = normalize(record.ka).replace(/\s/g, '');
            return record.entityType !== 'plans' && ['ka1', 'ka01', 'ka2', 'ka02'].includes(ka);
          })
          .map((record) => normalize(record.payload?.supportArea))
          .filter((area) => area && area !== normalize('soci\u00e1ln\u00ed za\u010dlen\u011bn\u00ed'))
      );
      return distinctAreas.size >= 3;
    }).length;

    const caseMeetingCount = filteredRecords.filter((record) => {
      const type = normalize(record.payload?.consultationType || record.payload?.type || record.title);
      return type.includes('pripadov') || type.includes('multiobor');
    }).length;
    const outreachCount = filteredRecords.filter((record) =>
      normalize(record.payload?.consultationType || record.title).includes('depist')
    ).length;
    const hoursValue = (value) => {
      const minutes = hoursToMinutes(value);
      return minutes > 0 ? minutes / 60 : 0;
    };
    const roundHours = (value) => Math.round(Number(value || 0) * 100) / 100;
    const professionalDevelopmentStats = WORKERS.map((worker) => {
      const normalizedWorker = normalize(worker);
      const stats = {
        key: normalizedWorker || worker,
        worker,
        individualSupervisionHours: 0,
        groupSupervisionHours: 0,
        education2026Hours: 0,
        education2027Hours: 0,
        education2028Hours: 0,
        educationTotalHours: 0,
        supervisionTotalHours: 0
      };

      professionalDevelopmentRecords
        .filter((record) => record.entityType === 'education_records')
        .forEach((record) => {
          const payload = record.payload || {};
          const workers = Array.isArray(payload.workers)
            ? payload.workers
            : [record.worker, payload.worker, payload.workerName, payload.jmeno_pracovnika, payload.jmenoPracovnika].filter(Boolean);
          if (!workers.some((item) => normalize(item) === normalizedWorker)) return;
          const hours = hoursValue(payload.hours);
          const year = String(payload.date || record.activityDate || '').slice(0, 4);
          if (year === '2026') stats.education2026Hours += hours;
          if (year === '2027') stats.education2027Hours += hours;
          if (year === '2028') stats.education2028Hours += hours;
          stats.educationTotalHours += hours;
        });

      professionalDevelopmentRecords
        .filter((record) => record.entityType === 'supervision_records')
        .forEach((record) => {
          const payload = record.payload || {};
          const workers = Array.isArray(payload.workers)
            ? payload.workers
            : [record.worker, payload.worker, payload.workerName, payload.jmeno_pracovnika, payload.jmenoPracovnika].filter(Boolean);
          if (!workers.some((item) => normalize(item) === normalizedWorker)) return;
          const hours = hoursValue(payload.hours);
          const supervisionType = normalize(payload.type || record.title);
          if (supervisionType.includes('skupin')) stats.groupSupervisionHours += hours;
          else stats.individualSupervisionHours += hours;
          stats.supervisionTotalHours += hours;
        });

      return {
        ...stats,
        individualSupervisionHours: roundHours(stats.individualSupervisionHours),
        groupSupervisionHours: roundHours(stats.groupSupervisionHours),
        education2026Hours: roundHours(stats.education2026Hours),
        education2027Hours: roundHours(stats.education2027Hours),
        education2028Hours: roundHours(stats.education2028Hours),
        educationTotalHours: roundHours(stats.educationTotalHours),
        supervisionTotalHours: roundHours(stats.supervisionTotalHours)
      };
    });
    const missingPlanCount = longTermClients.filter(
      (client) => !(contextRecordsByClient.get(client.id) || []).some((record) => record.entityType === 'plans')
    ).length;
    const missingGoalEvaluationCount = supportedClients.filter((client) =>
      (contextRecordsByClient.get(client.id) || [])
        .filter((record) => record.entityType === 'plans')
        .some((plan) => getPlanGoals(plan).some((goal) => isCompletedGoal(goal) && !String(goal.goalEvaluation || '').trim()))
    ).length;
    const completeMonitoringCount = longTermClients.filter(hasCompleteMonitoringData).length;
    const partnerStats = buildPartnerStats({
      records: filteredRecords,
      partners: records.filter((record) => record.entityType === 'actor_registry'),
      projectStartDate: REPORTING_PERIODS[1]?.start || '2026-03-01',
      referenceDate: selectedReportingPeriod?.end || todayIso()
    });
    const activePartners = partnerStats.filter((partner) => partner.isActiveInProject);

    return {
      indicators: [
        { key: '600000', code: '600 000', label: 'Celkov\u00fd po\u010det \u00fa\u010dastn\u00edk\u016f', current: longEligible.length, target: 29 },
        { key: '670102', code: '670 102', label: 'Vyu\u017e\u00edv\u00e1n\u00ed podpo\u0159en\u00fdch slu\u017eeb', current: shortEligible.length, target: 100 }
      ],
      longGoals: [
        { key: 'parenting-long', label: 'Rodi\u010dovsk\u00e9 kompetence', current: countLongGoal(['rodina']), target: 11 },
        { key: 'housing-long', label: 'Bydlen\u00ed', current: countLongGoal(['bydlen\u00ed']), target: 5 },
        { key: 'work-long', label: 'Pracovn\u00ed kompetence', current: countLongGoal(['zam\u011bstn\u00e1n\u00ed']), target: 5 },
        { key: 'finance-long', label: 'Finan\u010dn\u00ed situace', current: countLongGoal(['finance/dluhy', 'dluhy']), target: 5 }
      ],
      shortGoals: [
        {
          key: 'security-short',
          label: 'Soci\u00e1ln\u00ed zabezpe\u010den\u00ed',
          current: countShortGoal(['bydlen\u00ed', 'finance/dluhy', 'zam\u011bstn\u00e1n\u00ed', 'pr\u00e1va/povinnosti']),
          target: 50
        },
        {
          key: 'services-short',
          label: 'P\u0159\u00edstup ke slu\u017eb\u00e1m',
          current: countShortGoal(['zdrav\u00ed', 'bezpe\u010d\u00ed', 'vzd\u011bl\u00e1n\u00ed', 'slu\u017eby']),
          target: 25
        },
        { key: 'parenting-short', label: 'Rodi\u010dovsk\u00e9 kompetence', current: countShortGoal(['rodina']), target: 20 },
        { key: 'inclusion-short', label: 'Soci\u00e1ln\u00ed za\u010dlen\u011bn\u00ed (min. 3 oblasti v KA1/KA2)', current: countSocialInclusionGoal(), target: 5 }
      ],
      activityGoals: [
        { key: 'outreach', label: 'Depist\u00e1\u017en\u00ed z\u00e1znamy', current: outreachCount, target: 100 },
        { key: 'case-meetings', label: 'P\u0159\u00edpadov\u00e1 / multioborov\u00e1 setk\u00e1n\u00ed', current: caseMeetingCount, target: 15 }
      ],
      professionalDevelopmentStats,
      partnerMetrics: [
        { key: 'partners-active', label: 'Spolupracující partneři', current: activePartners.length, detail: 'Alespoň jedna doložená aktivita' },
        { key: 'partners-new', label: 'Nově zapojení partneři', current: activePartners.filter((partner) => partner.isNewInProject).length, detail: 'Nově zapojení od zahájení projektu' },
        { key: 'partners-once', label: 'Jednorázově zapojení partneři', current: activePartners.filter((partner) => partner.totalActivityCount === 1).length, detail: 'Právě jedna doložená aktivita' },
        { key: 'partners-90-days', label: 'Aktivní partneři za 90 dní', current: activePartners.filter((partner) => partner.isActiveLast90Days).length, detail: 'Aktivita v posledních 90 dnech období' }
      ],
      risks: [
        { key: 'near-40', label: 'Klienti bl\u00edzko 40 hodin', count: supportedClients.filter((client) => hoursFor(client.id) >= 30 && hoursFor(client.id) < 40).length, detail: '30\u201339,99 hodiny podpory' },
        { key: 'long-not-counted', label: 'Nad 40 hodin, ale nezapo\u010dteno do 600 000', count: longTermClients.length - longEligible.length, detail: 'Chyb\u00ed povinn\u00e9 monitorovac\u00ed \u00fadaje' },
        { key: 'short-not-counted', label: 'Pod 40 hodin, ale nezapo\u010dteno do 670 102', count: shortTermClients.length - shortEligible.length, detail: 'Chyb\u00ed minim\u00e1ln\u00ed registra\u010dn\u00ed \u00fadaje' },
        { key: 'missing-plan', label: 'Chyb\u00ed individu\u00e1ln\u00ed pl\u00e1n u 40+', count: missingPlanCount, detail: 'Riziko pro dolo\u017een\u00ed dlouhodob\u00e9 podpory' },
        { key: 'missing-evaluation', label: 'Chyb\u00ed vyhodnocen\u00ed c\u00edle', count: missingGoalEvaluationCount, detail: 'Spln\u011bn\u00fd c\u00edl nem\u00e1 slovn\u00ed vyhodnocen\u00ed' }
      ]
    };
  }, [clients, filteredRecords, professionalDevelopmentRecords, records, selectedReportingPeriod]);

  const periodRecordsForZor = useMemo(
    () => records.filter(
      (record) => ZOR_ACTIVITY_ENTITY_TYPES.has(record.entityType)
        && isDateWithinPeriod(record.activityDate || '', selectedReportingPeriod)
    ),
    [records, selectedReportingPeriod]
  );

  const clientTimeline = useMemo(() => {
    if (!selectedClientId) return [];
    return records
      .filter((record) => {
        if (record.entityType === 'payment_plan') return false;
        const clientIds = Array.isArray(record.clientIds) ?record.clientIds : record.clientId ?[record.clientId] : [];
        return clientIds.includes(selectedClientId);
      })
      .sort((a, b) => (b.activityDate || '').localeCompare(a.activityDate || ''));
  }, [records, selectedClientId]);

  const clientJourneyTimeline = useMemo(() => {
    if (!selectedClient) return [];

    const timelineRecords = records
      .filter((record) => {
        const clientIds = Array.isArray(record.clientIds) ?record.clientIds : record.clientId ?[record.clientId] : [];
        return clientIds.includes(selectedClient.id) && CLIENT_JOURNEY_ENTITY_TYPES.has(record.entityType);
      })
      .sort(compareTimelineRecordsDesc)
      .map((record) => ({
        ...record,
        isSynthetic: false
      }));

    const entryDate = selectedClient.datumVstupu || selectedClient.datumZarazeni || '';
    const syntheticEntry = entryDate
      ? [{
          id: `entry-${selectedClient.id}`,
          entityType: 'project_entry',
          activityDate: entryDate,
          worker: '',
          ka: '',
          title: 'Zařazení klienta do projektu',
          clientId: selectedClient.id,
          clientIds: [selectedClient.id],
          clientName: selectedClient.fullName,
          summary: `Status klienta: ${selectedClient.projectStatusLabel || 'Neuvedeno'}`,
          isSynthetic: true
        }]
      : [];

    return [...syntheticEntry, ...timelineRecords].sort(compareTimelineRecordsDesc);
  }, [records, selectedClient]);

  const selectedClientSupportBreakdown = useMemo(() => {
    if (!selectedClient) return { totalCount: 0, totalDocuments: 0, totalHours: 0, totalMinutes: 0, byType: [] };
    return getClientSupportBreakdown(selectedClient.id, records);
  }, [records, selectedClient]);

  const selectedClientDriveBundle = useMemo(() => {
    if (!selectedClient) return null;
    const storedBundle = records.find(
      (record) => record.entityType === 'client_folder_bundle' && record.clientId === selectedClient.id
    );
    if (storedBundle) return storedBundle;
    if (!selectedClient.driveFolderUrl && !selectedClient.monitoringListUrl) return null;
    return {
      id: 'sheet-drive-bundle-' + selectedClient.id,
      entityType: 'client_folder_bundle',
      clientId: selectedClient.id,
      payload: {
        clientFolderUrl: selectedClient.driveFolderUrl || '',
        clientFolderName: selectedClient.fullName || selectedClient.id,
        monListFileUrl: selectedClient.monitoringListUrl || '',
        monListFileName: 'Monitorovac\u00ed list - ' + (selectedClient.fullName || selectedClient.id)
      }
    };
  }, [records, selectedClient]);

  const tpmRecords = useMemo(
    () =>
      records
        .filter((record) => record.entityType === 'tpm_records')
        .sort((a, b) => (b.payload?.startDate || b.activityDate || '').localeCompare(a.payload?.startDate || a.activityDate || '')),
    [records]
  );

  const employmentRecords = useMemo(
    () =>
      records
        .filter((record) => record.entityType === 'employment_records')
        .sort((a, b) => (b.payload?.employmentStartDate || b.activityDate || '').localeCompare(a.payload?.employmentStartDate || a.activityDate || '')),
    [records]
  );
  const mentorReportRecords = useMemo(
    () =>
      records
        .filter((record) => record.entityType === 'mentor_report_document')
        .sort((a, b) => (b.activityDate || '').localeCompare(a.activityDate || '')),
    [records]
  );

  const ka01NetworkRecords = useMemo(
    () =>
      records
        .filter((record) => record.entityType === 'network_activities')
        .sort((a, b) => (b.activityDate || '').localeCompare(a.activityDate || '')),
    [records]
  );
  const ka01ActorRegistryRecords = useMemo(
    () => {
      const existing = records.filter((record) => record.entityType === 'actor_registry');
      const suppressedSeedIds = new Set(
        existing
          .map((record) => String(record.payload?.seedSourceId || '').trim())
          .filter(Boolean)
      );
      const normalizeKeyPart = (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ');
      const normalizeIco = (value) =>
        String(value || '')
          .replace(/[^\d]/g, '');
      const existingIdentityKeys = new Set(
        existing.map((record) => {
          const payload = record.payload || {};
          const icoKey = normalizeIco(payload.ico);
          return [
            normalizeKeyPart(payload.actorType),
            normalizeKeyPart(payload.municipality),
            icoKey
          ].join('|');
        })
      );
      const normalizedNames = new Set(existing.map((record) => String(record.payload?.name || '').trim().toLowerCase()));
      const seeded = KA01_DEFAULT_ACTOR_REGISTRY.filter(
        (item, index) => {
          const seedId = `seed-ka01-actor-${index + 1}`;
          if (suppressedSeedIds.has(seedId)) return false;
          const seedIdentityKey = [
            normalizeKeyPart(item.actorType),
            normalizeKeyPart(item.municipality),
            normalizeIco(item.ico)
          ].join('|');
          if (existingIdentityKeys.has(seedIdentityKey)) return false;
          return !normalizedNames.has(String(item.name || '').trim().toLowerCase());
        }
      ).map((item, index) => ({
        id: `seed-ka01-actor-${index + 1}`,
        ka: 'KA01',
        entityType: 'actor_registry',
        title: `Registr aktéra - ${item.name}`,
        activityDate: '',
        createdAt: 0,
        updatedAt: 0,
        worker: 'Garant projektu',
        payload: {
          id: '',
          ownerWorker: 'Garant projektu',
          ...item,
          networkOrigin: item.networkOrigin || 'výchozí síť'
        }
      }));
      return [...existing, ...seeded].sort((a, b) => (b.activityDate || '').localeCompare(a.activityDate || ''));
    },
    [records]
  );
  const educationRecords = useMemo(
    () => records.filter((record) => record.entityType === 'education_records').sort(compareTimelineRecordsDesc),
    [records]
  );
  const supervisionRecords = useMemo(
    () => records.filter((record) => record.entityType === 'supervision_records').sort(compareTimelineRecordsDesc),
    [records]
  );
  const ka01ActorOptions = useMemo(() => {
    const names = ka01ActorRegistryRecords
      .map((record) => String(record.payload?.name || '').trim())
      .filter(Boolean);
    const uniqueNames = Array.from(new Set(names));
    return [
      ...uniqueNames.map((name) => ({ value: name, label: name })),
      { value: KA01_ACTOR_CUSTOM, label: 'Jiná osoba (ručně)' }
    ];
  }, [ka01ActorRegistryRecords]);
  useEffect(() => {
    setKa01AttendanceSelection((prev) => {
      const next = { ...prev };
      ka01ActorRegistryRecords.forEach((record) => {
        if (typeof next[record.id] === 'boolean') return;
        const defaultValue = Boolean(record.payload?.includeInAttendance);
        next[record.id] = defaultValue;
      });
      return next;
    });
  }, [ka01ActorRegistryRecords]);
  const ka01NetworkDuration = useMemo(
    () => formatDurationFromTimes(ka01Draft.networkStartTime, ka01Draft.networkEndTime),
    [ka01Draft.networkStartTime, ka01Draft.networkEndTime]
  );
  const ka01StartTimeSuggestions = useMemo(
    () => getKa01TimeSuggestions(ka01Draft.networkStartTime),
    [ka01Draft.networkStartTime]
  );
  const ka01EndTimeSuggestions = useMemo(
    () => getKa01TimeSuggestions(ka01Draft.networkEndTime),
    [ka01Draft.networkEndTime]
  );

  const generatorClient = generatorDraft.clientId ?clientIndex[generatorDraft.clientId] : null;
  const generatorConfig = REPORT_PROMPTS[generatorDraft.selectedKey];
  const getPlanGoalOptions = React.useCallback(
    (clientId) => {
      if (!clientId) return [];
      const planRecord = records
        .filter((record) => record.entityType === 'plans' && record.clientId === clientId)
        .sort((a, b) => {
          const aGoals = Array.isArray(a.goals) ? a.goals : a.payload?.goals || [];
          const bGoals = Array.isArray(b.goals) ? b.goals : b.payload?.goals || [];
          const aHasGoals = Number(aGoals.some((goal) => goal.goalDescription));
          const bHasGoals = Number(bGoals.some((goal) => goal.goalDescription));
          if (aHasGoals !== bHasGoals) return bHasGoals - aHasGoals;
          return (b.createdAt || 0) - (a.createdAt || 0);
        })[0];
      const goals = getPlanGoals(planRecord);

      return goals
        .map((goal, index) => {
          const label = goal.goalDescription || goal.description || goal.title || `Cíl ${index + 1}`;
          return {
            value: goal.goalId || goal.id || `goal-${index + 1}`,
            label: `${index + 1}. ${truncate(label, 90)}`
          };
        })
        .filter((goal) => goal.value);
    },
    [records]
  );
  const generatorPlanGoalOptions = useMemo(
    () => getPlanGoalOptions(generatorDraft.clientId),
    [generatorDraft.clientId, getPlanGoalOptions]
  );
  const previousGeneratorRecords = useMemo(() => {
    if (!generatorClient || !generatorConfig) return [];
    return records
      .filter((record) => {
        const clientIds = Array.isArray(record.clientIds) ?record.clientIds : record.clientId ?[record.clientId] : [];
        return clientIds.includes(generatorClient.id) && record.entityType === generatorConfig.entityType;
      })
      .sort((a, b) => {
        const left = `${b.activityDate || ''}-${b.createdAt || 0}`;
        const right = `${a.activityDate || ''}-${a.createdAt || 0}`;
        return left.localeCompare(right);
      })
      .slice(0, 3);
  }, [generatorClient, generatorConfig, records]);
  const nextTherapySessionOrder = useMemo(() => {
    if (!generatorDraft.clientId) return '1';
    const therapyRecords = records.filter((record) => record.entityType === 'therapy_sessions' && record.clientId === generatorDraft.clientId);
    const highestOrder = therapyRecords.reduce((maxOrder, record) => {
      const order = Number(record.payload?.sessionOrder || 0);
      return Number.isFinite(order) ? Math.max(maxOrder, order) : maxOrder;
    }, 0);
    return String(Math.max(highestOrder, therapyRecords.length) + 1);
  }, [generatorDraft.clientId, records]);

  useEffect(() => {
    if (mainView === 'ka02') {
      setGeneratorDraft((prev) => ({
        ...prev,
        selectedKey: KA02_STRUCTURED_FORM_KEYS.includes(prev.selectedKey) ?prev.selectedKey : 'consultation',
        clientId: ka02Draft.selectedClientId || prev.clientId
      }));
    }
    if (mainView === 'ka03') {
      const preferredTpm =
        tpmRecords.find((record) => record.clientId === (ka03Draft.tpmClientId || ka03Draft.selectedClientId)) ||
        tpmRecords[0] ||
        null;
      setGeneratorDraft((prev) => ({
        ...prev,
        selectedKey: 'consultation',
        tpmRecordId: prev.tpmRecordId || preferredTpm?.id || '',
        clientId: prev.clientId || preferredTpm?.clientId || ka03Draft.tpmClientId || ka03Draft.employmentClientId || ka03Draft.selectedClientId,
        worker: 'Mentor/Kouč'
      }));
    }
  }, [mainView, ka02Draft.selectedClientId, ka03Draft.selectedClientId, ka03Draft.tpmClientId, ka03Draft.employmentClientId, tpmRecords]);

  useEffect(() => {
    if (generatorDraft.selectedKey !== 'therapy' || editingGeneratedRecordId) return;
    setGeneratorDraft((prev) => {
      if (prev.sessionOrder === nextTherapySessionOrder) return prev;
      return {
        ...prev,
        sessionOrder: nextTherapySessionOrder
      };
    });
  }, [editingGeneratedRecordId, generatorDraft.selectedKey, nextTherapySessionOrder]);

  useEffect(() => {
    if (!KA02_STRUCTURED_FORM_KEYS.includes(generatorDraft.selectedKey) || editingGeneratedRecordId) return;
    // Globální pracovník se nesmí měnit automaticky podle zvoleného formuláře.
    // Zůstává navolený v horní liště i při přepínání listů a typů dokumentů.
  }, [editingGeneratedRecordId, generatorDraft.selectedKey]);

  useEffect(() => {
    setZorTexts(null);
  }, [dashboardFilters.period]);

  const setFlash = (message) => {
    setStatusMessage(message);
    window.setTimeout(() => setStatusMessage(''), 3000);
  };

  const setSaveButtonNotice = (key, tone, text) => {
    setSaveButtonNotices((previous) => ({
      ...previous,
      [key]: { tone, text }
    }));
  };

  const clearSaveButtonNotice = (key) => {
    setSaveButtonNotices((previous) => {
      if (!previous[key]) return previous;
      const next = { ...previous };
      delete next[key];
      return next;
    });
  };

  const saveErrorMessage = (fallback, error) => {
    const detail = String(error?.message || '').trim();
    return detail ? `${fallback}: ${detail}` : fallback;
  };

  const normalizeDuplicateText = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, ' ')
      .toLowerCase();

  const normalizeRecordValue = (value) => {
    if (Array.isArray(value)) return value.map(normalizeRecordValue);
    if (value && typeof value === 'object') {
      return Object.keys(value)
        .sort()
        .reduce((acc, key) => {
          acc[key] = normalizeRecordValue(value[key]);
          return acc;
        }, {});
    }
    return value ?? '';
  };

  const buildDuplicateSignature = (record) =>
    JSON.stringify(
      normalizeRecordValue({
        entityType: record.entityType || '',
        ka: record.ka || '',
        activityDate: record.activityDate || '',
        worker: record.worker || '',
        clientId: record.clientId || '',
        clientIds: Array.isArray(record.clientIds) ? record.clientIds : [],
        clientName: record.clientName || '',
        title: record.title || '',
        documentText: cleanGeneratedText(record.documentText || ''),
        payload: record.payload || {},
        indicatorFlags: record.indicatorFlags || {}
      })
    );

  const buildClientDuplicateSignature = (draft = {}) =>
    JSON.stringify({
      jmeno: normalizeDuplicateText(draft.jmeno),
      prijmeni: normalizeDuplicateText(draft.prijmeni),
      datumNarozeni: String(draft.datumNarozeni || '').trim(),
      email: normalizeDuplicateText(draft.email),
      telefon: normalizeDuplicateText(draft.telefon).replace(/\s+/g, ''),
      datumVstupu: String(draft.datumVstupu || '').trim()
    });

  const isSameClientIdentity = (left = {}, right = {}) => {
    const leftFirstName = normalizeDuplicateText(left.jmeno);
    const rightFirstName = normalizeDuplicateText(right.jmeno);
    const leftLastName = normalizeDuplicateText(left.prijmeni);
    const rightLastName = normalizeDuplicateText(right.prijmeni);
    if (!leftFirstName || !leftLastName || leftFirstName !== rightFirstName || leftLastName !== rightLastName) return false;

    const leftBirthDate = String(left.datumNarozeni || '').trim();
    const rightBirthDate = String(right.datumNarozeni || '').trim();
    if (leftBirthDate && rightBirthDate) return leftBirthDate === rightBirthDate;

    // Neúplný nový záznam se stejným jménem nesmí obejít ochranu jen tím,
    // že v něm chybí datum narození, kontakt nebo datum vstupu.
    return true;
  };

  const findDuplicateClient = (draft = {}, excludedClientId = '') =>
    clients.find((client) => client.id !== excludedClientId && isSameClientIdentity(draft, client));

  const getDuplicateSaveMessage = (payload) => {
    if (payload.entityType === 'plans' && payload.clientId) {
      const existingPlan = records.find((record) => record.entityType === 'plans' && record.clientId === payload.clientId);
      if (existingPlan) {
        return `Klient už má založený individuální plán rozvoje: "${existingPlan.title || 'Plán rozvoje'}".`;
      }
    }

    const signature = buildDuplicateSignature(payload);
    const duplicate = records.find((record) => buildDuplicateSignature(record) === signature);
    if (duplicate) {
      return `Shodný zápis už v evidenci existuje: "${duplicate.title || 'Bez názvu'}".`;
    }

    return '';
  };

  const syncRecordToGoogleDrive = async (record) => {
    if (
      !GOOGLE_DRIVE_UPLOAD_URL ||
      !record?.clientId ||
      ['payment_plan', 'client_folder_bundle', 'ai_style_memory'].includes(record.entityType)
    ) {
      return { skipped: true };
    }

    const client = clientIndex[record.clientId] || {
      id: record.clientId,
      fullName: record.clientName || 'Bez klienta'
    };

    try {
      const response = await fetch(GOOGLE_DRIVE_UPLOAD_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(buildDriveUploadPayload(record, client))
      });
      if (response.type === 'opaque') {
        return { ok: true, opaque: true };
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok === false) {
        throw new Error(result.error || `Google Drive upload selhal se stavem ${response.status}.`);
      }
      return { ok: true, result };
    } catch (error) {
      console.error('Google Drive sync error:', error);
      return { ok: false, error };
    }
  };

  const persistClientDriveBundleRecord = async (client, bundleResult) => {
    const existingRecord = records.find(
      (record) => record.entityType === 'client_folder_bundle' && record.clientId === client.id
    );
    const payload = {
      entityType: 'client_folder_bundle',
      ka: '',
      title: 'Klientská složka na Google Drive',
      activityDate: todayIso(),
      worker: '',
      clientId: client.id,
      clientIds: [client.id],
      clientName: client.fullName,
      documentText: `Klientská složka byla připravena na Google Drive. Složka: ${bundleResult.clientFolderName || client.fullName}.`,
      payload: {
        ...bundleResult,
        generatedAt: new Date().toISOString()
      },
      indicatorFlags: {}
    };

    if (!hasFirebaseConfig || !db) {
      const nextRecord = existingRecord
        ? { ...existingRecord, ...payload, createdAt: existingRecord.createdAt || Date.now() }
        : { ...payload, id: `local-drive-bundle-${client.id}`, createdAt: Date.now() };
      const nextRecords = existingRecord
        ? records.map((record) => (record.id === existingRecord.id ? nextRecord : record))
        : [nextRecord, ...records];
      setRecords(nextRecords);
      saveLocalRecords(nextRecords);
      return;
    }

    const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'projectRecords');
    if (existingRecord?.id) {
      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projectRecords', existingRecord.id), {
        ...payload,
        createdAt: existingRecord.createdAt || Date.now()
      });
      return;
    }

    await addDoc(recordsRef, {
      ...payload,
      createdAt: Date.now()
    });
  };

  const provisionClientDriveFolder = async (client, { silent = false, manageState = true } = {}) => {
    if (!isClientRegistryAvailable) {
      if (!silent) setFlash('Klientský registr není dostupný. Vytvoření složky bylo zablokováno.');
      return false;
    }
    if (!GOOGLE_SHEET_MACRO_URL) {
      if (!silent) setFlash('Propojen\u00ed s Google Diskem nen\u00ed nastaven\u00e9.');
      return false;
    }

    if (manageState) setIsProvisioningClientFolder(true);
    try {
      const result = await postGoogleSheetAction({
        action: 'ensureClientFolder',
        klient_id: client.id
      });
      if (!result?.client) throw new Error('Apps Script nevrátil připravenou klientskou složku.');

      const provisionedClient = result.client;
      const bundleResult = {
        clientFolderUrl: provisionedClient.drive_folder_url || '',
        clientFolderName: client.fullName || client.id,
        monListFileUrl: provisionedClient.monitoring_list_url || '',
        monListFileName: 'Monitorovac\u00ed list - ' + (client.fullName || client.id),
        contractFileUrl: provisionedClient.contract_url || '',
        consentFileUrl: provisionedClient.consent_url || ''
      };
      if (!bundleResult.clientFolderUrl) throw new Error('Apps Script nevr\u00e1til odkaz na slo\u017eku klienta.');

      await persistClientDriveBundleRecord(client, bundleResult);
      if (!silent) setFlash('Kompletní klientská složka byla připravena.');
      return true;
    } catch (error) {
      console.error('Client Drive folder provisioning error:', error);
      if (!silent) setFlash(error.message || 'Slo\u017eku klienta se nepoda\u0159ilo vytvo\u0159it.');
      return false;
    } finally {
      if (manageState) setIsProvisioningClientFolder(false);
    }
  };

  const provisionAllClientDriveFolders = async () => {
    if (!GOOGLE_SHEET_MACRO_URL) {
      setFlash('Google Drive propojení zatím není nastavené.');
      return;
    }

    const clientsWithoutFolder = clients.filter(
      (client) => !client.driveFolderUrl && !records.some((record) => record.entityType === 'client_folder_bundle' && record.clientId === client.id)
    );
    if (!clientsWithoutFolder.length) {
      setFlash('Všichni klienti už mají založenou Drive složku.');
      return;
    }

    setIsProvisioningClientFolder(true);
    let createdCount = 0;
    try {
      for (const client of clientsWithoutFolder) {
        const ok = await provisionClientDriveFolder(client, { silent: true, manageState: false });
        if (ok) createdCount += 1;
      }
      setFlash(`Drive složky byly vytvořeny pro ${createdCount} z ${clientsWithoutFolder.length} klientů.`);
    } finally {
      setIsProvisioningClientFolder(false);
    }
  };


  const postGoogleSheetAction = async (payload) => {
    if (!GOOGLE_SHEET_MACRO_URL) return null;
    const scopedPayload = {
      ...payload,
      project_id: payload.project_id || activeProjectId,
      actor_id: payload.actor_id || currentWorker,
      source_system: payload.source_system || 'NEW_APP'
    };
    const response = await fetch(GOOGLE_SHEET_MACRO_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(scopedPayload)
    });
    if (!response.ok) throw new Error('Google Sheet akce selhala: ' + response.status);
    const result = await response.json().catch(() => ({}));
    if (result.ok === false) throw new Error(result.error || 'Google Sheet akce selhala.');
    return result;
  };

  const loadBackupStatus = async () => {
    if (!GOOGLE_SHEET_MACRO_URL || !canSeeAllClients) return null;
    try {
      const url = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
      url.searchParams.set('action', 'getBackupStatus');
      url.searchParams.set('project_id', activeProjectId);
      url.searchParams.set('actor_id', currentWorker);
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Načtení stavu zálohy selhalo.');
      const result = await response.json().catch(() => ({}));
      if (result.ok === false) throw new Error(result.error || 'Načtení stavu zálohy selhalo.');
      const nextStatus = result.backup || { state: 'idle', message: 'Záloha zatím nebyla vytvořena.' };
      setBackupStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      console.warn('Backup status refresh failed:', error);
      setBackupStatus((previous) => ({ ...previous, statusError: error.message || 'Stav zálohy nelze načíst.' }));
      return null;
    }
  };

  useEffect(() => {
    if (mainView !== 'dashboard' || !canSeeAllClients) return undefined;
    let active = true;
    const refresh = async () => {
      if (!active) return;
      await loadBackupStatus();
    };
    void refresh();
    const interval = window.setInterval(refresh, 5000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [mainView, canSeeAllClients]);

  const handleStartFullBackup = async () => {
    if (!canSeeAllClients || isBackupActionRunning) return;
    setIsBackupActionRunning(true);
    try {
      const result = await postGoogleSheetAction({ action: 'startFullBackup', requested_by: currentWorker });
      setBackupStatus(result?.backup || { state: 'queued', message: 'Záloha čeká na spuštění.' });
      setFlash('Kompletní záloha byla zařazena ke zpracování. Týdenní zálohování je aktivní.');
    } catch (error) {
      setBackupStatus({ state: 'error', message: error.message || 'Zálohu se nepodařilo spustit.' });
      setFlash(error.message || 'Zálohu se nepodařilo spustit.');
    } finally {
      setIsBackupActionRunning(false);
    }
  };

  const handleInstallWeeklyBackup = async () => {
    if (!canSeeAllClients || isBackupActionRunning) return;
    setIsBackupActionRunning(true);
    try {
      const result = await postGoogleSheetAction({ action: 'installWeeklyBackup', requested_by: currentWorker });
      setBackupStatus(result?.backup || backupStatus);
      setFlash('Týdenní automatická záloha byla zapnuta.');
    } catch (error) {
      setFlash(error.message || 'Týdenní zálohu se nepodařilo zapnout.');
    } finally {
      setIsBackupActionRunning(false);
    }
  };

  const refreshStatisticsRows = async () => {
    try {
      const url = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
      url.searchParams.set('action', 'listStatistics');
      url.searchParams.set('project_id', activeProjectId);
      url.searchParams.set('actor_id', currentWorker);
      const response = await fetch(url.toString(), { cache: 'no-store' });
      if (!response.ok) throw new Error('Obnovení statistik selhalo.');
      const result = await response.json().catch(() => ({}));
      if (result.ok === false) throw new Error(result.error || 'Obnovení statistik selhalo.');
      setStatisticsRows(result.statistics || []);
      return true;
    } catch (error) {
      console.warn('Statistics refresh failed:', error);
      return false;
    }
  };

  useEffect(() => {
    if (mainView === 'statistics') {
      void refreshStatisticsRows().then((ok) => {
        if (!ok) setFlash('Statistiky se nepodařilo obnovit z Google Sheetu.');
      });
    }
  }, [mainView]);

  const syncRecordToGoogleSheet = async (record) => {
    if (!GOOGLE_SHEET_MACRO_URL || record.entityType === 'ai_style_memory') return record;
    const payload = record.payload || {};

    if (record.entityType === 'actor_registry') {
      const result = await postGoogleSheetAction({
        action: 'savePartner',
        partner: {
          partner_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          nazev_subjektu: payload.name || record.title || '',
          typ_aktera: payload.actorType || '',
          puvod_site: payload.networkOrigin || 'st\u00e1vaj\u00edc\u00ed',
          datum_zapojeni: payload.joinedNetworkDate || record.activityDate || '',
          kontaktni_osoba: payload.contactName || [payload.contactTitle, payload.contactFirstName, payload.contactLastName].filter(Boolean).join(' '),
          funkce: payload.contactRole || payload.role || '',
          telefon: payload.phone || '',
          email: payload.email || '',
          status: 'Platn\u00fd'
        }
      });
      return { ...record, id: result?.partner?.partner_id || record.id };
    }

    if (record.entityType === 'network_activities') {
      const result = await postGoogleSheetAction({
        action: 'saveNetworkMeeting',
        networkMeeting: {
          schuzka_site_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          datum: record.activityDate || '',
          cas_od: payload.startTime || '',
          cas_do: payload.endTime || '',
          typ_schuzky: payload.type || record.title || '',
          misto: payload.place || '',
          pracovnik: record.worker || '',
          partner_ids: Array.isArray(payload.partnerIds) ? payload.partnerIds.join(', ') : payload.partnerIds || '',
          rt_clenove: Array.isArray(payload.rtMembers) ? payload.rtMembers.join(', ') : payload.rtMembers || '',
          dalsi_osoby: Array.isArray(payload.otherPeople) ? payload.otherPeople.join(', ') : payload.otherPeople || '',
          partneri: Array.isArray(payload.partnerNames) ? payload.partnerNames.join(', ') : payload.partnerNames || '',
          obsah_jednani: payload.notes || '',
          vystup: payload.outcome || payload.description || '',
          dalsi_kroky: payload.nextSteps || '',
          dokument_text: record.documentText || payload.description || '',
          status: 'Platn\u00fd'
        }
      });
      return { ...record, id: result?.networkMeeting?.schuzka_site_id || record.id };
    }

    if (record.entityType === 'education_records') {
      const workers = Array.isArray(payload.workers) ? payload.workers : [record.worker || payload.worker].filter(Boolean);
      const result = await postGoogleSheetAction({
        action: 'saveEducation',
        education: {
          vzdelavani_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          datum: record.activityDate || payload.date || '',
          pocet_hodin: payload.hours || '',
          nazev_vzdelavani: payload.title || record.title || '',
          cislo_akreditace: payload.accreditationNumber || '',
          jmeno_pracovnika: workers[0] || '',
          jmeno_pracovnika1: workers[0] || '',
          jmeno_pracovnika2: workers[1] || '',
          jmeno_pracovnika3: workers[2] || '',
          status: 'Platný'
        }
      });
      return { ...record, id: result?.education?.vzdelavani_id || result?.vzdelavani?.vzdelavani_id || record.id };
    }

    if (record.entityType === 'supervision_records') {
      const workers = Array.isArray(payload.workers) ? payload.workers : [];
      const result = await postGoogleSheetAction({
        action: 'saveSupervision',
        supervision: {
          sepervize_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          datum: record.activityDate || payload.date || '',
          pocet_hodin: payload.hours || '',
          typ_supervize: payload.type || '',
          jmeno_pracovnika1: workers[0] || '',
          jmeno_pracovnika2: workers[1] || '',
          jmeno_pracovnika3: workers[2] || ''
        }
      });
      return { ...record, id: result?.supervision?.sepervize_id || result?.supervize?.sepervize_id || record.id };
    }

    if (record.entityType === 'plans') {
      const sourceGoals = Array.isArray(record.goals)
        ? record.goals
        : Array.isArray(payload.goals)
          ? payload.goals
          : Array.isArray(payload.structuredGoals)
            ? payload.structuredGoals
            : [];
      const normalizedGoals = sourceGoals.length
        ? sourceGoals.map((goal, index) => ({
            goalId: goal.goalId || goal.id || ('goal-' + (index + 1)),
            goalDescription: goal.goalDescription || goal.description || '',
            actionSteps: Array.isArray(goal.actionSteps) ? goal.actionSteps.join('\n') : goal.actionSteps || '',
            targetDate: goal.targetDate && typeof goal.targetDate.toDate === 'function'
              ? goal.targetDate.toDate().toISOString().slice(0, 10)
              : String(goal.targetDate || goal.deadline || '').slice(0, 10),
            isCompleted: Boolean(goal.isCompleted),
            goalEvaluation: goal.goalEvaluation || ''
          }))
        : [{
            goalId: 'goal-1',
            goalDescription: typeof payload.goals === 'string' ? payload.goals : '',
            actionSteps: payload.plannedSteps || '',
            targetDate: '',
            isCompleted: false,
            goalEvaluation: ''
          }];
      const result = await postGoogleSheetAction({
        action: 'saveIndividualPlan',
        individualPlan: {
          plan_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          klient_id: record.clientId || '',
          popis_situace: payload.situationDescription || payload.currentSituation || '',
          cile_json: JSON.stringify(normalizedGoals),
          zaverecne_vyhodnoceni: payload.finalEvaluation || '',
          accepted_plan_text: payload.acceptedPlanText || record.documentText || '',
          pocet_minut: String(payload.durationMinutes ?? '').trim() && Number.isFinite(Number(payload.durationMinutes)) ? Number(payload.durationMinutes) : 60,
          status: 'Platn\u00fd'
        }
      });
      return {
        ...record,
        id: result?.individualPlan?.plan_id || record.id,
        goals: normalizedGoals,
        payload: { ...payload, structuredGoals: normalizedGoals }
      };
    }

    if (record.entityType === 'payment_plan') {
      const result = await postGoogleSheetAction({
        action: 'savePaymentPlan',
        paymentPlan: {
          plan_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          client_id: record.clientId || '',
          creditor_type: payload.creditorType || '',
          debt_amount: Number(payload.debtAmount || 0),
          first_payment_month: payload.firstPaymentMonth || '',
          planned_installments: Number(payload.plannedInstallments || 0),
          status: payload.status || 'ACTIVE',
          installment_statuses_json: JSON.stringify(payload.installmentStatuses || {}),
          notes: payload.notes || ''
        }
      });
      const savedPlan = result?.paymentPlan || {};
      return mapPaymentPlanRowToRecord(savedPlan, clientIndex) || {
        ...record,
        id: savedPlan.plan_id || record.id
      };
    }

    if (record.clientId && payload.caseManagementMode) {
      const manualPartnerNames = Array.isArray(payload.manualPartnerNames) ? payload.manualPartnerNames.map((name) => String(name || '').trim()).filter(Boolean) : [];
      const participantNames = Array.isArray(payload.partnerNames) ? payload.partnerNames.map((name) => String(name || '').trim()).filter(Boolean) : [];
      const registeredPartnerNames = Array.isArray(payload.registeredPartnerNames) && payload.registeredPartnerNames.length ? payload.registeredPartnerNames : participantNames.filter((name) => !manualPartnerNames.includes(name));

      const result = await postGoogleSheetAction({
        action: 'saveMeeting',
        meeting: {
          meeting_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          klient_id: record.clientId || '',
          case_management_id: '',
          datum: record.activityDate || '',
          cas_od: payload.startTime || payload.ka02StartTime || '',
          cas_do: payload.endTime || payload.ka02EndTime || '',
          duration_minutes: payload.durationMinutes || '',
          pocet_hodin: payload.durationMinutes ? Math.round((Number(payload.durationMinutes) / 60) * 100) / 100 : '',
          pracovnik: record.worker || '',
          activity_codes_json: JSON.stringify(payload.activityCodes || []),
          typ_podpory: payload.consultationType || 'koordinace podpory klienta',
          tema_podpory: payload.supportArea || '',
          forma_poskytovani: 'ambulantn\u00ed',
          cil_ip_id: payload.linkedPlanGoalId || '',
          cil_ip: payload.linkedPlanGoalLabel || '',
          partner_ids: Array.isArray(payload.selectedPartnerIds) ? payload.selectedPartnerIds.join(';') : payload.selectedPartnerIds || '',
          partneri: registeredPartnerNames.join('; '),
          ucastnici: participantNames.join('; '),
          pocet_akteru: Number(payload.participantCount || 0),
          popis: payload.topics || '',
          vysledek: payload.outcome || '',
          dalsi_krok: payload.nextSteps || '',
          dokument_text: record.documentText || '',
          status: 'Platn\u00fd'
        }
      });
      return { ...record, id: result?.meeting?.meeting_id || record.id };
    }

    if (record.clientId) {
      const result = await postGoogleSheetAction({
        action: 'savePerformance',
        performance: {
          vykon_id: String(record.id || '').startsWith('local-') ? '' : record.id || '',
          klient_id: record.clientId || '',
          datum: record.activityDate || '',
          cas_od: payload.startTime || payload.ka02StartTime || '',
          cas_do: payload.endTime || payload.ka02EndTime || '',
          pocet_hodin: payload.durationMinutes ? Math.round((Number(payload.durationMinutes) / 60) * 100) / 100 : '',
          pracovnik: record.worker || '',
          typ_podpory: payload.consultationType || record.title || record.entityType || '',
          tema_podpory: payload.supportArea || payload.topics || payload.debtStage || payload.targetJob || payload.position || '',
          specificka_pole_json: JSON.stringify(payload || {}),
          ...mapKA1SupportSpecificToSheetColumns(payload.supportSpecific || {}),
          forma_poskytovani: payload.meetingForm || payload.place || '',
          meeting_form: payload.meetingForm || '',
          misto: payload.place || '',
          cil_ip_id: payload.linkedPlanGoalId || '',
          cil_ip: payload.linkedPlanGoalLabel || '',
          popis: payload.caseNote || payload.topics || payload.debtSummary || payload.themes || payload.feedback || payload.experience || '',
          case_note: payload.caseNote || payload.topics || '',
          vysledek: payload.outcome || payload.solutionPlan || payload.recommendations || payload.developmentAreas || '',
          dalsi_krok: payload.nextSteps || payload.plannedSteps || '',
          dokument_text: record.documentText || '',
          status: 'Platn\u00fd'
        }
      });
      await refreshStatisticsRows();
      return {
        ...record,
        id: result?.performance?.vykon_id || result?.performance?.performance_id || record.id
      };
    }

    return record;
  };
  const saveRecord = async (payload, options = {}) => {
    payload = {
      ...payload,
      projectId: payload.projectId || activeProjectId,
      sourceSystem: payload.sourceSystem || 'NEW_APP'
    };
    const { noticeKey = '', progressText = 'Ukládám…', successText = 'Uloženo' } = options;
    const failSave = (message) => {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', message);
      setFlash(message);
      return false;
    };
    const completeSave = () => {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'success', successText);
      return true;
    };
    const hasClientBinding = Boolean(payload.clientId || (Array.isArray(payload.clientIds) && payload.clientIds.length));
    if (hasClientBinding && !isClientRegistryAvailable) {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', 'Klientský registr není dostupný. Uložení bylo zablokováno.');
      setFlash('Klientský registr není dostupný. Uložení bylo zablokováno, aby záznam nebyl přiřazen nesprávnému klientovi.');
      return false;
    }
    const duplicateMessage = getDuplicateSaveMessage(payload);
    if (duplicateMessage) {
      return failSave(duplicateMessage);
    }
    const pendingSignature = buildDuplicateSignature(payload);
    if (pendingRecordSaveSignaturesRef.current.has(pendingSignature)) {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', 'Tento záznam se už ukládá. Vyčkejte na dokončení.');
      setFlash('Tento záznam se už ukládá. Vyčkej na dokončení ukládání.');
      return false;
    }
    if (!user && hasFirebaseConfig) {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', 'Uložení se nepodařilo. Zkontrolujte připojení a Apps Script.');
      setFlash('Ulo\u017een\u00ed do Google Sheetu se nepoda\u0159ilo. Zkontroluj p\u0159ipojen\u00ed a nasazen\u00fd Apps Script.');
      return false;
    }
    if (!user) {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', 'Záznam nelze uložit bez přihlášeného uživatele.');
      setFlash('Záznam nelze uložit bez přihlášeného uživatele.');
      return false;
    }

    pendingRecordSaveSignaturesRef.current.add(pendingSignature);
    setIsSaving(true);
    if (noticeKey) setSaveButtonNotice(noticeKey, 'progress', progressText);
    try {
      if (!hasFirebaseConfig || !db || payload.entityType === 'payment_plan') {
        const localRecord = {
          ...payload,
          id: payload.id || `local-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          createdAt: Date.now()
        };
        const syncedRecord = await syncRecordToGoogleSheet(localRecord);
        setRecords((previousRecords) => {
          const nextRecords = [
            syncedRecord,
            ...previousRecords.filter((record) => record.id !== syncedRecord.id)
          ];
          saveLocalRecords(nextRecords);
          return nextRecords;
        });
        if (syncedRecord.entityType !== 'ai_style_memory') {
          await syncRecordToGoogleDrive(syncedRecord);
        }
        return completeSave();
      }

      const recordsRef = collection(db, 'artifacts', appId, 'public', 'data', 'projectRecords');
      const recordToSave = {
        ...payload,
        createdAt: Date.now()
      };
      const docRef = await addDoc(recordsRef, recordToSave);
      const syncedRecord = await syncRecordToGoogleSheet({ ...recordToSave, id: recordToSave.id || docRef.id });
      if (syncedRecord.entityType !== 'ai_style_memory') {
        await syncRecordToGoogleDrive(syncedRecord);
      }
      return completeSave();
    } catch (error) {
      console.error('Error saving record:', error);
      return failSave(saveErrorMessage('Záznam nebyl uložen', error));
    } finally {
      pendingRecordSaveSignaturesRef.current.delete(pendingSignature);
      setIsSaving(false);
    }
  };

  const updateExistingRecord = async (recordId, payload, options = {}) => {
    const { noticeKey = '', progressText = 'Ukládám…', successText = 'Uloženo' } = options;
    const failSave = (message) => {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', message);
      setFlash(message);
      return false;
    };
    const completeSave = () => {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'success', successText);
      return true;
    };
    const existingRecord = records.find((record) => record.id === recordId);
    if (!existingRecord) {
      if (noticeKey) setSaveButtonNotice(noticeKey, 'error', 'Upravovaný záznam už v evidenci není.');
      setFlash('Upravovaný záznam už v evidenci není.');
      return false;
    }

    setIsSaving(true);
    if (noticeKey) setSaveButtonNotice(noticeKey, 'progress', progressText);
    try {
      const updatedRecord = {
        ...existingRecord,
        ...payload,
        id: existingRecord.id,
        createdAt: existingRecord.createdAt || Date.now(),
        updatedAt: Date.now()
      };

      if (
        !hasFirebaseConfig ||
        !db ||
        existingRecord.remoteSource ||
        existingRecord.entityType === 'payment_plan'
      ) {
        const syncedRecord = await syncRecordToGoogleSheet(updatedRecord);
        const nextRecords = records.map((record) => (record.id === recordId ? syncedRecord : record));
        setRecords(nextRecords);
        saveLocalRecords(nextRecords);
        if (syncedRecord.entityType !== 'ai_style_memory') {
          await syncRecordToGoogleDrive(syncedRecord);
        }
        return completeSave();
      }

      await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projectRecords', recordId), {
        ...payload,
        createdAt: existingRecord.createdAt || Date.now(),
        updatedAt: Date.now()
      });
      const syncedRecord = await syncRecordToGoogleSheet(updatedRecord);
      if (syncedRecord.entityType !== 'ai_style_memory') {
        await syncRecordToGoogleDrive(syncedRecord);
      }
      return completeSave();
    } catch (error) {
      console.error('Update record error:', error);
      return failSave(saveErrorMessage('Záznam nebyl uložen', error));
    } finally {
      setIsSaving(false);
    }
  };


  const deleteGoogleSheetRecord = async (record) => {
    if (!GOOGLE_SHEET_MACRO_URL || !record?.id || String(record.id).startsWith('local-')) return;
    let action = '';
    if (record.entityType === 'consultations') {
      action = record.ka === 'KA2' || record.payload?.caseManagementMode ? 'deleteMeeting' : 'deletePerformance';
    } else if (record.entityType === 'plans') {
      action = 'deleteIndividualPlan';
    } else if (record.entityType === 'actor_registry') {
      action = 'deletePartner';
    } else if (record.entityType === 'network_activities') {
      action = 'deleteNetworkMeeting';
    } else if (record.entityType === 'education_records') {
      action = 'deleteEducation';
    } else if (record.entityType === 'supervision_records') {
      action = 'deleteSupervision';
    } else if (record.entityType === 'payment_plan') {
      action = 'deletePaymentPlan';
    }
    if (action) {
      await postGoogleSheetAction({ action, id: record.id });
      if (action === 'deletePerformance') await refreshStatisticsRows();
    }
  };

  const deleteRecord = async (record) => {
    if (!record?.id) return;
    if (record.isLegacyReadOnly || record.sourceSystem === 'LEGACY_XLSM') {
      setFlash('Historický výkon z XLSM je v aplikaci pouze pro čtení.');
      return;
    }
    const confirmed = window.confirm(`Opravdu smazat záznam "${record.title || 'bez názvu'}"?`);
    if (!confirmed) return;

    setIsSaving(true);
    const previousRecords = records;
    const nextRecords = records.filter((item) => item.id !== record.id);
    try {
      await deleteGoogleSheetRecord(record);
      setRecords(nextRecords);
      if (!hasFirebaseConfig || !db || record.entityType === 'payment_plan') {
        saveLocalRecords(nextRecords);
        setFlash('Záznam byl smazán.');
        return;
      }

      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projectRecords', record.id));
      setFlash('Záznam byl smazán.');
    } catch (error) {
      setRecords(previousRecords);
      console.error('Delete record error:', error);
      setFlash('Záznam se nepodařilo smazat.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClientCreate = async () => {
    if (!isClientRegistryAvailable) {
      const message = 'Klientský registr není dostupný. Uložení klienta bylo zablokováno.';
      setSaveButtonNotice('client-create', 'error', message);
      setFlash(message);
      return;
    }
    clearSaveButtonNotice('client-create');
    if (!clientDraft.jmeno.trim() || !clientDraft.prijmeni.trim()) {
      const message = 'Vyplň alespoň jméno a příjmení klienta.';
      setSaveButtonNotice('client-create', 'error', message);
      setFlash(message);
      return;
    }

    const clientToSave = {
      ...clientDraft,
      projectId: activeProjectId,
      sourceSystem: 'NEW_APP'
    };

    const duplicateClient = findDuplicateClient(clientToSave);
    if (duplicateClient) {
      setSelectedClientId(duplicateClient.id);
      const message = `Klient už v registru existuje: ${duplicateClient.fullName || 'bez jména'}.`;
      setSaveButtonNotice('client-create', 'error', message);
      setFlash(message);
      return;
    }

    const pendingSignature = buildClientDuplicateSignature(clientToSave);
    if (pendingClientSaveSignaturesRef.current.has(pendingSignature)) {
      const message = 'Tento klient se už ukládá. Vyčkej na dokončení ukládání.';
      setSaveButtonNotice('client-create', 'progress', message);
      setFlash(message);
      return;
    }

    pendingClientSaveSignaturesRef.current.add(pendingSignature);
    setIsSaving(true);
    setSaveButtonNotice('client-create', 'progress', 'Ukládám klienta…');
    try {
      const result = await postGoogleSheetAction({
        action: 'saveClient',
        client: mapClientDraftToSheetClient(clientToSave, '', activeProjectId)
      });
      if (!result?.client?.klient_id) throw new Error('Google Sheet nevr\u00e1til ID klienta.');
      const savedClient = mapSheetRowToClient(result.client, clients.length);
      if (!savedClient) throw new Error('Ulo\u017een\u00e9ho klienta se nepoda\u0159ilo na\u010d\u00edst.');

      setClients((prev) => [savedClient, ...prev.filter((client) => client.id !== savedClient.id)]);
      setSelectedClientId(savedClient.id);
      setClientDraft({ ...emptyClientDraft, datumVstupu: todayIso() });
      setSheetError('');
      setSaveButtonNotice('client-create', 'progress', 'Klient uložen, vytvářím kompletní klientskou složku…');
      const folderCreated = await provisionClientDriveFolder(savedClient, { silent: true, manageState: false });
      if (folderCreated) {
        setSaveButtonNotice('client-create', 'success', 'Klient a kompletní klientská složka vytvořeny');
        setFlash('Klientská složka včetně smlouvy, souhlasu a monitorovacího listu byla vytvořena.');
      } else {
        const message = 'Klient byl uložen, ale kompletní klientskou složku se nepodařilo vytvořit.';
        setSaveButtonNotice('client-create', 'error', message);
        setFlash(message);
      }
    } catch (error) {
      console.error('Google Sheets client save error:', error);
      const message = saveErrorMessage('Klient nebyl uložen', error);
      setSaveButtonNotice('client-create', 'error', message);
      setFlash(message);
    } finally {
      pendingClientSaveSignaturesRef.current.delete(pendingSignature);
      setIsSaving(false);
    }
  };

  const openClientEditForm = (client = selectedClient) => {
    if (!client) return;
    clearSaveButtonNotice('client-update');
    setClientEditDraft({
      ...emptyClientDraft,
      ...client
    });
    setSelectedClientId(client.id);
    setShowClientEditForm(true);
  };

  const handleClientUpdate = async () => {
    if (!isClientRegistryAvailable) {
      const message = 'Klientský registr není dostupný. Úprava klienta byla zablokována.';
      setSaveButtonNotice('client-update', 'error', message);
      setFlash(message);
      return;
    }
    if (!selectedClient) return;
    clearSaveButtonNotice('client-update');
    if (!clientEditDraft.jmeno.trim() || !clientEditDraft.prijmeni.trim()) {
      const message = 'Vyplň alespoň jméno a příjmení klienta.';
      setSaveButtonNotice('client-update', 'error', message);
      setFlash(message);
      return;
    }

    const targetClientId = clientEditDraft.id || selectedClient.id;
    const duplicateClient = findDuplicateClient(clientEditDraft, targetClientId);
    if (duplicateClient) {
      const message = `Klient s t\u011bmito \u00fadaji u\u017e v registru existuje: ${duplicateClient.fullName || 'bez jm\u00e9na'}.`;
      setSaveButtonNotice('client-update', 'error', message);
      setFlash(message);
      return;
    }

    setIsSaving(true);
    setSaveButtonNotice('client-update', 'progress', 'Ukládám úpravy…');
    try {
      const result = await postGoogleSheetAction({
        action: 'saveClient',
        client: mapClientDraftToSheetClient(
          clientEditDraft,
          targetClientId,
          selectedClient.projectId || activeProjectId
        )
      });
      if (!result?.client?.klient_id) throw new Error('Google Sheet nevr\u00e1til ID klienta.');
      const savedClient = mapSheetRowToClient(result.client, clients.findIndex((client) => client.id === targetClientId));
      if (!savedClient) throw new Error('Upraven\u00e9ho klienta se nepoda\u0159ilo na\u010d\u00edst.');

      setClients((prev) => prev.map((client) => (client.id === targetClientId ? savedClient : client)));
      setSelectedClientId(savedClient.id);
      setSheetError('');
      setSaveButtonNotice('client-update', 'success', 'Klient uložen');
      setFlash('Klient uložen');
      setShowClientEditForm(false);
    } catch (error) {
      console.error('Google Sheets client update error:', error);
      const message = saveErrorMessage('Klient nebyl uložen', error);
      setSaveButtonNotice('client-update', 'error', message);
      setFlash(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateText = async () => {
    if (!generatorClient) {
      setFlash('Vyber klienta, pro kterého chceš výstup připravit.');
      return;
    }
    const selectedTpmRecord =
      generatorDraft.selectedKey === 'mentor'
        ? tpmRecords.find((record) => record.id === generatorDraft.tpmRecordId) || null
        : null;
    if (generatorDraft.selectedKey === 'mentor' && !selectedTpmRecord) {
    }
    if (isPhysicalSignedFiledOutreach(generatorDraft)) {
      const physicalText = buildPhysicalSignedFiledOutreachText();
      setGeneratedText(physicalText);
      setLastGeneratedText(physicalText);
      setGeneratorDraft((prev) => ({ ...prev, topics: '', outcome: '', nextSteps: '', generatedText: physicalText }));
      setGenerationNotice('Zápis je fyzicky podepsán a založen. Elektronický text byl vytvořen bez vyplnění polí Popis, Výsledek a Navazující krok.');
      setFlash('Zápis pro fyzicky založenou depistáž byl připraven.');
      setAiGenerationStatus('success');
      return;
    }

    setIsGenerating(true);
    setAiGenerationStatus('loading');
    setGeneratedText('');
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const aiModel = selectedAiModel || DEFAULT_AI_MODEL;
    setGenerationNotice(`Generuji text přes ${aiModel}...`);
    const maxOutputTokens = generatorDraft.selectedKey === 'therapy' ? 8192 : 4096;
    if (!apiKey) {
      const fallback = buildFallbackGeneratedText(generatorConfig.label, generatorClient, generatorDraft);
      setGeneratedText(fallback);
      setLastGeneratedText(fallback);
      setGeneratorDraft((prev) => ({ ...prev, generatedText: fallback }));
      setGenerationNotice('Gemini API klíč není nastavený. Zobrazuji pracovní návrh z formuláře.');
      setFlash('AI klíč není nastavený. Vytvořil jsem bezpečný pracovní návrh textu z formuláře.');
      setAiGenerationStatus('warning');
      setIsGenerating(false);
      return;
    }

    const previousRecordContext = redactClientIdentifiers(buildPreviousRecordsContext(previousGeneratorRecords), generatorClient);
    const styleMemoryContext = redactClientIdentifiers(buildStyleMemoryContext(records, {
      selectedKey: generatorDraft.selectedKey,
      worker: generatorDraft.worker,
      maxItems: 3
    }), generatorClient);
    const isPersonalDevelopmentPlan = generatorDraft.selectedKey === 'plan';
    const effectiveGeneratorKa = getEffectiveGeneratorKa(generatorConfig, generatorDraft);
    const kaActivityContext = effectiveGeneratorKa === 'KA2' || effectiveGeneratorKa === 'KA02'
      ? KA02_ACTIVITY_AI_CONTEXT
      : '';
    const kaContextInstruction = kaActivityContext
      ? `Metodický kontext ${generatorConfig.ka} pro pochopení podpory:\n${kaActivityContext}\n\nTento kontext použij k věcnému zaměření výstupu, ale neopisuj jej mechanicky do zápisu.`
      : '';
    const outputModeInstruction = isPersonalDevelopmentPlan
      ? 'Lehká výjimka: u Plánu osobního rozvoje může být výstup plánovým projektovým dokumentem s cíli, bariérami a navazujícími kroky podpory. I zde ale vycházej pouze ze zadaných údajů a z role zvoleného pracovníka.'
      : `Zásadní pravidlo: výstup musí být vždy zápis o poskytnuté projektové podpoře v ${effectiveGeneratorKa || 'příslušné KA'}, ne hotový dokument pro klienta k přímému použití. Zohledni zaměření zvolené podpory "${generatorConfig.label}" a roli zvoleného pracovníka "${generatorDraft.worker || 'Neuvedeno'}".`;
    const mentorContextInstruction = (() => {
      if (generatorDraft.selectedKey !== 'mentor' || !selectedTpmRecord) return '';
      const tpmPayload = selectedTpmRecord.payload || {};
      const ka02RecordsForClient = records
        .filter((record) => record.clientId === generatorClient.id && ['plans', 'consultations', 'debt_cases', 'therapy_sessions', 'cv_outputs', 'job_simulators'].includes(record.entityType))
        .sort((a, b) => (`${b.activityDate || ''}-${b.createdAt || 0}`).localeCompare(`${a.activityDate || ''}-${a.createdAt || 0}`))
        .slice(0, 8);
      const ka02Context = ka02RecordsForClient.length
        ? ka02RecordsForClient
            .map((record, index) => {
              const text = cleanGeneratedText(record.documentText || '').replace(/\s+/g, ' ').trim();
              const brief = text ? text.slice(0, 260) : '';
              return `${index + 1}. ${record.activityDate || 'Bez data'} | ${record.title || record.entityType}${brief ? ` | ${brief}` : ''}`;
            })
            .join('\n')
        : 'Nebyly nalezeny dřívější zápisy klienta v KA02.';

      return [
        'Důležité: při tvorbě zprávy mentora vycházej z konkrétního vybraného TPM a z historie podpory klienta v KA02.',
        `Vybrané TPM (ID: ${selectedTpmRecord.id}):`,
        `- Klient: ${selectedTpmRecord.clientName || generatorClient.fullName}`,
        `- Zaměstnavatel: ${tpmPayload.employer || 'Neuvedeno'}`,
        `- Začátek TPM: ${tpmPayload.startDate || selectedTpmRecord.activityDate || 'Neuvedeno'}`,
        `- Konec TPM: ${tpmPayload.endDate || 'Neuvedeno'}`,
        `- Plánované měsíce: ${tpmPayload.plannedMonths ?? 'Neuvedeno'}`,
        `- Skutečné měsíce: ${tpmPayload.actualMonths ?? 'Neuvedeno'}`,
        '',
        'Dřívější zápisy klienta v KA02 (kontext):',
        ka02Context,
        '',
        'Tyto informace použij jako kontext pro průběh TPM, dosažený pokrok a realistická doporučení. Nic si nevymýšlej.'
      ].join('\n');
    })();

    const exactGeneratorFacts = buildExactGeneratorFacts(generatorConfig, generatorDraft);
    const promptParts = [
      {
        text: exactGeneratorFacts
      },
      {
        text: buildSafeGeneratorUserPrompt(generatorConfig, generatorClient, generatorDraft)
      },
      {
        text: 'Zásadní pravidlo pro práci s fakty: výsledný zápis smí obsahovat pouze skutečnosti uvedené v části AKTUÁLNÍ AKTIVITA a v aktuálních poznámkách pracovníka. Kontext z předchozích záznamů a stylovou paměť použij jen pro návaznost, tón a strukturu. Nepřebírej z nich konkrétní úkony, služby, instituce, výsledky, dohody, termíny ani navazující kroky, pokud nejsou výslovně uvedeny v aktuální aktivitě. Pokud Popis, Výsledek nebo Navazující krok nejsou vyplněné, nesmíš si je domyslet.'
      },
      {
        text: outputModeInstruction
      },
      ...(kaContextInstruction ?[{ text: kaContextInstruction }] : []),
      {
        text: 'Registrační údaje klienta jako postavení na trhu práce, vzdělání a znevýhodnění používej jen jako tichý kontext pro pochopení situace. Nevypisuj je ve výstupu mechanicky jako samostatné řádky. Pokud je hodnota neuvedená nebo nepodstatná pro konkrétní podporu, úplně ji vynech. Nikdy nepiš formulace typu "Znevýhodnění: Neuvedeno (bude doplněno při další spolupráci)".'
      },
      {
        text: 'Při zpracování vstupu oprav překlepy, pravopis a drobné jazykové chyby do spisovné češtiny, ale neměň význam, nedoplňuj fakta a nic si nevymýšlej.'
      }
    ];
    if (generatorDraft.bulletNotes.trim()) {
      promptParts.push({
        text: `Poznámky pracovníka v bodech nebo heslech:\n${redactClientIdentifiers(generatorDraft.bulletNotes.trim(), generatorClient)}\n\nZ těchto bodů vytvoř souvislý, čistý a věcný zápis.`
      });
    }
    if (previousRecordContext) {
      promptParts.push({
        text: previousRecordContext
      });
    }
    if (styleMemoryContext) {
      promptParts.push({
        text: styleMemoryContext
      });
    }
    if (mentorContextInstruction) {
      promptParts.push({
        text: mentorContextInstruction
      });
    }

    const payload = {
      contents: [
        {
          role: 'user',
          parts: promptParts /*
            {
              text: generatorConfig.buildUserPrompt({
                client: generatorClient,
                fields: generatorDraft
              })
            },
            {
              text: 'Při zpracování vstupu oprav překlepy, pravopis a drobné jazykové chyby do spisovné češtiny, ale neměň význam, nedoplňuj fakta a nic si nevymýšlej.'
            }
          */,
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: `Závazná data z formuláře: KA je "${effectiveGeneratorKa}", datum aktivity je "${generatorDraft.date || todayIso()}" a délka podpory je "${formatSupportDuration(getGeneratorSupportMinutes(generatorDraft))}". Tyto hodnoty ve výstupu použij přesně, neměň je a nedoplňuj jiné datum ani jiný rozsah podpory.`
          },
          {
            text: `${generatorConfig.buildSystemPrompt({ fields: sanitizeAiInput(generatorDraft) })}${kaContextInstruction ?`\n\n${kaContextInstruction}` : ''}\n\nNadřazené pravidlo pro typ výstupu: ${
              isPersonalDevelopmentPlan
                ? 'u Plánu osobního rozvoje vytváříš plánový projektový dokument; nejde o běžný zápis z konzultace, ale pořád musí odpovídat zadaným údajům, zaměření podpory a zvolenému pracovníkovi.'
                : 'vytváříš zápis o poskytnuté podpoře a pracovní aktivitě v projektu. Nevytvářej finální externí dokument pro klienta, pokud by to odporovalo zápisu do klientské složky.'
            } Text musí odpovídat zaměření podpory "${generatorConfig.label}" a zvolenému pracovníkovi "${generatorDraft.worker || 'Neuvedeno'}".\n\nRegistrační údaje klienta jako postavení na trhu práce, vzdělání a znevýhodnění jsou pouze kontext. Nevkládej je automaticky do výstupu jako samostatné položky. Vypiš je jen tehdy, když jsou věcně důležité pro konkrétní podporu nebo u Plánu osobního rozvoje pro stručnou identifikaci klienta. Neuvedené hodnoty zcela vynech.\n\nFormát výstupu: používej pouze čistý prostý text bez Markdownu. Nepoužívej hvězdičky, tučné zvýraznění, markdown nadpisy, odrážky s pomlčkou ani kódové bloky. Nadpisy piš jako běžné řádky bez speciálních znaků.`
          }
        ]
      },
      generationConfig: {
        temperature: 0.18,
        topP: 0.9,
        maxOutputTokens: generatorDraft.selectedKey === 'consultation' ? 1200 : Math.min(maxOutputTokens, 2500),
        ...(generatorDraft.selectedKey === 'consultation' ? {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              recordText: { type: 'STRING' },
              warnings: { type: 'ARRAY', items: { type: 'STRING' } }
            },
            required: ['recordText']
          }
        } : {})
      }
    };

    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`;
      const response = await fetchGemini(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message || `AI požadavek selhal se stavem ${response.status}.`);
      }
      let finalResult = result;
      let finishReason = finalResult?.candidates?.[0]?.finishReason || '';
      let usedRetry = false;
      if (finishReason === 'MAX_TOKENS') {
        const retryPayload = {
          ...payload,
          systemInstruction: {
            parts: [
              ...(payload.systemInstruction?.parts || []),
              {
                text: 'Predchozi vystup byl useknuty limitem tokenu. Vrat cely kompletni vystup v jednom celku, bez opakovani, bez markdownu, vecne a strukturovane.'
              }
            ]
          },
          generationConfig: {
            ...payload.generationConfig,
            temperature: 0.25,
            maxOutputTokens: Math.max(maxOutputTokens, 8192)
          }
        };
        const retryResponse = await fetchGemini(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(retryPayload)
        });
        const retryResult = await retryResponse.json();
        if (!retryResponse.ok) {
          throw new Error(retryResult?.error?.message || `AI opakovany pozadavek selhal se stavem ${retryResponse.status}.`);
        }
        finalResult = retryResult;
        finishReason = finalResult?.candidates?.[0]?.finishReason || '';
        usedRetry = true;
      }
      let cleanText;
      let outputCheck;
      if (generatorDraft.selectedKey === 'consultation') {
        const rawOutput = extractGeminiText(finalResult);
        let parsedOutput;
        try {
          parsedOutput = parseAiJson(rawOutput);
        } catch (parseError) {
          const repairPayload = {
            ...payload,
            contents: [{ role: 'user', parts: [{ text: `Oprav následující odpověď na validní JSON podle zadaného schématu. Nic věcně nepřidávej:
${rawOutput}` }] }],
            generationConfig: { ...payload.generationConfig, temperature: 0 }
          };
          const repairResponse = await fetchGemini(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(repairPayload) });
          const repairResult = await repairResponse.json();
          if (!repairResponse.ok) throw new Error(repairResult?.error?.message || 'Oprava JSON výstupu selhala.');
          parsedOutput = parseAiJson(extractGeminiText(repairResult));
        }
        const validated = validateRecordOutput(parsedOutput, { consultationType: generatorDraft.consultationType, client: generatorClient });
        cleanText = cleanGeneratedText(validated.recordText);
        outputCheck = { isSuspicious: false, reasons: [] };
      } else {
        cleanText = cleanGeneratedText(extractGeminiText(finalResult));
        outputCheck = inspectAiOutputCompleteness(cleanText, { finishReason });
      }
      let continuationCount = 0;

      while (outputCheck.isSuspicious && continuationCount < 3) {
        const continuationPayload = {
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: `Původní zadání dokumentu:\n${exactGeneratorFacts}\n\n${buildSafeGeneratorUserPrompt(generatorConfig, generatorClient, generatorDraft)}`
                },
                {
                  text: `Dosavadní text je pravděpodobně nedokončený. Navazuj přesně tam, kde skončil, neopakuj předchozí věty a vrať pouze pokračování textu.\n\nDosavadní text:\n${cleanText}`
                }
              ]
            }
          ],
          systemInstruction: {
            parts: [
              {
                text: `${generatorConfig.buildSystemPrompt({ fields: sanitizeAiInput(generatorDraft) })}\n\nVrať pouze pokračování již rozepsaného dokumentu. Neopakuj začátek, nepřidávej omluvu ani technické vysvětlení. Zachovej prostý text bez Markdownu a dokonči rozpracovanou myšlenku přirozeně česky.`
              }
            ]
          },
          generationConfig: {
            temperature: 0.25,
            maxOutputTokens: generatorDraft.selectedKey === 'therapy' ? 4096 : 2048
          }
        };

        const continuationResponse = await fetchGemini(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(continuationPayload)
        });
        const continuationResult = await continuationResponse.json();
        if (!continuationResponse.ok) {
          throw new Error(continuationResult?.error?.message || `Doplnění pokračování selhalo se stavem ${continuationResponse.status}.`);
        }

        const continuationText = cleanGeneratedText(extractGeminiText(continuationResult));
        if (!continuationText) break;
        cleanText = cleanGeneratedText(`${cleanText}\n\n${continuationText}`);
        finishReason = continuationResult?.candidates?.[0]?.finishReason || '';
        outputCheck = inspectAiOutputCompleteness(cleanText, { finishReason });
        continuationCount += 1;
      }

      setGeneratedText(cleanText);
      setLastGeneratedText(cleanText);
      setGeneratorDraft((prev) => ({ ...prev, generatedText: cleanText }));
      setGenerationNotice(`AI text byl vygenerován (${cleanText.length} znaků). Výsledek je v poli "Výstup dokumentu" níže.`);
      setFlash(`AI text byl vygenerován (${cleanText.length} znaků).`);
      setAiGenerationStatus('success');
    } catch (error) {
      console.error('Generate error:', error);
      const fallback = buildFallbackGeneratedText(generatorConfig.label, generatorClient, generatorDraft);
      setGeneratedText(fallback);
      setLastGeneratedText(fallback);
      setGeneratorDraft((prev) => ({ ...prev, generatedText: fallback }));
      setGenerationNotice(`${error.message || 'Generování selhalo.'} Zobrazuji pracovní návrh z formuláře.`);
      setFlash(error.message || 'Generování selhalo. Používám pracovní text vytvořený z vyplněných polí.');
      setAiGenerationStatus('error');
    } finally {
      setIsGenerating(false);
    }
  };

  const getGeneratedOutputMissingFields = () => {
    const missing = [];
    if (!generatorClient) missing.push('klient');
    if (!String(generatorDraft.date || '').trim()) missing.push('datum aktivity');
    if (!String(generatorDraft.worker || '').trim()) missing.push('pracovník');
    if (generatorDraft.selectedKey !== 'plan' && !String(generatorDraft.linkedPlanGoalId || '').trim()) missing.push('cíl IP');
    if (generatorDraft.selectedKey === 'plan' && (!Number.isFinite(Number(generatorDraft.planDurationMinutes)) || Number(generatorDraft.planDurationMinutes) <= 0)) {
      missing.push('kladný čas podpory v minutách');
    }
    if (generatorDraft.selectedKey === 'consultation') {
      if (!String(generatorDraft.ka02StartTime || '').trim()) missing.push('čas OD');
      if (!String(generatorDraft.ka02EndTime || '').trim()) missing.push('čas DO');
      const startMinutes = timeToMinutesForSupport(generatorDraft.ka02StartTime);
      const endMinutes = timeToMinutesForSupport(generatorDraft.ka02EndTime);
      if (generatorDraft.ka02StartTime && generatorDraft.ka02EndTime && startMinutes !== null && endMinutes !== null && endMinutes <= startMinutes) missing.push('platný čas OD–DO');
      if (!String(generatorDraft.consultationType || '').trim()) missing.push('typ podpory');
      if (!String(generatorDraft.supportArea || '').trim()) missing.push('oblast podpory');
      if (!generatorDraft.caseManagementMode && !String(generatorDraft.ka02Place || '').trim()) missing.push('forma poskytování');
    }
    if (!String(generatedText || '').trim()) missing.push('výstup dokumentu');
    return [...new Set(missing)];
  };

  const resetGeneratedDocumentFormAfterSave = () => {
    const nextClientId = selectedClientId || generatorDraft.clientId || accessibleClients[0]?.id || '';
    const nextWorker = currentWorker || generatorDraft.worker || WORKERS[0];
    const nextSelectedKey = generatorDraft.selectedKey || emptyGeneratorDraft.selectedKey;
    const keepCaseManagementMode = Boolean(generatorDraft.caseManagementMode);

    setGeneratedText('');
    setLastGeneratedText('');
    setGeneratorDraft({
      ...emptyGeneratorDraft,
      selectedKey: nextSelectedKey,
      clientId: nextClientId,
      worker: nextWorker,
      date: todayIso(),
      caseManagementMode: keepCaseManagementMode,
      ka02Place: keepCaseManagementMode ? 'ambulantní' : ''
    });
    setGenerationNotice('');
    setAiGenerationStatus('idle');
    setCopied(false);
  };

  const handleSaveGeneratedOutput = async () => {
    const missingFields = getGeneratedOutputMissingFields();
    if (missingFields.length) {
      const message = 'Dokument nelze uložit. Doplňte: ' + missingFields.join(', ') + '.';
      setSaveNotice({ tone: 'error', text: message });
      setFlash(message);
      return false;
    }
    const selectedTpmRecord =
      generatorDraft.selectedKey === 'mentor'
        ? tpmRecords.find((record) => record.id === generatorDraft.tpmRecordId) || null
        : null;
    if (generatorDraft.selectedKey === 'mentor' && !selectedTpmRecord) {
      setFlash('Pro zprávu mentora vyber uložené TPM.');
      return;
    }
    if (!generatorClient) {
      setFlash('Vyber klienta.');
      return;
    }
    const isOneTimeOrder = generatorDraft.linkedPlanGoalId === 'one-time-order';
    if (
      generatorDraft.selectedKey !== 'plan' &&
      (!generatorDraft.linkedPlanGoalId || (!isOneTimeOrder && !generatorPlanGoalOptions.some((goal) => goal.value === generatorDraft.linkedPlanGoalId)))
    ) {
      setFlash(generatorPlanGoalOptions.length ? 'Vyber cíl z plánu osobního rozvoje.' : 'Nejdřív doplň cíl v plánu osobního rozvoje klienta.');
      return;
    }
    if (!generatedText.trim()) {
      setFlash('Nejprve vygeneruj nebo doplň text výstupu.');
      return;
    }

    const isPerformanceSave = generatorDraft.selectedKey === 'consultation';
    const savedClientReference = `${generatorClient.fullName || generatorClient.id || 'vybraný klient'}${generatorClient.id ? ` (${generatorClient.id})` : ''}`;
    const savedPerformanceConfirmation = `Výkon byl uložen klientovi ${savedClientReference}.`;
    setSaveNotice({
      tone: 'progress',
      text: isPerformanceSave ? `Ukládám výkon klientovi ${savedClientReference}…` : 'Dokument se ukládá…'
    });

    if (generatedOutputSaveLockRef.current) {
      setSaveNotice({ tone: 'progress', text: 'Výkon se již ukládá…' });
      setFlash('Výkon se již ukládá. Vyčkejte na dokončení.');
      return false;
    }
    generatedOutputSaveLockRef.current = true;

    try {
      const payload = buildGeneratorRecord({
        client: generatorClient,
        generatorDraft,
        generatedText,
        selectedTpmRecord
      });

    let ok = false;
    if (editingGeneratedRecordId) {
      ok = await updateExistingRecord(editingGeneratedRecordId, payload);
    } else if (generatorDraft.selectedKey === 'mentor' && payload.payload?.tpmRecordId) {
      const existingMentorReport = records
        .filter((record) => record.entityType === 'mentor_report_document')
        .find((record) => record.payload?.tpmRecordId === payload.payload.tpmRecordId);

      if (existingMentorReport) {
        setIsSaving(true);
        try {
          const updatedRecord = {
            ...existingMentorReport,
            ...payload,
            id: existingMentorReport.id,
            createdAt: existingMentorReport.createdAt || Date.now(),
            updatedAt: Date.now()
          };

          if (!hasFirebaseConfig || !db) {
            const nextRecords = records.map((record) => (record.id === existingMentorReport.id ? updatedRecord : record));
            setRecords(nextRecords);
            saveLocalRecords(nextRecords);
            ok = true;
          } else {
            await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'projectRecords', existingMentorReport.id), {
              ...payload,
              createdAt: existingMentorReport.createdAt || Date.now(),
              updatedAt: Date.now()
            });
            ok = true;
          }
        } catch (error) {
          console.error('Mentor report update error:', error);
          setFlash('Aktualizace zprávy mentora selhala.');
          ok = false;
        } finally {
          setIsSaving(false);
        }
      } else {
        ok = await saveRecord(payload);
      }
    } else {
      ok = await saveRecord(payload);
    }
    if (!ok) {
      setSaveNotice({ tone: 'error', text: 'Uložení dokumentu selhalo. Zkontrolujte připojení a zkuste to znovu.' });
      return false;
    }

    if (editingGeneratedRecordId) {
      setEditingGeneratedRecordId('');
      resetGeneratedDocumentFormAfterSave();
      const editConfirmation = isPerformanceSave
        ? `Výkon byl upraven u klienta ${savedClientReference}.`
        : 'Záznam byl upraven.';
      setFlash(`${editConfirmation} Formulář byl vymazán.`);
      setSaveNotice({ tone: 'success', text: isPerformanceSave ? editConfirmation : 'Uloženo' });
      return true;
    }

    const generatorPromptSnapshot = buildSafeGeneratorUserPrompt(generatorConfig, generatorClient, generatorDraft);
    const styleMemoryRecord = buildAiStyleMemoryRecord({
      client: generatorClient,
      generatorDraft,
      generatedText,
      promptText: [generatorPromptSnapshot, generatorDraft.bulletNotes || ''].filter(Boolean).join('\n\n'),
      config: generatorConfig
    });
    const memoryOk = await saveRecord(styleMemoryRecord);
    resetGeneratedDocumentFormAfterSave();
    if (memoryOk) {
      setFlash(
        isPerformanceSave
          ? `${savedPerformanceConfirmation} Formulář byl vymazán.`
          : 'Strukturovaný záznam, dokument i anonymizovaná AI stylová paměť byly uloženy. Formulář byl vymazán.'
      );
      setSaveNotice({ tone: 'success', text: isPerformanceSave ? savedPerformanceConfirmation : 'Uloženo' });
      return true;
    }
    setFlash(
      isPerformanceSave
        ? `${savedPerformanceConfirmation} Pomocná AI stylová paměť se neuložila. Formulář byl vymazán.`
        : 'Záznam a dokument byly uloženy, ale AI stylová paměť se neuložila. Formulář byl vymazán.'
    );
    setSaveNotice({
      tone: 'warning',
      text: isPerformanceSave
        ? `${savedPerformanceConfirmation} Pomocná AI stylová paměť se neuložila.`
        : 'Dokument byl uložen, ale nepodařilo se uložit pomocnou AI stylovou paměť. Formulář byl vymazán.'
    });
    return true;
    } finally {
      generatedOutputSaveLockRef.current = false;
    }
  };

  const handleExportPlanTemplateDocx = async () => {
    if (!generatorClient) {
      setFlash('Vyber klienta pro export plánu.');
      return;
    }
    if (generatorDraft.selectedKey !== 'plan') {
      setFlash('DOCX šablona je zatím připravena jen pro individuální plán rozvoje.');
      return;
    }
    if (!generatedText.trim()) {
      setFlash('Nejprve vygeneruj text plánu.');
      return;
    }

    try {
      const response = await fetch('/api/export-plan-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(buildPlanTemplatePayload(generatorClient, generatorDraft, generatedText))
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Export DOCX selhal.');
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `plan-osobniho-rozvoje-${slugify(generatorClient.fullName)}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(href);
      setFlash('Plán byl exportován do DOCX podle tabulkové šablony.');
    } catch (error) {
      console.error('Plan DOCX export error:', error);
      setFlash(error.message || 'Export plánu do DOCX selhal.');
    }
  };

  const renderAiDocumentPanel = ({ allowedKeys, title, description, hideStyleFeedback = false, panelClassName = '', lockClientSelection = false, watermarkText = '' }) => (
    <AiDocumentPanel
      allowedKeys={allowedKeys}
      title={title}
      description={description}
      reportPrompts={REPORT_PROMPTS}
      generatorDraft={generatorDraft}
      setGeneratorDraft={setGeneratorDraft}
      clients={accessibleClients}
      tpmRecords={tpmRecords}
      workers={WORKERS}
      lockClientSelection={lockClientSelection}
      lockedClientId={generatorDraft.clientId}
      lockedClientName={clientIndex[generatorDraft.clientId]?.fullName || ''}
      watermarkText={watermarkText}
      generatedText={generatedText}
      setGeneratedText={setGeneratedText}
      lastGeneratedText={lastGeneratedText}
      generationNotice={generationNotice}
      aiGenerationStatus={aiGenerationStatus}
      isGenerating={isGenerating}
      isSaving={isSaving}
      saveNotice={saveNotice}
      saveMissingFields={getGeneratedOutputMissingFields()}
      onClearSaveNotice={() => setSaveNotice(null)}
      onGenerate={handleGenerateText}
      onSave={handleSaveGeneratedOutput}
      onExportPlan={handleExportPlanTemplateDocx}
      planGoalOptions={generatorPlanGoalOptions}
      partners={records.filter((record) => record.entityType === 'actor_registry')}
      hideStyleFeedback={hideStyleFeedback}
      panelClassName={panelClassName}
    />
  );
  const handleSaveKa01Assessment = async () => {
    const client = clientIndex[ka01Draft.assessmentClientId];
    if (!client) {
      setFlash('Vyber klienta pro posouzení vstupu.');
      return;
    }

    const ok = await saveRecord({
      entityType: 'eligibility_assessments',
      ka: 'KA01',
      title: `Posouzení vstupu - ${client.fullName}`,
      activityDate: ka01Draft.date,
      worker: ka01Draft.worker,
      clientId: client.id,
      clientIds: [client.id],
      clientName: client.fullName,
      payload: {
        formalCriteriaMet: ka01Draft.formalCriteriaMet,
        contentCriteriaCount: Number(ka01Draft.contentCriteriaCount || 0),
        motivationLevel: ka01Draft.motivationLevel,
        decision: ka01Draft.decision,
        waitingList: ka01Draft.waitingList,
        rationale: ka01Draft.rationale
      }
    });

    if (ok) {
      setFlash('Vstupní posouzení bylo uloženo.');
      setKa01Draft((prev) => ({ ...prev, rationale: '' }));
    }
  };

  const polishKa01NetworkDraft = async ({ force = false } = {}) => {
    if (!force && ka01Draft.networkDescription.trim()) {
      return ka01Draft;
    }

    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const aiModel = selectedAiModel || DEFAULT_AI_MODEL;
    if (!apiKey) {
      setFlash('AI korektura aktivity tvorby s\u00edt\u011b nen\u00ed dostupn\u00e1, proto\u017ee nen\u00ed nastaven\u00fd Gemini API kl\u00ed\u010d. Aktivita nebyla ulo\u017eena.');
      return null;
    }

    const currentParticipantNames = (ka01Draft.networkActorEntries || [])
      .map((entry) => getKa01ActorDisplayName(entry))
      .filter(Boolean);
    const currentParticipants = currentParticipantNames.join(', ') || String(ka01Draft.networkParticipants || '').trim();
    const currentParticipantCount = currentParticipantNames.length || Number(ka01Draft.networkCount || 0);
    try {
      const response = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: KA2_NETWORK_SYSTEM_PROMPT }] },
          contents: [
            {
              role: 'user',
              parts: [
                {
                  text: [
                    'Vytvo\u0159 souvisl\u00fd projektov\u00fd z\u00e1pis aktivity KA02-Tvorba s\u00edt\u011b.',
                    KA01_ACTIVITY_AI_CONTEXT,
                    'Piš česky, věcně a auditně obhajitelně. Rozsah přizpůsob typu a obsahu aktivity. Nevymýšlej osoby, rozhodnutí, úkoly, odpovědnosti ani termíny. Vrať pouze JSON se všemi poli description, outcome a nextSteps.',
                    getKa01PhaseGuidance(),
                    getKa01ActivityTypeGuidance(ka01Draft.networkType),
                    '',
                    'Dostupn\u00e1 data:',
                    'Typ aktivity: ' + (ka01Draft.networkType || ''),
                    'Po\u010det \u00fa\u010dastn\u00edk\u016f: ' + currentParticipantCount,
                    'Zapojen\u00e9 osoby: ' + currentParticipants,
                    'M\u00edsto: ' + (ka01Draft.networkPlace || ''),
                    'Popis: ' + (ka01Draft.networkNotes || '')
                  ].join('\n')
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              required: ['description', 'outcome', 'nextSteps'],
              properties: {
                description: { type: 'STRING' },
                outcome: { type: 'STRING' },
                nextSteps: { type: 'STRING' }
              }
            }
          }
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || 'AI korektura selhala.');
      const finishReason = result?.candidates?.[0]?.finishReason || '';
      if (finishReason === 'MAX_TOKENS') {
        throw new Error('AI vrátila useknutý text kvůli limitu délky. Aktivita nebyla uložena, zkus text zkrátit nebo uložit znovu.');
      }
      const parsed = parseAiJson(extractGeminiText(result));
      const description = cleanGeneratedText(parsed.description || '').trim() || 'Neuvedeno';
      const outcome = cleanGeneratedText(parsed.outcome || '').trim() || 'Neuvedeno';
      const nextSteps = cleanGeneratedText(parsed.nextSteps || '').trim() || 'Neuvedeno';
      const isTeamMeeting = String(ka01Draft.networkType || '').trim().toLocaleLowerCase('cs') === 'porada';
      const outcomeLabel = isTeamMeeting ? 'Úkoly' : 'Výsledek';
      const nextStepsLabel = isTeamMeeting ? 'Termín a témata dalšího jednání' : 'Navazující krok';
      const aiDescription = [
        `Popis: ${description}`,
        `${outcomeLabel}: ${outcome}`,
        `${nextStepsLabel}: ${nextSteps}`
      ].join('\n\n');
      return {
        ...ka01Draft,
        networkOutcome: outcome,
        networkNextSteps: nextSteps,
        networkDescription: aiDescription
      };
    } catch (error) {
      console.warn('KA01 AI polish skipped:', error);
      setFlash(error.message || 'AI korektura aktivity tvorby s\u00edt\u011b se nepoda\u0159ila. Aktivita nebyla ulo\u017eena.');
      return null;
    }
  };

  const handleGenerateKa01NetworkDescription = async () => {
    if (!String(ka01Draft.networkNotes || '').trim()) {
      setFlash('Nejprve vypl\u0148 popis.');
      return;
    }
    setIsSaving(true);
    try {
      const polishedDraft = await polishKa01NetworkDraft({ force: true });
      if (!polishedDraft) return;
      setKa01Draft(polishedDraft);
      setFlash('N\u00e1vrh z\u00e1pisu byl vygenerov\u00e1n.');
    } finally {
      setIsSaving(false);
    }
  };
  const persistKa01Network = async () => {
    if (!String(ka01Draft.networkStartTime || '').trim() || !String(ka01Draft.networkEndTime || '').trim()) {
      setSaveButtonNotice('network', 'error', 'Aktivita nebyla uložena: doplňte čas od a do.');
      setKa01NetworkTimeError('Nutn\u00e9 doplnit \u010das od a do.');
      return;
    }
    if (!String(ka01Draft.networkNotes || '').trim()) {
      setSaveButtonNotice('network', 'error', 'Aktivita nebyla uložena: vyplňte popis.');
      setFlash('Vypl\u0148 popis.');
      return;
    }
    setKa01NetworkTimeError('');
    setIsSaving(true);
    const polishedDraft = await polishKa01NetworkDraft();
    setIsSaving(false);
    if (!polishedDraft) {
      setSaveButtonNotice('network', 'error', 'Aktivita nebyla uložena: příprava zápisu selhala.');
      return;
    }
    setKa01Draft(polishedDraft);

    const participantNames = normalizeKa01ActorEntries(polishedDraft.networkActorEntries)
      .map((entry) => getKa01ActorDisplayName(entry))
      .filter(Boolean);
    const isTeamMeeting = String(polishedDraft.networkType || '').toLowerCase() === 'porada';
    const partnerRecords = ka01ActorRegistryRecords.filter((record) =>
      participantNames.includes(String(record.payload?.name || '').trim())
    );
    const partnerNames = partnerRecords.map((record) => String(record.payload?.name || '').trim()).filter(Boolean);
    const partnerIds = partnerRecords.map((record) => record.id).filter(Boolean);
    const rtMembers = isTeamMeeting ? participantNames.filter((name) => WORKERS.includes(name)) : [];
    const knownNames = new Set([...rtMembers, ...partnerNames]);
    const otherPeople = participantNames.filter((name) => !knownNames.has(name));
    const count = participantNames.length;

    if (!editingKa01NetworkRecordId && !ka01NetworkPendingIdRef.current) {
      ka01NetworkPendingIdRef.current = 'SCHUZKA-SITE-WEB-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8);
    }
    const recordPayload = {
      id: editingKa01NetworkRecordId || ka01NetworkPendingIdRef.current,
      entityType: 'network_activities',
      ka: 'KA2',
      title: 'KA02 - ' + polishedDraft.networkType,
      activityDate: polishedDraft.date,
      worker: '',
      clientIds: [],
      documentText: polishedDraft.networkDescription,
      payload: {
        type: polishedDraft.networkType,
        participants: participantNames.join(', '),
        partnerIds,
        partnerNames,
        rtMembers,
        otherPeople,
        place: polishedDraft.networkPlace,
        count,
        startTime: polishedDraft.networkStartTime,
        endTime: polishedDraft.networkEndTime,
        duration: formatDurationFromTimes(polishedDraft.networkStartTime, polishedDraft.networkEndTime),
        notes: polishedDraft.networkNotes,
        outcome: polishedDraft.networkOutcome || '',
        nextSteps: polishedDraft.networkNextSteps || '',
        description: polishedDraft.networkDescription
      },
      indicatorFlags: { ka01NetworkActivity: true }
    };

    const ok = editingKa01NetworkRecordId
      ? await updateExistingRecord(editingKa01NetworkRecordId, recordPayload, { noticeKey: 'network', successText: 'Uloženo' })
      : await saveRecord(recordPayload, { noticeKey: 'network', successText: 'Uloženo' });
    if (!ok) return;
    ka01NetworkPendingIdRef.current = '';

    try {
      const url = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
      url.searchParams.set('action', 'listNetworkMeetings');
      url.searchParams.set('project_id', activeProjectId);
      url.searchParams.set('actor_id', currentWorker);
      const response = await fetch(url.toString());
      const json = await response.json();
      if (!response.ok || json.ok === false) throw new Error(json.error || 'Na?ten? sch?zek selhalo.');
      const remoteNetworkRecords = mapSheetRecordsToAppRecords({ networkMeetings: json.networkMeetings || [] }, clientIndex);
      setRecords((previous) => {
        const otherRecords = previous.filter((record) => record.entityType !== 'network_activities');
        const merged = [...remoteNetworkRecords, ...otherRecords].sort(compareTimelineRecordsDesc);
        if (!hasFirebaseConfig || !db) saveLocalRecords(merged);
        return merged;
      });
    } catch (error) {
      console.warn('Network meetings refresh error:', error);
    }

    setFlash(editingKa01NetworkRecordId ? 'Aktivita tvorby s\u00edt\u011b byla upravena.' : 'Aktivita tvorby s\u00edt\u011b byla ulo\u017eena.');
    setEditingKa01NetworkRecordId('');
    setKa01Draft((previous) => ({
      ...previous,
      networkParticipants: '',
      networkActorEntries: [buildEmptyKa01ActorEntry()],
      networkPlaceType: '',
      networkPlaceCustom: '',
      networkPlace: '',
      networkCount: '0',
      networkStartTime: '',
      networkEndTime: '',
      networkNotes: '',
      networkOutcome: '',
      networkNextSteps: '',
      networkDescription: ''
    }));
  };
  const handleSaveKa01Network = async () => {
    if (ka01NetworkSaveLockRef.current) return;
    ka01NetworkSaveLockRef.current = true;
    setSaveButtonNotice('network', 'progress', 'Ukládám…');
    try {
      await persistKa01Network();
    } finally {
      ka01NetworkSaveLockRef.current = false;
      setIsSaving(false);
    }
  };

  const handleEditKa01Network = (record) => {
    const payload = record.payload || {};
    const knownParticipantValues = String(payload.type || '').toLowerCase() === 'porada'
      ? [...WORKERS, ...ka01ActorOptions.map((option) => option.value)]
      : ka01ActorOptions.map((option) => option.value);
    const actorEntries = parseKa01ActorEntries(payload.participants || '', knownParticipantValues);
    const selectedActorCount = actorEntries.filter((entry) => Boolean(getKa01ActorDisplayName(entry))).length;
    const minimumCount = selectedActorCount;
    const placeSelection = parseKa01PlaceValue(payload.place || '');
    setKa01Draft((prev) => ({
      ...prev,
      date: record.activityDate || todayIso(),
      worker: '',
      networkType: payload.type || payload.networkType || prev.networkType,
      networkParticipants: payload.participants || '',
      networkActorEntries: actorEntries,
      networkPlaceType: placeSelection.placeType,
      networkPlaceCustom: placeSelection.customPlace,
      networkPlace: payload.place || '',
      networkCount: String(Math.max(Number(payload.count ?? 0), minimumCount, 0)),
      networkStartTime: payload.startTime || '',
      networkEndTime: payload.endTime || '',
      networkNotes: payload.notes || '',
      networkOutcome: payload.outcome || '',
      networkNextSteps: payload.nextSteps || '',
      networkDescription: payload.description || payload.notes || ''
    }));
    setEditingKa01NetworkRecordId(record.id);
    setFlash('Záznam KA01 byl načten do formuláře pro úpravu.');
  };

  const cancelKa01NetworkEdit = () => {
    setEditingKa01NetworkRecordId('');
    setKa01NetworkTimeError('');
    setKa01Draft((prev) => ({
      ...prev,
      networkParticipants: '',
      networkActorEntries: [buildEmptyKa01ActorEntry()],
      networkPlaceType: '',
      networkPlaceCustom: '',
      networkPlace: '',
      networkCount: '0',
      networkStartTime: '',
      networkEndTime: '',
      networkNotes: '',
      networkOutcome: '',
      networkNextSteps: '',
      networkDescription: ''
    }));
  };

  const toggleKa01NetworkDescription = (recordId) => {
    setExpandedKa01NetworkRecordIds((prev) =>
      prev.includes(recordId) ?prev.filter((item) => item !== recordId) : [...prev, recordId]
    );
  };

  useEffect(() => {
    if (String(ka01Draft.networkStartTime || '').trim() && String(ka01Draft.networkEndTime || '').trim()) {
      setKa01NetworkTimeError('');
    }
  }, [ka01Draft.networkStartTime, ka01Draft.networkEndTime]);

  useEffect(() => {
    setKa01Draft((previous) => {
      const knownValues = new Set(
        String(previous.networkType || '').toLowerCase() === 'porada'
          ? [...WORKERS, ...ka01ActorRegistryRecords.map((record) => String(record.payload?.name || '').trim()).filter(Boolean)]
          : ka01ActorRegistryRecords.map((record) => String(record.payload?.name || '').trim()).filter(Boolean)
      );
      const normalizedEntries = normalizeKa01ActorEntries(previous.networkActorEntries).map((entry) => {
        const value = String(entry.actorType || '').trim();
        if (!value || value === KA01_ACTOR_CUSTOM) return entry;
        return knownValues.has(value) ? entry : { actorType: KA01_ACTOR_CUSTOM, customName: value };
      });
      return {
        ...previous,
        networkActorEntries: normalizedEntries,
        networkParticipants: serializeKa01ActorEntries(normalizedEntries)
      };
    });
  }, [ka01Draft.networkType, ka01ActorRegistryRecords]);
  const updateKa01ActorEntry = (index, patch) => {
    setKa01Draft((prev) => {
      const nextEntries = normalizeKa01ActorEntries(prev.networkActorEntries).map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, ...patch } : entry
      );
      const normalizedEntries = normalizeKa01ActorEntries(nextEntries);
      const selectedCount = normalizedEntries.filter((entry) => Boolean(getKa01ActorDisplayName(entry))).length;
      const nextCount = selectedCount;
      return {
        ...prev,
        networkActorEntries: normalizedEntries,
        networkParticipants: serializeKa01ActorEntries(normalizedEntries),
        networkCount: String(nextCount)
      };
    });
  };

  const updateKa01PlaceSelection = (placeType) => {
    setKa01Draft((prev) => ({
      ...prev,
      networkPlaceType: placeType,
      networkPlaceCustom: placeType === KA01_PLACE_CUSTOM ?prev.networkPlaceCustom : '',
      networkPlace:
        placeType === KA01_PLACE_CUSTOM
          ?prev.networkPlaceCustom
          : placeType
            ?placeType
            : ''
    }));
  };

  const updateKa01PlaceCustom = (customPlace) => {
    setKa01Draft((prev) => ({
      ...prev,
      networkPlaceCustom: customPlace,
      networkPlace: prev.networkPlaceType === KA01_PLACE_CUSTOM ?customPlace : prev.networkPlace
    }));
  };

  const handleSaveKa02 = async (entityType) => {
    const client = clientIndex[ka02Draft.selectedClientId];
    if (!client) {
      setFlash('Vyber klienta pro KA02 aktivitu.');
      return;
    }

    const payload = buildKa02Record(entityType, ka02Draft, client);
    const ok = await saveRecord(payload);
    if (ok) {
      setFlash('Záznam KA02 byl uložen.');
    }
  };

  const handleSaveKa01ActorRegistry = async () => {
    const name = String(ka01ActorDraft.name || '').trim();
    const origin = String(ka01ActorDraft.networkOrigin || '').trim();
    const contactName = String(ka01ActorDraft.contactName || '').trim();
    clearSaveButtonNotice('actor');
    if (!name) { setSaveButtonNotice('actor', 'error', 'Aktér nebyl uložen: vyplňte název subjektu.'); setFlash('Vyplňte název subjektu.'); return; }
    if (!ka01ActorDraft.actorType) { setSaveButtonNotice('actor', 'error', 'Aktér nebyl uložen: vyberte typ aktéra.'); setFlash('Vyberte typ aktéra.'); return; }
    if (!origin) { setSaveButtonNotice('actor', 'error', 'Aktér nebyl uložen: vyberte původ sítě.'); setFlash('Vyberte původ sítě.'); return; }
    if (origin.toLowerCase().includes('nov') && !ka01ActorDraft.joinedNetworkDate) {
      setSaveButtonNotice('actor', 'error', 'Aktér nebyl uložen: doplňte datum zapojení.');
      setFlash('U nov\u011b zapojen\u00e9ho akt\u00e9ra dopl\u0148 datum zapojen\u00ed.');
      return;
    }

    const editingId = ka01ActorDraft.id || '';
    const duplicate = records.find((record) =>
      record.entityType === 'actor_registry'
      && record.id !== editingId
      && String(record.payload?.name || '').trim().toLowerCase() === name.toLowerCase()
      && String(record.payload?.contactName || '').trim().toLowerCase() === contactName.toLowerCase()
    );
    if (duplicate) {
      setSaveButtonNotice('actor', 'error', 'Aktér nebyl uložen: tento subjekt a kontaktní osoba už existují.');
    }
    if (duplicate) { setFlash('Tento subjekt a kontaktn\u00ed osoba u\u017e jsou v registru.'); return; }

    const tokens = contactName.split(/\s+/).filter(Boolean);
    const titlePattern = /^(Mgr\.?|Ing\.?|Bc\.?|JUDr\.?|MUDr\.?|PhDr\.?|doc\.?|prof\.?|DiS\.?)$/i;
    const contactTitle = tokens.length && titlePattern.test(tokens[0]) ? tokens.shift() : '';
    const contactFirstName = tokens.shift() || '';
    const contactLastName = tokens.join(' ');
    const actorRecord = {
      entityType: 'actor_registry',
      ka: 'KA2',
      title: 'Registr akt\u00e9ra - ' + name,
      activityDate: ka01ActorDraft.joinedNetworkDate || todayIso(),
      worker: ka01Draft.worker || '',
      clientIds: [],
      documentText: '',
      payload: {
        id: editingId,
        name,
        actorType: ka01ActorDraft.actorType,
        networkOrigin: origin,
        joinedNetworkDate: origin.toLowerCase().includes('nov') ? ka01ActorDraft.joinedNetworkDate : '',
        contactName,
        contactTitle,
        contactFirstName,
        contactLastName,
        contactRole: String(ka01ActorDraft.contactRole || '').trim(),
        phone: String(ka01ActorDraft.phone || '').trim(),
        email: String(ka01ActorDraft.email || '').trim(),
        cooperationStatus: 'aktivn\u011b zapojen'
      },
      indicatorFlags: { ka01NetworkSize: 1 }
    };

    const ok = editingId
      ? await updateExistingRecord(editingId, actorRecord, { noticeKey: 'actor', successText: 'Uloženo' })
      : await saveRecord(actorRecord, { noticeKey: 'actor', successText: 'Uloženo' });
    if (!ok) return;
    setFlash(editingId ? 'Akt\u00e9r byl upraven.' : 'Akt\u00e9r byl ulo\u017een do registru.');
    setKa01ActorDraft((previous) => ({
      ...previous,
      ...KA01_EMPTY_ACTOR_ROLES,
      id: '', name: '', networkOrigin: '', actorType: 'obec / m\u011bsto',
      ico: '', municipality: '', web: '', contactTitle: '', contactFirstName: '', contactLastName: '',
      contactName: '', contactRole: '', phone: '', email: '', joinedNetworkDate: '',
      communicationNote: '', lastContactDate: '', inactivityReason: ''
    }));
  };
  const handleEditKa01ActorRegistry = (record) => {
    const payload = record.payload || {};
    const fullName = String(payload.contactName || '').trim();
    const splitTitle = String(payload.contactTitle || '').trim();
    const splitFirst = String(payload.contactFirstName || '').trim();
    const splitLast = String(payload.contactLastName || '').trim();
    const fallbackTokens = fullName.split(/\s+/).filter(Boolean);
    const knownTitleRegex = /^(Mgr\.?|Ing\.?|Bc\.?|JUDr\.?|MUDr\.?|PhDr\.?|doc\.?|prof\.?|DiS\.?)$/i;
    const parsedTitle = splitTitle || (fallbackTokens.length > 0 && knownTitleRegex.test(fallbackTokens[0]) ? fallbackTokens[0] : '');
    const parsedFirst = splitFirst
      || (fallbackTokens.length > 0
        ? (parsedTitle ? (fallbackTokens[1] || '') : fallbackTokens[0])
        : '');
    const parsedLast = splitLast
      || (fallbackTokens.length > 0
        ? fallbackTokens.slice(parsedTitle ? 2 : 1).join(' ')
        : '');

    setKa01ActorDraft({
      ...ka01ActorDraft,
      ...KA01_EMPTY_ACTOR_ROLES,
      ...payload,
      networkOrigin:
        String(payload.networkOrigin || '').trim()
        || (String(record.id || '').startsWith('seed-ka01-actor-')
          ? 'výchozí síť'
          : 'nově přidaný v realizaci'),
      roleRecruitment: isCheckedValue(payload.roleRecruitment),
      roleClientReferral: isCheckedValue(payload.roleClientReferral),
      roleMaterialDistribution: isCheckedValue(payload.roleMaterialDistribution),
      roleJobOpportunities: isCheckedValue(payload.roleJobOpportunities),
      roleTpm: isCheckedValue(payload.roleTpm),
      roleHpp: isCheckedValue(payload.roleHpp),
      roleFollowupService: isCheckedValue(payload.roleFollowupService) || isCheckedValue(payload.roleDebtSocialSupport),
      roleDebtSocialSupport: isCheckedValue(payload.roleDebtSocialSupport),
      roleInfoSharingWithConsent: isCheckedValue(payload.roleInfoSharingWithConsent),
      roleCoordinationMeetings: isCheckedValue(payload.roleCoordinationMeetings),
      roleWorkplaceAdaptation: isCheckedValue(payload.roleWorkplaceAdaptation),
      roleOther: isCheckedValue(payload.roleOther),
      contactTitle: parsedTitle,
      contactFirstName: parsedFirst,
      contactLastName: parsedLast,
      id: record.id
    });
    setFlash('Karta aktéra byla načtena k úpravě.');
  };

  const toggleKa01ActorAttendance = (recordId, checked) => {
    setKa01AttendanceSelection((prev) => ({
      ...prev,
      [recordId]: Boolean(checked)
    }));
  };

  const exportKa01AttendanceSheet = async () => {
    const selected = ka01ActorRegistryRecords.filter((record) => {
      if (!ka01AttendanceSelection[record.id]) return false;
      const payload = record.payload || {};
      const fullName = String(payload.contactName || '').trim();
      const fallbackTokens = fullName.split(/\s+/).filter(Boolean);
      const titleRegex = /^(Mgr\.?|Ing\.?|Bc\.?|JUDr\.?|MUDr\.?|PhDr\.?|doc\.?|prof\.?|DiS\.?)$/i;
      const title = String(payload.contactTitle || '').trim()
        || (fallbackTokens.length > 0 && titleRegex.test(fallbackTokens[0]) ? fallbackTokens[0] : '');
      const firstName = String(payload.contactFirstName || '').trim()
        || (fallbackTokens.length > 0 ? (title ? (fallbackTokens[1] || '') : fallbackTokens[0]) : '');
      const lastName = String(payload.contactLastName || '').trim()
        || (fallbackTokens.length > 0 ? fallbackTokens.slice(title ? 2 : 1).join(' ') : '');
      const subject = String(payload.name || '').trim();
      return Boolean(firstName && lastName && subject);
    });

    if (selected.length === 0) {
      setFlash('Označ alespoň jednoho aktéra s vyplněným jménem, příjmením a subjektem.');
      return;
    }

    const attendanceRowCount = Math.max(15, selected.length);
    const rows = Array.from({ length: attendanceRowCount }, (_, index) => {
      const record = selected[index];
      const payload = record?.payload || {};
      const fullName = String(payload.contactName || '').trim();
      const fallbackTokens = fullName.split(/\s+/).filter(Boolean);
      const titleRegex = /^(Mgr\.?|Ing\.?|Bc\.?|JUDr\.?|MUDr\.?|PhDr\.?|doc\.?|prof\.?|DiS\.?)$/i;
      const title = String(payload.contactTitle || '').trim()
        || (fallbackTokens.length > 0 && titleRegex.test(fallbackTokens[0]) ? fallbackTokens[0] : '');
      const firstName = String(payload.contactFirstName || '').trim()
        || (fallbackTokens.length > 0 ? (title ? (fallbackTokens[1] || '') : fallbackTokens[0]) : '');
      const lastName = String(payload.contactLastName || '').trim()
        || (fallbackTokens.length > 0 ? fallbackTokens.slice(title ? 2 : 1).join(' ') : '');
      return {
        order: String(index + 1),
        firstName: record ? firstName : '',
        lastName: record ? lastName : '',
        organization: String(payload.name || '').trim(),
        role: String(payload.contactRole || '').trim()
      };
    });

    setFlash('Připravuji PDF prezenční listiny...');
    let wrapper = null;
    try {
      const escapeHtml = (value) => String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

      const rowsHtml = rows.map((row) => `
        <tr>
          <td style="border:1px solid #cbd5e1;padding:6px;text-align:center;">${escapeHtml(row.order)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(row.firstName)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(row.lastName)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(row.organization)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;">${escapeHtml(row.role)}</td>
          <td style="border:1px solid #cbd5e1;padding:6px;height:30px;"></td>
        </tr>
      `).join('');

      wrapper = document.createElement('div');
      wrapper.style.position = 'fixed';
      wrapper.style.left = '0';
      wrapper.style.top = '0';
      wrapper.style.pointerEvents = 'none';
      wrapper.style.zIndex = '2147483647';
      wrapper.style.width = '1123px';
      wrapper.style.background = '#ffffff';
      wrapper.style.color = '#0f172a';
      wrapper.style.fontFamily = 'Arial, sans-serif';
      wrapper.style.padding = '28px';
      wrapper.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:12px;">
          <div>
            <h1 style="margin:0 0 8px 0;font-size:34px;line-height:1.2;">KA2 - Prezenční listina aktérů sítě</h1>
            <p style="margin:0 0 6px 0;font-size:18px;">Datum vytvoření: ${escapeHtml(todayIso())}</p>
            <p style="margin:0;font-size:18px;">Schůzka dne: ........................................   Od: ....................   Do: ....................</p>
          </div>
          <img src="${sfLogoImage}" alt="Spolufinancováno" style="width:420px;height:auto;" />
        </div>
        <table style="width:100%;border-collapse:collapse;font-size:16px;">
          <thead>
            <tr>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">#</th>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">Jméno</th>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">Příjmení</th>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">Organizace</th>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">Funkce v organizaci</th>
              <th style="border:1px solid #cbd5e1;padding:6px;background:#f8fafc;">Podpis</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      `;
      document.body.appendChild(wrapper);
      const logoEl = wrapper.querySelector('img');
      if (logoEl && !logoEl.complete) {
        await new Promise((resolve) => {
          logoEl.onload = () => resolve();
          logoEl.onerror = () => resolve();
        });
      }

      await new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
      const canvas = await html2canvas(wrapper, {
        scale: 2,
        useCORS: false,
        backgroundColor: '#ffffff'
      });
      wrapper.remove();
      wrapper = null;

      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 8;
      const contentWidth = pageWidth - margin * 2;
      const contentHeight = pageHeight - margin * 2;
      const imgHeight = (canvas.height * contentWidth) / canvas.width;

      let heightLeft = imgHeight;
      let y = margin;
      doc.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight);
      heightLeft -= contentHeight;

      while (heightLeft > 0) {
        y = margin - (imgHeight - heightLeft);
        doc.addPage();
        doc.addImage(imgData, 'PNG', margin, y, contentWidth, imgHeight);
        heightLeft -= contentHeight;
      }

      doc.save(`prezencni_listina_${todayIso()}.pdf`);
      setFlash(`Prezenční listina byla stažena do PDF pro ${selected.length} aktérů.`);
    } catch (error) {
      wrapper?.remove();
      console.error('KA01 attendance PDF export error:', error);
      setFlash(error.message || 'Export prezenční listiny do PDF selhal.');
    }
  };


  const handleSaveKa03 = async (entityType) => {
    const clientIdByEntityType = {
      tpm_records: ka03Draft.tpmClientId || ka03Draft.selectedClientId,
      employment_records: ka03Draft.employmentClientId || ka03Draft.selectedClientId
    };
    const activityDateByEntityType = {
      tpm_records: ka03Draft.tpmDate || ka03Draft.date,
      employment_records: ka03Draft.employmentDate || ka03Draft.date
    };
    const client = clientIndex[clientIdByEntityType[entityType] || ka03Draft.selectedClientId];
    if (!client) {
      setFlash('Vyber klienta pro aktivitu.');
      return;
    }
    const goalOptions = getPlanGoalOptions(client.id);
    const selectedGoalId =
      entityType === 'employment_records'
        ? ka03Draft.employmentLinkedPlanGoalId
        : ka03Draft.tpmLinkedPlanGoalId;
    if (!selectedGoalId || !goalOptions.some((goal) => goal.value === selectedGoalId)) {
      setFlash(goalOptions.length ? 'Vyber cíl z plánu osobního rozvoje.' : 'Nejdřív doplň cíl v plánu osobního rozvoje klienta.');
      return;
    }

    const payload = buildKa03Record(entityType, { ...ka03Draft, date: activityDateByEntityType[entityType] || ka03Draft.date }, client);
    const ok = editingKa03RecordId ? await updateExistingRecord(editingKa03RecordId, payload) : await saveRecord(payload);
    if (ok) {
      setEditingKa03RecordId('');
      setFlash(editingKa03RecordId ?'Záznam byl upraven.' : 'Záznam byl uložen.');
    }
  };

  const handleSaveEducation = async () => {
    clearSaveButtonNotice('education');
    const title = String(educationDraft.title || '').trim();
    const date = String(educationDraft.date || '').trim();
    const hours = String(educationDraft.hours || '').trim();
    const workers = [
      educationDraft.worker1,
      educationDraft.worker2,
      educationDraft.worker3
    ].map((worker) => String(worker || '').trim()).filter(Boolean);

    if (!date || !title || !hours || workers.length === 0) {
      setSaveButtonNotice('education', 'error', 'Vzdělávání nebylo uloženo: doplňte všechna povinná pole.');
      setFlash('Vyplň datum, počet hodin, název vzdělávání a alespoň prvního pracovníka.');
      return;
    }

    const recordPayload = {
      id: 'VZDELAVANI-WEB-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      entityType: 'education_records',
      ka: 'VZDELAVANI',
      title,
      activityDate: date,
      worker: workers[0],
      clientIds: [],
      documentText: title,
      payload: {
        date,
        hours,
        title,
        accreditationNumber: String(educationDraft.accreditationNumber || '').trim(),
        worker: workers[0],
        workers
      },
      indicatorFlags: {}
    };

    const ok = await saveRecord(recordPayload, { noticeKey: 'education', successText: 'Uloženo' });
    if (!ok) return;
    setEducationDraft({
      date: todayIso(),
      hours: '',
      title: '',
      accreditationNumber: '',
      worker1: readStoredGlobalWorker(),
      worker2: '',
      worker3: ''
    });
    setFlash('Vzdělávací akce byla uložena.');
  };

  const handleSaveSupervision = async () => {
    clearSaveButtonNotice('supervision');
    const date = String(supervisionDraft.date || '').trim();
    const hours = String(supervisionDraft.hours || '').trim();
    const type = String(supervisionDraft.type || '').trim();
    const workers = [
      supervisionDraft.worker1,
      isIndividualSupervision ? '' : supervisionDraft.worker2,
      isIndividualSupervision ? '' : supervisionDraft.worker3
    ].map((worker) => String(worker || '').trim()).filter(Boolean);

    if (!date || !hours || !type || workers.length === 0) {
      setSaveButtonNotice('supervision', 'error', 'Supervize nebyla uložena: doplňte všechna povinná pole.');
      setFlash('Vyplň datum, počet hodin, typ supervize a alespoň prvního pracovníka.');
      return;
    }

    const recordPayload = {
      id: 'SUPERVIZE-WEB-' + Date.now() + '-' + Math.random().toString(16).slice(2, 8),
      entityType: 'supervision_records',
      ka: 'SUPERVIZE',
      title: 'Supervize - ' + type,
      activityDate: date,
      worker: workers[0],
      clientIds: [],
      documentText: type,
      payload: {
        date,
        hours,
        type,
        workers
      },
      indicatorFlags: {}
    };

    const ok = await saveRecord(recordPayload, { noticeKey: 'supervision', successText: 'Uloženo' });
    if (!ok) return;
    setSupervisionDraft({
      date: todayIso(),
      hours: '',
      type: 'individuální',
      worker1: readStoredGlobalWorker(),
      worker2: '',
      worker3: ''
    });
    setFlash('Supervize byla uložena.');
  };

  const openClient = (clientId, nextView = 'clients') => {
    if (nextView !== mainView && !confirmAndResetBeforeViewChange()) return;
    setShowClientEditForm(false);
    setClientCaseSummary('');
    setEditingGeneratedRecordId('');
    setEditingKa03RecordId('');
    setSelectedClientId(clientId);
    setGeneratorDraft((prev) => ({ ...prev, clientId }));
    setKa01Draft((prev) => ({ ...prev, assessmentClientId: clientId }));
    setKa02Draft((prev) => ({ ...prev, selectedClientId: clientId }));
    setKa03Draft((prev) => ({
      ...prev,
      selectedClientId: clientId,
      tpmClientId: clientId,
      employmentClientId: clientId,
      tpmLinkedPlanGoalId: '',
      tpmLinkedPlanGoalLabel: '',
      employmentLinkedPlanGoalId: '',
      employmentLinkedPlanGoalLabel: '',
      tpmDate: prev.tpmDate || todayIso(),
      employmentDate: prev.employmentDate || todayIso()
    }));
    setMainView(nextView);
  };

  const formatHoursForExport = (hours) => {
    const safeHours = Number(hours || 0);
    const totalMinutes = Math.round(safeHours * 60);
    const wholeHours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const decimalHours = (totalMinutes / 60).toFixed(1).replace('.', ',');
    return `${decimalHours} hod (${String(wholeHours).padStart(2, '0')}hod${String(minutes).padStart(2, '0')}min)`;
  };

  const getUniqueClientSupportRecords = (sourceRecords) => {
    const seen = new Set();
    return (sourceRecords || []).filter((record) => {
      if (record.isSynthetic || record.entityType !== 'consultations') return false;
      const clientIds = Array.isArray(record.clientIds) ? record.clientIds : record.clientId ? [record.clientId] : [];
      if (!clientIds.length) return false;
      const payload = record.payload || {};
      const key = [
        [...clientIds].sort().join(','),
        record.activityDate || '',
        payload.startTime || payload.ka02StartTime || '',
        payload.endTime || payload.ka02EndTime || '',
        Number(payload.durationMinutes || 0),
        payload.consultationType || record.title || '',
        record.documentText || payload.topics || '',
        payload.outcome || '',
        payload.nextSteps || ''
      ].map((value) => String(value).trim()).join('|').toLocaleLowerCase('cs');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };

  const getClientDashboardExportStats = (clientId) => {
    const supportRecords = getUniqueClientSupportRecords(records).filter((record) => {
      const clientIds = Array.isArray(record.clientIds) ? record.clientIds : record.clientId ? [record.clientId] : [];
      return clientIds.includes(clientId);
    });
    const minutesFor = (predicate) => supportRecords
      .filter(predicate)
      .reduce((sum, record) => sum + Number(record.payload?.durationMinutes || 0), 0);
    const isKa2 = (record) => String(record.ka || '').toUpperCase() === 'KA2' || Boolean(record.payload?.caseManagementMode);
    const totalMinutes = minutesFor(() => true);
    return {
      supportCount: supportRecords.length,
      totalHours: totalMinutes / 60,
      ka1Hours: minutesFor((record) => !isKa2(record)) / 60,
      ka2Hours: minutesFor(isKa2) / 60
    };
  };
  const exportActivitiesCsv = () => {
    const rows = filteredRecords.map((record) => [
      record.activityDate || '',
      record.ka || '',
      record.entityType || '',
      record.title || '',
      record.worker || '',
      record.clientName || '',
      truncate(record.documentText || '', 120)
    ]);

    downloadCsv(
      ['Datum', 'KA', 'Entita', 'Název', 'Pracovník', 'Klient', 'Text'],
      rows,
      'aktivity-projektu.csv'
    );
  };

  const exportClientsCsv = () => {
    const rows = accessibleClients.map((client) => {
      const stats = getClientDashboardExportStats(client.id);
      const supportCategory = stats.totalHours >= 40 ? '40 hodin a více' : stats.totalHours > 0 ? 'Méně než 40 hodin' : 'Bez podpory';
      return [
        client.id,
        client.fullName,
        client.datumNarozeni || '',
        client.pohlavi || '',
        client.mesto || '',
        client.postaveniNaTrhu || '',
        client.vzdelani || '',
        client.znevyhodneni || '',
        client.projectStatusLabel || '',
        client.datumVstupu || '',
        client.datumVystupu || '',
        stats.supportCount,
        formatHoursForExport(stats.totalHours),
        formatHoursForExport(stats.ka1Hours),
        formatHoursForExport(stats.ka2Hours),
        supportCategory
      ];
    });

    downloadCsv(
      [
        'Interní ID',
        'Klient',
        'Datum narození',
        'Pohlaví',
        'Obec',
        'Postavení na trhu práce',
        'Dosažené vzdělání',
        'Typ znevýhodnění',
        'Status klienta',
        'Datum vstupu',
        'Datum výstupu',
        'Počet zápisů podpory',
        'Celková podpora',
        'Podpora KA1',
        'Podpora KA2',
        'Kategorie podpory'
      ],
      rows,
      'klienti-a-podpora-is-esf.csv'
    );
  };

  const exportAllRecordsBackup = () => {
    const supportRecords = getUniqueClientSupportRecords(filteredRecords);
    const content = buildAllRecordsBackupHtml(supportRecords, clients);
    downloadHtmlDocument(content, `zapisy-podpory-${todayIso()}.doc`);
  };
  const exportIndicatorsCsv = () => {
    const rows = computedIndicators.map((item) => [
      item.ka,
      item.label,
      item.current,
      item.target,
      item.currentIds.join(', ')
    ]);

    downloadCsv(['KA', 'Indikátor', 'Hodnota', 'Cíl', 'Zdroje'], rows, 'indikatory-projektu.csv');
  };

  const exportClientFolder = () => {
    if (!selectedClient) return;
    const content = buildClientFolderHtml(selectedClient, clientJourneyTimeline);
    downloadHtmlDocument(content, `slozka-klienta-${slugify(selectedClient.fullName)}.doc`);
  };

  const summarizeClientCase = async () => {
    if (!selectedClient) return;
    const aiTimeline = filterClientCaseAiRecords(clientJourneyTimeline);
    const aiSupportBreakdown = getClientSupportBreakdown(selectedClient.id, aiTimeline);
    const fallbackSummary = buildClientCaseSummary(selectedClient, aiTimeline, aiSupportBreakdown);
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const aiModel = selectedAiModel || DEFAULT_AI_MODEL;

    if (!apiKey) {
      setClientCaseSummary(fallbackSummary);
      copyToClipboard(fallbackSummary, setCopied);
      setFlash('AI klíč není nastavený. Připravil jsem strukturovaný souhrn bez AI a zkopíroval ho do schránky.');
      return;
    }

    setIsSummarizingCase(true);
    setFlash('Připravuji AI souhrn zakázky klienta...');
    try {
      const response = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: buildAiClientCaseSummaryPrompt(selectedClient, aiTimeline, aiSupportBreakdown) }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 8192
          }
        })
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error?.message || `AI souhrn selhal se stavem ${response.status}.`);
      }
      const aiSummary = cleanGeneratedText(extractGeminiText(result));
      const summary = aiSummary || fallbackSummary;
      setClientCaseSummary(summary);
      copyToClipboard(summary, setCopied);
      setFlash('AI souhrn zakázky klienta byl připraven a zkopírován do schránky.');
    } catch (error) {
      console.error('Client case AI summary error:', error);
      setClientCaseSummary(fallbackSummary);
      copyToClipboard(fallbackSummary, setCopied);
      setFlash('AI souhrn se nepodařilo vytvořit. Použil jsem strukturovaný souhrn bez AI.');
    } finally {
      setIsSummarizingCase(false);
    }
  };

  const exportJourneyRecord = (record) => {
    if (!record || !selectedClient) return;
    const content = buildRecordHtmlDocument(record, selectedClient);
    const filenameParts = [
      record.activityDate || todayIso(),
      record.ka || record.entityType || 'zaznam',
      record.title || 'zapis'
    ];
    downloadHtmlDocument(content, `${slugify(filenameParts.join('-'))}.doc`);
  };

  const toggleJourneyPrintSelection = (recordId) => {
    setSelectedJourneyPrintIds((prev) =>
      prev.includes(recordId) ? prev.filter((item) => item !== recordId) : [...prev, recordId]
    );
  };

  const exportSelectedJourneyRecords = () => {
    if (!selectedClient) return;
    const selectedRecords = clientJourneyTimeline.filter((record) => selectedJourneyPrintIds.includes(record.id));
    if (!selectedRecords.length) {
      setFlash('Nejprve zaškrtni alespoň jeden zápis v klientské ose.');
      return;
    }
    const content = buildSelectedJourneyPrintHtml(selectedClient, selectedRecords);
    downloadHtmlDocument(content, `vybrane-zapisy-${slugify(selectedClient.fullName)}-${todayIso()}.doc`);
  };

  const buildJourneyPlanAiPrompt = (record) => [
    'Vylepši Individuální plán rozvoje klienta ve stejné struktuře, jakou používá formulář KA02.',
    'Vrať pouze validní JSON bez Markdownu a bez komentáře.',
    'JSON musí mít klíče: situationDescription, goals, finalEvaluation, acceptedPlanText.',
    'Pole goals musí být pole objektů se stejnými goalId jako ve vstupu. Neměň goalId, nemaž cíle, nepřidávej nové cíle a neměň termíny. Termín můžeš opsat pouze do acceptedPlanText.',
    'Povinně zlepši a rozveď formulace nejen v acceptedPlanText, ale také přímo v situationDescription, v každém goals[].goalDescription a v každém goals[].actionSteps. Tato strukturovaná pole musí obsahově odpovídat acceptedPlanText a nesmějí zůstat jen jako původní hesla, pokud je v souvislém textu rozvedeš.',
    'acceptedPlanText vytvoř jako čitelný souvislý plán výhradně ze stejných strukturovaných polí. Neuváděj věty typu "Žádná specifická data nebyla poskytnuta".',
    'finalEvaluation zachovej přesně ze vstupu. Pokud je prázdné, vrať prázdný řetězec a do acceptedPlanText nevkládej závěrečné vyhodnocení ani tvrzení o dosaženém výsledku.',
    'Nepřidávej nová fakta, diagnózy, zaměstnavatele, termíny ani výsledky.',
    '',
    'Aktuální struktura individuálního plánu:',
    JSON.stringify(buildStructuredPlanForAi(record), null, 2)
  ].join('\n');

  const handleGenerateJourneyPlanDraft = async (record) => {
    const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
    const aiModel = selectedAiModel || DEFAULT_AI_MODEL;
    if (!apiKey) {
      const fallbackRecord = buildPlanRecordWithStructuredDraft(record, buildStructuredPlanForAi(record), selectedClient);
      setJourneyPlanStructuredDrafts((prev) => ({ ...prev, [record.id]: buildStructuredPlanForAi(record) }));
      setJourneyPlanDrafts((prev) => ({ ...prev, [record.id]: buildPersonalDevelopmentPlanText(fallbackRecord, selectedClient) }));
      setFlash('AI klíč není nastavený. Vložil jsem strukturovaný návrh bez AI.');
      return;
    }

    setGeneratingJourneyPlanId(record.id);
    try {
      const response = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: buildJourneyPlanAiPrompt(record) }] }],
          systemInstruction: {
            parts: [{ text: `${AI_SAFETY_BASE} Vylepšuješ strukturovaný individuální plán, zachováváš vazby na cíle a vracíš pouze validní JSON podle požadovaného schématu.` }]
          },
          generationConfig: {
            temperature: 0.18,
            topP: 0.9,
            maxOutputTokens: 2500,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                situationDescription: { type: 'STRING' },
                goals: { type: 'ARRAY', items: { type: 'OBJECT', properties: { goalId: { type: 'STRING' }, goalDescription: { type: 'STRING' }, actionSteps: { type: 'STRING' }, deadline: { type: 'STRING' } }, required: ['goalId', 'goalDescription', 'actionSteps', 'deadline'] } },
                finalEvaluation: { type: 'STRING' },
                acceptedPlanText: { type: 'STRING' }
              },
              required: ['situationDescription', 'goals', 'finalEvaluation', 'acceptedPlanText']
            }
          }
        })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || `AI požadavek selhal se stavem ${response.status}.`);
      let structuredDraft;
      const rawPlanOutput = extractGeminiText(result);
      try {
        structuredDraft = parseStructuredPlanAiResult(rawPlanOutput, record);
      } catch (parseError) {
        try {
          const repairResponse = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: `Oprav odpověď na validní JSON podle původního schématu. Neměň goalId, počet cílů ani termíny a nic věcně nepřidávej. Povinně rozpracuj heslovité goalDescription a actionSteps do profesionálních formulací při zachování původního významu:
${rawPlanOutput}` }] }],
              systemInstruction: { parts: [{ text: AI_SAFETY_BASE }] },
              generationConfig: { temperature: 0, maxOutputTokens: 2500, responseMimeType: 'application/json' }
            })
          });
          const repairResult = await repairResponse.json();
          if (!repairResponse.ok) throw new Error(repairResult?.error?.message || 'Oprava JSON individuálního plánu selhala.');
          structuredDraft = parseStructuredPlanAiResult(extractGeminiText(repairResult), record);
        } catch (repairError) {
          console.warn('Journey plan AI JSON repair failed, using safe fallback:', repairError);
          structuredDraft = buildStructuredPlanFallback(rawPlanOutput, record);
        }
      }
      structuredDraft = { ...structuredDraft, acceptedPlanText: buildAcceptedPlanTextFromStructuredDraft(structuredDraft) };
      const previewRecord = buildPlanRecordWithStructuredDraft(record, structuredDraft, selectedClient);
      const text = structuredDraft.acceptedPlanText;
      setJourneyPlanStructuredDrafts((prev) => ({ ...prev, [record.id]: structuredDraft }));
      setJourneyPlanDrafts((prev) => ({ ...prev, [record.id]: text }));
      setFlash('AI návrh plánu osobního rozvoje je připravený v detailu záznamu.');
    } catch (error) {
      console.error('Journey plan AI error:', error);
      setJourneyPlanStructuredDrafts((prev) => ({ ...prev, [record.id]: buildStructuredPlanForAi(record) }));
      setJourneyPlanDrafts((prev) => ({ ...prev, [record.id]: buildPersonalDevelopmentPlanText(record, selectedClient) }));
      setFlash('AI návrh se nepodařilo vytvořit. Vložil jsem strukturovaný návrh bez AI.');
    } finally {
      setGeneratingJourneyPlanId('');
    }
  };

  const handleAcceptJourneyPlanDraft = async (record) => {
    const text = cleanGeneratedText(journeyPlanDrafts[record.id] || '');
    if (!text) {
      setFlash('Nejprve vygeneruj nebo doplň návrh plánu.');
      return;
    }
    const structuredDraft = journeyPlanStructuredDrafts[record.id] || {
      ...buildStructuredPlanForAi(record),
      acceptedPlanText: text
    };
    const updatedPlanRecord = buildPlanRecordWithStructuredDraft(record, { ...structuredDraft, acceptedPlanText: text }, selectedClient);
    const ok = await updateExistingRecord(record.id, updatedPlanRecord);
    if (ok) {
      setJourneyPlanDrafts((prev) => ({ ...prev, [record.id]: text }));
      setJourneyPlanStructuredDrafts((prev) => ({ ...prev, [record.id]: updatedPlanRecord }));
      setFlash('Návrh plánu byl přijat a propsán do struktury formuláře v KA02.');
    }
  };

  const editJourneyRecord = (record) => {
    if (!record || record.isSynthetic) return;
    if (record.isLegacyReadOnly || record.sourceSystem === 'LEGACY_XLSM') {
      setFlash('Historický výkon z XLSM je v aplikaci pouze pro čtení.');
      return;
    }
    if (!confirmAndResetBeforeViewChange()) return;
    const payload = record.payload || {};
    const clientId = record.clientId || record.clientIds?.[0] || selectedClient?.id || '';

    if (record.entityType === 'plans') {
      setSelectedClientId(clientId);
      setKa02Draft((prev) => ({ ...prev, selectedClientId: clientId }));
      setGeneratorDraft((prev) => ({ ...prev, clientId, linkedPlanGoalId: '', linkedPlanGoalLabel: '' }));
      setEditingGeneratedRecordId('');
      setEditingKa03RecordId('');
      setMainView('ka02');
      setFlash('Individuální plán rozvoje je načtený vlevo v KA02 a můžeš ho upravit.');
      return;
    }

    const generatorKeyByEntityType = {
      consultations: 'consultation',
      debt_cases: 'debt',
      therapy_sessions: 'therapy',
      cv_outputs: 'cv',
      job_simulators: 'simulator',
      mentor_report_document: 'mentor'
    };
    const generatorKey = generatorKeyByEntityType[record.entityType];
    if (generatorKey) {
      setEditingGeneratedRecordId(record.id);
      setEditingKa03RecordId('');
      setSelectedClientId(clientId);
      setKa02Draft((prev) => ({ ...prev, selectedClientId: clientId }));
      setGeneratorDraft((prev) => ({
        ...prev,
        selectedKey: generatorKey,
        clientId,
        date: record.activityDate || todayIso(),
        worker: record.worker || prev.worker,
        tpmRecordId: payload.tpmRecordId || prev.tpmRecordId || '',
        linkedPlanGoalId: record.linkedPlanGoalId || payload.linkedPlanGoalId || '',
        linkedPlanGoalLabel: record.linkedPlanGoalLabel || payload.linkedPlanGoalLabel || '',
        ka02StartTime: payload.startTime || '',
        ka02EndTime: payload.endTime || '',
        ka02Place: payload.place || '',
        consultationType: payload.consultationType || prev.consultationType,
        supportArea: payload.supportArea || '',
        kuSupportTypeCode: payload.kuSupportTypeCode || KU_SUPPORT_DEFAULT_CODE,
        supportSpecific: payload.supportSpecific || {},
        topics: payload.topics || '',
        outcome: payload.outcome || '',
        nextSteps: payload.nextSteps || payload.progressSummary || '',
        selectedPartnerIds: payload.selectedPartnerIds || [],
        registeredPartnerNames: payload.registeredPartnerNames || [],
        manualPartnerNames: payload.manualPartnerNames || [],
        partnerNames: payload.partnerNames || (payload.partners ? String(payload.partners).split(';').map((item) => item.trim()).filter(Boolean) : []),
        participantCount: Number(payload.participantCount || 0),
        caseManagementMode: Boolean(payload.caseManagementMode),
        debtSummary: payload.debtSummary || '',
        debtCauses: payload.debtCauses || '',
        debtStage: payload.debtStage || prev.debtStage,
        solutionPlan: payload.solutionPlan || '',
        sessionOrder: String(payload.sessionOrder || prev.sessionOrder || '1'),
        themes: payload.themes || '',
        mentalState: payload.mentalState || '',
        recommendations: payload.recommendations || '',
        targetJob: payload.targetJob || '',
        experience: payload.experience || '',
        skills: payload.skills || '',
        position: payload.position || '',
        feedback: payload.feedback || '',
        strengths: payload.strengths || '',
        developmentAreas: payload.developmentAreas || '',
        workplace: payload.workplace || '',
        barriers: payload.barriers || '',
        generatedText: record.documentText || ''
      }));
      setGeneratedText(record.documentText || '');
      setLastGeneratedText(record.documentText || '');
      setGenerationNotice('Záznam byl načten k úpravě. Po uložení se aktualizuje původní záznam.');
      setAiGenerationStatus('idle');
      setMainView('ka02');
      setFlash('Záznam byl načten k úpravě.');
      return;
    }

    if (record.entityType === 'tpm_records' || record.entityType === 'employment_records') {
      const isEmployment = record.entityType === 'employment_records';
      setEditingGeneratedRecordId('');
      setEditingKa03RecordId(record.id);
      setSelectedClientId(clientId);
      setKa03Draft((prev) => ({
        ...prev,
        selectedClientId: clientId,
        tpmClientId: clientId,
        employmentClientId: clientId,
        worker: record.worker || prev.worker,
        employer: payload.employer || '',
        workplace: payload.workplace || '',
        tpmDate: isEmployment ? prev.tpmDate : record.activityDate || payload.startDate || todayIso(),
        startDate: payload.startDate || record.activityDate || prev.startDate,
        endDate: payload.endDate || '',
        plannedMonths: String(payload.plannedMonths ?? prev.plannedMonths),
        actualMonths: String(payload.actualMonths ?? prev.actualMonths),
        employmentDate: isEmployment ? record.activityDate || payload.employmentStartDate || todayIso() : prev.employmentDate,
        employmentStartDate: payload.employmentStartDate || record.activityDate || prev.employmentStartDate,
        employmentEndDate: payload.employmentEndDate || '',
        employmentPlannedMonths: String(payload.employmentPlannedMonths ?? prev.employmentPlannedMonths),
        employmentActualMonths: String(payload.employmentActualMonths ?? prev.employmentActualMonths),
        tpmLinkedPlanGoalId: isEmployment ? prev.tpmLinkedPlanGoalId : record.linkedPlanGoalId || payload.linkedPlanGoalId || '',
        tpmLinkedPlanGoalLabel: isEmployment ? prev.tpmLinkedPlanGoalLabel : record.linkedPlanGoalLabel || payload.linkedPlanGoalLabel || '',
        employmentLinkedPlanGoalId: isEmployment ? record.linkedPlanGoalId || payload.linkedPlanGoalId || '' : prev.employmentLinkedPlanGoalId,
        employmentLinkedPlanGoalLabel: isEmployment ? record.linkedPlanGoalLabel || payload.linkedPlanGoalLabel || '' : prev.employmentLinkedPlanGoalLabel
      }));
      setMainView('ka02');
      setFlash('Záznam byl načten k úpravě.');
      return;
    }

    setFlash('Tento typ záznamu zatím nemá editační formulář.');
  };

  const exportKa01NetworkDocx = async (record) => {
    if (!record) return;
    const payload = record.payload || {};
    const activityType = payload.type || payload.networkType || record.title || 'aktivita';
    const isTeamMeeting = String(activityType).trim().toLocaleLowerCase('cs') === 'porada';
    const generatedText = String(payload.description || record.documentText || '').trim();
    const extractSection = (labelPattern, nextLabelPattern) => {
      const match = generatedText.match(new RegExp(`(?:^|\\n)\\s*(?:${labelPattern}):\\s*([\\s\\S]*?)(?=\\n\\s*(?:${nextLabelPattern}):|$)`, 'i'));
      return String(match?.[1] || '').trim();
    };
    const description = extractSection('Popis', 'Výsledek|Úkoly') || String(payload.notes || '').trim() || generatedText || 'Neuvedeno';
    const outcome = String(payload.outcome || '').trim()
      || extractSection('Výsledek|Úkoly', 'Navazující krok|Termín a témata dalšího jednání')
      || 'Neuvedeno';
    const nextSteps = String(payload.nextSteps || '').trim()
      || extractSection('Navazující krok|Termín a témata dalšího jednání', '(?!)')
      || 'Neuvedeno';
    const filenameParts = [record.activityDate || todayIso(), 'KA02', activityType];

    try {
      const response = await fetch('/api/export-record-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `${slugify(filenameParts.join('-'))}.docx`,
          title: isTeamMeeting ? 'KA02 - Zápis z porady realizačního týmu' : (record.title || 'KA02 - aktivita sítě'),
          activityDate: record.activityDate || '',
          ka: 'KA02',
          worker: '',
          text: '',
          rows: [
            { label: 'Datum', value: record.activityDate || '' },
            { label: 'Typ aktivity', value: activityType },
            { label: 'Počet účastníků', value: payload.count ?? '' },
            { label: 'OD', value: payload.startTime || '' },
            { label: 'DO', value: payload.endTime || '' },
            { label: 'Trvání', value: payload.duration || formatDurationFromTimes(payload.startTime, payload.endTime) },
            { label: isTeamMeeting ? 'Přítomní členové realizačního týmu a další osoby' : 'Zapojení aktéři', value: payload.participants || '' },
            { label: 'Místo jednání', value: payload.place || '' },
            { label: 'Popis', value: description },
            { label: isTeamMeeting ? 'Úkoly' : 'Výsledek', value: outcome },
            { label: isTeamMeeting ? 'Termín a témata dalšího jednání' : 'Navazující krok', value: nextSteps }
          ]
        })
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Export DOCX selhal.');
      }

      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `${slugify(filenameParts.join('-'))}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(href);
      setFlash(isTeamMeeting ? 'Zápis z porady byl stažen do DOCX.' : 'Aktivita tvorby sítě byla stažena do DOCX.');
    } catch (error) {
      console.error('KA02 DOCX export error:', error);
      setFlash(error.message || 'Export aktivity tvorby sítě do DOCX selhal.');
    }
  };
  const exportKa01NetworkBulk = async () => {
    let exportRecords = ka01NetworkRecords;
    if (GOOGLE_SHEET_MACRO_URL) {
      try {
        const url = new URL(GOOGLE_SHEET_MACRO_URL, window.location.origin);
        url.searchParams.set('action', 'listNetworkMeetings');
        url.searchParams.set('project_id', activeProjectId);
        url.searchParams.set('actor_id', currentWorker);
        const response = await fetch(url.toString());
        const json = await response.json();
        if (!response.ok || json.ok === false) throw new Error(json.error || 'Na\u010dten\u00ed aktivit selhalo.');
        const freshRecords = mapSheetRecordsToAppRecords({ networkMeetings: json.networkMeetings || [] }, clientIndex)
          .filter((record) => record.entityType === 'network_activities');
        if (freshRecords.length) exportRecords = freshRecords;
      } catch (error) {
        console.warn('Fresh network export data load failed:', error);
      }
    }
    if (!exportRecords.length) {
      setFlash('Nejsou ulo\u017een\u00e9 \u017e\u00e1dn\u00e9 aktivity tvorby s\u00edt\u011b ke sta\u017een\u00ed.');
      return;
    }

    const escapeExportHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const formatExportTime = (value) => {
      const text = String(value ?? '').trim();
      if (!text) return '';

      if (/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/.test(text)) {
        const totalMinutes = Math.round(Number(text) * 24 * 60) % (24 * 60);
        return String(Math.floor(totalMinutes / 60)).padStart(2, '0')
          + ':'
          + String(totalMinutes % 60).padStart(2, '0');
      }

      const match = text.match(/(?:^|T|\s)([01]?\d|2[0-3])[:.]([0-5]\d)(?::[0-5]\d)?/);
      if (!match) return '';
      return String(Number(match[1])).padStart(2, '0') + ':' + match[2];
    };

    const rows = exportRecords
      .map((record) => {
        const payload = record.payload || {};
        const type = payload.type || payload.networkType || '';
        const startTime = formatExportTime(payload.startTime);
        const endTime = formatExportTime(payload.endTime);
        const duration = formatDurationFromTimes(startTime, endTime);
        const notesAndOutcome = [payload.notes, payload.outcome]
          .map((value) => String(value || '').trim())
          .filter(Boolean)
          .join(' / ');
        const description = payload.description || payload.notes || '';
        return `
          <tr>
            <td>${escapeExportHtml(record.activityDate || '')}</td>
            <td>${escapeExportHtml(type)}</td>
            <td class="time">${escapeExportHtml(startTime)}</td>
            <td class="time">${escapeExportHtml(endTime)}</td>
            <td>${escapeExportHtml(duration)}</td>
            <td>${escapeExportHtml(payload.participants || '')}</td>
            <td>${escapeExportHtml(payload.place || '')}</td>
            <td>${escapeExportHtml(notesAndOutcome)}</td>
            <td>${escapeExportHtml(description)}</td>
          </tr>`;
      })
      .join('');

    const content = `
      <html>
        <head>
          <meta charset="utf-8" />
          <title>KA2 - hromadn\u00fd export aktivit</title>
          <style>
            @page Section1 {
              size: 841.9pt 595.3pt;
              margin: 34pt;
              mso-page-orientation: landscape;
            }
            div.Section1 { page: Section1; }
            body { font-family: Arial, sans-serif; color: #1e293b; }
            table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 9pt; }
            th, td { padding: 5px; border: 1px solid #cbd5e1; vertical-align: top; overflow-wrap: anywhere; }
            th { background: #f8fafc; text-align: left; }
            td.time { white-space: nowrap; text-align: center; }
          </style>
        </head>
        <body>
          <div class="Section1">
            <h1 style="margin:0 0 8px;">KA2 - hromadn\u00fd export aktivit</h1>
            <p style="margin:0 0 16px;color:#475569;">Po\u010det z\u00e1znam\u016f: ${exportRecords.length}</p>
            <table>
              <colgroup>
                <col style="width:8%;" />
                <col style="width:11%;" />
                <col style="width:5%;" />
                <col style="width:5%;" />
                <col style="width:8%;" />
                <col style="width:17%;" />
                <col style="width:10%;" />
                <col style="width:17%;" />
                <col style="width:19%;" />
              </colgroup>
              <thead>
                <tr>
                  <th>Datum</th>
                  <th>Typ aktivity</th>
                  <th>OD</th>
                  <th>DO</th>
                  <th>Trv\u00e1n\u00ed</th>
                  <th>Zapojen\u00ed akt\u00e9\u0159i</th>
                  <th>M\u00edsto setk\u00e1n\u00ed</th>
                  <th>Obsah / v\u00fdsledek</th>
                  <th>Popis aktivity</th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </body>
      </html>`;

    downloadHtmlDocument(content, `ka02-hromadny-export-${todayIso()}.doc`);
    setFlash('Hromadn\u00fd export aktivit KA02 byl sta\u017een.');
  };

  const exportMonitoringBundle = () => {
    const content = buildMonitoringBundleHtml({
      indicators: computedIndicators,
      records: filteredRecords,
      clients
    });
    downloadHtmlDocument(content, 'souhrnna-monitorovaci-dokumentace.doc');
  };

  const kuStatisticsOverview = useMemo(
    () => buildKuStatisticsOverview(statisticsRows, statisticsFilters),
    [statisticsRows, statisticsFilters]
  );

  const hasValidKuStatisticsDateRange = Boolean(statisticsFilters.dateFrom && statisticsFilters.dateTo)
    && parseDateForSort(statisticsFilters.dateFrom) <= parseDateForSort(statisticsFilters.dateTo);

  const handleExportKuStatisticsDocx = async () => {
    if (!hasValidKuStatisticsDateRange) {
      setFlash('Vyber datum od a datum do pro statistiku KÚ.');
      return;
    }
    setIsExportingKuStatistics(true);
    try {
      const response = await fetch('/api/export-record-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: `statistika-ku-${statisticsFilters.dateFrom}-${statisticsFilters.dateTo}.docx`,
          title: 'Statistika pro KÚ',
          rows: [
            { label: 'Datum od', value: formatDateLabel(statisticsFilters.dateFrom) },
            { label: 'Datum do', value: formatDateLabel(statisticsFilters.dateTo) },
            { label: 'Počet unikátních osob', value: kuStatisticsOverview.totalUniqueClients },
            { label: 'Počet statistických záznamů', value: kuStatisticsOverview.totalRecords }
          ],
          text: buildKuStatisticsDocumentText(kuStatisticsOverview)
        })
      });

      if (!response.ok) {
        const errorResult = await response.json().catch(() => ({}));
        throw new Error(errorResult.error || 'Export statistiky KÚ selhal.');
      }

      const blob = await response.blob();
      const href = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = `statistika-ku-${statisticsFilters.dateFrom}-${statisticsFilters.dateTo}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(href);
      setFlash('Statistika pro KÚ byla stažena do DOCX.');
    } catch (error) {
      console.error('KU statistics DOCX export error:', error);
      setFlash(error.message || 'Export statistiky KÚ selhal.');
    } finally {
      setIsExportingKuStatistics(false);
    }
  };

  const handleGenerateZorTexts = async () => {
    if (!selectedReportingPeriod || selectedReportingPeriod.value === 'all') {
      setFlash('Nejprve vyber konkrétní vykazované období.');
      return;
    }

    setIsGeneratingZor(true);
    const kaTexts = buildZorTexts(periodRecordsForZor);
    let horizontalPrinciplesText = buildHorizontalPrinciplesFallbackText();
    let usedAi = false;
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
      if (apiKey) {
        const aiModel = selectedAiModel || DEFAULT_AI_MODEL;
        const response = await fetchGemini(`https://generativelanguage.googleapis.com/v1beta/models/${aiModel}:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: buildHorizontalPrinciplesAiPrompt({
              periodLabel: selectedReportingPeriod.label,
              kaTexts
            }) }] }],
            systemInstruction: {
              parts: [{ text: `${AI_SAFETY_BASE}\nVytváříš pouze anonymizovaný text do zprávy o realizaci. Nepřidávej žádné nedoložené skutečnosti a vrať jen výsledný odstavec bez nadpisu.` }]
            },
            generationConfig: { temperature: 0.15, maxOutputTokens: 500 }
          })
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result?.error?.message || 'AI text horizontálních principů se nepodařilo vytvořit.');
        const aiText = cleanGeneratedText(extractGeminiText(result)).trim();
        if (!aiText) throw new Error('AI vrátila prázdný text horizontálních principů.');
        horizontalPrinciplesText = aiText;
        usedAi = true;
      }
    } catch (error) {
      console.warn('ZOR horizontal principles AI fallback:', error);
    } finally {
      setZorTexts({
        periodLabel: selectedReportingPeriod.label,
        generatedAt: new Date().toISOString(),
        texts: {
          ...kaTexts,
          'Horizontální principy – rovné příležitosti žen a mužů a nediskriminace': horizontalPrinciplesText
        }
      });
      setFlash(
        usedAi
          ? `Texty pro ZOR včetně AI textu horizontálních principů byly připraveny za období ${selectedReportingPeriod.label}.`
          : `Texty pro ZOR byly připraveny za období ${selectedReportingPeriod.label}. Pro horizontální principy byl použit bezpečný pracovní text bez AI.`
      );
      setIsGeneratingZor(false);
    }
  };

  const viewTheme = VIEW_THEMES[mainView] || VIEW_THEMES.clients;

  return (
    <div className={`relative min-h-screen overflow-hidden text-slate-800 transition-colors duration-500 ${activeProject.theme.page || viewTheme.page}`}>
      <div className={`pointer-events-none absolute -left-24 top-32 h-72 w-72 rounded-full blur-3xl ${activeProject.theme.ambient || viewTheme.accent}`} />
      <div className="pointer-events-none absolute right-[-8rem] top-[22rem] h-96 w-96 rounded-full bg-white/35 blur-3xl" />
      <header className={`sticky top-0 z-10 border-b shadow-sm shadow-black/5 backdrop-blur-xl transition-colors duration-500 ${activeProject.theme.header || viewTheme.header}`}>
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 md:px-6">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className={`text-xs font-semibold uppercase tracking-[0.22em] ${activeProject.theme.label || viewTheme.label}`}>Projektové výkaznictví</p>
                <span className={`rounded-full border px-2.5 py-1 text-[10px] font-extrabold tracking-wide ${activeProject.theme.badge}`}>
                  {activeProject.shortName}
                </span>
              </div>
              <h1 className="mt-1 text-2xl font-bold text-slate-900">{activeProject.title}</h1>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {activeProject.registrationNumber} · {activeProject.recipient}
              </p>
              {goalDeadlineAlerts.total > 0 && (
                <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-xs text-amber-900 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setGoalAlertsExpanded((value) => !value)}
                    className="flex w-full items-start justify-between gap-3 text-left font-semibold"
                    title="Zobrazit detail cílů k vyhodnocení"
                  >
                    <span>
                      Ke kontrole: {goalDeadlineAlerts.approaching.length} {goalDeadlineAlerts.approaching.length === 1 ? 'cíl se blíží' : goalDeadlineAlerts.approaching.length >= 2 && goalDeadlineAlerts.approaching.length <= 4 ? 'cíle se blíží' : 'cílů se blíží'} k termínu
                      {goalDeadlineAlerts.overdue.length > 0 ? `, ${goalDeadlineAlerts.overdue.length} ${goalDeadlineAlerts.overdue.length === 1 ? 'cíl je' : goalDeadlineAlerts.overdue.length >= 2 && goalDeadlineAlerts.overdue.length <= 4 ? 'cíle jsou' : 'cílů je'} po termínu bez vyhodnocení` : ''}.
                    </span>
                    <ChevronRight className={`mt-0.5 h-4 w-4 shrink-0 transition-transform ${goalAlertsExpanded ? 'rotate-90' : ''}`} />
                  </button>
                  {!goalAlertsExpanded && goalAlertPreviewItems.length > 0 && (
                    <p className="mt-1 text-[11px] text-amber-800">
                      {goalAlertPreviewItems.map((item) => `${item.clientName} – ${formatDateLabel(item.deadline)}`).join('; ')}
                      {goalDeadlineAlerts.total > goalAlertPreviewItems.length ? `; … a další ${goalDeadlineAlerts.total - goalAlertPreviewItems.length}` : ''}
                    </p>
                  )}
                  {goalAlertsExpanded && (
                    <div className="mt-2 grid gap-2 text-[11px] md:grid-cols-2">
                      <div>
                        <div className="font-bold text-amber-950">Blíží se termín cíle</div>
                        {goalDeadlineAlerts.approaching.length ? (
                          <ul className="mt-1 space-y-1">
                            {goalDeadlineAlerts.approaching.slice(0, 6).map((item) => (
                              <li key={`soon-${item.clientId}-${item.deadline}-${item.goalLabel}`} className="rounded-md bg-white/70 px-2 py-1">
                                <strong>{item.clientName}</strong> – {formatDateLabel(item.deadline)} ({item.daysUntil === 0 ? 'dnes' : `za ${item.daysUntil} dnů`})<br />
                                <span className="text-amber-800">{item.goalLabel}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-amber-700">Žádné cíle v nejbližších {GOAL_DEADLINE_WARNING_DAYS} dnech.</p>
                        )}
                      </div>
                      <div>
                        <div className="font-bold text-amber-950">Po termínu bez vyhodnocení</div>
                        {goalDeadlineAlerts.overdue.length ? (
                          <ul className="mt-1 space-y-1">
                            {goalDeadlineAlerts.overdue.slice(0, 6).map((item) => (
                              <li key={`overdue-${item.clientId}-${item.deadline}-${item.goalLabel}`} className="rounded-md bg-white/70 px-2 py-1">
                                <strong>{item.clientName}</strong> – termín {formatDateLabel(item.deadline)} ({item.daysOverdue} dnů po termínu)<br />
                                <span className="text-amber-800">{item.goalLabel}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-amber-700">Žádné cíle po termínu bez vyhodnocení.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-col gap-3 text-sm sm:flex-row sm:items-end lg:justify-self-end">
              <ProjectSwitcher
                activeProjectId={activeProjectId}
                onChange={switchActiveProject}
                disabled={isSaving}
              />
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500" htmlFor="global-worker-select">
                  Pracovník pro aplikaci
                </label>
                <select
                  id="global-worker-select"
                  value={globalWorker || WORKERS[0]}
                  onChange={(event) => setGlobalWorker(event.target.value)}
                  className="h-11 min-w-[220px] rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  title="Vybraný pracovník se použije pro nové záznamy."
                >
                  {WORKERS.map((worker) => (
                    <option key={worker} value={worker}>{worker}</option>
                  ))}
                </select>
              </div>
              {false && <TopMetric
                label="Stav integrace"
                value={sheetError ?'Sheets fallback' : 'Hybrid aktivní'}
                icon={sheetError ?AlertCircle : CheckCircle2}
                tone={sheetError ?'amber' : 'blue'}
              />}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap gap-2">
              {APP_VIEWS.map((item) => {
                const Icon = item.icon;
                const active = mainView === item.id;
                const navTheme = NAV_THEMES[item.id] || NAV_THEMES.clients;
                return (
                  <button
                    key={item.id}
                    onClick={() => switchMainView(item.id)}
                    className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? navTheme.active
                        : navTheme.idle
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </button>
                );
              })}
            </nav>

            {statusMessage && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                {statusMessage}
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-[1] mx-auto max-w-7xl px-4 py-6 md:px-6">
        {firebaseAuthError && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {firebaseAuthError}
          </div>
        )}
        {sheetError && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {sheetError}
          </div>
        )}

        {mainView === 'clients' && (
          <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
            <div className="space-y-3">
              <Panel
                title="Klientský registr"
                description=""
                icon={Users}
                action={
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        clearSaveButtonNotice('client-create');
                        setShowClientForm((prev) => !prev);
                      }}
                      className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100"
                    >
                      <Plus className="h-4 w-4" />
                      {showClientForm ?'Zavřít formulář' : 'Přidat klienta'}
                    </button>
                  </div>
                }
              >
                <div className="mb-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Začněte psát příjmení..."
                      className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                    />
                  </div>
                </div>

                {showClientForm && (
                  <div className="mb-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                    <ClientRegistrationFields draft={clientDraft} setDraft={setClientDraft} compact />
                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        onClick={handleClientCreate}
                        disabled={isSaving}
                        className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                      >
                        <Save className="h-4 w-4" />
                        Uložit klienta
                      </button>
                      <SaveInlineNotice notice={saveButtonNotices['client-create']} />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  {isLoadingClients ?(
                    <LoadingCard text="Načítám klienty z registru..." />
                  ) : (
                    filteredClientList.length === 0 ? (
                      <div className="rounded-xl border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
                        Žádný klient neodpovídá vyhledávání.
                      </div>
                    ) : filteredClientList.map((client) => {
                      const stats = getClientStats(client.id, records);
                      const active = client.id === selectedClientId;
                      return (
                        <div
                          key={client.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => openClient(client.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              openClient(client.id);
                            }
                          }}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ?'border-indigo-500 bg-indigo-100 shadow-md ring-2 ring-indigo-300'
                              : 'border-slate-200 bg-white hover:border-indigo-200 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex w-full items-start justify-between gap-2 text-left">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-bold text-slate-900">{client.fullName}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openClientEditForm(client);
                                }}
                                className="inline-flex items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-blue-700 transition hover:bg-blue-100"
                                aria-label={`Upravit klienta ${client.fullName}`}
                              >
                                <Pencil className="h-3 w-3" />
                                Upravit
                              </button>
                              <ChevronRight className="h-4 w-4 text-slate-400" />
                            </div>
                          </div>
                          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs">
                            <MiniBadge icon={Database} label={`ID ${formatClientShortId(client)}`} tone="slate" />
                            <MiniBadge icon={Clock} label={formatSupportMinutes(stats.supportMinutes)} tone="indigo" />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </Panel>
            </div>

            <div className="space-y-4">
              {selectedClient ?(
                <>
                  {false && (
                  <Panel
                    title={selectedClient.fullName}
                    icon={User}
                    className="!border-indigo-400 !bg-indigo-100/70 ring-2 ring-indigo-200/80"
                    action={
                      <div className="flex flex-wrap gap-2 sm:flex-nowrap">
                        <button
                          onClick={summarizeClientCase}
                          disabled={isSummarizingCase}
                          className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSummarizingCase ?<Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
                          Shrnout zakázku AI
                        </button>
                        <HelpIcon help={HELP.clientsAiSummary} />
                        <button
                          onClick={() => provisionClientDriveFolder(selectedClient)}
                          disabled={isProvisioningClientFolder}
                          className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isProvisioningClientFolder ?<Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />}
                          Otevřít složku klienta
                        </button>
                        <HelpIcon help={HELP.clientsDriveFolder} />
                        <button
                          onClick={openClientEditForm}
                          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                        >
                          <User className="h-4 w-4" />
                          Upravit klienta
                        </button>
                      </div>
                    }
                  >
                    {showClientEditForm && (
                      <div className="mb-2 rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                        <ClientRegistrationFields draft={clientEditDraft} setDraft={setClientEditDraft} />
                        <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              clearSaveButtonNotice('client-update');
                              setShowClientEditForm(false);
                            }}
                            className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            Zrušit
                          </button>
                          <button
                            type="button"
                            onClick={handleClientUpdate}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <Save className="h-3.5 w-3.5" />
                            Uložit úpravy
                          </button>
                          <SaveInlineNotice notice={saveButtonNotices['client-update']} />
                        </div>
                      </div>
                    )}
                    {clientCaseSummary && (
                      <div className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50/70 p-3">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <div className="text-sm font-bold text-indigo-900">Souhrn zakázky klienta</div>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(clientCaseSummary, setCopied)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50"
                          >
                            <ClipboardCopy className="h-3.5 w-3.5" />
                            Kopírovat
                          </button>
                        </div>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-sm leading-relaxed text-slate-800">{clientCaseSummary}</pre>
                      </div>
                    )}
                    <div className="grid gap-2 xl:grid-cols-[1.55fr_0.85fr]">
                      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                        {[
                          { key: 'address', icon: MapPin, label: 'Adresa', value: buildAddress(selectedClient) },
                          { key: 'contact', icon: Phone, label: 'Kontakt', value: selectedClient.telefon || selectedClient.email || 'Neuvedeno' },
                          { key: 'edu', icon: GraduationCap, label: 'Vzdělání', value: selectedClient.vzdelani || 'Neuvedeno' },
                          { key: 'job', icon: Briefcase, label: 'Postavení na trhu práce', value: selectedClient.postaveniNaTrhu || 'Neuvedeno' },
                          { key: 'disadv', icon: AlertCircle, label: 'Znevýhodnění', value: selectedClient.znevyhodneni || 'Neuvedeno' }
                        ].map((item) => (
                          <div key={item.key} className="rounded-lg border border-slate-200 bg-white px-2.5 py-2">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                              <item.icon className="h-3 w-3" />
                              <span>{item.label}</span>
                            </div>
                            <div className="mt-1 line-clamp-2 text-sm font-semibold text-slate-900">{item.value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Projektový stav</div>
                        <div className="mt-1.5 space-y-0.5 text-sm">
                          <DetailRow label="ID klienta" value={formatClientShortId(selectedClient)} />
                          <DetailRow label="Status klienta" value={selectedClient.projectStatusLabel} />
                          <DetailRow label="Datum vstupu" value={selectedClient.datumVstupu || 'Neuvedeno'} />
                          <DetailRow label="Datum výstupu" value={selectedClient.datumVystupu || 'Neuvedeno'} />
                          <DetailRow label="Situace po ukončení" value={selectedClient.situacePoUkonceni || 'Neuvedeno'} />
                        </div>
                      </div>
                    </div>

                    <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/70 p-2">
                      {selectedClientDriveBundle?.payload ?(
                        <div className="grid gap-1.5 md:grid-cols-2">
                          {[
                            {
                              key: 'folder',
                              title: 'Klientská složka - ZDE',
                              url: selectedClientDriveBundle.payload.clientFolderUrl,
                              caption: selectedClientDriveBundle.payload.clientFolderName
                            },
                            {
                              key: 'monlist',
                              title: 'Monitorovací list - ZDE',
                              url: selectedClientDriveBundle.payload.monListFileUrl,
                              caption: selectedClientDriveBundle.payload.monListFileName
                            }
                          ].map((item) => (
                            <a
                              key={item.key}
                              href={item.url || '#'}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded-md border border-emerald-200 bg-white px-2.5 py-1.5 transition hover:border-emerald-300 hover:bg-emerald-50"
                            >
                              <div className="text-xs font-semibold text-slate-900">{item.title}</div>
                              <div className="truncate text-[11px] text-slate-500">{item.caption || 'Bez odkazu'}</div>
                            </a>
                          ))}
                        </div>
                      ) : (
                        <div className="mt-3 text-sm text-emerald-800">
                          Kompletní klientská složka se zakládá automaticky při uložení klienta.
                        </div>
                      )}
                    </div>
                  </Panel>
                  )}

                  <div className="grid gap-4">
                    <Panel
                      title={selectedClient.fullName}
                      titleClassName="!text-2xl !font-black !text-indigo-950"
                      className="!border-indigo-500 !bg-indigo-100 ring-2 ring-indigo-300"
                    >
                      {selectedClientSupportBreakdown.byType.length === 0 ?(
                        <EmptyState icon={BarChart3} title="U klienta zatím nejsou evidované žádné podpory." />
                      ) : (
                        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200 text-sm">
                              <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600">
                                <tr>
                                  <th className="px-3 py-2 text-left">Typ podpory</th>
                                  <th className="px-3 py-2 text-right">Počet</th>
                                  <th className="px-3 py-2 text-right">Čas</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {selectedClientSupportBreakdown.byType.map((item) => (
                                  <tr key={item.key}>
                                    <td className="px-3 py-2 font-medium text-slate-900">{item.label}</td>
                                    <td className="px-3 py-2 text-right text-slate-700">{item.count}</td>
                                    <td className="px-3 py-2 text-right text-slate-700">{formatSupportMinutes(item.minutes)}</td>
                                  </tr>
                                ))}
                              </tbody>
                              <tfoot className="bg-slate-50 font-semibold text-slate-800">
                                <tr>
                                  <td className="px-3 py-2">Celkem</td>
                                  <td className="px-3 py-2 text-right">{selectedClientSupportBreakdown.totalCount}</td>
                                  <td className="px-3 py-2 text-right">{formatSupportMinutes(selectedClientSupportBreakdown.totalMinutes)}</td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </div>
                      )}
                    </Panel>

                    <Panel
                      title="Klientská osa"
                      icon={History}
                      className="!border-indigo-400 !bg-indigo-100/70 ring-2 ring-indigo-200/80"
                      action={
                        <button
                          type="button"
                          onClick={exportSelectedJourneyRecords}
                          disabled={selectedJourneyPrintIds.length === 0}
                          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                        >
                          <Printer className="h-4 w-4" />
                          Tisk vybraných záznamů ({selectedJourneyPrintIds.length})
                        </button>
                      }
                    >
                      <div className="space-y-3">
                        {clientJourneyTimeline.length === 0 ?(
                          <EmptyState icon={FileText} title="Klient zatím nemá žádné uložené kroky v KA1 ani KA2." />
                        ) : (
                          clientJourneyTimeline.map((record, index) => {
                            const meta = getClientJourneyMeta(record);
                            const tone = JOURNEY_TONE_CLASSES[meta.tone] || JOURNEY_TONE_CLASSES.slate;
                            const Icon = meta.icon;
                            const summary = buildClientJourneySummary(record);
                            const detail = buildClientJourneyDetail(record, selectedClient);
                            const isExpanded = expandedJourneyRecordIds.includes(record.id);
                            const isLegacyReadOnly =
                              record.isLegacyReadOnly || record.sourceSystem === 'LEGACY_XLSM';

                            return (
                              <div key={record.id} className="grid gap-2 md:grid-cols-[72px_96px_24px_minmax(0,1fr)] md:items-start">
                                <div className="flex justify-start pt-0.5">
                                  <label className={`flex min-h-12 w-16 flex-col items-center justify-center gap-1 rounded-xl border px-2 py-1.5 text-[10px] font-bold uppercase tracking-wide shadow-sm transition ${record.isSynthetic ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400 opacity-55' : selectedJourneyPrintIds.includes(record.id) ? 'cursor-pointer border-slate-900 bg-slate-900 text-white' : 'cursor-pointer border-slate-300 bg-white text-slate-600 hover:border-slate-500 hover:bg-slate-50'}`} title={record.isSynthetic ? 'Zařazení klienta není samostatný tisknutelný zápis.' : 'Zařadit zápis do společného tisku'}>
                                    <span className="inline-flex items-center gap-1">
                                      <Printer className="h-3 w-3" />
                                      Tisk
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={selectedJourneyPrintIds.includes(record.id)}
                                      disabled={record.isSynthetic}
                                      onChange={() => toggleJourneyPrintSelection(record.id)}
                                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                                    />
                                  </label>
                                </div>
                                <div className="pt-1 text-xs font-semibold text-slate-500">{formatDateLabel(record.activityDate)}</div>
                                <div className="relative flex h-full justify-center">
                                  <div className={`relative z-[1] mt-1 h-6 w-6 rounded-full border-4 border-white shadow-sm ${tone.dot}`} />
                                  {index < clientJourneyTimeline.length - 1 && (
                                    <div className="absolute top-8 h-[calc(100%+1.5rem)] w-px bg-slate-200" />
                                  )}
                                </div>
                                <div className={`rounded-xl border p-3 shadow-sm ${tone.panel}`}>
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div className="min-w-0">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${tone.badge}`}>
                                          {meta.stage}
                                        </span>
                                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                                          {meta.label}
                                        </span>
                                        {isLegacyReadOnly && (
                                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                                            Historický XLSM · pouze čtení
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-2 flex items-start gap-2">
                                        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${tone.badge}`}>
                                          <Icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0">
                                          <div className="text-sm font-bold text-slate-900">{record.title || meta.label}</div>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="flex flex-nowrap items-center justify-end gap-1">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setExpandedJourneyRecordIds((prev) =>
                                            prev.includes(record.id) ?prev.filter((item) => item !== record.id) : [...prev, record.id]
                                          )
                                        }
                                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-50"
                                      >
                                        <ChevronRight className={`h-3 w-3 transition-transform ${isExpanded ?'rotate-90' : ''}`} />
                                        {isExpanded ?'Skrýt' : 'Detail'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => exportJourneyRecord(record)}
                                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700 transition hover:bg-slate-100"
                                      >
                                        <Download className="h-3 w-3" />
                                        Stáhnout
                                      </button>
                                      {!record.isSynthetic && !isLegacyReadOnly && (
                                        <>
                                          <button
                                            type="button"
                                            onClick={() => deleteRecord(record)}
                                            disabled={isSaving}
                                            className="shrink-0 rounded-full border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                                          >
                                            Smazat
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => editJourneyRecord(record)}
                                            disabled={isSaving}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-blue-700 transition hover:bg-blue-100 disabled:opacity-50"
                                          >
                                            <Pencil className="h-3 w-3" />
                                            Upravit
                                          </button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                  <div className="mt-3 rounded-xl border border-white/70 bg-white/80 p-3 text-sm leading-snug text-slate-700">
                                    {summary}
                                  </div>
                                  {record.entityType === 'mentor_report_document' && (
                                    <div className="mt-2 text-xs text-emerald-800">
                                      Archivní vazba: {record.payload?.tpmRecordId || 'bez vazby'}
                                    </div>
                                  )}
                                  {isExpanded && (
                                    <div className="mt-2 space-y-3">
                                      <div className="whitespace-pre-wrap rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-800">
                                        {detail}
                                      </div>
                                      {record.entityType === 'plans' && !record.isSynthetic && (
                                        <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                            <div>
                                              <div className="text-sm font-bold text-amber-950">AI návrh plánu osobního rozvoje</div>
                                              <div className="text-xs text-amber-800">Návrh se po přijetí uloží zpět do stejného záznamu plánu v KA02.</div>
                                            </div>
                                            <div className="flex flex-wrap gap-2">
                                              <button
                                                type="button"
                                                onClick={() => handleGenerateJourneyPlanDraft(record)}
                                                disabled={generatingJourneyPlanId === record.id || isSaving}
                                                className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white hover:bg-indigo-700 disabled:opacity-60"
                                              >
                                                {generatingJourneyPlanId === record.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                                Vygenerovat návrh
                                              </button>
                                              <button
                                                type="button"
                                                onClick={() => handleAcceptJourneyPlanDraft(record)}
                                                disabled={isSaving || !String(journeyPlanDrafts[record.id] || '').trim()}
                                                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                                              >
                                                <Save className="h-3.5 w-3.5" />
                                                Přijmout návrh
                                              </button>
                                            </div>
                                          </div>
                                          <textarea
                                            value={journeyPlanDrafts[record.id] ?? buildPersonalDevelopmentPlanText(record, selectedClient)}
                                            onChange={(event) => setJourneyPlanDrafts((prev) => ({ ...prev, [record.id]: event.target.value }))}
                                            rows={14}
                                            className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                          />
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })
                        )}
                      </div>
                    </Panel>

                    {false && (
                    <Panel title="Projektové aktivity klienta" description="Chronologická auditní stopa všech evidovaných kroků." icon={History}>
                      <div className="space-y-3">
                        {clientTimeline.length === 0 ?(
                          <EmptyState icon={FileText} title="Klient zatím nemá žádné uložené aktivity." />
                        ) : (
                          clientTimeline.map((record) => (
                            <div key={record.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="text-sm font-bold text-slate-900">{record.title}</div>
                                  <div className="mt-1 text-xs text-slate-500">
                                    {record.activityDate || 'Bez data'} · {record.ka || 'Bez KA'} · {record.worker || 'Bez pracovníka'}
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-indigo-700">
                                    {record.entityType}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => deleteRecord(record)}
                                    disabled={isSaving}
                                    className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                                  >
                                    Smazat
                                  </button>
                                </div>
                              </div>
                              {record.documentText && (
                                <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm leading-relaxed text-slate-700">
                                  {truncate(record.documentText, 360)}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    </Panel>
                    )}

                    {false && (
                    <Panel title="Generátor dokumentů" description="Dokument se vždy ukládá spolu se strukturovanou aktivitou." icon={Sparkles}>
                      <div className="space-y-4">
                        <SelectField
                          label="Typ dokumentu"
                          value={generatorDraft.selectedKey}
                          onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, selectedKey: value }))}
                          options={Object.entries(REPORT_PROMPTS).map(([key, value]) => ({ value: key, label: value.label }))}
                        />
                        <SelectField
                          label="Klient"
                          value={generatorDraft.clientId}
                          onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, clientId: value }))}
                          options={clients.map((client) => ({ value: client.id, label: client.fullName }))}
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <InputField label="Datum aktivity" value={generatorDraft.date} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, date: value }))} />
                          <SelectField
                            label="Pracovník"
                            value={generatorDraft.worker}
                            onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, worker: value }))}
                            options={WORKERS.map((worker) => ({ value: worker, label: worker }))}
                          />
                        </div>

                        {generatorDraft.selectedKey === 'plan' && (
                          <>
                            <TextAreaField label="Výchozí situace" value={generatorDraft.currentSituation} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, currentSituation: value }))} />
                            <TextAreaField label="Cíle" value={generatorDraft.goals} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, goals: value }))} />
                            <TextAreaField label="Bariéry" value={generatorDraft.barriers} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, barriers: value }))} />
                            <TextAreaField label="Plánované kroky" value={generatorDraft.plannedSteps} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, plannedSteps: value }))} />
                            <InputField label="Čas podpory (min)" value={generatorDraft.planDurationMinutes} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, planDurationMinutes: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'consultation' && (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <SelectField
                                label="Typ konzultace"
                                value={generatorDraft.consultationType}
                                onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, consultationType: value }))}
                                options={[
                                  { value: 'z\u00e1kladn\u00ed soci\u00e1ln\u00ed poradenstv\u00ed', label: 'z\u00e1kladn\u00ed soci\u00e1ln\u00ed poradenstv\u00ed' },
                                  { value: 'Dluhové poradenství', label: 'Dluhové poradenství' },
                                  { value: 'Motivační podpora', label: 'Motivační podpora' }
                                ]}
                              />
                              <InputField label="Délka (min)" value={generatorDraft.durationMinutes} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, durationMinutes: value }))} />
                            </div>
                            <TextAreaField label="Témata" value={generatorDraft.topics} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, topics: value }))} />
                            <TextAreaField label="Vyhodnocení" value={generatorDraft.outcome} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, outcome: value }))} />
                            <TextAreaField label="Další kroky" value={generatorDraft.nextSteps} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, nextSteps: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'debt' && (
                          <>
                            <TextAreaField label="Mapované závazky" value={generatorDraft.debtSummary} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, debtSummary: value }))} />
                            <TextAreaField label="Příčiny předlužení" value={generatorDraft.debtCauses} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, debtCauses: value }))} />
                            <InputField label="Fáze řešení" value={generatorDraft.debtStage} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, debtStage: value }))} />
                            <TextAreaField label="Návrh řešení" value={generatorDraft.solutionPlan} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, solutionPlan: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'therapy' && (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2">
                              <InputField label="Pořadí setkání" value={generatorDraft.sessionOrder} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, sessionOrder: value }))} />
                              <InputField label="Délka (min)" value={generatorDraft.durationMinutes} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, durationMinutes: value }))} />
                            </div>
                            <TextAreaField label="Témata" value={generatorDraft.themes} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, themes: value }))} />
                            <TextAreaField label="Psychický stav" value={generatorDraft.mentalState} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, mentalState: value }))} />
                            <TextAreaField label="Doporučení" value={generatorDraft.recommendations} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, recommendations: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'cv' && (
                          <>
                            <InputField label="Cílová pozice" value={generatorDraft.targetJob} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, targetJob: value }))} />
                            <InputField label="Čas podpory tvorby CV (min)" value={generatorDraft.cvDurationMinutes} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, cvDurationMinutes: value }))} />
                            <TextAreaField label="Zkušenosti" value={generatorDraft.experience} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, experience: value }))} />
                            <TextAreaField label="Dovednosti" value={generatorDraft.skills} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, skills: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'simulator' && (
                          <>
                            <InputField label="Simulovaná pozice" value={generatorDraft.position} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, position: value }))} />
                            <TextAreaField label="Průběh a výkon" value={generatorDraft.feedback} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, feedback: value }))} />
                            <TextAreaField label="Silné stránky" value={generatorDraft.strengths} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, strengths: value }))} />
                            <TextAreaField label="Rozvojové oblasti" value={generatorDraft.developmentAreas} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, developmentAreas: value }))} />
                          </>
                        )}

                        {generatorDraft.selectedKey === 'mentor' && (
                          <>
                            <InputField label="Pracoviště / kontext" value={generatorDraft.workplace} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, workplace: value }))} />
                            <TextAreaField label="Průběžný pokrok" value={generatorDraft.progressSummary} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, progressSummary: value }))} />
                            <TextAreaField label="Pozorované překážky" value={generatorDraft.barriers} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, barriers: value }))} />
                            <TextAreaField label="Další podpora" value={generatorDraft.nextSteps} onChange={(value) => setGeneratorDraft((prev) => ({ ...prev, nextSteps: value }))} />
                          </>
                        )}

                        <div className="flex flex-wrap gap-3">
                          <button
                            onClick={handleGenerateText}
                            disabled={isGenerating}
                            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                          >
                            {isGenerating ?<Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                            Vygenerovat návrh
                          </button>
                          <button
                            onClick={handleSaveGeneratedOutput}
                            disabled={isSaving}
                            className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                            {isSaving ? 'Ukládám…' : generatorDraft.selectedKey === 'consultation' ? 'Uložit výkon' : 'Uložit dokument'}
                          </button>
                          <SaveInlineNotice notice={saveNotice} />
                          <button
                            onClick={() => copyToClipboard(generatedText, setCopied)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <ClipboardCopy className="h-4 w-4" />
                            {copied ?'Zkopírováno' : 'Kopírovat'}
                          </button>
                        </div>

                        {generationNotice && (
                          <div className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-800">
                            {generationNotice}
                          </div>
                        )}

                        {false && generatedText && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-emerald-700">
                              Náhled vygenerovaného textu
                            </div>
                            <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-relaxed text-slate-800">
                              {generatedText}
                            </div>
                          </div>
                        )}

                        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="mb-2 text-sm font-semibold text-slate-700">Výstup dokumentu</div>
                          <textarea
                            value={generatedText}
                            onChange={(event) => {
                              setGeneratedText(event.target.value);
                              setGeneratorDraft((prev) => ({ ...prev, generatedText: event.target.value }));
                            }}
                            rows={24}
                            className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            placeholder="Po vygenerování nebo ručním dopsání se zde zobrazí text dokumentu."
                          />
                        </div>
                      </div>
                    </Panel>
                    )}
                  </div>
                </>
              ) : (
                <EmptyState icon={Users} title="Vyber klienta ze seznamu vlevo." />
              )}
            </div>
          </div>
        )}

        {mainView === 'ka2case' && (
          <React.Suspense fallback={<LazyViewFallback />}>
            <Ka2CaseManagementView
              clients={accessibleClients}
              records={records}
              onSaveRecord={saveRecord}
              onUpdateRecord={updateExistingRecord}
              onDeleteRecord={deleteRecord}
              ka02Draft={ka02Draft}
              setKa02Draft={setKa02Draft}
              setGeneratorDraft={setGeneratorDraft}
              renderAiDocumentPanel={renderAiDocumentPanel}
              computedIndicators={computedIndicators}
            />
          </React.Suspense>
        )}

        {mainView === 'ka01' && (
          <React.Suspense fallback={<LazyViewFallback />}>
            <Ka01View
              ka01Draft={ka01Draft}
              setKa01Draft={setKa01Draft}
              ka01ActorDraft={ka01ActorDraft}
              setKa01ActorDraft={setKa01ActorDraft}
              ka01ActorOptions={ka01ActorOptions}
              ka01ActorCustomValue={KA01_ACTOR_CUSTOM}
              updateKa01ActorEntry={updateKa01ActorEntry}
              ka01PlaceOptions={KA01_PLACE_OPTIONS}
              ka01PlaceCustomValue={KA01_PLACE_CUSTOM}
              updateKa01PlaceSelection={updateKa01PlaceSelection}
              updateKa01PlaceCustom={updateKa01PlaceCustom}
              clients={accessibleClients}
              handleSaveKa01Assessment={handleSaveKa01Assessment}
              isSaving={isSaving}
              ka01NetworkDuration={ka01NetworkDuration}
              ka01StartTimeSuggestions={ka01StartTimeSuggestions}
              ka01EndTimeSuggestions={ka01EndTimeSuggestions}
              editingKa01NetworkRecordId={editingKa01NetworkRecordId}
              handleGenerateKa01NetworkDescription={handleGenerateKa01NetworkDescription}
              handleSaveKa01Network={handleSaveKa01Network}
              handleSaveKa01ActorRegistry={handleSaveKa01ActorRegistry}
              networkSaveNotice={saveButtonNotices.network}
              actorSaveNotice={saveButtonNotices.actor}
              toggleKa01ActorAttendance={toggleKa01ActorAttendance}
              ka01AttendanceSelection={ka01AttendanceSelection}
              exportKa01AttendanceSheet={exportKa01AttendanceSheet}
              handleEditKa01ActorRegistry={handleEditKa01ActorRegistry}
              exportKa01NetworkBulk={exportKa01NetworkBulk}
              ka01NetworkTimeError={ka01NetworkTimeError}
              cancelKa01NetworkEdit={cancelKa01NetworkEdit}
              ka01NetworkRecords={ka01NetworkRecords}
              ka01ActorRegistryRecords={ka01ActorRegistryRecords}
              expandedKa01NetworkRecordIds={expandedKa01NetworkRecordIds}
              toggleKa01NetworkDescription={toggleKa01NetworkDescription}
              exportKa01NetworkDocx={exportKa01NetworkDocx}
              handleEditKa01Network={handleEditKa01Network}
              deleteRecord={deleteRecord}
              computedIndicators={computedIndicators}
              formatDurationFromTimes={formatDurationFromTimes}
            />
          </React.Suspense>
        )}

        {mainView === 'ka02' && (
          <React.Suspense fallback={<LazyViewFallback />}>
            <Ka02View
              clients={accessibleClients}
              records={records}
              onSaveRecord={saveRecord}
              onUpdateRecord={updateExistingRecord}
              ka02Draft={ka02Draft}
              setKa02Draft={setKa02Draft}
              setGeneratorDraft={setGeneratorDraft}
              renderAiDocumentPanel={renderAiDocumentPanel}
              ka02AiDocumentKeys={KA02_AI_DOCUMENT_KEYS}
              computedIndicators={computedIndicators}
              currentWorker={currentWorker}
              isSaving={isSaving}
              onGenerateAiNote={generateKa1PerformanceNote}
            />
          </React.Suspense>
        )}

        {mainView === 'education' && (
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <div className="space-y-4">
              <Panel title="Vzdělávání" description="Evidence vzdělávacích akcí pracovníků projektu." icon={GraduationCap}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <InputField label="Datum" type="date" value={educationDraft.date} onChange={(value) => setEducationDraft((prev) => ({ ...prev, date: value }))} />
                  <InputField label="Počet hodin" help={{ title: 'Počet hodin', text: 'Hodinou se myslí 60 minut.' }} value={educationDraft.hours} onChange={(value) => setEducationDraft((prev) => ({ ...prev, hours: value }))} placeholder="např. 8" />
                  <InputField label="Název vzdělávání" value={educationDraft.title} onChange={(value) => setEducationDraft((prev) => ({ ...prev, title: value }))} />
                  <InputField label="Číslo akreditace" value={educationDraft.accreditationNumber} onChange={(value) => setEducationDraft((prev) => ({ ...prev, accreditationNumber: value }))} />
                  <SelectField label="Pracovník 1" value={educationDraft.worker1} onChange={(value) => setEducationDraft((prev) => ({ ...prev, worker1: value }))} options={WORKERS.map((worker) => ({ value: worker, label: worker }))} />
                  <SelectField label="Pracovník 2" value={educationDraft.worker2} onChange={(value) => setEducationDraft((prev) => ({ ...prev, worker2: value }))} options={[{ value: '', label: 'Nevyplněno' }, ...WORKERS.map((worker) => ({ value: worker, label: worker }))]} />
                  <SelectField label="Pracovník 3" value={educationDraft.worker3} onChange={(value) => setEducationDraft((prev) => ({ ...prev, worker3: value }))} options={[{ value: '', label: 'Nevyplněno' }, ...WORKERS.map((worker) => ({ value: worker, label: worker }))]} />
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleSaveEducation} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      Uložit vzdělávání
                    </button>
                    <SaveInlineNotice notice={saveButtonNotices.education} />
                  </div>
                </div>
              </Panel>

              <Panel title="Uložená vzdělávání" description="Přehled vzdělávacích akcí uložených do evidence." icon={FileSpreadsheet}>
                {educationRecords.length === 0 ? (
                  <EmptyState icon={GraduationCap} title="Zatím není uložena žádná vzdělávací akce." />
                ) : (
                  <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-[900px] w-full divide-y divide-slate-200 text-xs">
                      <thead className="sticky top-0 bg-amber-50 font-semibold uppercase text-amber-800">
                        <tr>
                          <th className="px-2 py-2 text-left">Datum</th>
                          <th className="px-2 py-2 text-left">Počet hodin</th>
                          <th className="px-2 py-2 text-left">Název vzdělávání</th>
                          <th className="px-2 py-2 text-left">Číslo akreditace</th>
                          <th className="px-2 py-2 text-left">Pracovník 1</th>
                          <th className="px-2 py-2 text-left">Pracovník 2</th>
                          <th className="px-2 py-2 text-left">Pracovník 3</th>
                          <th className="px-2 py-2 text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {educationRecords.map((record) => {
                          const payload = record.payload || {};
                          const workers = Array.isArray(payload.workers) ? payload.workers : [record.worker || payload.worker].filter(Boolean);
                          return (
                            <tr key={record.id} className="even:bg-slate-50/60">
                              <td className="px-2 py-2">{record.activityDate || payload.date || '-'}</td>
                              <td className="px-2 py-2">{payload.hours || '-'}</td>
                              <td className="px-2 py-2 font-semibold">{payload.title || record.title || '-'}</td>
                              <td className="px-2 py-2">{payload.accreditationNumber || '-'}</td>
                              <td className="px-2 py-2">{workers[0] || '-'}</td>
                              <td className="px-2 py-2">{workers[1] || '-'}</td>
                              <td className="px-2 py-2">{workers[2] || '-'}</td>
                              <td className="whitespace-nowrap px-2 py-2 text-right">
                                <button type="button" onClick={() => deleteRecord(record)} disabled={isSaving} className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 disabled:opacity-50">
                                  Smazat
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>

            <div className="space-y-4">
              <Panel title="Supervize" description="Evidence individuálních a skupinových supervizí." icon={Brain}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <InputField label="Datum" type="date" value={supervisionDraft.date} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, date: value }))} />
                  <InputField label="Počet hodin" help={{ title: 'Počet hodin', text: 'Hodinou se myslí 60 minut.' }} value={supervisionDraft.hours} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, hours: value }))} placeholder="např. 2" />
                  <SelectField label="Typ supervize" value={supervisionDraft.type} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, type: value, worker2: value === 'individuální' ? '' : prev.worker2, worker3: value === 'individuální' ? '' : prev.worker3 }))} options={SUPERVISION_TYPE_OPTIONS.map((type) => ({ value: type, label: type }))} />
                  <SelectField label="Pracovník 1" value={supervisionDraft.worker1} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, worker1: value }))} options={WORKERS.map((worker) => ({ value: worker, label: worker }))} />
                  {!isIndividualSupervision && (
                    <>
                      <SelectField label="Pracovník 2" value={supervisionDraft.worker2} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, worker2: value }))} options={[{ value: '', label: 'Nevyplněno' }, ...WORKERS.map((worker) => ({ value: worker, label: worker }))]} />
                      <SelectField label="Pracovník 3" value={supervisionDraft.worker3} onChange={(value) => setSupervisionDraft((prev) => ({ ...prev, worker3: value }))} options={[{ value: '', label: 'Nevyplněno' }, ...WORKERS.map((worker) => ({ value: worker, label: worker }))]} />
                    </>
                  )}
                </div>
                <div className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={handleSaveSupervision} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                      <Save className="h-4 w-4" />
                      Uložit supervizi
                    </button>
                    <SaveInlineNotice notice={saveButtonNotices.supervision} />
                  </div>
                </div>
              </Panel>

              <Panel title="Uložené supervize" description="Přehled supervizí uložených do evidence." icon={FileSpreadsheet}>
                {supervisionRecords.length === 0 ? (
                  <EmptyState icon={Brain} title="Zatím není uložena žádná supervize." />
                ) : (
                  <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-[900px] w-full divide-y divide-slate-200 text-xs">
                      <thead className="sticky top-0 bg-amber-50 font-semibold uppercase text-amber-800">
                        <tr>
                          <th className="px-2 py-2 text-left">Datum</th>
                          <th className="px-2 py-2 text-left">Počet hodin</th>
                          <th className="px-2 py-2 text-left">Typ supervize</th>
                          <th className="px-2 py-2 text-left">Pracovník 1</th>
                          <th className="px-2 py-2 text-left">Pracovník 2</th>
                          <th className="px-2 py-2 text-left">Pracovník 3</th>
                          <th className="px-2 py-2 text-right">Akce</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {supervisionRecords.map((record) => {
                          const payload = record.payload || {};
                          const workers = Array.isArray(payload.workers) ? payload.workers : [];
                          return (
                            <tr key={record.id} className="even:bg-slate-50/60">
                              <td className="px-2 py-2">{record.activityDate || payload.date || '-'}</td>
                              <td className="px-2 py-2">{payload.hours || '-'}</td>
                              <td className="px-2 py-2 font-semibold">{payload.type || record.title || '-'}</td>
                              <td className="px-2 py-2">{workers[0] || '-'}</td>
                              <td className="px-2 py-2">{workers[1] || '-'}</td>
                              <td className="px-2 py-2">{workers[2] || '-'}</td>
                              <td className="whitespace-nowrap px-2 py-2 text-right">
                                <button type="button" onClick={() => deleteRecord(record)} disabled={isSaving} className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700 disabled:opacity-50">
                                  Smazat
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Panel>
            </div>
          </div>
        )}

        {mainView === 'statistics' && (
          <div className="grid gap-4 xl:grid-cols-2 xl:items-start">
            <Panel
              title="Statistiky"
              description="Přehled pro KÚ se generuje z listu Statistiky. Do klientské osy se tyto položky samostatně nepromítají."
              icon={BarChart3}
            >
              <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <InputField
                  label="Datum od"
                  type="date"
                  value={statisticsFilters.dateFrom}
                  onChange={(value) => setStatisticsFilters((prev) => ({ ...prev, dateFrom: value }))}
                />
                <InputField
                  label="Datum do"
                  type="date"
                  value={statisticsFilters.dateTo}
                  onChange={(value) => setStatisticsFilters((prev) => ({ ...prev, dateTo: value }))}
                />
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={handleExportKuStatisticsDocx}
                    disabled={!hasValidKuStatisticsDateRange || isExportingKuStatistics}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-cyan-200 bg-cyan-700 px-4 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    {isExportingKuStatistics ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    Statistika pro KÚ
                  </button>
                  {!statisticsFilters.dateFrom || !statisticsFilters.dateTo ? (
                    <p className="text-xs text-slate-500">Tlačítko se aktivuje po vyplnění obou datumů.</p>
                  ) : !hasValidKuStatisticsDateRange ? (
                    <p className="text-xs text-rose-600">Datum od nesmí být později než datum do.</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-cyan-100 bg-cyan-50 p-4">
                  <div className="text-xs font-semibold uppercase text-cyan-700">Unikátní osoby</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{kuStatisticsOverview.totalUniqueClients}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-slate-500">Statistické záznamy</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{kuStatisticsOverview.totalRecords}</div>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="text-xs font-semibold uppercase text-slate-500">Načteno z listu Statistiky</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{statisticsRows.length}</div>
                </div>
              </div>

              <div className="mt-4">
                {hasValidKuStatisticsDateRange && kuStatisticsOverview.rows.length === 0 && (
                  <EmptyState title="Bez dat pro zvolené období" text="V listu Statistiky nejsou pro zadaný rozsah aktivní položky typu podpory dle KÚ." icon={FileText} />
                )}
              {kuStatisticsOverview.rows.length > 0 && (
                <div className="overflow-auto rounded-lg border border-slate-200 bg-white">
                  <table className="min-w-[760px] w-full divide-y divide-slate-100 text-xs">
                    <thead className="bg-slate-50 text-[11px] font-semibold uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left">Skupina</th>
                        <th className="px-3 py-2 text-left">Forma pomoci</th>
                        <th className="px-3 py-2 text-left">Klienti</th>
                        <th className="px-3 py-2 text-right">Osob</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {kuStatisticsOverview.rows.map((item) => (
                        <tr key={item.key} className="align-middle">
                          <td className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{item.group}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{item.name}</td>
                          <td className="max-w-[360px] truncate px-3 py-2 text-slate-500" title={item.clientNames.join(', ')}>
                            {item.clientNames.slice(0, 6).join(', ')}{item.clientNames.length > 6 ? ` a další ${item.clientNames.length - 6}` : ''}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right text-sm font-bold text-cyan-800">{item.clientCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              </div>
            </Panel>
            <div aria-hidden="true" className="hidden xl:block" />
          </div>
        )}

        {mainView === 'dashboard' && (
          <React.Suspense fallback={<LazyViewFallback />}>
            <ReportingView
              dashboardOverview={dashboardOverview}
              exportClientsCsv={exportClientsCsv}
              exportAllRecordsBackup={exportAllRecordsBackup}
              supportExportCount={getUniqueClientSupportRecords(filteredRecords).length}
              dashboardFilters={dashboardFilters}
              setDashboardFilters={setDashboardFilters}
              filteredRecords={filteredRecords}
              handleGenerateZorTexts={handleGenerateZorTexts}
              isGeneratingZor={isGeneratingZor}
              zorTexts={zorTexts}
              copyToClipboard={copyToClipboard}
              setCopied={setCopied}
              copied={copied}
              deleteRecord={deleteRecord}
              isSaving={isSaving}
              canManageBackups={canSeeAllClients}
              backupStatus={backupStatus}
              isBackupActionRunning={isBackupActionRunning}
              handleStartFullBackup={handleStartFullBackup}
              handleInstallWeeklyBackup={handleInstallWeeklyBackup}
            />
          </React.Suspense>
        )}
      </main>

      {showClientEditForm && selectedClient && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 backdrop-blur-sm sm:p-6"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) {
              clearSaveButtonNotice('client-update');
              setShowClientEditForm(false);
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-edit-dialog-title"
            className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-blue-200 bg-white shadow-2xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 bg-gradient-to-r from-blue-50 to-indigo-50 px-4 py-3 sm:px-6">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-blue-700">Klientský registr</div>
                <h2 id="client-edit-dialog-title" className="mt-1 text-xl font-extrabold text-slate-950">
                  Upravit klienta · {selectedClient.fullName}
                </h2>
                <div className="mt-1 text-xs text-slate-500">ID {formatClientShortId(selectedClient)}</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  clearSaveButtonNotice('client-update');
                  setShowClientEditForm(false);
                }}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              >
                Zavřít
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">
              <ClientRegistrationFields draft={clientEditDraft} setDraft={setClientEditDraft} />

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Další práce s klientem</div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={summarizeClientCase}
                    disabled={isSummarizingCase}
                    className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-white px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-50 disabled:opacity-60"
                  >
                    {isSummarizingCase ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardCopy className="h-4 w-4" />}
                    Shrnout zakázku AI
                  </button>
                  {selectedClientDriveBundle?.payload?.clientFolderUrl && (
                    <a
                      href={selectedClientDriveBundle.payload.clientFolderUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                    >
                      <DownloadCloud className="h-4 w-4" />
                      Otevřít složku klienta
                    </a>
                  )}
                </div>

                {clientCaseSummary && (
                  <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border border-indigo-100 bg-white p-3 text-sm leading-relaxed text-slate-800">
                    {clientCaseSummary}
                  </pre>
                )}

                {selectedClientDriveBundle?.payload && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {[
                      {
                        key: 'monlist',
                        title: 'Monitorovací list',
                        url: selectedClientDriveBundle.payload.monListFileUrl
                      }
                    ].filter((item) => item.url).map((item) => (
                      <a
                        key={item.key}
                        href={item.url || '#'}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-50"
                      >
                        {item.title} – otevřít
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
              <button
                type="button"
                onClick={() => {
                  clearSaveButtonNotice('client-update');
                  setShowClientEditForm(false);
                }}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleClientUpdate}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {isSaving ? 'Ukládám…' : 'Uložit úpravy'}
              </button>
              <SaveInlineNotice notice={saveButtonNotices['client-update']} />
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
