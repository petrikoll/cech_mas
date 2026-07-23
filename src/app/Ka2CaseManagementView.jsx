import React from 'react';
import { ClipboardList } from 'lucide-react';

import { Panel, SelectField } from '../components/ui.jsx';
import { selectLatestClientPlan } from '../lib/planSelection.js';

function ReadOnlyPlan({ clients, records, selectedClientId, onClientChange }) {
  const plan = selectLatestClientPlan(records, selectedClientId);
  const goals = Array.isArray(plan?.goals) && plan.goals.length ? plan.goals : plan?.payload?.structuredGoals || plan?.payload?.goals || [];
  const text = (value, fallback = 'Nevyplněno.') => String(value || '').trim() || fallback;

  return (
    <aside className="space-y-4">
      <Panel title="Klient" icon={ClipboardList}>
        <SelectField
          label="Klient"
          value={selectedClientId || ''}
          onChange={onClientChange}
          options={[{ value: '', label: 'Vyberte klienta' }, ...clients.map((client) => ({ value: client.id, label: client.fullName }))]}
        />
      </Panel>
      {selectedClientId ? (
        <Panel title="Individuální plán" description="Přebráno z KA1-Individuální podpora. Náhled v KA2 není editovatelný." icon={ClipboardList}>
          {plan ? (
            <div className="space-y-3 text-sm">
              <div><strong className="block text-slate-800">Popis situace</strong><p className="mt-1 whitespace-pre-wrap text-slate-600">{text(plan.payload?.situationDescription || plan.situationDescription)}</p></div>
              <div>
                <strong className="block text-slate-800">Cíle</strong>
                <div className="mt-2 space-y-2">
                  {goals.length ? goals.map((goal, index) => (
                    <div key={goal.goalId || goal.id || index} className="rounded-lg border border-slate-200 bg-white p-2">
                      <span className="text-xs font-semibold text-indigo-700">Cíl {index + 1}</span>
                      <p className="mt-1 whitespace-pre-wrap text-slate-700"><strong>Popis cíle:</strong> {text(goal.goalDescription || goal.description)}</p>
                      {(goal.actionSteps || goal.plannedSteps) && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-600"><strong>Akční kroky:</strong> {Array.isArray(goal.actionSteps) ? goal.actionSteps.join('\n') : goal.actionSteps || goal.plannedSteps}</p>}
                      {(goal.targetDate || goal.deadline) && <p className="mt-1 text-xs text-slate-500"><strong>Termín:</strong> {String(goal.targetDate || goal.deadline).slice(0, 10)}</p>}
                    </div>
                  )) : <p className="text-slate-500">Není zadaný žádný cíl.</p>}
                </div>
              </div>
              <div><strong className="block text-slate-800">Závěrečné vyhodnocení plánu</strong><p className="mt-1 whitespace-pre-wrap text-slate-600">{text(plan.payload?.finalEvaluation)}</p></div>
            </div>
          ) : <p className="text-sm text-slate-500">Klient zatím nemá uložený individuální plán v KA1.</p>}
        </Panel>
      ) : <div className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Vyberte klienta pro zobrazení individuálního plánu.</div>}
    </aside>
  );
}

function Ka2CaseManagementView({ clients, records, ka02Draft, setKa02Draft, setGeneratorDraft, renderAiDocumentPanel, computedIndicators }) {
  const selectedClientName = clients.find((client) => client.id === ka02Draft.selectedClientId)?.fullName || '';

  React.useEffect(() => {
    setGeneratorDraft((prev) => ({
      ...prev,
      selectedKey: 'consultation',
      clientId: ka02Draft.selectedClientId || prev.clientId,
      consultationType: prev.caseManagementMode ? prev.consultationType : 'case management - individuální práce s klientem',
      ka02Place: 'ambulantní',
      caseManagementMode: true
    }));
  }, [ka02Draft.selectedClientId, setGeneratorDraft]);

  const caseCount = Array.isArray(computedIndicators) ? computedIndicators.find((item) => item.key === 'ka02Consultations')?.current || 0 : 0;
  const selectClient = (clientId) => {
    setKa02Draft((prev) => ({ ...prev, selectedClientId: clientId }));
    setGeneratorDraft((prev) => ({
      ...prev,
      clientId,
      selectedKey: 'consultation',
      consultationType: 'case management - individuální práce s klientem',
      linkedPlanGoalId: '',
      linkedPlanGoalLabel: '',
      selectedPartnerIds: [],
      registeredPartnerNames: [],
      manualPartnerNames: [],
      partnerNames: [],
      participantCount: 0,
      ka02Place: 'ambulantní',
      caseManagementMode: true
    }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100"><div className="flex flex-wrap items-center gap-x-4 gap-y-1"><span className="font-semibold uppercase tracking-wide text-slate-300">KA2 Case management:</span><span>Klientské záznamy <strong>{caseCount}</strong></span></div></div>
      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <ReadOnlyPlan clients={clients} records={records} selectedClientId={ka02Draft.selectedClientId} onClientChange={selectClient} />
        <div className="min-w-0">{renderAiDocumentPanel({ allowedKeys: ['consultation'], title: 'Zápis case managementu', description: 'Vyplňte podklady, vygenerujte návrh a uložte až finální dokument.', lockClientSelection: true, hideStyleFeedback: true, watermarkText: selectedClientName })}</div>
      </div>
    </div>
  );
}

export default Ka2CaseManagementView;
