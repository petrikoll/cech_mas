import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock3,
  DownloadCloud,
  ExternalLink,
  FileText,
  FolderOpen,
  Loader2,
  RefreshCw,
  Scale,
  Search,
  ShieldAlert,
  Users
} from 'lucide-react';

const formatDate = (value) => {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}. ${Number(match[2])}. ${match[1]}` : '—';
};

const isMatched = (value) => /^(ano|true|1)$/i.test(String(value || ''));

export default function IsirView({
  clients,
  cases,
  documents,
  verifications,
  isChecking,
  progressNotice,
  onCheckClient,
  onCheckProject,
  onArchiveDocument
}) {
  const [query, setQuery] = useState('');
  const [selectedClientId, setSelectedClientId] = useState('');
  const [archivingDocumentId, setArchivingDocumentId] = useState('');

  const verificationByClientId = useMemo(
    () => Object.fromEntries((verifications || []).map((item) => [String(item.client_id), item])),
    [verifications]
  );
  const filteredClients = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('cs');
    return (clients || []).filter((client) => {
      if (!normalized) return true;
      return `${client.fullName || ''} ${client.clientNumber || ''}`
        .toLocaleLowerCase('cs')
        .includes(normalized);
    });
  }, [clients, query]);
  const selectedClient = (clients || []).find((client) => client.id === selectedClientId) || null;
  const selectedVerification = selectedClient ? verificationByClientId[selectedClient.id] : null;
  const selectedCases = (cases || []).filter((item) => item.client_id === selectedClientId);
  const selectedDocuments = (documents || [])
    .filter((item) => item.client_id === selectedClientId)
    .sort((left, right) => String(right.event_date || '').localeCompare(String(left.event_date || '')));
  const checkedCount = Object.keys(verificationByClientId).length;
  const matchedCount = Object.values(verificationByClientId).filter((item) => isMatched(item.matched)).length;
  const driveCount = (documents || []).filter((item) => item.drive_url).length;
  const metricStyles = {
    slate: { card: 'border-slate-100 bg-slate-50/70', icon: 'text-slate-700' },
    sky: { card: 'border-sky-100 bg-sky-50/70', icon: 'text-sky-700' },
    amber: { card: 'border-amber-100 bg-amber-50/70', icon: 'text-amber-700' },
    emerald: { card: 'border-emerald-100 bg-emerald-50/70', icon: 'text-emerald-700' }
  };

  const archiveDocument = async (document) => {
    setArchivingDocumentId(document.document_id);
    try {
      await onArchiveDocument(document.document_id);
    } finally {
      setArchivingDocumentId('');
    }
  };

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-white/90 bg-white/[0.91] p-6 shadow-[0_22px_60px_-46px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/[0.05] backdrop-blur-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="rounded-2xl bg-sky-50 p-3 text-sky-700 ring-1 ring-sky-100">
              <Scale className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-700">Hromadná kontrola klientů</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-950">Insolvenční rejstřík</h2>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Kontrola probíhá po jednom klientovi přímo proti ISIR. Výsledky, řízení a dokumenty se ukládají k projektu.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCheckProject}
            disabled={isChecking}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-sky-700 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Zkontrolovat celý projekt
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            [Users, 'Klienti projektu', clients.length, 'slate'],
            [CheckCircle2, 'Zkontrolováno', checkedCount, 'sky'],
            [ShieldAlert, 'Nalezená řízení', matchedCount, 'amber'],
            [FolderOpen, 'PDF na Disku', driveCount, 'emerald']
          ].map(([Icon, label, value, tone]) => (
            <div key={label} className={`rounded-2xl border p-4 ${metricStyles[tone].card}`}>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                <Icon className={`h-4 w-4 ${metricStyles[tone].icon}`} />
                {label}
              </div>
              <div className="mt-2 text-2xl font-black text-slate-950">{value}</div>
            </div>
          ))}
        </div>

        <div className="mt-4 min-h-12 rounded-2xl border border-sky-100 bg-sky-50/75 px-4 py-3 text-sm leading-6 text-sky-950">
          <div className="flex items-start gap-2">
            {isChecking ? <Loader2 className="mt-1 h-4 w-4 shrink-0 animate-spin" /> : <Clock3 className="mt-1 h-4 w-4 shrink-0" />}
            <span>{progressNotice || 'Kontrola nyní neběží. Poslední uložené výsledky zůstávají dostupné níže.'}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
        <aside className="rounded-3xl border border-white/90 bg-white/[0.91] p-4 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Vyhledat klienta…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
            />
          </label>
          <div className="mt-3 max-h-[680px] space-y-2 overflow-auto pr-1">
            {filteredClients.map((client) => {
              const verification = verificationByClientId[client.id];
              const active = selectedClientId === client.id;
              return (
                <button
                  type="button"
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`flex w-full items-center justify-between gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                    active
                      ? 'border-sky-200 bg-sky-50 ring-2 ring-sky-100'
                      : 'border-slate-100 bg-white hover:border-sky-100 hover:bg-sky-50/40'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold text-slate-900">{client.fullName}</span>
                    <span className="mt-1 block text-xs text-slate-500">
                      ID {client.clientNumber || '—'} · {verification ? `kontrola ${formatDate(verification.verified_at)}` : 'dosud nekontrolován'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${
                      !verification ? 'bg-slate-300' : isMatched(verification.matched) ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  </span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="min-w-0">
          {!selectedClient ? (
            <div className="rounded-3xl border border-dashed border-sky-200 bg-white/80 p-12 text-center">
              <Scale className="mx-auto h-9 w-9 text-sky-300" />
              <h3 className="mt-3 text-lg font-extrabold text-slate-900">Vyberte klienta</h3>
              <p className="mt-1 text-sm text-slate-500">Zobrazí se výsledek kontroly, řízení a dostupné dokumenty.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-3xl border border-white bg-white/[0.92] p-5 shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-700">Vybraný klient · ID {selectedClient.clientNumber}</p>
                    <h3 className="mt-1 text-2xl font-black text-slate-950">{selectedClient.fullName}</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      {selectedVerification
                        ? `${isMatched(selectedVerification.matched) ? 'Řízení nalezeno' : 'Bez započitatelného vstupu od 1. 3. 2026'} · poslední kontrola ${formatDate(selectedVerification.verified_at)}`
                        : 'Klient zatím nebyl zkontrolován.'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onCheckClient(selectedClient)}
                    disabled={isChecking}
                    className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-extrabold text-sky-800 hover:bg-sky-100 disabled:opacity-60"
                  >
                    {isChecking ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Zkontrolovat klienta
                  </button>
                </div>
              </div>

              {selectedCases.length === 0 ? (
                <div className="rounded-3xl border border-white bg-white/[0.88] p-8 text-center text-sm text-slate-500 ring-1 ring-slate-900/[0.05]">
                  Pro klienta není uložené žádné insolvenční řízení.
                </div>
              ) : selectedCases.map((caseItem) => {
                const caseDocuments = selectedDocuments.filter((document) => document.case_id === caseItem.case_id);
                return (
                  <article key={caseItem.case_id} className="overflow-hidden rounded-3xl border border-white bg-white/[0.93] shadow-[0_20px_54px_-44px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.05]">
                    <div className="border-b border-slate-100 bg-gradient-to-r from-sky-50/80 to-white p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Spisová značka</p>
                          <h4 className="mt-1 text-lg font-black text-slate-950">{caseItem.case_number}</h4>
                          <p className="mt-1 text-sm text-slate-600">
                            Zahájeno {formatDate(caseItem.proceeding_started_at)} · {caseItem.case_status || 'stav neuveden'}
                          </p>
                        </div>
                        {caseItem.detail_url && (
                          <a href={caseItem.detail_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50">
                            Otevřít v ISIR <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="p-5">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <h5 className="font-extrabold text-slate-900">Dokumenty ({caseDocuments.length})</h5>
                        <span className="text-xs text-slate-500">PDF lze otevřít ze zdroje nebo uložit do složky klienta</span>
                      </div>
                      {caseDocuments.length === 0 ? (
                        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">V detailu řízení nebyly nalezené PDF dokumenty.</p>
                      ) : (
                        <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100">
                          {caseDocuments.map((document) => (
                            <div key={document.document_id} className="flex flex-col gap-3 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                              <div className="flex min-w-0 items-start gap-3">
                                <FileText className="mt-0.5 h-5 w-5 shrink-0 text-sky-700" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-bold text-slate-900" title={document.title}>{document.title}</p>
                                  <p className="mt-0.5 text-xs text-slate-500">{formatDate(document.event_date)}{document.drive_url ? ' · uloženo na Google Disku' : ''}</p>
                                </div>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <a
                                  href={document.drive_url || document.source_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                                >
                                  {document.drive_url ? <FolderOpen className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                                  {document.drive_url ? 'Otevřít z Disku' : 'Otevřít PDF'}
                                </a>
                                {!document.drive_url && (
                                  <button
                                    type="button"
                                    onClick={() => archiveDocument(document)}
                                    disabled={Boolean(archivingDocumentId)}
                                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                                  >
                                    {archivingDocumentId === document.document_id
                                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      : <DownloadCloud className="h-3.5 w-3.5" />}
                                    Uložit na Disk
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
