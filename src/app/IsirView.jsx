import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BellRing,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Download,
  DownloadCloud,
  ExternalLink,
  FileDown,
  FileText,
  Filter,
  FolderOpen,
  Loader2,
  Pencil,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Users,
  UploadCloud,
  X
} from 'lucide-react';
import {
  parseLegacyIsirCaseStudy,
  selectMostCompleteCaseStudy
} from '../lib/legacyIsirCaseStudy.js';

const formatDate = (value, withTime = false) => {
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return '—';
  const date = `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`;
  return withTime && match[4] ? `${date} ${match[4]}:${match[5]}` : date;
};

const formatCompactDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}.${match[2]}.${match[1]}` : '—';
};

const formatClaimsDeadlineStatus = (value) => {
  const deadline = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline)) return 'Nelze bezpečně určit';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Prague',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const todayParts = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${todayParts.year}-${todayParts.month}-${todayParts.day}`;
  if (deadline > today) return `Běží do ${formatDate(deadline)}`;
  if (deadline === today) return `Končí dnes (${formatDate(deadline)})`;
  return `Skončila ${formatDate(deadline)}`;
};

const isTruthy = (value) => /^(ano|true|1)$/i.test(String(value || ''));
const normalizedStatus = (value) => String(value || '').trim().toLocaleUpperCase('cs') || 'BEZ ŘÍZENÍ';
const isDebtRelief = (value) => /ODDLUŽEN/i.test(normalizedStatus(value));
const isRemoved = (value) => /ODSKRT|UKONČ/i.test(normalizedStatus(value));
const isOpenCase = (value) => /NEVYŘ|NEVYR|VYŘIZ|MORATOR|KONKURS/i.test(normalizedStatus(value));
const safeParse = (value, fallback = {}) => {
  if (value && typeof value === 'object') return value;
  try { return JSON.parse(String(value || '')); } catch { return fallback; }
};

const parseMarkedSections = (value) => {
  const source = String(value || '').replace(/\r\n?/g, '\n').trim();
  const matches = [...source.matchAll(/\[\[SECTION:([^:\]]+):([^\]]+)\]\]/g)];
  if (!matches.length) {
    return source ? [{ key: 'content', title: 'Obsah', body: source }] : [];
  }
  return matches.map((match, index) => ({
    key: match[1],
    title: match[2],
    body: source
      .slice(match.index + match[0].length, matches[index + 1]?.index ?? source.length)
      .trim()
  }));
};

const cleanAiLine = (value) => String(value || '').replace(/\*\*/g, '').trim();

function RichAiText({ value }) {
  const lines = String(value || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let list = [];
  const flushList = () => {
    if (!list.length) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} className="list-disc space-y-1 pl-5">
        {list.map((item, index) => <li key={`${item}-${index}`}>{item}</li>)}
      </ul>
    );
    list = [];
  };
  lines.forEach((rawLine) => {
    const line = cleanAiLine(rawLine);
    if (!line) {
      flushList();
      return;
    }
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (bullet) {
      list.push(cleanAiLine(bullet[1]));
      return;
    }
    flushList();
    const heading = line.length <= 80
      && (/^#{1,4}\s+/.test(line) || /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ0-9][^:]{2,70}:\s*$/.test(line));
    if (heading) {
      blocks.push(
        <h4 key={`heading-${blocks.length}`} className="mt-4 text-xs font-black text-slate-950 first:mt-0">
          {line.replace(/^#{1,4}\s+/, '').replace(/:\s*$/, '')}
        </h4>
      );
      return;
    }
    const label = line.match(/^([^:\n]{2,60}:)\s*(.*)$/);
    blocks.push(
      <p key={`paragraph-${blocks.length}`}>
        {label ? <><strong className="text-slate-900">{label[1]}</strong>{label[2] ? ` ${label[2]}` : ''}</> : line}
      </p>
    );
  });
  flushList();
  return <div className="space-y-2">{blocks.length ? blocks : <p>Bez obsahu.</p>}</div>;
}

const getPdfPreviewUrl = (document) => {
  const sourceUrl = String(document?.source_url || '');
  try {
    const parsed = new URL(sourceUrl);
    if (
      parsed.protocol === 'https:'
      && parsed.hostname.toLowerCase() === 'isir.justice.cz'
      && parsed.pathname.toLowerCase() === '/isir/doc/dokument.pdf'
      && /^\d+$/.test(parsed.searchParams.get('id') || '')
    ) {
      return `/api/isir-document?url=${encodeURIComponent(parsed.toString())}#page=1&zoom=page-width&pagemode=thumbs`;
    }
  } catch {
    // Neoficiální nebo starší odkaz se otevře původním způsobem.
  }
  return document?.drive_url || sourceUrl;
};

const statusTone = (status) => {
  if (status === 'BEZ ŘÍZENÍ') return 'bg-slate-100 text-slate-600 ring-slate-200';
  if (isDebtRelief(status)) return 'bg-emerald-50 text-emerald-800 ring-emerald-200';
  if (isRemoved(status)) return 'bg-slate-100 text-slate-700 ring-slate-200';
  return 'bg-amber-50 text-amber-800 ring-amber-200';
};

export default function IsirView({
  clients = [],
  cases = [],
  documents = [],
  verifications = [],
  analyses = [],
  isChecking,
  isAnalyzing,
  isImporting,
  progressNotice,
  onCheckClient,
  onCheckProject,
  onArchiveDocument,
  onAnalyzeDocuments,
  onMarkDocumentsSeen,
  onExportCaseStudy,
  onImportLegacyData,
  onImportLegacyFromDrive,
  onEditClient
}) {
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedCaseId, setSelectedCaseId] = useState('');
  const [view, setView] = useState('list');
  const [sortBy, setSortBy] = useState('client');
  const [statusFilters, setStatusFilters] = useState([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState([]);
  const [previewDocumentId, setPreviewDocumentId] = useState('');
  const [archivingDocumentId, setArchivingDocumentId] = useState('');
  const [analysisTab, setAnalysisTab] = useState('current');
  const [floatingSummary, setFloatingSummary] = useState(null);
  const [floatingSummaryTab, setFloatingSummaryTab] = useState('summary');
  const [isFloatingSummaryMinimized, setIsFloatingSummaryMinimized] = useState(false);
  const [floatingSummaryPosition, setFloatingSummaryPosition] = useState(null);
  const importInputRef = useRef(null);
  const floatingSummaryPanelRef = useRef(null);
  const floatingSummaryDragRef = useRef(null);

  const verificationByClient = useMemo(
    () => Object.fromEntries(verifications.map((item) => [String(item.client_id), item])),
    [verifications]
  );
  const casesByClient = useMemo(() => cases.reduce((map, item) => {
    const key = String(item.client_id || '');
    map[key] = [...(map[key] || []), item];
    return map;
  }, {}), [cases]);
  const documentsByCase = useMemo(() => documents.reduce((map, item) => {
    const key = String(item.case_id || '');
    map[key] = [...(map[key] || []), item];
    return map;
  }, {}), [documents]);
  const latestAnalysisByCase = useMemo(() => {
    const map = {};
    analyses
      .filter((item) =>
        !item.kind
        || item.kind === 'CASE_DOCUMENT_ANALYSIS'
        || item.kind === 'LEGACY_LOCAL_IMPORT'
      )
      .slice()
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .forEach((item) => {
        if (!map[item.case_id]) map[item.case_id] = item;
      });
    return map;
  }, [analyses]);
  const clientRows = useMemo(() => clients.map((client) => {
    const clientCases = (casesByClient[client.id] || [])
      .slice()
      .sort((left, right) => String(right.proceeding_started_at || '').localeCompare(String(left.proceeding_started_at || '')));
    const latestCase = clientCases[0] || null;
    const verification = verificationByClient[client.id] || null;
    const caseDocuments = clientCases.flatMap((item) => documentsByCase[item.case_id] || []);
    const status = latestCase ? normalizedStatus(latestCase.case_status) : 'BEZ ŘÍZENÍ';
    return {
      client,
      clientCases,
      latestCase,
      verification,
      status,
      newDocuments: caseDocuments.filter((item) => isTruthy(item.is_new)),
      lastChecked: verification?.verified_at || latestCase?.checked_at || ''
    };
  }), [clients, casesByClient, documentsByCase, verificationByClient]);

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('cs');
    const rows = clientRows.filter((row) => {
      if (normalizedQuery && !`${row.client.fullName} ${row.client.clientNumber} ${row.latestCase?.case_number || ''}`
        .toLocaleLowerCase('cs').includes(normalizedQuery)) return false;
      if (onlyNew && !row.newDocuments.length) return false;
      if (statusFilters.length) {
        const matches = statusFilters.some((filter) => {
          if (filter === 'none') return row.status === 'BEZ ŘÍZENÍ';
          if (filter === 'debt-relief') return isDebtRelief(row.status);
          if (filter === 'removed') return isRemoved(row.status);
          if (filter === 'open') return isOpenCase(row.status);
          if (filter === 'deadline') {
            return row.clientCases.some((item) => item.claims_deadline && item.claims_deadline >= new Date().toISOString().slice(0, 10));
          }
          return true;
        });
        if (!matches) return false;
      }
      return true;
    });
    return rows.sort((left, right) => {
      if (sortBy === 'status') return left.status.localeCompare(right.status, 'cs');
      if (sortBy === 'checked') return String(right.lastChecked).localeCompare(String(left.lastChecked));
      if (sortBy === 'case') return String(left.latestCase?.case_number || '').localeCompare(String(right.latestCase?.case_number || ''), 'cs');
      return String(left.client.fullName || '').localeCompare(String(right.client.fullName || ''), 'cs');
    });
  }, [clientRows, onlyNew, query, sortBy, statusFilters]);

  const selectedRow = clientRows.find((row) => row.client.id === selectedClientId) || null;
  const selectedCase = selectedRow?.clientCases.find((item) => item.case_id === selectedCaseId)
    || selectedRow?.clientCases[0]
    || null;
  const selectedCaseDocuments = selectedCase
    ? (documentsByCase[selectedCase.case_id] || []).slice().sort((left, right) =>
      String(right.event_date || '').localeCompare(String(left.event_date || '')))
    : [];
  const selectedAnalysis = selectedCase ? latestAnalysisByCase[selectedCase.case_id] || null : null;
  const parsedAnalysisResult = selectedAnalysis?.result
    || safeParse(selectedAnalysis?.result_json || selectedCase?.ai_summary_json, {});
  const legacyCaseStudy = selectMostCompleteCaseStudy(
    parsedAnalysisResult.case_study,
    selectedCase?.ai_case_study
  );
  const legacyCaseStudyResult = parseLegacyIsirCaseStudy(legacyCaseStudy);
  const analysisResult = {
    ...parsedAnalysisResult,
    ...legacyCaseStudyResult,
    finances: parsedAnalysisResult.finances || {},
    case_study: legacyCaseStudy
  };
  const caseStudySections = parseMarkedSections(legacyCaseStudy);
  const activeCaseStudySection = caseStudySections.find((section) => section.key === analysisTab)
    || caseStudySections[0]
    || null;
  const floatingSummarySections = parseMarkedSections(floatingSummary?.summary_text);
  const activeFloatingSummarySection = floatingSummarySections
    .find((section) => section.key === floatingSummaryTab)
    || floatingSummarySections[0]
    || null;
  const documentSummaries = selectedCase
    ? analyses
      .filter((item) => item.case_id === selectedCase.case_id && item.kind === 'DOCUMENT_SUMMARY')
      .slice()
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .map((item) => {
        const result = item.result || safeParse(item.result_json, {});
        const summary = result.document_summary;
        return summary?.summary_text
          ? {
            ...summary,
            id: item.analysis_id,
            created_at: item.created_at,
            title: summary.title || 'Shrnutí vybraných dokumentů'
          }
          : null;
      })
      .filter(Boolean)
    : [];

  const checkedCount = clientRows.filter((row) => row.verification).length;
  const foundCount = clientRows.filter((row) => row.clientCases.length).length;
  const debtReliefCount = clientRows.filter((row) => isDebtRelief(row.status)).length;
  const removedCount = clientRows.filter((row) => isRemoved(row.status)).length;
  const newDocumentRows = clientRows.filter((row) => row.newDocuments.length);

  const openDetail = (row) => {
    setSelectedClientId(row.client.id);
    setSelectedCaseId(row.latestCase?.case_id || '');
    setSelectedDocumentIds([]);
    setPreviewDocumentId('');
    setView('detail');
  };
  const toggleStatus = (key) => setStatusFilters((previous) =>
    previous.includes(key) ? previous.filter((item) => item !== key) : [...previous, key]
  );
  const toggleDocument = (documentId) => setSelectedDocumentIds((previous) =>
    previous.includes(documentId) ? previous.filter((item) => item !== documentId) : [...previous, documentId]
  );

  const runAnalysis = async () => {
    const chosen = selectedCaseDocuments.filter((item) => selectedDocumentIds.includes(item.document_id));
    const analysis = await onAnalyzeDocuments({
      client: selectedRow.client,
      caseItem: selectedCase,
      documents: chosen,
      contextDocuments: selectedCaseDocuments,
      mode: 'document-summary'
    });
    const summary = analysis?.result?.document_summary;
    if (summary?.summary_text) {
      setFloatingSummary({
        ...summary,
        id: analysis.analysis_id,
        created_at: analysis.created_at,
        title: summary.title || 'Shrnutí vybraných dokumentů'
      });
      setFloatingSummaryTab('summary');
      setIsFloatingSummaryMinimized(false);
    }
    setSelectedDocumentIds([]);
  };

  const archiveDocument = async (documentId) => {
    setArchivingDocumentId(documentId);
    try { await onArchiveDocument(documentId); }
    finally { setArchivingDocumentId(''); }
  };

  const startFloatingSummaryDrag = (event) => {
    if (event.target.closest('button') || !floatingSummaryPanelRef.current) return;
    const rect = floatingSummaryPanelRef.current.getBoundingClientRect();
    floatingSummaryDragRef.current = {
      pointerId: event.pointerId,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveFloatingSummary = (event) => {
    const drag = floatingSummaryDragRef.current;
    const panel = floatingSummaryPanelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const rect = panel.getBoundingClientRect();
    setFloatingSummaryPosition({
      left: Math.max(8, Math.min(event.clientX - drag.offsetX, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(event.clientY - drag.offsetY, window.innerHeight - rect.height - 8))
    });
  };

  const stopFloatingSummaryDrag = (event) => {
    if (floatingSummaryDragRef.current?.pointerId === event.pointerId) {
      floatingSummaryDragRef.current = null;
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };

  const importLegacyBundle = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const bundle = JSON.parse(await file.text());
    await onImportLegacyData(bundle);
  };

  if (view === 'detail' && selectedRow) {
    const finance = analysisResult.finances || {};
    const caseNewDocuments = selectedCaseDocuments.filter((item) => isTruthy(item.is_new));
    const previewDocument = selectedCaseDocuments.find((item) => item.document_id === previewDocumentId) || null;
    const previewDocumentUrl = getPdfPreviewUrl(previewDocument);
    return (
      <section className="space-y-3">
        <article className="rounded-2xl border border-amber-900/15 bg-white/[0.96] p-3 shadow-[0_14px_34px_-28px_rgba(15,23,42,0.45)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => setView('list')} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-50" aria-label="Zpět na přehled">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-sky-700">Detail klienta ISIR · ID {selectedRow.client.clientNumber}</p>
                <h2 className="mt-0.5 text-xl font-black text-slate-950">{selectedRow.client.fullName}</h2>
                <p className="text-xs text-slate-500">Datum narození {formatDate(selectedRow.client.datumNarozeni)} · projekt {selectedRow.client.projectId}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onEditClient(selectedRow.client)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> Upravit klienta
              </button>
              <button type="button" onClick={() => onCheckClient(selectedRow.client)} disabled={isChecking} className="inline-flex items-center gap-1.5 rounded-lg bg-rose-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-rose-800 disabled:opacity-60">
                {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Zkontrolovat nyní
              </button>
            </div>
          </div>
        </article>

        <article className="rounded-xl border border-[#9a6b3e] bg-[#bd8753] p-3 text-slate-950 shadow-[0_12px_30px_-26px_rgba(71,42,18,0.8)]">
          <div className="grid gap-x-5 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Stav řízení', selectedCase ? normalizedStatus(selectedCase.case_status) : 'BEZ ŘÍZENÍ'],
              ['Spisová značka', selectedCase?.case_number || '—'],
              ['Datum zahájení', formatDate(selectedCase?.proceeding_started_at)],
              ['Poslední kontrola', formatDate(selectedRow.lastChecked, true)],
              ['Poslední událost', selectedCase?.last_event_title || '—'],
              ['Hlavní dokumenty', selectedCase ? (selectedCase.main_document_count || selectedCaseDocuments.filter((item) => isTruthy(item.is_main)).length) : '—'],
              ['Vedlejší dokumenty', selectedCase ? (selectedCase.secondary_document_count || selectedCaseDocuments.filter((item) => !isTruthy(item.is_main)).length) : '—'],
              ['Lhůta přihlášek', formatClaimsDeadlineStatus(selectedCase?.claims_deadline)],
              ['Přihlášky pohledávek', finance.reviewed_claims_count ?? selectedCase?.claims_count ?? '—']
            ].map(([label, value]) => (
              <div key={label} className={label === 'Poslední událost' ? 'lg:col-span-2' : ''}>
                <p className="text-[9px] font-extrabold uppercase tracking-wide text-amber-950/65">{label}</p>
                <p className={`mt-0.5 text-xs font-extrabold leading-4 ${label === 'Stav řízení' && isDebtRelief(value) ? 'text-emerald-950' : 'text-slate-950'}`}>{value}</p>
              </div>
            ))}
          </div>
          {selectedRow.clientCases.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-amber-950/20 pt-3">
              {selectedRow.clientCases.map((item) => (
                <button key={item.case_id} type="button" onClick={() => {
                  setSelectedCaseId(item.case_id);
                  setSelectedDocumentIds([]);
                  setPreviewDocumentId('');
                }} className={`rounded-xl px-3 py-2 text-xs font-extrabold ring-1 ${
                  selectedCase?.case_id === item.case_id
                    ? 'bg-sky-700 text-white ring-sky-700'
                    : 'bg-slate-50 text-slate-700 ring-slate-200'
                }`}>{item.case_number}</button>
              ))}
            </div>
          )}
        </article>

        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-white/[0.94] px-3 py-2 text-[11px] shadow-sm">
          <span className="inline-flex items-center gap-2 font-bold text-emerald-800">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {isAnalyzing ? 'AI právě zpracovává dokumenty' : 'Bez běžící AI úlohy'}
          </span>
          <span className="text-slate-500">
            <strong className="text-slate-700">Kazuistika:</strong> {selectedAnalysis ? formatDate(selectedAnalysis.created_at, true) : 'zatím nevytvořena'}
          </span>
        </div>
        <div role="status" aria-live="polite" className="rounded-xl border border-sky-100 bg-sky-50/90 px-3 py-2 text-xs leading-5 text-sky-950 shadow-sm">
          <span className="inline-flex items-start gap-2">
            {isChecking || isAnalyzing
              ? <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
              : <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{progressNotice || 'Kontrola nyní neběží.'}</span>
          </span>
        </div>

        {!selectedCase ? (
          <div className="rounded-3xl border border-white bg-white/90 p-12 text-center ring-1 ring-slate-900/[0.05]">
            <Scale className="mx-auto h-9 w-9 text-slate-300" />
            <h3 className="mt-3 text-lg font-black text-slate-900">Bez nalezeného řízení</h3>
            <p className="mt-1 text-sm text-slate-500">Poslední kontrola {formatDate(selectedRow.lastChecked, true)}.</p>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              <div className="space-y-4">
                <article className="overflow-hidden rounded-xl border border-[#dfcdb8] bg-white/[0.97] shadow-sm">
                  <div className="flex min-h-[66px] items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
                    <h3 className="text-base font-black text-slate-800">Dokumenty</h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-extrabold text-slate-500">Vybráno: {selectedDocumentIds.length}</span>
                      <button type="button" onClick={runAnalysis} disabled={!selectedDocumentIds.length || isAnalyzing || selectedDocumentIds.length > 10} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#dcc5a9] bg-[#f6f2ec] px-3 text-xs font-extrabold text-slate-600 hover:bg-[#efe7dc] disabled:cursor-not-allowed disabled:opacity-60">
                        {isAnalyzing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        Vytvořit AI shrnutí
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto px-4 pb-2 pt-2" aria-label="Seznam PDF dokumentů">
                    <div className="flex min-w-max gap-2">
                    {selectedCaseDocuments.map((document) => {
                      const selected = selectedDocumentIds.includes(document.document_id);
                      return (
                        <div
                          key={document.document_id}
                          className={`flex h-[94px] w-[136px] flex-none flex-col overflow-hidden rounded-[10px] border shadow-sm transition ${
                            previewDocumentId === document.document_id
                              ? 'border-sky-300 bg-sky-50 ring-1 ring-sky-200'
                              : selected
                                ? 'border-violet-300 bg-violet-50/70 ring-1 ring-violet-200'
                                : 'border-slate-300 bg-white hover:bg-[#fffaf4]'
                          }`}
                        >
                          <div className="flex min-h-0 flex-1 items-start gap-2 px-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!selected && selectedDocumentIds.length >= 10}
                                onChange={() => toggleDocument(document.document_id)}
                                aria-label={`Vybrat dokument ${document.title}`}
                                className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-sm border-slate-400 text-violet-700 focus:ring-violet-200 disabled:opacity-40"
                              />
                              <button
                                type="button"
                                onClick={() => setPreviewDocumentId(previewDocumentId === document.document_id ? '' : document.document_id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block text-[10px] font-extrabold leading-3 text-slate-500">{formatCompactDate(document.event_date)}</span>
                                <strong className="mt-0.5 block line-clamp-2 text-[10px] font-black leading-[12px] text-[#79491f]" title={document.title}>{document.title}</strong>
                                <span className="mt-0.5 block truncate text-[9px] font-bold leading-3 text-slate-500">
                                  {isTruthy(document.is_main) ? 'hlavní dokument' : 'vedlejší dokument'}
                                  {isTruthy(document.is_new) ? ' · nové' : ''}
                                </span>
                              </button>
                          </div>
                          <div className="mt-auto flex h-[30px] items-center gap-1 border-t border-[#eadfce] bg-[#fffaf4] px-1.5 py-1">
                              <a href={document.drive_url || document.source_url} target="_blank" rel="noreferrer" className="inline-flex h-5 flex-1 items-center justify-center rounded-full border border-[#dfc4a5] bg-white px-2 text-[9px] font-bold text-slate-700 hover:bg-[#f7eee3]">
                                Otevřít
                              </a>
                              <a href={document.source_url} target="_blank" rel="noreferrer" download title="Stáhnout" aria-label={`Stáhnout ${document.title}`} className="inline-flex h-5 flex-1 items-center justify-center rounded-full border border-[#dfc4a5] bg-white px-2 text-[9px] font-bold text-slate-700 hover:bg-[#f7eee3]">
                                Stáhnout
                              </a>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                  </div>
                  {previewDocument && (
                    <div className="border-t border-slate-200 bg-slate-50/70 p-4 sm:p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <strong className="block truncate text-base text-slate-950">{previewDocument.title}</strong>
                          <span className="mt-1 block text-xs text-slate-500">{formatDate(previewDocument.event_date)}</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => setPreviewDocumentId('')} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <ChevronDown className="h-3.5 w-3.5" /> Sbalit náhled
                          </button>
                          <a href={previewDocument.drive_url || previewDocument.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-2 text-xs font-extrabold text-white hover:bg-sky-800">
                            <ExternalLink className="h-3.5 w-3.5" /> Otevřít
                          </a>
                          <a href={previewDocument.source_url} target="_blank" rel="noreferrer" download className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50">
                            <Download className="h-3.5 w-3.5" /> Stáhnout
                          </a>
                          {!previewDocument.drive_url && (
                            <button type="button" onClick={() => archiveDocument(previewDocument.document_id)} disabled={Boolean(archivingDocumentId)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
                              {archivingDocumentId === previewDocument.document_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                              Uložit na Disk
                            </button>
                          )}
                          {caseNewDocuments.length > 0 && (
                            <button type="button" onClick={() => onMarkDocumentsSeen(selectedCase.case_id)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 hover:bg-amber-100">
                              <BellRing className="h-3.5 w-3.5" /> Označit nové jako přečtené
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner">
                        <iframe
                          src={previewDocumentUrl}
                          title={`Náhled dokumentu ${previewDocument.title}`}
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-[72vh] min-h-[560px] w-full bg-white"
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500">Pokud se náhled PDF nezobrazí, použijte tlačítko Otevřít nebo Stáhnout.</p>
                    </div>
                  )}
                </article>
              </div>

              <div className="space-y-4">
                <article className="rounded-xl border border-[#dfcdb8] bg-white/[0.97] p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Kazuistika AI</p>
                      <h3 className="mt-1 text-lg font-black text-slate-950">{selectedAnalysis ? formatDate(selectedAnalysis.created_at, true) : 'Zatím nevytvořena'}</h3>
                    </div>
                    {selectedAnalysis && (
                      <button type="button" onClick={() => onExportCaseStudy({ client: selectedRow.client, caseItem: selectedCase, analysis: { ...selectedAnalysis, result: analysisResult } })} className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-extrabold text-violet-800">
                        <FileDown className="h-4 w-4" /> DOCX
                      </button>
                    )}
                  </div>
                  {!caseStudySections.length && !documentSummaries.length ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center">
                      <Bot className="mx-auto h-7 w-7 text-violet-400" />
                      <p className="mt-2 text-sm font-bold text-slate-800">Kazuistika zatím není vytvořená. Vytvoří se automaticky po načtení podstatných dokumentů.</p>
                    </div>
                  ) : (
                    <div className="mt-4 grid gap-3 lg:grid-cols-[190px_minmax(0,1fr)]">
                      <aside className="rounded-xl border border-amber-200 bg-[#f7ead8] p-2">
                        <nav className="space-y-2" aria-label="Části kazuistiky">
                          {caseStudySections.map((section) => (
                            <button
                              key={section.key}
                              type="button"
                              onClick={() => setAnalysisTab(section.key)}
                              className={`w-full rounded-lg border px-3 py-3 text-left text-[11px] font-extrabold uppercase tracking-wide transition ${
                                activeCaseStudySection?.key === section.key
                                  ? 'border-amber-800 bg-[#875326] text-white shadow-sm'
                                  : 'border-amber-300 bg-white text-amber-950 hover:bg-amber-50'
                              }`}
                            >
                              {section.title}
                            </button>
                          ))}
                        </nav>
                        <div className="mt-3 border-t border-amber-200 pt-3">
                          <p className="text-[9px] font-extrabold uppercase tracking-wide text-amber-900/60">Minimalizovaná shrnutí</p>
                          {documentSummaries.length ? (
                            <div className="mt-2 space-y-1.5">
                              {documentSummaries.map((summary) => (
                                <button
                                  key={summary.id}
                                  type="button"
                                  onClick={() => {
                                    setFloatingSummary(summary);
                                    setFloatingSummaryTab('summary');
                                    setIsFloatingSummaryMinimized(false);
                                  }}
                                  className="w-full rounded-lg border border-amber-200 bg-white p-2 text-left transition hover:bg-amber-50"
                                >
                                  <strong className="block truncate text-[10px] text-slate-800">{summary.title}</strong>
                                  <span className="mt-1 block line-clamp-3 text-[9px] leading-3.5 text-slate-600">
                                    {summary.minimal_summary || summary.summary_text}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <p className="mt-1 text-[10px] leading-4 text-amber-950/65">Uložená shrnutí dokumentů se zobrazí zde po jejich vytvoření.</p>
                          )}
                        </div>
                      </aside>

                      <section className="rounded-xl border border-sky-200 bg-white p-4">
                        <h3 className="text-base font-black text-slate-950">
                          {activeCaseStudySection?.title || 'Kazuistika'}
                        </h3>
                        {activeCaseStudySection ? (
                          <div className="mt-4 text-xs leading-5 text-slate-700">
                            <RichAiText value={activeCaseStudySection.body} />
                          </div>
                        ) : (
                          <p className="mt-4 text-sm text-slate-500">Kazuistika zatím není vytvořená.</p>
                        )}
                      </section>
                    </div>
                  )}
                </article>
              </div>
            </div>
          </>
        )}
        {floatingSummary && !isFloatingSummaryMinimized && (
          <aside
            ref={floatingSummaryPanelRef}
            style={floatingSummaryPosition
              ? { left: floatingSummaryPosition.left, top: floatingSummaryPosition.top }
              : undefined}
            className={`fixed z-50 flex max-h-[78vh] w-[min(720px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-2xl ${
              floatingSummaryPosition ? '' : 'bottom-5 right-5'
            }`}
          >
            <div
              onPointerDown={startFloatingSummaryDrag}
              onPointerMove={moveFloatingSummary}
              onPointerUp={stopFloatingSummaryDrag}
              onPointerCancel={stopFloatingSummaryDrag}
              className="flex cursor-move touch-none select-none items-start justify-between gap-4 border-b border-amber-200 bg-[#f7ead8] px-4 py-3"
            >
              <div className="min-w-0">
                <strong className="block truncate text-sm text-slate-900">{floatingSummary.title}</strong>
                <span className="mt-0.5 block text-[10px] text-slate-500">
                  {floatingSummary.created_at ? `Vytvořeno: ${formatDate(floatingSummary.created_at, true)}` : ''}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => setIsFloatingSummaryMinimized(true)}
                  className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[10px] font-bold text-amber-950"
                >
                  Minimalizovat
                </button>
                <button
                  type="button"
                  onClick={() => setFloatingSummary(null)}
                  className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600"
                  aria-label="Zavřít shrnutí"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            {floatingSummarySections.length > 1 && (
              <nav className="flex flex-wrap gap-2 border-b border-slate-200 px-4 py-2" aria-label="Části shrnutí dokumentů">
                {floatingSummarySections.map((section) => (
                  <button
                    key={section.key}
                    type="button"
                    onClick={() => setFloatingSummaryTab(section.key)}
                    className={`rounded-lg px-3 py-1.5 text-[10px] font-extrabold ${
                      activeFloatingSummarySection?.key === section.key
                        ? 'bg-[#875326] text-white'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {section.title}
                  </button>
                ))}
              </nav>
            )}
            <div className="min-h-0 overflow-y-auto p-4">
              <h3 className="text-sm font-black text-slate-950">
                {activeFloatingSummarySection?.title || 'Shrnutí dokumentu'}
              </h3>
              <div className="mt-3 text-xs leading-5 text-slate-700">
                <RichAiText value={activeFloatingSummarySection?.body || floatingSummary.summary_text} />
              </div>
            </div>
          </aside>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-3xl border border-white bg-white/[0.94] p-6 shadow-[0_22px_60px_-46px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/[0.05]">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 ring-1 ring-sky-100"><Scale className="h-6 w-6" /></div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Kontrola a práce s dokumenty</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Klienti ISIR</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">Přehled řízení, nových dokumentů, lhůt a AI analýz pro klienty právě zvoleného projektu.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={importInputRef} type="file" accept="application/json,.json" onChange={importLegacyBundle} className="sr-only" />
            <button type="button" onClick={onImportLegacyFromDrive} disabled={isImporting || isChecking} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-emerald-800 disabled:opacity-60">
              {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <DownloadCloud className="h-4 w-4" />} Načíst připravená data z Disku
            </button>
            <button type="button" onClick={() => importInputRef.current?.click()} disabled={isImporting || isChecking} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-extrabold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60">
              <UploadCloud className="h-4 w-4" /> Vybrat jiný soubor
            </button>
            <button type="button" onClick={onCheckProject} disabled={isChecking || isImporting} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white shadow-sm hover:bg-sky-800 disabled:opacity-60">
              {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Hromadná kontrola ISIR
            </button>
          </div>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            [Users, 'Klienti', clients.length, 'bg-slate-50 text-slate-800 ring-slate-100'],
            [CheckCircle2, 'Zkontrolováno', checkedCount, 'bg-sky-50 text-sky-800 ring-sky-100'],
            [ShieldAlert, 'Nalezená řízení', foundCount, 'bg-amber-50 text-amber-800 ring-amber-100'],
            [Scale, 'Oddlužení', debtReliefCount, 'bg-emerald-50 text-emerald-800 ring-emerald-100'],
            [CircleAlert, 'Odškrtnuto', removedCount, 'bg-slate-100 text-slate-700 ring-slate-200']
          ].map(([Icon, label, value, tone]) => (
            <div key={label} className={`rounded-2xl p-4 ring-1 ${tone}`}>
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide opacity-75"><Icon className="h-4 w-4" />{label}</div>
              <div className="mt-2 text-2xl font-black">{value}</div>
            </div>
          ))}
        </div>
        <div role="status" aria-live="polite" className="mt-4 min-h-12 rounded-2xl border border-sky-100 bg-sky-50/75 px-4 py-3 text-sm leading-6 text-sky-950">
          <div className="flex items-start gap-2">
            {isChecking || isImporting ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin" /> : <Clock3 className="mt-1 h-4 w-4 shrink-0" />}
            <span>{progressNotice || 'Kontrola nyní neběží. Uložené výsledky jsou dostupné v tabulce.'}</span>
          </div>
        </div>
      </div>

      {newDocumentRows.length > 0 && (
        <div className="rounded-3xl border border-amber-100 bg-amber-50/85 p-4 ring-1 ring-amber-100">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="flex shrink-0 items-center gap-2 font-black text-amber-950"><BellRing className="h-5 w-5" /> Nové dokumenty</div>
            <div className="flex flex-wrap gap-2">
              {newDocumentRows.slice(0, 8).map((row) => (
                <button key={row.client.id} type="button" onClick={() => openDetail(row)} className="rounded-xl bg-white px-3 py-2 text-xs font-extrabold text-amber-900 ring-1 ring-amber-200">
                  {row.client.fullName} <span className="ml-1 rounded-md bg-amber-100 px-1.5 py-0.5">+{row.newDocuments.length}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-3xl border border-white bg-white/[0.95] p-4 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Hledat klienta, ID nebo spis…" className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-9 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100" />
            {query && <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-3 text-slate-400"><X className="h-4 w-4" /></button>}
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-600">
            <Filter className="h-4 w-4" />
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="h-9 min-w-0 flex-1 bg-transparent font-bold outline-none">
              <option value="client">Řadit podle klienta</option>
              <option value="status">Řadit podle stavu</option>
              <option value="case">Řadit podle spisu</option>
              <option value="checked">Řadit podle kontroly</option>
            </select>
          </label>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-sm font-bold text-amber-900">
            <input type="checkbox" checked={onlyNew} onChange={(event) => setOnlyNew(event.target.checked)} /> Jen s novými dokumenty
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            ['none', 'Bez řízení'],
            ['open', 'Nevyřízená'],
            ['debt-relief', 'Oddlužení'],
            ['removed', 'Odškrtnutá'],
            ['deadline', 'Ve lhůtě pro přihlášky']
          ].map(([key, label]) => (
            <label key={key} className={`flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold ring-1 ${
              statusFilters.includes(key) ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-white text-slate-600 ring-slate-200'
            }`}><input type="checkbox" checked={statusFilters.includes(key)} onChange={() => toggleStatus(key)} />{label}</label>
          ))}
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-100">
          <table className="min-w-[1080px] w-full border-collapse text-left">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Datum narození</th>
                <th className="px-4 py-3">Stav insolvence</th>
                <th className="px-4 py-3">Spisová značka</th>
                <th className="px-4 py-3">Datum prvního podání</th>
                <th className="px-4 py-3">Poslední událost</th>
                <th className="px-4 py-3">Poslední kontrola</th>
                <th className="px-4 py-3 text-right">Akce</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map((row) => (
                <tr key={row.client.id} className="bg-white text-sm hover:bg-sky-50/35">
                  <td className="px-4 py-3">
                    <button type="button" onClick={() => openDetail(row)} className="font-black text-slate-950 hover:text-sky-700">{row.client.fullName}</button>
                    <span className="mt-0.5 block text-xs text-slate-500">ID {row.client.clientNumber}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.client.datumNarozeni)}</td>
                  <td className="px-4 py-3"><span className={`inline-flex rounded-lg px-2.5 py-1 text-xs font-extrabold ring-1 ${statusTone(row.status)}`}>{row.status}</span></td>
                  <td className="px-4 py-3 font-bold text-slate-700">{row.latestCase?.case_number || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.latestCase?.proceeding_started_at)}</td>
                  <td className="max-w-[260px] px-4 py-3 text-slate-600">
                    <span className="line-clamp-2">{row.latestCase?.last_event_at ? `${formatDate(row.latestCase.last_event_at)} – ` : ''}{row.latestCase?.last_event_title || '—'}</span>
                    {row.newDocuments.length > 0 && <span className="mt-1 inline-flex rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-800 ring-1 ring-amber-200">+{row.newDocuments.length} nové</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{formatDate(row.lastChecked, true)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" onClick={() => openDetail(row)} className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-extrabold text-sky-800">
                      Detail <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRows.length && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-sm text-slate-500">Filtru neodpovídá žádný klient.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
