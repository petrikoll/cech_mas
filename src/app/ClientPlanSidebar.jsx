import React from 'react';

import PersonalDevelopmentPlanForm from './PersonalDevelopmentPlanForm.jsx';

function ClientPlanSidebar({ clients, records = [], selectedClientId, onClientChange, onSaveRecord, onUpdateRecord }) {
  const selectedClient = clients.find((client) => client.id === selectedClientId);

  return (
    <aside className="space-y-3 xl:sticky xl:top-3 xl:max-h-[calc(100vh-1.5rem)] xl:overflow-auto">
      <div className="rounded-2xl border border-slate-500 bg-slate-300 p-3 shadow-sm">
        <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Klient
        </label>
        <select
          value={selectedClientId}
          onChange={(event) => onClientChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(148,163,184,0.18)] outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        >
          <option value="">Vyber klienta...</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.fullName}
            </option>
          ))}
        </select>
      </div>

      {selectedClientId ? (
        <PersonalDevelopmentPlanForm
          clientId={selectedClientId}
          clientName={selectedClient?.fullName || ''}
          records={records}
          onSaveRecord={onSaveRecord}
          onUpdateRecord={onUpdateRecord}
          compact
        />
      ) : (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center text-sm font-medium text-slate-500">
          Vyber klienta pro zobrazení IPR.
        </div>
      )}
    </aside>
  );
}

export default ClientPlanSidebar;
