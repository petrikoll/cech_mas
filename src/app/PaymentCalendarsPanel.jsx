import React from 'react';
import {
  CalendarCheck2, Check, ChevronDown, ChevronUp, CircleDashed, Plus, Trash2, WalletCards, X
} from 'lucide-react';
import {
  PAYMENT_MONTH_STATUSES,
  PAYMENT_PLAN_STATUSES,
  buildPaymentSchedule,
  calculateAveragePayment,
  calculatePlannedEndMonth,
  nextPaymentMonthStatus
} from '../lib/paymentPlans.js';

const EMPTY_DRAFT = Object.freeze({
  debtAmount: '',
  firstPaymentMonth: '',
  plannedInstallments: '',
  creditorType: '',
  notes: ''
});

const STATUS_LABELS = Object.freeze({
  ACTIVE: 'Aktivní',
  COMPLETED: 'Úspěšně dokončen',
  FAILED: 'Nedokončen',
  PAUSED: 'Pozastaven'
});

function formatCurrency(value) {
  return new Intl.NumberFormat('cs-CZ', {
    style: 'currency',
    currency: 'CZK',
    maximumFractionDigits: 2
  }).format(Number(value) || 0);
}

function formatMonth(value) {
  const [year, month] = String(value || '').split('-');
  return year && month ? `${month}/${year.slice(-2)}` : '—';
}

function updatePayloadForRecord(record, payload) {
  return {
    entityType: record.entityType,
    ka: record.ka,
    title: record.title,
    activityDate: record.activityDate,
    worker: record.worker || '',
    clientId: record.clientId,
    clientIds: record.clientIds || [record.clientId],
    clientName: record.clientName || '',
    projectId: record.projectId || '',
    sourceSystem: record.sourceSystem || 'NEW_APP',
    documentText: record.documentText || '',
    indicatorFlags: record.indicatorFlags || {},
    payload
  };
}

function MonthStatusIcon({ status }) {
  if (status === PAYMENT_MONTH_STATUSES.PAID) return <Check className="h-4 w-4" />;
  if (status === PAYMENT_MONTH_STATUSES.MISSED) return <X className="h-4 w-4" />;
  return <CircleDashed className="h-4 w-4" />;
}

export default function PaymentCalendarsPanel({
  selectedClient,
  records,
  onSaveRecord,
  onUpdateRecord,
  onDeleteRecord,
  isSaving
}) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [expandedPlanIds, setExpandedPlanIds] = React.useState({});
  const [optimisticStatuses, setOptimisticStatuses] = React.useState({});
  const [draft, setDraft] = React.useState(EMPTY_DRAFT);
  const [message, setMessage] = React.useState('');
  const pendingStatusesRef = React.useRef({});
  const saveTimersRef = React.useRef({});

  React.useEffect(() => {
    setIsAdding(false);
    setDraft(EMPTY_DRAFT);
    setMessage('');
  }, [selectedClient?.id]);

  const plans = records
    .filter((record) =>
      record.entityType === 'payment_plan' &&
      record.clientId === selectedClient?.id
    )
    .sort((a, b) =>
      String(b.payload?.firstPaymentMonth || '').localeCompare(String(a.payload?.firstPaymentMonth || ''))
    );

  const updateDraft = (key, value) => {
    setDraft((previous) => ({ ...previous, [key]: value }));
    setMessage('');
  };

  const savePlan = async () => {
    const debtAmount = Number(String(draft.debtAmount).replace(',', '.'));
    const plannedInstallments = Number(draft.plannedInstallments);
    if (!selectedClient) {
      setMessage('Nejprve vyberte klienta.');
      return;
    }
    if (!draft.creditorType.trim() || !draft.firstPaymentMonth) {
      setMessage('Doplňte věřitele a měsíc první splátky.');
      return;
    }
    if (!Number.isFinite(debtAmount) || debtAmount <= 0) {
      setMessage('Výše dluhu musí být kladné číslo.');
      return;
    }
    if (!Number.isInteger(plannedInstallments) || plannedInstallments <= 0 || plannedInstallments > 240) {
      setMessage('Počet splátek musí být celé číslo od 1 do 240.');
      return;
    }

    const plannedEndMonth = calculatePlannedEndMonth(draft.firstPaymentMonth, plannedInstallments);
    const averagePayment = calculateAveragePayment(debtAmount, plannedInstallments);
    const ok = await onSaveRecord({
      entityType: 'payment_plan',
      ka: 'KA1',
      title: `Splátkový kalendář · ${draft.creditorType.trim()}`,
      activityDate: `${draft.firstPaymentMonth}-01`,
      worker: '',
      clientId: selectedClient.id,
      clientIds: [selectedClient.id],
      clientName: selectedClient.fullName,
      documentText: '',
      payload: {
        creditorType: draft.creditorType.trim(),
        debtAmount,
        firstPaymentMonth: draft.firstPaymentMonth,
        plannedInstallments,
        plannedEndMonth,
        averagePayment,
        status: PAYMENT_PLAN_STATUSES.ACTIVE,
        installmentStatuses: {},
        notes: draft.notes.trim()
      },
      indicatorFlags: {}
    }, {
      noticeKey: 'payment-plan',
      progressText: 'Ukládám splátkový kalendář…',
      successText: 'Splátkový kalendář uložen'
    });

    if (ok) {
      setDraft(EMPTY_DRAFT);
      setIsAdding(false);
      setMessage('Splátkový kalendář byl uložen.');
    }
  };

  const updatePlanPayload = async (record, nextPayload, successMessage) => {
    const ok = await onUpdateRecord(
      record.id,
      updatePayloadForRecord(record, nextPayload),
      {
        noticeKey: 'payment-plan',
        progressText: 'Ukládám změnu…',
        successText: successMessage
      }
    );
    if (ok) setMessage(successMessage);
    return ok;
  };

  const persistQueuedStatuses = async (record) => {
    const nextStatuses = pendingStatusesRef.current[record.id];
    if (!nextStatuses) return;
    delete pendingStatusesRef.current[record.id];
    delete saveTimersRef.current[record.id];

    const ok = await updatePlanPayload(
      record,
      { ...(record.payload || {}), installmentStatuses: nextStatuses },
      'Změny v harmonogramu byly uloženy.'
    );
    setOptimisticStatuses((previous) => {
      const next = { ...previous };
      delete next[record.id];
      return next;
    });
    if (!ok) setMessage('Změny se nepodařilo uložit. Harmonogram byl obnoven.');
  };

  const toggleMonth = (record, month) => {
    const payload = record.payload || {};
    const currentStatuses =
      pendingStatusesRef.current[record.id] ||
      optimisticStatuses[record.id] ||
      payload.installmentStatuses ||
      {};
    const nextStatus = nextPaymentMonthStatus(currentStatuses[month]);
    const nextStatuses = { ...currentStatuses };
    if (nextStatus === PAYMENT_MONTH_STATUSES.PENDING) delete nextStatuses[month];
    else nextStatuses[month] = nextStatus;

    pendingStatusesRef.current[record.id] = nextStatuses;
    setOptimisticStatuses((previous) => ({ ...previous, [record.id]: nextStatuses }));
    setMessage('Změny budou automaticky uloženy…');
    if (saveTimersRef.current[record.id]) clearTimeout(saveTimersRef.current[record.id]);
    saveTimersRef.current[record.id] = setTimeout(
      () => persistQueuedStatuses(record),
      650
    );
  };

  const deletePlan = async (record) => {
    if (saveTimersRef.current[record.id]) clearTimeout(saveTimersRef.current[record.id]);
    delete saveTimersRef.current[record.id];
    delete pendingStatusesRef.current[record.id];
    setOptimisticStatuses((previous) => {
      const next = { ...previous };
      delete next[record.id];
      return next;
    });
    await onDeleteRecord(record);
  };

  const setPlanStatus = async (record, status) => {
    const pendingStatuses = pendingStatusesRef.current[record.id];
    if (saveTimersRef.current[record.id]) clearTimeout(saveTimersRef.current[record.id]);
    delete saveTimersRef.current[record.id];
    delete pendingStatusesRef.current[record.id];
    const ok = await updatePlanPayload(
      record,
      {
        ...(record.payload || {}),
        ...(pendingStatuses ? { installmentStatuses: pendingStatuses } : {}),
        status
      },
      status === PAYMENT_PLAN_STATUSES.COMPLETED
        ? 'Kalendář byl označen jako úspěšně dokončený.'
        : status === PAYMENT_PLAN_STATUSES.FAILED
          ? 'Kalendář byl označen jako nedokončený.'
          : 'Kalendář byl znovu aktivován.'
    );
    if (pendingStatuses) {
      setOptimisticStatuses((previous) => {
        const next = { ...previous };
        delete next[record.id];
        return next;
      });
    }
    if (!ok) setMessage('Změnu stavu se nepodařilo uložit.');
  };

  if (!selectedClient) {
    return <p className="text-sm text-slate-500">Nejprve vyberte klienta.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-slate-500">
          {plans.length
            ? `${plans.length} ${plans.length === 1 ? 'kalendář' : plans.length < 5 ? 'kalendáře' : 'kalendářů'}`
            : 'Klient zatím nemá splátkový kalendář.'}
        </div>
        <button
          type="button"
          onClick={() => {
            setIsAdding((value) => !value);
            setMessage('');
          }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700"
        >
          <Plus className="h-3.5 w-3.5" />
          Přidat kalendář
        </button>
      </div>

      {isAdding && (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/60 p-3">
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Typ věřitele / věřitel
            </span>
            <input
              value={draft.creditorType}
              onChange={(event) => updateDraft('creditorType', event.target.value)}
              placeholder="např. ČSSZ, zdravotní pojišťovna, soukromý sektor"
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Výše dluhu
              </span>
              <input
                inputMode="decimal"
                value={draft.debtAmount}
                onChange={(event) => updateDraft('debtAmount', event.target.value)}
                placeholder="např. 6300"
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"
              />
            </label>
            <label>
              <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
                Počet splátek
              </span>
              <input
                type="number"
                min="1"
                max="240"
                value={draft.plannedInstallments}
                onChange={(event) => updateDraft('plannedInstallments', event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Měsíc první splátky
            </span>
            <input
              type="month"
              value={draft.firstPaymentMonth}
              onChange={(event) => updateDraft('firstPaymentMonth', event.target.value)}
              className="h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          {draft.debtAmount && draft.plannedInstallments && (
            <div className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">
              Průměrná plánovaná splátka:{' '}
              <strong>{formatCurrency(calculateAveragePayment(
                Number(String(draft.debtAmount).replace(',', '.')),
                Number(draft.plannedInstallments)
              ))}</strong>
              {draft.firstPaymentMonth && (
                <> · plánované ukončení <strong>{formatMonth(calculatePlannedEndMonth(
                  draft.firstPaymentMonth,
                  Number(draft.plannedInstallments)
                ))}</strong></>
              )}
            </div>
          )}
          <label className="block">
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-slate-600">
              Poznámka
            </span>
            <textarea
              rows={2}
              value={draft.notes}
              onChange={(event) => updateDraft('notes', event.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setDraft(EMPTY_DRAFT);
                setMessage('');
              }}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700"
            >
              Zrušit
            </button>
            <button
              type="button"
              onClick={savePlan}
              disabled={isSaving}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              Uložit kalendář
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900">
          {message}
        </div>
      )}

      {plans.map((record) => {
        const payload = record.payload || {};
        const months = buildPaymentSchedule(payload.firstPaymentMonth, payload.plannedInstallments);
        const statuses = optimisticStatuses[record.id] || payload.installmentStatuses || {};
        const paidCount = months.filter((month) => statuses[month] === PAYMENT_MONTH_STATUSES.PAID).length;
        const missedCount = months.filter((month) => statuses[month] === PAYMENT_MONTH_STATUSES.MISSED).length;
        const isExpanded = expandedPlanIds[record.id] !== false;
        const isActive = payload.status === PAYMENT_PLAN_STATUSES.ACTIVE || !payload.status;
        return (
          <div key={record.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setExpandedPlanIds((previous) => ({
                ...previous,
                [record.id]: !isExpanded
              }))}
              className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <WalletCards className="h-4 w-4 text-indigo-600" />
                  <span className="text-sm font-extrabold text-slate-900">
                    {payload.creditorType || 'Neuvedený věřitel'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {formatCurrency(payload.debtAmount)} · {paidCount}/{payload.plannedInstallments || 0} splněno
                  {missedCount ? ` · ${missedCount} nesplněno` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                  payload.status === PAYMENT_PLAN_STATUSES.COMPLETED
                    ? 'bg-emerald-100 text-emerald-800'
                    : payload.status === PAYMENT_PLAN_STATUSES.FAILED
                      ? 'bg-rose-100 text-rose-800'
                      : 'bg-indigo-100 text-indigo-800'
                }`}>
                  {STATUS_LABELS[payload.status] || STATUS_LABELS.ACTIVE}
                </span>
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 px-3 py-3">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <div className="text-slate-500">Průměrná splátka</div>
                    <strong>{formatCurrency(payload.averagePayment)}</strong>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-2.5 py-2">
                    <div className="text-slate-500">Období</div>
                    <strong>{formatMonth(payload.firstPaymentMonth)}–{formatMonth(payload.plannedEndMonth)}</strong>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5">
                  {months.map((month) => {
                    const monthStatus = statuses[month] || PAYMENT_MONTH_STATUSES.PENDING;
                    return (
                      <button
                        key={month}
                        type="button"
                        disabled={isSaving || !isActive}
                        onClick={() => toggleMonth(record, month)}
                        title="Kliknutím přepnete: splněno → nesplněno → bez záznamu"
                        className={`flex min-w-[58px] items-center justify-center gap-1 rounded-lg border px-2 py-2 text-[11px] font-bold transition disabled:cursor-default ${
                          monthStatus === PAYMENT_MONTH_STATUSES.PAID
                            ? 'border-emerald-300 bg-emerald-100 text-emerald-900'
                            : monthStatus === PAYMENT_MONTH_STATUSES.MISSED
                              ? 'border-rose-300 bg-rose-100 text-rose-900'
                              : 'border-slate-200 bg-slate-50 text-slate-500 hover:border-indigo-300'
                        }`}
                      >
                        <MonthStatusIcon status={monthStatus} />
                        {formatMonth(month)}
                      </button>
                    );
                  })}
                </div>

                {payload.notes && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    {payload.notes}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {isActive ? (
                    <>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => setPlanStatus(record, PAYMENT_PLAN_STATUSES.COMPLETED)}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        <CalendarCheck2 className="h-3.5 w-3.5" />
                        Dokončeno
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => setPlanStatus(record, PAYMENT_PLAN_STATUSES.FAILED)}
                        className="rounded-lg bg-rose-600 px-2.5 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                      >
                        Nedokončeno
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => setPlanStatus(record, PAYMENT_PLAN_STATUSES.ACTIVE)}
                      className="rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-[11px] font-bold text-indigo-800 disabled:opacity-60"
                    >
                      Znovu aktivovat
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => deletePlan(record)}
                    className="ml-auto inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-2 text-[11px] font-bold text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Smazat kalendář
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
