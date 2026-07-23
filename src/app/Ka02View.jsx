import React from 'react';
import { CheckCircle2, Clock, History, Save, UserRound } from 'lucide-react';
import { KA1_PHASES } from '../config/ka1Catalog.js';
import { EmptyState, Panel } from '../components/ui.jsx';

const MEETING_FORMS = ['Osobně', 'Telefonicky', 'Online', 'Terénní'];

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
  ka02Draft,
  setKa02Draft,
  currentWorker,
  isSaving
}) {
  const [formError, setFormError] = React.useState('');
  const selectedClient = clients.find((client) => client.id === ka02Draft.selectedClientId) || null;
  const selectedPhase = KA1_PHASES.find((phase) => phase.code === ka02Draft.phaseCode) || KA1_PHASES[0];
  const durationMinutes = durationFromDraft(ka02Draft);
  const activityCodes = Array.isArray(ka02Draft.activityCodes) ? ka02Draft.activityCodes : [];

  const update = (key, value) => {
    setKa02Draft((previous) => ({ ...previous, [key]: value }));
    setFormError('');
  };

  const changePhase = (phaseCode) => {
    setKa02Draft((previous) => ({
      ...previous,
      phaseCode,
      activityCodes: []
    }));
    setFormError('');
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
    }
  };

  const recentPerformances = records
    .filter((record) =>
      record.entityType === 'consultations' &&
      record.clientId === ka02Draft.selectedClientId &&
      Array.isArray(record.payload?.activityCodes)
    )
    .slice(0, 8);

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

          <Panel title="Poslední výkony klienta" icon={History}>
            {!selectedClient ? (
              <p className="text-sm text-slate-500">Nejprve vyberte klienta.</p>
            ) : recentPerformances.length ? (
              <div className="space-y-2">
                {recentPerformances.map((record) => (
                  <div key={record.id} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <div className="text-xs font-bold text-slate-800">
                      {(record.payload.activityCodes || []).join(', ')}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {record.activityDate} · {formatDuration(record.payload.durationMinutes)}
                    </div>
                  </div>
                ))}
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
