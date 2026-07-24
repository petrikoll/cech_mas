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
  Sparkles,
  Users,
  UploadCloud,
  X
} from 'lucide-react';

const formatDate = (value, withTime = false) => {
  const text = String(value || '');
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/);
  if (!match) return '—';
  const date = `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`;
  return withTime && match[4] ? `${date} ${match[4]}:${match[5]}` : date;
};

const formatMoney = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 2 }).format(numeric)
    : '—';
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

function AnalysisList({ items, empty = 'Neuvedeno' }) {
  if (!Array.isArray(items) || !items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="space-y-2 text-sm leading-6 text-slate-700">
      {items.map((item, index) => {
        const label = typeof item === 'string' ? item : item.label || item.event || '';
        const date = typeof item === 'object' ? item.date : '';
        return (
          <li key={`${date}-${label}-${index}`} className="flex gap-2">
            <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-sky-600" />
            <span>{date ? <strong>{formatDate(date)} – </strong> : null}{label}</span>
          </li>
        );
      })}
    </ul>
  );
}

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
  const [expandedDocumentId, setExpandedDocumentId] = useState('');
  const [previewDocumentId, setPreviewDocumentId] = useState('');
  const [archivingDocumentId, setArchivingDocumentId] = useState('');
  const [analysisTab, setAnalysisTab] = useState('current');
  const [localAnalysisByCase, setLocalAnalysisByCase] = useState({});
  const importInputRef = useRef(null);

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
      .slice()
      .sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || '')))
      .forEach((item) => {
        if (!map[item.case_id]) map[item.case_id] = item;
      });
    return { ...map, ...localAnalysisByCase };
  }, [analyses, localAnalysisByCase]);

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
  const analysisResult = {
    ...parsedAnalysisResult,
    case_study: parsedAnalysisResult.case_study || selectedCase?.ai_case_study || ''
  };

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
      documents: chosen
    });
    setLocalAnalysisByCase((previous) => ({ ...previous, [selectedCase.case_id]: analysis }));
    setAnalysisTab('current');
  };

  const archiveDocument = async (documentId) => {
    setArchivingDocumentId(documentId);
    try { await onArchiveDocument(documentId); }
    finally { setArchivingDocumentId(''); }
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
      <section className="space-y-4">
        <article className="rounded-3xl border border-white bg-[#f3e8d7]/[0.96] p-5 shadow-[0_22px_60px_-46px_rgba(15,23,42,0.45)] ring-1 ring-amber-950/[0.08]">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-start gap-3">
              <button type="button" onClick={() => setView('list')} className="rounded-xl border border-amber-900/10 bg-white/80 p-2.5 text-slate-600 hover:bg-white" aria-label="Zpět na přehled">
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-2xl font-black text-slate-950">{selectedRow.client.fullName}</h2>
                <p className="mt-1 text-xs font-bold uppercase tracking-[0.14em] text-amber-900/60">Klient ISIR · ID {selectedRow.client.clientNumber}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => onEditClient(selectedRow.client)} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">
                <Pencil className="h-4 w-4" /> Upravit klienta
              </button>
              <button type="button" onClick={() => onCheckClient(selectedRow.client)} disabled={isChecking} className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-extrabold text-white hover:bg-sky-800 disabled:opacity-60">
                {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Zkontrolovat nyní
              </button>
            </div>
          </div>
          <div className="mt-5 grid gap-x-8 gap-y-4 border-t border-amber-950/10 pt-5 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Klient', selectedRow.client.fullName],
              ['Datum narození', formatDate(selectedRow.client.datumNarozeni)],
              ['Projekt', selectedRow.client.projectId],
              ['Poslední kontrola', formatDate(selectedRow.lastChecked, true)],
              ['Stav řízení', selectedCase ? normalizedStatus(selectedCase.case_status) : 'BEZ ŘÍZENÍ'],
              ['Spisová značka', selectedCase?.case_number || '—'],
              ['Datum zahájení', formatDate(selectedCase?.proceeding_started_at)],
              ['Poslední událost', selectedCase?.last_event_title || '—'],
              ['Hlavní dokumenty', selectedCase ? (selectedCase.main_document_count || selectedCaseDocuments.filter((item) => isTruthy(item.is_main)).length) : '—'],
              ['Vedlejší dokumenty', selectedCase ? (selectedCase.secondary_document_count || selectedCaseDocuments.filter((item) => !isTruthy(item.is_main)).length) : '—'],
              ['Lhůta přihlášek', formatDate(selectedCase?.claims_deadline)],
              ['Přihlášky pohledávek', finance.reviewed_claims_count ?? selectedCase?.claims_count ?? '—']
            ].map(([label, value]) => (
              <div key={label} className={label === 'Poslední událost' ? 'lg:col-span-2' : ''}>
                <p className="text-[10px] font-extrabold uppercase tracking-wide text-amber-950/55">{label}</p>
                <p className={`mt-1 text-sm font-extrabold leading-5 ${label === 'Stav řízení' && isDebtRelief(value) ? 'text-emerald-800' : 'text-slate-900'}`}>{value}</p>
              </div>
            ))}
          </div>
          {selectedRow.clientCases.length > 1 && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-amber-950/10 pt-4">
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
                <article className="overflow-hidden rounded-3xl border border-white bg-white/[0.95] shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
                  <div className="flex flex-col gap-3 border-b border-slate-100 p-5 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h3 className="text-lg font-black text-slate-950">Dokumenty ({selectedCaseDocuments.length})</h3>
                      <p className="mt-1 text-sm text-slate-500">Dokument můžete rozbalit přímo zde, otevřít v nové kartě, stáhnout nebo uložit na Disk.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {caseNewDocuments.length > 0 && (
                        <button type="button" onClick={() => onMarkDocumentsSeen(selectedCase.case_id)} className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-extrabold text-amber-800">
                          <BellRing className="h-4 w-4" /> Označit nové jako přečtené
                        </button>
                      )}
                      <button type="button" onClick={runAnalysis} disabled={!selectedDocumentIds.length || isAnalyzing || selectedDocumentIds.length > 10} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-xs font-extrabold text-white hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50">
                        {isAnalyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        Vytvořit AI shrnutí ({selectedDocumentIds.length})
                      </button>
                    </div>
                  </div>
                  <div className="overflow-x-auto border-b border-slate-100 px-4 py-4" aria-label="Seznam PDF dokumentů">
                    <div className="flex min-w-max divide-x divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {selectedCaseDocuments.map((document) => {
                      const selected = selectedDocumentIds.includes(document.document_id);
                      const expanded = expandedDocumentId === document.document_id;
                      const documentAnalysis = safeParse(document.analysis_json, {});
                      return (
                        <div
                          key={document.document_id}
                          className={`flex w-[182px] flex-none flex-col transition ${
                            previewDocumentId === document.document_id
                              ? 'bg-sky-50 ring-2 ring-inset ring-sky-300'
                              : selected
                                ? 'bg-violet-50/70 ring-1 ring-inset ring-violet-200'
                                : 'bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex min-h-[112px] items-start gap-2 p-2.5">
                              <input
                                type="checkbox"
                                checked={selected}
                                disabled={!selected && selectedDocumentIds.length >= 10}
                                onChange={() => toggleDocument(document.document_id)}
                                aria-label={`Vybrat dokument ${document.title}`}
                                className="mt-1 h-4 w-4 shrink-0 rounded border-slate-300 text-violet-700 focus:ring-violet-200 disabled:opacity-40"
                              />
                              <button
                                type="button"
                                onClick={() => setPreviewDocumentId(previewDocumentId === document.document_id ? '' : document.document_id)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <span className="block text-xs font-extrabold text-slate-500">{formatDate(document.event_date)}</span>
                                <strong className="mt-1 block line-clamp-3 text-xs leading-4 text-slate-900">{document.title}</strong>
                                <span className="mt-1.5 flex flex-wrap items-center gap-1">
                                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-extrabold uppercase ring-1 ${
                                    isTruthy(document.is_main) ? 'bg-sky-50 text-sky-800 ring-sky-100' : 'bg-slate-50 text-slate-600 ring-slate-200'
                                  }`}>{isTruthy(document.is_main) ? 'hlavní dokument' : 'příloha'}</span>
                                  {isTruthy(document.is_new) && <span className="rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase text-amber-800 ring-1 ring-amber-200">nové</span>}
                                </span>
                              </button>
                          </div>
                          <div className="mt-auto flex items-center gap-1 border-t border-slate-100 bg-slate-50/70 p-1.5">
                              {documentAnalysis.summary && (
                                <button type="button" onClick={() => setExpandedDocumentId(expanded ? '' : document.document_id)} title="AI shrnutí dokumentu" aria-label="AI shrnutí dokumentu" className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-violet-100 bg-violet-50 text-violet-800">
                                  <Bot className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <a href={document.drive_url || document.source_url} target="_blank" rel="noreferrer" className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50">
                                <ExternalLink className="h-3.5 w-3.5" /> Otevřít
                              </a>
                              <a href={document.source_url} target="_blank" rel="noreferrer" download title="Stáhnout" aria-label={`Stáhnout ${document.title}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                                <Download className="h-3.5 w-3.5" />
                              </a>
                              {!document.drive_url && (
                                <button type="button" onClick={() => archiveDocument(document.document_id)} disabled={Boolean(archivingDocumentId)} title="Uložit na Disk" aria-label={`Uložit na Disk ${document.title}`} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 disabled:opacity-60">
                                  {archivingDocumentId === document.document_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                                </button>
                              )}
                          </div>
                          {expanded && documentAnalysis.summary && (
                            <div className="border-t border-violet-100 bg-white p-2.5 text-[11px] leading-4 text-slate-700">
                              <strong className="text-violet-800">{documentAnalysis.category || 'AI shrnutí dokumentu'}</strong>
                              <p className="mt-1">{documentAnalysis.summary}</p>
                            </div>
                          )}
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
                <article className="rounded-3xl border border-white bg-white/[0.95] p-5 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
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
                  <div className="mt-4 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                    <button type="button" onClick={() => setAnalysisTab('current')} className={`rounded-lg px-3 py-2 text-xs font-extrabold ${analysisTab === 'current' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Aktuální stav</button>
                    <button type="button" onClick={() => setAnalysisTab('evolution')} className={`rounded-lg px-3 py-2 text-xs font-extrabold ${analysisTab === 'evolution' ? 'bg-white text-slate-950 shadow-sm' : 'text-slate-500'}`}>Vývoj řízení</button>
                  </div>
                  {!selectedAnalysis && !selectedCase.ai_summary_json ? (
                    <div className="mt-4 rounded-2xl border border-dashed border-violet-200 bg-violet-50/40 p-6 text-center">
                      <Bot className="mx-auto h-7 w-7 text-violet-400" />
                      <p className="mt-2 text-sm font-bold text-slate-800">Vyberte důležité dokumenty a vytvořte společnou analýzu.</p>
                    </div>
                  ) : analysisTab === 'current' ? (
                    <div className="mt-5 space-y-5">
                      <div><h4 className="text-sm font-black text-slate-900">Stav nyní</h4><p className="mt-2 text-sm leading-6 text-slate-700">{analysisResult.status_now || 'Neuvedeno'}</p></div>
                      <div><h4 className="text-sm font-black text-slate-900">Nejbližší termíny</h4><div className="mt-2"><AnalysisList items={analysisResult.nearest_deadlines} /></div></div>
                      <div><h4 className="text-sm font-black text-slate-900">Co ověřit a řešit</h4><div className="mt-2"><AnalysisList items={analysisResult.advisor_actions} /></div></div>
                      <div><h4 className="text-sm font-black text-slate-900">Co má udělat klient</h4><div className="mt-2"><AnalysisList items={analysisResult.client_actions} /></div></div>
                      <div className="rounded-2xl bg-emerald-50/70 p-4 ring-1 ring-emerald-100">
                        <h4 className="text-sm font-black text-emerald-950">Finance a pohledávky</h4>
                        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                          <div><dt className="text-xs text-emerald-800">Pohledávky celkem</dt><dd className="font-black text-emerald-950">{formatMoney(finance.claims_total_amount || selectedCase.claims_total_amount)}</dd></div>
                          <div><dt className="text-xs text-emerald-800">Přezkoumáno</dt><dd className="font-black text-emerald-950">{finance.reviewed_claims_count ?? selectedCase.claims_count ?? '—'}</dd></div>
                          <div><dt className="text-xs text-emerald-800">Očekávání 3 roky</dt><dd className="font-black text-emerald-950">{finance.expected_satisfaction_3y_percent == null ? '—' : `${finance.expected_satisfaction_3y_percent} %`}</dd></div>
                          <div><dt className="text-xs text-emerald-800">Očekávání 5 let</dt><dd className="font-black text-emerald-950">{finance.expected_satisfaction_5y_percent == null ? '—' : `${finance.expected_satisfaction_5y_percent} %`}</dd></div>
                        </dl>
                      </div>
                      <div><h4 className="text-sm font-black text-slate-900">Nejistoty</h4><div className="mt-2"><AnalysisList items={analysisResult.uncertainties} empty="Žádné uvedené." /></div></div>
                      <p className="border-t border-slate-100 pt-3 text-xs text-slate-500">Jistota výstupu: <strong>{analysisResult.confidence || 'neuvedena'}</strong></p>
                    </div>
                  ) : (
                    <div className="mt-5 space-y-5">
                      <div><h4 className="text-sm font-black text-slate-900">Chronologie</h4><div className="mt-2"><AnalysisList items={analysisResult.proceeding_evolution} /></div></div>
                      {analysisResult.insolvency_evaluation && <div><h4 className="text-sm font-black text-slate-900">Vyhodnocení oddlužení</h4><p className="mt-2 text-sm leading-6 text-slate-700">{analysisResult.insolvency_evaluation}</p></div>}
                      {analysisResult.case_study && <div><h4 className="text-sm font-black text-slate-900">Kazuistika</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{analysisResult.case_study}</p></div>}
                    </div>
                  )}
                </article>
              </div>
            </div>
          </>
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
