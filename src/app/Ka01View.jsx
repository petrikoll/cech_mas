import React from 'react';
import { CalendarDays, Download, Save, Sparkles, Users } from 'lucide-react';

import { EmptyState, HelpIcon, InputField, Panel, SaveInlineNotice, SelectField, TextAreaField } from '../components/ui.jsx';
import { HELP } from '../config/helpCatalog.js';
import { truncate } from '../lib/projectUtils.js';

const ACTIVITY_OPTIONS = [
  { value: 'koordina\u010dn\u00ed setk\u00e1n\u00ed', label: 'Koordina\u010dn\u00ed setk\u00e1n\u00ed' },
  { value: 'Porada', label: 'Porada' },
  { value: 'roz\u0161\u00ed\u0159en\u00ed nebo udr\u017een\u00ed s\u00edt\u011b', label: 'Roz\u0161\u00ed\u0159en\u00ed nebo udr\u017een\u00ed s\u00edt\u011b' },
  { value: 'skupinov\u00e1', label: 'Skupinov\u00e1' },
  { value: 'individu\u00e1ln\u00ed', label: 'Individu\u00e1ln\u00ed' }
]

const ACTOR_OPTIONS = [
  'obec / m\u011bsto', '\u00fa\u0159ad pr\u00e1ce', 'soci\u00e1ln\u00ed slu\u017eba', 'zdravotnick\u00e9 za\u0159\u00edzen\u00ed',
  '\u0161kola', 'neziskov\u00e1 organizace', 'komunitn\u00ed akt\u00e9r', 'jin\u00fd subjekt'
].map((value) => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1) }));

function Ka01View({
  ka01Draft, setKa01Draft, ka01ActorDraft, setKa01ActorDraft,
  ka01ActorCustomValue, updateKa01ActorEntry, ka01PlaceOptions,
  ka01PlaceCustomValue, updateKa01PlaceSelection, updateKa01PlaceCustom,
  isSaving, ka01NetworkDuration, editingKa01NetworkRecordId,
  handleGenerateKa01NetworkDescription, handleSaveKa01Network,
  handleSaveKa01ActorRegistry, toggleKa01ActorAttendance,
  networkSaveNotice, actorSaveNotice,
  ka01AttendanceSelection, exportKa01AttendanceSheet,
  handleEditKa01ActorRegistry, exportKa01NetworkBulk,
  ka01NetworkTimeError, cancelKa01NetworkEdit, ka01NetworkRecords,
  ka01ActorRegistryRecords, expandedKa01NetworkRecordIds,
  toggleKa01NetworkDescription, exportKa01NetworkDocx,
  handleEditKa01Network, deleteRecord
}) {
  const [expandedActorIds, setExpandedActorIds] = React.useState([]);
  const timeOptions = React.useMemo(() => Array.from({ length: 21 }, (_, index) => {
    const total = 7 * 60 + index * 30;
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }), []);
  const timesWithCurrent = (value) => value && !timeOptions.includes(value) ? [value, ...timeOptions] : timeOptions;
  const isTeamMeeting = String(ka01Draft.networkType || '').toLowerCase() === 'porada';
  const sortedActors = React.useMemo(
    () => [...ka01ActorRegistryRecords].sort((a, b) => String(a.payload?.name || '').localeCompare(String(b.payload?.name || ''), 'cs')),
    [ka01ActorRegistryRecords]
  );
  const participantOptions = React.useMemo(() => {
    const actorNames = sortedActors
      .map((record) => {
        const payload = record.payload || {};
        const institutionName = String(payload.name || '').trim();
        const contactName = String(payload.contactName || '').trim();
        if (!institutionName) return '';
        return contactName ? `${institutionName} — ${contactName}` : institutionName;
      })
      .filter(Boolean)
      .sort((first, second) => {
        return String(first).localeCompare(String(second), 'cs');
      });
    const options = actorNames;
    return Array.from(new Set(options)).map((value) => ({ value, label: value })).concat([
      { value: ka01ActorCustomValue, label: 'Dal\u0161\u00ed osoba (ru\u010dn\u011b)' }
    ]);
  }, [ka01ActorCustomValue, sortedActors]);
  const actorOrigin = (record) => String(record.payload?.networkOrigin || '').toLocaleLowerCase('cs');
  const networkActors = sortedActors.filter((record) => !actorOrigin(record).includes('potenci'));
  const currentActors = networkActors.filter((record) => actorOrigin(record).includes('stávaj')).length;
  const newActors = networkActors.filter((record) => actorOrigin(record).includes('nov')).length;
  const attendanceCount = Object.values(ka01AttendanceSelection || {}).filter(Boolean).length;
  const isNewActor = String(ka01ActorDraft.networkOrigin || '').toLowerCase().includes('nov');
  const actorTypeOptions = ACTOR_OPTIONS.some((option) => option.value === ka01ActorDraft.actorType)
    ? ACTOR_OPTIONS
    : [{ value: ka01ActorDraft.actorType, label: ka01ActorDraft.actorType }, ...ACTOR_OPTIONS].filter((option) => option.value);
  const toggleActor = (id) => setExpandedActorIds((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <div className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold uppercase text-slate-300">KA02 - Tvorba sítě:</span>
          <span>Aktéři <strong>{networkActors.length}</strong></span>
          <span>Stávající síť <strong>{currentActors}</strong></span>
          <span>Nově zapojení <strong>{newActors}</strong></span>
          <span>Aktivity <strong>{ka01NetworkRecords.length}</strong></span>
        </div>
      </div>

      <Panel title="KA02 - Záznam schůzky / aktivity sítě" description="Individuální a skupinové schůzky partnerů a porady realizačního týmu." icon={Users} className="w-full min-w-0">
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Datum</label>
              <div className="grid grid-cols-[1fr_auto] gap-2">
                <input id="ka02-network-date" type="date" value={ka01Draft.date} onChange={(event) => setKa01Draft((previous) => ({ ...previous, date: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />
                <button type="button" onClick={() => document.getElementById('ka02-network-date')?.showPicker?.()} className="rounded-lg border border-slate-300 bg-white px-3" title="Otevřít kalendář"><CalendarDays className="h-4 w-4" /></button>
              </div>
            </div>
            <SelectField label="Typ aktivity" help={HELP.networkType} value={ka01Draft.networkType} onChange={(value) => setKa01Draft((previous) => ({ ...previous, networkType: value }))} options={ACTIVITY_OPTIONS} />
            <div><label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{'Po\u010det \u00fa\u010dastn\u00edk\u016f'}</label><input type="text" value={ka01Draft.networkCount} readOnly className="w-full rounded-lg border border-slate-300 bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700" /></div>
          </div>

          <div className="grid items-end gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2 lg:grid-cols-[88px_88px_130px_minmax(220px,1fr)]">
            <div><label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Od</label><select value={ka01Draft.networkStartTime} onChange={(event) => setKa01Draft((previous) => ({ ...previous, networkStartTime: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">Čas</option>{timesWithCurrent(ka01Draft.networkStartTime).map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            <div><label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Do</label><select value={ka01Draft.networkEndTime} onChange={(event) => setKa01Draft((previous) => ({ ...previous, networkEndTime: event.target.value }))} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">Čas</option>{timesWithCurrent(ka01Draft.networkEndTime).map((option) => <option key={option} value={option}>{option}</option>)}</select></div>
            <div><label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">Trvání</label><div className="flex h-9 items-center rounded-md border border-slate-300 bg-white px-2 text-sm font-semibold">{ka01NetworkDuration || '-'}</div></div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase text-slate-500">Místo setkání <HelpIcon help={HELP.networkPlace} /></label>
              <div className={`grid gap-2 ${ka01Draft.networkPlaceType === ka01PlaceCustomValue ? 'sm:grid-cols-2' : 'grid-cols-1'}`}>
                <select value={ka01Draft.networkPlaceType || ''} onChange={(event) => updateKa01PlaceSelection(event.target.value)} className="h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm"><option value="">Vyber místo</option>{ka01PlaceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                {ka01Draft.networkPlaceType === ka01PlaceCustomValue && <input type="text" value={ka01Draft.networkPlaceCustom || ''} onChange={(event) => updateKa01PlaceCustom(event.target.value)} placeholder="Jiné místo" className="h-9 rounded-md border border-slate-300 bg-white px-2 text-sm" />}
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase text-slate-500">{isTeamMeeting ? 'Přítomní členové realizačního týmu a další osoby' : 'Přítomní aktéři a další osoby'}</label>
            <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
              {(ka01Draft.networkActorEntries || []).map((entry, index) => (
                <div key={`participant-${index}`} className="min-w-[260px] flex-1 rounded-md border border-slate-200 bg-white p-2">
                  <select value={entry.actorType || ''} onChange={(event) => updateKa01ActorEntry(index, { actorType: event.target.value, customName: event.target.value === ka01ActorCustomValue ? entry.customName || '' : '' })} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"><option value="">Vyber osobu</option>{participantOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                  {entry.actorType === ka01ActorCustomValue && <input type="text" value={entry.customName || ''} onChange={(event) => updateKa01ActorEntry(index, { customName: event.target.value })} placeholder="Jméno a funkce osoby" className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm" />}
                </div>
              ))}
            </div>
          </div>

          <div>
            <TextAreaField label="Popis" help={HELP.networkDescription} value={ka01Draft.networkNotes} onChange={(value) => setKa01Draft((previous) => ({ ...previous, networkNotes: value }))} rows={6} />
          </div>
          <TextAreaField label="Výstup zápisu" help={HELP.networkOutput} value={ka01Draft.networkDescription || ''} onChange={(value) => setKa01Draft((previous) => ({ ...previous, networkDescription: value }))} rows={5} placeholder="Po vygenerování se zde zobrazí návrh textu dokumentu" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={handleGenerateKa01NetworkDescription} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Sparkles className="h-4 w-4" />Vygenerovat návrh AI</button>
            <button onClick={handleSaveKa01Network} disabled={isSaving} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{editingKa01NetworkRecordId ? 'Uložit úpravu' : 'Uložit aktivitu'}</button>
            <SaveInlineNotice notice={networkSaveNotice} />
            <button type="button" onClick={exportKa01NetworkBulk} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800"><Download className="h-4 w-4" />Hromadné stažení</button>
            {editingKa01NetworkRecordId && <button type="button" onClick={cancelKa01NetworkEdit} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold">Zrušit úpravu</button>}
            {ka01NetworkTimeError && <span className="inline-flex items-center text-sm font-semibold text-red-600">{ka01NetworkTimeError}</span>}
          </div>

          <div>
            <div className="mb-2 text-sm font-bold">Uložené schůzky a aktivity sítě</div>
            {ka01NetworkRecords.length === 0 ? <EmptyState icon={Users} title="Zatím není uložena žádná aktivita sítě." /> : (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[900px] w-full divide-y divide-slate-200 text-xs"><thead className="bg-sky-50 font-semibold uppercase text-sky-800"><tr><th className="px-2 py-2 text-left">Datum</th><th className="px-2 py-2 text-left">Typ</th><th className="px-2 py-2 text-left">Účastníci</th><th className="px-2 py-2 text-left">Zápis</th><th className="px-2 py-2 text-right">Akce</th></tr></thead><tbody className="divide-y divide-slate-100">
                {ka01NetworkRecords.map((record) => { const expanded = expandedKa01NetworkRecordIds.includes(record.id); const text = record.payload?.description || record.payload?.notes || ''; return <tr key={record.id} className="even:bg-slate-50/60"><td className="px-2 py-2">{record.activityDate || '-'}</td><td className="px-2 py-2 font-semibold">{record.payload?.type || record.title}</td><td className="max-w-[220px] px-2 py-2">{truncate(record.payload?.participants || '-', 80)}</td><td className="max-w-[360px] px-2 py-2">{expanded ? text : truncate(text, 150)} {text.length > 150 && <button type="button" onClick={() => toggleKa01NetworkDescription(record.id)} className="font-semibold text-blue-700">{expanded ? 'Méně' : 'Více'}</button>}</td><td className="whitespace-nowrap px-2 py-2 text-right"><button type="button" onClick={() => exportKa01NetworkDocx(record)} className="mr-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">DOCX</button><button type="button" onClick={() => handleEditKa01Network(record)} className="mr-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700">Upravit</button><button type="button" onClick={() => deleteRecord(record)} disabled={isSaving} className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700">Smazat</button></td></tr>; })}
              </tbody></table></div>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="KA02 - Evidence subjektů partnerské sítě" description="Registr stávajících a nově zapojených aktérů." icon={Users} className="w-full min-w-0 overflow-hidden">
        <div className="grid gap-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <InputField label="Název subjektu" help={HELP.actorName} value={ka01ActorDraft.name} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, name: value }))} />
            <SelectField label="Typ aktéra" help={HELP.actorType} value={ka01ActorDraft.actorType} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, actorType: value }))} options={actorTypeOptions} />
            <SelectField label="Zapojení aktéra" help={HELP.actorOrigin} value={ka01ActorDraft.networkOrigin || ''} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, networkOrigin: value, joinedNetworkDate: value.includes('nov') ? previous.joinedNetworkDate : '' }))} options={[{ value: '', label: 'Vyberte p\u016fvod' }, { value: 'st\u00e1vaj\u00edc\u00ed', label: 'St\u00e1vaj\u00edc\u00ed' }, { value: 'nov\u011b zapojen\u00fd', label: 'Nov\u011b zapojen\u00fd' }, { value: 'potencion\u00e1ln\u00ed', label: 'Potencion\u00e1ln\u00ed' }]} />
            {isNewActor && <InputField label="Datum zapojení" help={HELP.actorDate} type="date" value={ka01ActorDraft.joinedNetworkDate || ''} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, joinedNetworkDate: value }))} />}
            <InputField label="Kontaktní osoba" help={HELP.actorContactName} value={ka01ActorDraft.contactName} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, contactName: value }))} />
            <InputField label="Funkce" help={HELP.actorContactRole} value={ka01ActorDraft.contactRole} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, contactRole: value }))} />
            <InputField label="Telefon" help={HELP.actorPhoneEmail} type="tel" value={ka01ActorDraft.phone} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, phone: value }))} />
            <InputField label="E-mail" help={HELP.actorPhoneEmail} type="email" value={ka01ActorDraft.email} onChange={(value) => setKa01ActorDraft((previous) => ({ ...previous, email: value }))} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleSaveKa01ActorRegistry} disabled={isSaving} className="inline-flex w-fit items-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"><Save className="h-4 w-4" />{ka01ActorDraft.id ? 'Uložit úpravu aktéra' : 'Uložit aktéra do registru'}</button>
            <SaveInlineNotice notice={actorSaveNotice} />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="text-sm font-bold">Uložený registr aktérů</div>
                <HelpIcon help={HELP.attendanceExport} />
              </div>
              <button type="button" onClick={exportKa01AttendanceSheet} disabled={attendanceCount === 0} className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"><Download className="h-4 w-4" />Vytvořit prezenční listinu ({attendanceCount})</button>
            </div>
            {sortedActors.length === 0 ? <EmptyState icon={Users} title="Zatím není uložen žádný aktér v síti." /> : (
              <div className="overflow-auto rounded-lg border border-slate-200 bg-white"><table className="min-w-[1100px] w-full divide-y divide-slate-200 text-xs"><thead className="sticky top-0 bg-sky-50 font-semibold uppercase text-sky-800"><tr><th className="px-2 py-2 text-left">Subjekt</th><th className="px-2 py-2 text-left">Typ</th><th className="px-2 py-2 text-left">Kontaktní osoba</th><th className="px-2 py-2 text-left">Funkce</th><th className="px-2 py-2 text-left">Kontakt</th><th className="px-2 py-2 text-left">Původ</th><th className="px-2 py-2 text-left">Datum zapojení</th><th className="px-2 py-2 text-left">Prezenční listina</th><th className="px-2 py-2 text-right">Akce</th></tr></thead><tbody className="divide-y divide-slate-100">
                {sortedActors.map((record) => { const payload = record.payload || {}; const contactName = String(payload.contactName || '').trim(); const canAttend = Boolean(payload.name && contactName.split(/\s+/).filter(Boolean).length >= 2); const expanded = expandedActorIds.includes(record.id); return <React.Fragment key={record.id}><tr className="even:bg-slate-50/60"><td className="px-2 py-2 font-semibold">{payload.name || '-'}</td><td className="px-2 py-2">{payload.actorType || '-'}</td><td className="px-2 py-2">{contactName || '-'}</td><td className="px-2 py-2">{payload.contactRole || '-'}</td><td className="px-2 py-2">{[payload.phone, payload.email].filter(Boolean).join(' / ') || '-'}</td><td className="px-2 py-2">{payload.networkOrigin || '-'}</td><td className="px-2 py-2">{String(payload.networkOrigin || '').toLowerCase().includes('nov') ? payload.joinedNetworkDate || '-' : '-'}</td><td className="px-2 py-2"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={Boolean(ka01AttendanceSelection?.[record.id])} onChange={(event) => toggleKa01ActorAttendance(record.id, event.target.checked)} disabled={!canAttend} className="h-4 w-4" /><span>{canAttend ? 'Ano' : 'Doplňte jméno'}</span></label></td><td className="whitespace-nowrap px-2 py-2 text-right"><button type="button" onClick={() => toggleActor(record.id)} className="mr-1 rounded-full border border-slate-200 px-2 py-1 font-semibold">{expanded ? 'Skrýt' : 'Detail'}</button><button type="button" onClick={() => handleEditKa01ActorRegistry(record)} className="mr-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-1 font-semibold text-blue-700">Upravit</button><button type="button" onClick={() => deleteRecord(record)} disabled={isSaving} className="rounded-full border border-red-200 bg-red-50 px-2 py-1 font-semibold text-red-700">Smazat</button></td></tr>{expanded && <tr><td colSpan={9} className="bg-white px-3 py-2 text-slate-600">{[payload.contactName, payload.contactRole, payload.phone, payload.email].filter(Boolean).join(' | ') || 'Žádné další údaje.'}</td></tr>}</React.Fragment>; })}
              </tbody></table></div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

export default Ka01View;
