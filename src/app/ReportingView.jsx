import React from 'react';
import { Activity, Archive, BarChart3, CheckCircle2, ClipboardCopy, Download, FileSpreadsheet, FileText, Flag, HardDriveDownload, Loader2, ShieldCheck, Target } from 'lucide-react';

import { HelpIcon, Panel, SelectField } from '../components/ui.jsx';
import { HELP } from '../config/helpCatalog.js';
import { REPORTING_PERIODS, WORKERS } from '../config/projectConfig.js';

const formatMetric = (value) =>
  Number(value || 0).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });

const formatPercent = (value) =>
  `${Number(value || 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

const PROJECT_TONES = {
  CECH: {
    badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    icon: 'bg-indigo-100 text-indigo-700',
    bar: 'bg-indigo-600',
    ring: '#4f46e5',
    soft: 'border-indigo-100 bg-indigo-50/50'
  },
  MAS: {
    badge: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    icon: 'bg-emerald-100 text-emerald-700',
    bar: 'bg-emerald-600',
    ring: '#059669',
    soft: 'border-emerald-100 bg-emerald-50/50'
  }
};

const safePercent = (value) => Math.max(0, Math.min(100, Number(value) || 0));

function SummaryCard({ label, accessibleLabel, value, icon: Icon, tone }) {
  const percent = safePercent(value);
  return (
    <div aria-label={accessibleLabel || label} className="flex min-w-0 items-center gap-4 rounded-2xl border border-white bg-white/95 p-4 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.045]">
      <div
        className="grid h-16 w-16 shrink-0 place-items-center rounded-full"
        style={{ background: `conic-gradient(${tone.ring} ${percent * 3.6}deg, #e2e8f0 0deg)` }}
      >
        <div className="grid h-12 w-12 place-items-center rounded-full bg-white">
          <Icon className="h-5 w-5 text-slate-600" />
        </div>
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black tracking-tight text-slate-950">{formatPercent(value)}</div>
        <div className="mt-0.5 text-sm font-semibold leading-snug text-slate-600">{label}</div>
      </div>
    </div>
  );
}

function MetricCard({ item, tone }) {
  return (
    <article className="rounded-2xl border border-white bg-white/95 p-5 shadow-[0_12px_32px_-26px_rgba(15,23,42,0.5)] ring-1 ring-slate-900/[0.045] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-28px_rgba(15,23,42,0.48)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Indikátor</div>
          <h3 className="mt-1 text-lg font-black text-slate-950">{item.code}</h3>
        </div>
        <div className={`rounded-xl p-2.5 ${tone.icon}`}><BarChart3 className="h-5 w-5" /></div>
      </div>
      <div className="mt-5 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">Aktuálně / cíl</div>
          <div className="mt-1 text-xl font-black text-slate-950">
            {formatMetric(item.current)} <span className="text-sm font-semibold text-slate-400">/ {formatMetric(item.target)}</span>
          </div>
        </div>
        <strong className="text-sm text-slate-700">{formatPercent(item.percent)}</strong>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${safePercent(item.percent)}%` }} />
      </div>
    </article>
  );
}

function GoalCard({ item, tone }) {
  return (
    <article className={`rounded-2xl border p-4 transition hover:bg-white ${tone.soft}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold leading-snug text-slate-900">{item.label}</h3>
            {item.supplemental && (
              <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                mezivýsledek
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-slate-600">
            <strong className="text-slate-950">{formatMetric(item.current)}</strong> z cílových {formatMetric(item.target)}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-black text-slate-800">{formatPercent(item.percent)}</div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white">
        <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${safePercent(item.percent)}%` }} />
      </div>
    </article>
  );
}

function ReportingView({
  projectDashboard,
  activeProjectId,
  exportClientsXlsx,
  exportAllRecordsBackup,
  supportExportCount,
  dashboardFilters,
  setDashboardFilters,
  filteredRecords,
  handleGenerateZorTexts,
  isGeneratingZor = false,
  zorTexts,
  copyToClipboard,
  setCopied,
  copied,
  canManageBackups = false,
  backupStatus = null,
  isBackupActionRunning = false,
  handleStartFullBackup,
  handleInstallWeeklyBackup,
  handleVerifyProjectInsolvencies,
  isVerifyingProjectInsolvencies = false,
  projectInsolvencyNotice = ''
}) {
  const fulfillment = projectDashboard || { indicators: [], goals: [], outputPercent: 0, resultPercent: 0, goalsPercent: 0 };
  const tone = PROJECT_TONES[activeProjectId] || PROJECT_TONES.CECH;
  const backupBusy = isBackupActionRunning || ['queued', 'running'].includes(backupStatus?.state);
  const backupFinishedAt = backupStatus?.finishedAt
    ? new Date(backupStatus.finishedAt).toLocaleString('cs-CZ')
    : '';
  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-white bg-white/70 p-4 shadow-[0_16px_44px_-32px_rgba(15,23,42,0.42)] ring-1 ring-slate-900/[0.045] backdrop-blur-sm sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-full border px-3 py-1 text-xs font-black tracking-wide ${tone.badge}`}>
                PROJEKT {activeProjectId || ''}
              </span>
              <span className="text-xs font-semibold text-slate-500">Kumulativní stav projektu</span>
            </div>
            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">Plnění indikátorů a cílů</h1>
            <p className="mt-1 text-sm text-slate-600">Rychlý přehled aktuálního plnění vůči cílovým hodnotám.</p>
          </div>
          <div className="w-full sm:w-auto sm:min-w-[360px]">
            <button
              type="button"
              onClick={handleVerifyProjectInsolvencies}
              disabled={isVerifyingProjectInsolvencies}
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border bg-white/75 px-4 py-3 text-sm font-extrabold shadow-[0_8px_24px_-20px_rgba(15,23,42,0.45)] transition hover:-translate-y-0.5 hover:bg-white disabled:cursor-wait disabled:opacity-60 ${tone.badge}`}
            >
              {isVerifyingProjectInsolvencies
                ? <Loader2 className="h-5 w-5 animate-spin" />
                : <ShieldCheck className="h-5 w-5" />}
              {isVerifyingProjectInsolvencies ? 'Probíhá hromadná kontrola ISIR…' : 'Hromadně ověřit klienty v ISIR'}
            </button>
            <div
              role="status"
              aria-live="polite"
              className={`mt-2 flex min-h-10 items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold ${
                isVerifyingProjectInsolvencies
                  ? 'border-indigo-200 bg-indigo-50 text-indigo-800'
                  : 'border-slate-200 bg-white/70 text-slate-600'
              }`}
            >
              {isVerifyingProjectInsolvencies && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
              <span>{projectInsolvencyNotice || 'Kontrola zatím nebyla spuštěna.'}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <SummaryCard label="Výstupové indikátory" accessibleLabel="Plnění indikátorů výstupů celkem v %" value={fulfillment.outputPercent} icon={Flag} tone={tone} />
          <SummaryCard label="Výsledkové indikátory" accessibleLabel="Plnění indikátorů výsledků celkem v %" value={fulfillment.resultPercent} icon={BarChart3} tone={tone} />
          <SummaryCard label="Projektové cíle" accessibleLabel="Plnění cílů celkem v %" value={fulfillment.goalsPercent} icon={CheckCircle2} tone={tone} />
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-black text-slate-950">Plnění indikátorů</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {fulfillment.indicators.map((item) => <MetricCard key={item.key} item={item} tone={tone} />)}
        </div>
      </section>

      <section className="rounded-3xl border border-white bg-white/80 p-4 shadow-[0_14px_38px_-30px_rgba(15,23,42,0.45)] ring-1 ring-slate-900/[0.045] sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-slate-500" />
          <h2 className="text-lg font-black text-slate-950">Plnění cílů</h2>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          {fulfillment.goals.map((item) => <GoalCard key={item.key} item={item} tone={tone} />)}
        </div>
      </section>

      <Panel
        title="Nástroje reportingu"
        description="Projektové indikátory a cíle výše jsou kumulativní. Exporty klientské podpory zahrnují pouze KA1."
        icon={Activity}
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={exportClientsXlsx} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
              <FileSpreadsheet className="h-4 w-4" /> Klienti a podpora KA1 do IS ESF (.xlsx)
            </button><HelpIcon help={HELP.dashboardExport} />
            <button onClick={exportAllRecordsBackup} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Archive className="h-4 w-4" /> Stáhnout zápisy podpory KA1 (.docx) ({supportExportCount || 0})
            </button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SelectField label="Vykazované období" help={HELP.dashboardPeriod} value={dashboardFilters.period} onChange={(value) => setDashboardFilters((prev) => ({ ...prev, period: value }))} options={REPORTING_PERIODS.map((period) => ({ value: period.value, label: period.label }))} />
          <SelectField label="Pracovník" value={dashboardFilters.worker} onChange={(value) => setDashboardFilters((prev) => ({ ...prev, worker: value }))} options={[{ value: 'all', label: 'Všichni pracovníci' }].concat(WORKERS.map((worker) => ({ value: worker, label: worker })))} />
          <div className="flex flex-col justify-end">
            <button type="button" onClick={handleGenerateZorTexts} disabled={dashboardFilters.period === 'all' || isGeneratingZor} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-400">
              {isGeneratingZor ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              {isGeneratingZor ? 'Připravuji texty…' : 'Vytvořit texty pro ZOR'}
            </button><HelpIcon help={HELP.dashboardZor} />
          </div>
        </div>
        <div className="mt-3 text-xs text-slate-600">Aktivní filtr zahrnuje <strong>{filteredRecords.length}</strong> záznamů.</div>
      </Panel>

      {canManageBackups && (
        <Panel
          title="Kompletní záloha Google Drive"
          description="Vytvoří ZIP s hlavním Google Sheetem, klientskými složkami a kontrolním manifestem. Uchovává se posledních 12 záloh."
          icon={HardDriveDownload}
          action={
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleStartFullBackup} disabled={backupBusy} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-sm font-semibold text-white hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60">
                {backupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                {backupBusy ? 'Záloha se připravuje…' : 'Vytvořit kompletní zálohu'}
              </button>
              {!backupStatus?.weeklyEnabled && (
                <button type="button" onClick={handleInstallWeeklyBackup} disabled={isBackupActionRunning} className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700 hover:bg-indigo-100 disabled:opacity-60">
                  <ShieldCheck className="h-4 w-4" /> Zapnout týdenní zálohy
                </button>
              )}
              {backupStatus?.downloadUrl && backupStatus?.state === 'success' && (
                <a href={backupStatus.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
                  <Download className="h-4 w-4" /> Stáhnout poslední ZIP
                </a>
              )}
            </div>
          }
        >
          <div className={`rounded-lg border px-3 py-2 text-sm ${
            backupStatus?.state === 'error'
              ? 'border-red-200 bg-red-50 text-red-800'
              : backupStatus?.state === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-slate-200 bg-slate-50 text-slate-700'
          }`}>
            <div className="font-semibold">{backupStatus?.message || 'Záloha zatím nebyla vytvořena.'}</div>
            <div className="mt-1 text-xs">
              Automaticky každou neděli ve 2:00: <strong>{backupStatus?.weeklyEnabled ? 'zapnuto' : 'vypnuto'}</strong>
              {backupFinishedAt ? ` · Poslední dokončení: ${backupFinishedAt}` : ''}
              {backupStatus?.fileCount ? ` · Souborů v záloze: ${backupStatus.fileCount}` : ''}
            </div>
            {backupStatus?.statusError && <div className="mt-1 text-xs text-red-700">{backupStatus.statusError}</div>}
          </div>
          <p className="mt-2 text-xs text-slate-500">ZIP je uložen v chráněné složce Zálohy na Google Disku. Pro ochranu při ztrátě účtu pravidelně stáhněte kopii také mimo tento Google účet.</p>
        </Panel>
      )}

      {zorTexts && (
        <Panel title={'Texty pro ZOR (' + zorTexts.periodLabel + ')'} description="Pracovní návrhy popisu pokroku za sledované období." icon={FileText}>
          <div className="space-y-3">
            {Object.entries(zorTexts.texts).map(([ka, value]) => (
              <div key={ka} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3"><strong>{ka}</strong><button type="button" onClick={() => copyToClipboard(value, setCopied)} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold"><ClipboardCopy className="h-4 w-4" />{copied ? 'Zkopírováno' : 'Kopírovat'}</button></div>
                <div className="mt-3 whitespace-pre-wrap text-sm text-slate-700">{value}</div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

export default ReportingView;
