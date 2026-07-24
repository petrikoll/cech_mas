import React from 'react';
import { Activity, Archive, ClipboardCopy, Download, FileSpreadsheet, FileText, HardDriveDownload, Loader2, ShieldCheck, TrendingUp } from 'lucide-react';

import { HelpIcon, Panel, SelectField } from '../components/ui.jsx';
import { HELP } from '../config/helpCatalog.js';
import { REPORTING_PERIODS, WORKERS } from '../config/projectConfig.js';

const formatMetric = (value) =>
  Number(value || 0).toLocaleString('cs-CZ', { maximumFractionDigits: 2 });

const formatPercent = (value) =>
  `${Number(value || 0).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;

function FulfillmentTable({ title, rows, summaryRows = [], accent = 'indigo' }) {
  const tone = accent === 'emerald'
    ? { border: 'border-emerald-200', header: 'bg-emerald-700', bar: 'bg-emerald-600', soft: 'bg-emerald-50' }
    : { border: 'border-indigo-200', header: 'bg-indigo-700', bar: 'bg-indigo-600', soft: 'bg-indigo-50' };

  return (
    <section className={`overflow-hidden rounded-2xl border ${tone.border} bg-white shadow-sm`}>
      <div className={`${tone.header} px-5 py-4 text-white`}>
        <div className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5" />
          <h2 className="text-base font-black">{title}</h2>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className={`${tone.soft} text-left text-[11px] font-extrabold uppercase tracking-wide text-slate-600`}>
            <tr>
              <th className="px-4 py-3">{rows[0]?.code ? 'Indikátor' : 'Ukazatel'}</th>
              <th className="px-4 py-3 text-right">Cílová hodnota</th>
              <th className="px-4 py-3 text-right">Aktuální plnění</th>
              <th className="px-4 py-3 text-right">Plnění v %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((item) => (
              <tr key={item.key} className="hover:bg-slate-50/80">
                <td className="px-4 py-3 font-bold text-slate-900">{item.code || item.label}</td>
                <td className="px-4 py-3 text-right text-slate-700">{formatMetric(item.target)}</td>
                <td className="px-4 py-3 text-right font-black text-slate-950">{formatMetric(item.current)}</td>
                <td className="w-44 px-4 py-3">
                  <div className="flex items-center justify-end gap-3">
                    <div className="h-2 w-20 overflow-hidden rounded-full bg-slate-100">
                      <div className={`h-full rounded-full ${tone.bar}`} style={{ width: `${Math.min(100, item.percent)}%` }} />
                    </div>
                    <strong className="w-16 text-right text-slate-900">{formatPercent(item.percent)}</strong>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {summaryRows.length > 0 && (
            <tfoot className={`${tone.soft} border-t-2 ${tone.border}`}>
              {summaryRows.map((item) => (
                <tr key={item.label}>
                  <td colSpan={3} className="px-4 py-3 font-extrabold text-slate-800">{item.label}</td>
                  <td className="px-4 py-3 text-right font-black text-slate-950">{formatPercent(item.value)}</td>
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

function ReportingView({
  dashboardOverview,
  projectDashboard,
  activeProjectId,
  exportClientsCsv,
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
  handleInstallWeeklyBackup
}) {
  const overview = dashboardOverview || { indicators: [], longGoals: [], shortGoals: [], activityGoals: [], professionalDevelopmentStats: [], partnerMetrics: [], risks: [] };
  const fulfillment = projectDashboard || { indicators: [], goals: [], outputPercent: 0, resultPercent: 0, goalsPercent: 0 };
  const projectAccent = activeProjectId === 'MAS' ? 'emerald' : 'indigo';
  const backupBusy = isBackupActionRunning || ['queued', 'running'].includes(backupStatus?.state);
  const backupFinishedAt = backupStatus?.finishedAt
    ? new Date(backupStatus.finishedAt).toLocaleString('cs-CZ')
    : '';
  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <FulfillmentTable
          title={`PROJEKT ${activeProjectId || ''} – Plnění indikátorů`}
          rows={fulfillment.indicators}
          summaryRows={[
            { label: 'Plnění indikátorů výstupů celkem v %', value: fulfillment.outputPercent },
            { label: 'Plnění indikátorů výsledků celkem v %', value: fulfillment.resultPercent }
          ]}
          accent={projectAccent}
        />
        <FulfillmentTable
          title={`PROJEKT ${activeProjectId || ''} – Plnění cílů`}
          rows={fulfillment.goals}
          summaryRows={[
            { label: 'Plnění cílů celkem v %', value: fulfillment.goalsPercent }
          ]}
          accent={projectAccent}
        />
      </div>

      <Panel
        title="Nástroje reportingu"
        description="Projektové indikátory a cíle výše jsou kumulativní. Filtry slouží pro exporty a texty ZOR."
        icon={Activity}
        action={
          <div className="flex flex-wrap gap-2">
            <button onClick={exportClientsCsv} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 hover:bg-emerald-100">
              <FileSpreadsheet className="h-4 w-4" /> Klienti a podpora do IS ESF
            </button><HelpIcon help={HELP.dashboardExport} />
            <button onClick={exportAllRecordsBackup} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Archive className="h-4 w-4" /> Stáhnout zápisy ({supportExportCount || 0})
            </button>
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <SelectField label="Vykazované období" help={HELP.dashboardPeriod} value={dashboardFilters.period} onChange={(value) => setDashboardFilters((prev) => ({ ...prev, period: value }))} options={REPORTING_PERIODS.map((period) => ({ value: period.value, label: period.label }))} />
          <SelectField label="Klíčová aktivita" value={dashboardFilters.ka} onChange={(value) => setDashboardFilters((prev) => ({ ...prev, ka: value }))} options={[{ value: 'all', label: 'Všechny KA' }, { value: 'KA1', label: 'KA1' }, { value: 'KA2', label: 'KA2' }]} />
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
