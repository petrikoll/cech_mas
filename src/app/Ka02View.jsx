import React from 'react';
import { computedIndicatorsMap } from '../lib/projectUtils.js';
import ClientPlanSidebar from './ClientPlanSidebar.jsx';

function Ka02View({
  clients,
  records,
  onSaveRecord,
  onUpdateRecord,
  ka02Draft,
  setKa02Draft,
  setGeneratorDraft,
  renderAiDocumentPanel,
  ka02AiDocumentKeys,
  computedIndicators
}) {
  const indicatorMap = computedIndicatorsMap(computedIndicators);
  const plans = indicatorMap.ka02Plans;
  const consultations = indicatorMap.ka02Consultations;
  const supported = indicatorMap.ka02SupportedClients;
  const simulator = indicatorMap.ka02SimulatorRuns;
  const therapy = indicatorMap.ka02TherapyClients;
  const cv = indicatorMap.ka02CvOutputs;
  const debts = indicatorMap.ka02DebtMappedClients;
  const repayments = indicatorMap.ka02RepaymentArrangements;
  const selectedClientName = clients.find((client) => client.id === ka02Draft.selectedClientId)?.fullName || '';

  React.useEffect(() => {
    setGeneratorDraft((prev) => ({
      ...prev,
      selectedKey: 'consultation',
      clientId: ka02Draft.selectedClientId || prev.clientId,
      linkedPlanGoalId: prev.linkedPlanGoalId || 'one-time-order',
      linkedPlanGoalLabel: prev.linkedPlanGoalLabel || 'Jednor\u00e1zov\u00e1 zak\u00e1zka',
      caseManagementMode: false
    }));
  }, [ka02Draft.selectedClientId, setGeneratorDraft]);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs text-slate-100">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="font-semibold uppercase tracking-wide text-slate-300">KA1 Individuální podpora:</span>
          <span>Individuální plány <strong>{plans.current}</strong></span>
          <span>Zápisy podpory <strong>{consultations.current}</strong></span>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)] xl:items-start">
        <ClientPlanSidebar
          clients={clients}
          records={records}
          onSaveRecord={onSaveRecord}
          onUpdateRecord={onUpdateRecord}
          selectedClientId={ka02Draft.selectedClientId}
          onClientChange={(clientId) => {
            setKa02Draft((prev) => ({ ...prev, selectedClientId: clientId }));
            setGeneratorDraft((prev) => ({
              ...prev,
              clientId,
              linkedPlanGoalId: 'one-time-order',
              linkedPlanGoalLabel: 'Jednor\u00e1zov\u00e1 zak\u00e1zka',
              selectedKey: 'consultation',
              caseManagementMode: false
            }));
          }}
        />

        <div className="min-w-0">
          {renderAiDocumentPanel({
            allowedKeys: ['consultation'],
            title: 'KA1 - Z\u00e1pis individu\u00e1ln\u00ed podpory',
            description: 'P\u0159\u00edm\u00e1 pr\u00e1ce s klientem. Individu\u00e1ln\u00ed pl\u00e1n je vlevo, z\u00e1pis podpory vpravo.',
            lockClientSelection: true,
            hideStyleFeedback: true,
            watermarkText: selectedClientName
          })}
        </div>
      </div>
    </div>
  );
}

export default Ka02View;
