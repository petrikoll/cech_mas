import React from 'react';
import { AlertCircle, CheckCircle2, Clock, History, Loader2, Save, Sparkles, UserRound } from 'lucide-react';
import { KA1_PHASES } from '../config/ka1Catalog.js';
import { EmptyState, Panel } from '../components/ui.jsx';
import PaymentCalendarsPanel from './PaymentCalendarsPanel.jsx';

const MEETING_FORMS = ['Osobně', 'Telefonicky', 'Online', 'Terénní'];
const KA1_ACTIVITY_TITLE_BY_CODE = Object.freeze(
  KA1_PHASES.flatMap((phase) => phase.activities)
    .reduce((result, activity) => ({ ...result, [activity.code]: activity.title }), {})
);

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function durationFromDraft(draft) {
  const start = timeToMinutes(draft.startTime);
  const end = timeToMinutes(draft.endTime);
  return start !== null && end !== null && end > start ? end - start : 0;
}

function formatDuration(minutes) {
  if (!minutes) return '—';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} h ${rest ? `${rest} min` : ''}`.trim() : `${rest} min`;
}

function formatActivityDate(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value || '—';
  return `${Number(match[3])}. ${Number(match[2])}. ${match[1]}`;
}

function FieldLabel({ children, required = false }) {
  return (
    <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
      {children}{required ? <span className="ml-1 text-rose-600">*</span> : null}
    </span>
  );
}

function Ka02View({
  clients,
  records,
  onSaveRecord,
  onUpdateRecord,
  onDeleteRecord,
  ka02Draft,
  setKa02Draft,
  currentWorker,
  isSaving,
  onGenerateAiNote
}) {
  const [formError, setFormError] = React.useState('');
  const [isGeneratingAiNote, setIsGeneratingAiNote] = React.useState(false);
  const [aiReview, setAiReview] = React.useState(null);
  const [clientOverviewView, setClientOverviewView] = React.useState('payment-plans');
  const selectedClient = clients.find((client) => client.id === ka02Draft.selectedClientId) || null;
  const selectedPhase = KA1_PHASES.find((phase) => phase.code === ka02Draft.phaseCode) || KA1_PHASES[0];
  const durationMinutes = durationFromDraft(ka02Draft);
  const activityCodes = Array.isArray(ka02Draft.activityCodes) ? ka02Draft.activityCodes : [];

  const update = (key, value) => {
    setKa02Draft((previous) => ({ ...previous, [key]: value }));
    setFormError('');
    setAiReview(null);
  };

  const changePhase = (phaseCode) => {
    setKa02Draft((previous) => ({
      ...previous,
      phaseCode,
      activityCodes: []
    }));
    setFormError('');
    setAiReview(null);
  };

  const toggleActivity = (code) => {
    setKa02Draft((previous) => {
      const selected = Array.isArray(previous.activityCodes) ? previous.activityCodes : [];
      return {
        ...previous,
        activityCodes: selected.includes(code)
          ? selected.filter((item) => item !== code)
          : [...selected, code]
      };
    });
    setFormError('');
    setAiReview(null);
  };

  const generateAiNote = async () => {
    if (!selectedClient) {
      setFormError('Vyberte klienta.');
      return;
    }
    if (!activityCodes.length) {
      setFormError('Vyberte alespoň jednu činnost.');
      return;
    }
    if (!String(ka02Draft.caseNote || '').trim()) {
      setFormError('Nejprve napište pracovní poznámky, ze kterých má AI vytvořit návrh.');
      return;
    }
    if (typeof onGenerateAiNote !== 'function') {
      setFormError('AI návrh nyní není dostupný.');
      return;
    }

    setFormError('');
    setIsGeneratingAiNote(true);
    try {
      const result = await onGenerateAiNote({
        draft: ka02Draft,
        selectedClient,
        selectedPhase,
        records
      });
      update('caseNote', result.formattedOutput);
      setAiReview(result);
    } catch (error) {
      setFormError(error?.message || 'AI návrh se nepodařilo vytvořit.');
    } finally {
      setIsGeneratingAiNote(false);
    }
  };

  const savePerformance = async () => {
    if (!selectedClient) {
      setFormError('Vyberte klienta.');
      return;
    }
    if (!activityCodes.length) {
      setFormError('Vyberte alespoň jednu činnost.');
      return;
    }
    if (!ka02Draft.date) {
      setFormError('Vyplňte datum výkonu.');
      return;
    }
    if (!durationMinutes) {
      setFormError('Zadejte platný čas začátku a konce.');
      return;
    }
    if (!String(ka02Draft.caseNote || '').trim()) {
      setFormError('Doplňte zápis z jednání.');
      return;
    }

    const activityTitles = selectedPhase.activities
      .filter((activity) => activityCodes.includes(activity.code))
      .map((activity) => activity.title);
    const worker = currentWorker || ka02Draft.worker || '';
    const ok = await onSaveRecord({
      entityType: 'consultations',
      ka: 'KA1',
      title: `${selectedPhase.code}: ${activityCodes.join(', ')}`,
      activityDate: ka02Draft.date,
      worker,
      clientId: selectedClient.id,
      clientIds: [selectedClient.id],
      clientName: selectedClient.fullName,
      documentText: String(ka02Draft.caseNote || '').trim(),
      payload: {
        phaseCode: selectedPhase.code,
        phaseTitle: selectedPhase.title,
        activityCodes,
        activityTitles,
        consultationType: selectedPhase.title,
        supportArea: selectedPhase.code,
        meetingForm: ka02Draft.meetingForm,
        place: ka02Draft.place,
        startTime: ka02Draft.startTime,
        endTime: ka02Draft.endTime,
        durationMinutes,
        caseNote: String(ka02Draft.caseNote || '').trim(),
        topics: String(ka02Draft.caseNote || '').trim()
      },
      indicatorFlags: { ka02Consultations: true }
    }, {
      noticeKey: 'ka1-performance',
      progressText: 'Ukládám výkon…',
      successText: 'Výkon uložen'
    });

    if (ok) {
      setKa02Draft((previous) => ({
        ...previous,
        activityCodes: [],
        startTime: '',
        endTime: '',
        caseNote: ''
      }));
      setAiReview(null);
    }
  };

  const recentPerformances = records
    .filter((record) =>
      record.entityType === 'consultations' &&
      record.clientId === ka02Draft.selectedClientId &&
      Array.isArray(record.payload?.activityCodes)
    )
    .sort((a, b) => String(b.activityDate || '').localeCompare(String(a.activityDate || '')))
    .slice(0, 8);

  const performancePreview = (record) => {
    const payload = record.payload || {};
    const codes = Array.isArray(payload.activityCodes) ? payload.activityCodes : [];
    const activityTitles = Array.isArray(payload.activityTitles) && payload.activityTitles.length
      ? payload.activityTitles
      : codes.map((code) => KA1_ACTIVITY_TITLE_BY_CODE[code]).filter(Boolean);
    const note = String(
      payload.caseNote ||
      payload.topics ||
      record.documentText ||
      payload.outcome ||
      payload.nextSteps ||
      ''
    ).trim();
    return {
      codes,
      activityTitles,
      note,
      place: payload.place || '',
      meetingForm: payload.meetingForm || ''
    };
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
              KA1 · klientská práce
            </div>
            <h2 className="mt-1 text-xl font-extrabold text-slate-900">Nový výkon</h2>
          </div>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-sm text-indigo-900">
            Pracovník: <strong>{currentWorker || ka02Draft.worker || 'Neuvedeno'}</strong>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[340px_minmax(0,1fr)] xl:items-start">
        <div className="space-y-4">
          <Panel title="Klient a datum" icon={UserRound}>
            <label className="block">
              <FieldLabel required>Klient</FieldLabel>
              <select
                value={ka02Draft.selectedClientId}
                onChange={(event) => update('selectedClientId', event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                <option value="">Vyberte klienta</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {client.clientNumber ? `${client.clientNumber} · ` : ''}{client.fullName}
                  </option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <FieldLabel required>Datum</FieldLabel>
              <input
                type="date"
                value={ka02Draft.date}
                onChange={(event) => update('date', event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <label className="mt-4 block">
              <FieldLabel>Forma jednání</FieldLabel>
              <select
                value={ka02Draft.meetingForm}
                onChange={(event) => update('meetingForm', event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              >
                {MEETING_FORMS.map((form) => (
                  <option key={form} value={form}>{form}</option>
                ))}
              </select>
            </label>

            <label className="mt-4 block">
              <FieldLabel>Místo</FieldLabel>
              <input
                value={ka02Draft.place}
                onChange={(event) => update('place', event.target.value)}
                placeholder="Obec, kancelář nebo jiné místo"
                className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <label>
                <FieldLabel required>Od</FieldLabel>
                <input
                  type="time"
                  value={ka02Draft.startTime}
                  onChange={(event) => update('startTime', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label>
                <FieldLabel required>Do</FieldLabel>
                <input
                  type="time"
                  value={ka02Draft.endTime}
                  onChange={(event) => update('endTime', event.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
            </div>
            <div className={`mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold ${
              durationMinutes ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-500'
            }`}>
              <Clock className="h-4 w-4" />
              Délka podpory: {formatDuration(durationMinutes)}
            </div>
          </Panel>

          <Panel title="Přehled klienta" icon={History}>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setClientOverviewView('performances')}
                className={`rounded-lg px-2 py-2 text-xs font-extrabold transition ${
                  clientOverviewView === 'performances'
                    ? 'bg-white text-indigo-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Poslední výkony
              </button>
              <button
                type="button"
                onClick={() => setClientOverviewView('payment-plans')}
                className={`rounded-lg px-2 py-2 text-xs font-extrabold transition ${
                  clientOverviewView === 'payment-plans'
                    ? 'bg-white text-indigo-800 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Splátkové kalendáře
              </button>
            </div>

            {clientOverviewView === 'payment-plans' ? (
              <PaymentCalendarsPanel
                selectedClient={selectedClient}
                records={records}
                onSaveRecord={onSaveRecord}
                onUpdateRecord={onUpdateRecord}
                onDeleteRecord={onDeleteRecord}
                isSaving={isSaving}
              />
            ) : !selectedClient ? (
              <p className="text-sm text-slate-500">Nejprve vyberte klienta.</p>
            ) : recentPerformances.length ? (
              <div className="space-y-3 border-l-2 border-indigo-200 pl-3">
                {recentPerformances.map((record) => {
                  const preview = performancePreview(record);
                  return (
                    <div key={record.id} className="relative rounded-xl border border-slate-200 border-l-4 border-l-indigo-500 bg-white px-3 py-3 shadow-sm">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-slate-800">
                          {formatActivityDate(record.activityDate)}
                        </span>
                        <span className="rounded-md bg-indigo-100 px-1.5 py-0.5 text-[10px] font-black text-indigo-800">
                          {preview.codes.join(', ') || 'KA1'}
                        </span>
                        <span className="text-[11px] font-semibold text-slate-500">
                          {formatDuration(record.payload.durationMinutes)}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs font-bold leading-snug text-slate-800">
                        {preview.activityTitles.length
                          ? preview.activityTitles.join(' · ')
                          : record.title || 'Klientská práce'}
                      </div>
                      <div className="mt-2 whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-700">
                        {preview.note || 'Výkon nemá slovní zápis.'}
                      </div>
                      {(preview.meetingForm || preview.place) && (
                        <div className="mt-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                          {[preview.meetingForm, preview.place].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-slate-500">Zatím bez evidovaných výkonů.</p>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Fáze a činnosti podpory" icon={CheckCircle2}>
            <div className="grid gap-2 lg:grid-cols-3">
              {KA1_PHASES.map((phase) => (
                <button
                  key={phase.code}
                  type="button"
                  onClick={() => changePhase(phase.code)}
                  className={`rounded-xl border px-3 py-3 text-left transition ${
                    phase.code === selectedPhase.code
                      ? 'border-indigo-600 bg-indigo-600 text-white shadow-sm'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50'
                  }`}
                >
                  <div className="text-xs font-black">{phase.code}</div>
                  <div className="mt-1 text-sm font-bold leading-snug">{phase.title}</div>
                </button>
              ))}
            </div>

            <div className="mt-4 space-y-2">
              {selectedPhase.activities.map((activity) => {
                const selected = activityCodes.includes(activity.code);
                return (
                  <label
                    key={activity.code}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 transition ${
                      selected
                        ? 'border-emerald-300 bg-emerald-50'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleActivity(activity.code)}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <strong className="mr-2 text-sm text-slate-900">{activity.code}</strong>
                      <span className="text-sm text-slate-700">{activity.title}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Panel>

          <Panel title="Zápis z jednání" icon={Save}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">
              <div>
                <div className="text-sm font-bold text-violet-950">AI návrh a kontrola návaznosti</div>
                <div className="text-xs text-violet-700">Gemini 2.5 Flash porovná návrh s předchozí klientskou osou. Výsledek se neuloží automaticky.</div>
              </div>
              <button
                type="button"
                onClick={generateAiNote}
                disabled={isGeneratingAiNote || isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-extrabold text-white shadow-sm transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60"
              >
                {isGeneratingAiNote ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {isGeneratingAiNote ? 'Generuji…' : 'Vygenerovat návrh'}
              </button>
            </div>
            <label className="block">
              <FieldLabel required>Průběh, výsledek a další krok</FieldLabel>
              <textarea
                value={ka02Draft.caseNote}
                onChange={(event) => update('caseNote', event.target.value)}
                rows={12}
                placeholder="Zapište věcně průběh klientské práce, doložený výsledek a domluvený další krok."
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
              />
            </label>

            {aiReview ? (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-950">
                  <AlertCircle className="h-4 w-4" />
                  Kontrola návrhu proti klientské ose
                </div>
                {[
                  ['Kontrola návaznosti', aiReview.qualityCheck],
                  ['Doporučení', aiReview.recommendations],
                  ['Chybějící informace', aiReview.missingInformation],
                  ['Jazykové poznámky', aiReview.languageSuggestions]
                ].filter(([, items]) => items?.length).map(([label, items]) => (
                  <div key={label} className="mt-2">
                    <div className="text-xs font-bold uppercase tracking-wide text-amber-800">{label}</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-950">
                      {items.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                ))}
                {!aiReview.qualityCheck?.length &&
                 !aiReview.recommendations?.length &&
                 !aiReview.missingInformation?.length &&
                 !aiReview.languageSuggestions?.length ? (
                  <div className="mt-2 text-sm text-amber-900">AI nezjistila podstatný problém v návaznosti zápisu.</div>
                ) : null}
              </div>
            ) : null}

            {formError ? (
              <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800">
                {formError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Výkon se uloží pouze do aktivního projektu vybraného v hlavičce.
              </div>
              <button
                type="button"
                onClick={savePerformance}
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-wait disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {isSaving ? 'Ukládám…' : 'Uložit výkon'}
              </button>
            </div>
          </Panel>
        </div>
      </div>

      {!clients.length ? (
        <EmptyState
          icon={UserRound}
          title="V aktivním projektu nejsou dostupní klienti."
        />
      ) : null}
    </div>
  );
}

export default Ka02View;
