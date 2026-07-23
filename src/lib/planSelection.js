const planTimestamp = (record) => {
  const value = record?.updatedAt || record?.createdAt || 0;
  if (typeof value === 'number') return value;
  const parsed = Date.parse(String(value || ''));
  return Number.isNaN(parsed) ? 0 : parsed;
};

const planContentScore = (record) => {
  const payload = record?.payload || {};
  const goals = Array.isArray(record?.goals) ? record.goals : payload.structuredGoals || payload.goals || [];
  return (
    (String(payload.acceptedPlanText || record?.acceptedPlanText || record?.documentText || '').trim() ? 8 : 0) +
    (String(payload.situationDescription || record?.situationDescription || '').trim() ? 4 : 0) +
    (Array.isArray(goals) && goals.some((goal) => String(goal?.goalDescription || '').trim()) ? 2 : 0) +
    (String(payload.finalEvaluation || record?.finalEvaluation || '').trim() ? 1 : 0)
  );
};

function selectLatestClientPlan(records = [], clientId = '') {
  return records
    .filter((record) => record.entityType === 'plans' && record.clientId === clientId)
    .sort((a, b) => planTimestamp(b) - planTimestamp(a) || Number(String(b.id || '').match(/(\d+)$/)?.[1] || 0) - Number(String(a.id || '').match(/(\d+)$/)?.[1] || 0) || planContentScore(b) - planContentScore(a))[0] || null;
}

export { selectLatestClientPlan };
