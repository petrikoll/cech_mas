const PROJECT_IDS = Object.freeze({
  CECH: 'CECH',
  MAS: 'MAS'
});

const PROJECTS = Object.freeze({
  [PROJECT_IDS.CECH]: Object.freeze({
    id: PROJECT_IDS.CECH,
    shortName: 'CECH',
    title: 'Řešení předluženosti na severním Osoblažsku',
    registrationNumber: 'CZ.03.02.01/00/25_106/0006138',
    recipient: 'Osoblažský cech, z.ú.',
    partner: '',
    startDate: '2026-03-01',
    endDate: '2028-06-30',
    theme: Object.freeze({
      active: 'border-indigo-800 bg-indigo-700 text-white shadow-md shadow-indigo-300/60',
      idle: 'border-indigo-300 bg-white/90 text-indigo-950 hover:bg-indigo-100',
      badge: 'border-indigo-300 bg-indigo-100 text-indigo-900',
      page: 'bg-[radial-gradient(circle_at_top_left,#c7d2fe_0,#dbeafe_34%,#e8eef8_64%,#eef2f7_100%)]',
      header: 'border-indigo-300 bg-indigo-50/90',
      ambient: 'bg-indigo-400/25',
      label: 'text-indigo-800'
    })
  }),
  [PROJECT_IDS.MAS]: Object.freeze({
    id: PROJECT_IDS.MAS,
    shortName: 'MAS',
    title: 'Řešení oblasti dluhové problematiky na území MAS',
    registrationNumber: 'CZ.03.02.01/00/25_084/0006297',
    recipient: 'Rozvoj Krnovska o.p.s.',
    partner: 'Osoblažský cech, z.ú.',
    startDate: '2026-03-01',
    endDate: '2028-02-29',
    theme: Object.freeze({
      active: 'border-emerald-800 bg-emerald-700 text-white shadow-md shadow-emerald-300/60',
      idle: 'border-emerald-300 bg-white/90 text-emerald-950 hover:bg-emerald-100',
      badge: 'border-emerald-300 bg-emerald-100 text-emerald-900',
      page: 'bg-[radial-gradient(circle_at_top_left,#bbf7d0_0,#d1fae5_34%,#e3f3e9_64%,#edf5f0_100%)]',
      header: 'border-emerald-300 bg-emerald-50/90',
      ambient: 'bg-emerald-400/25',
      label: 'text-emerald-800'
    })
  })
});

const PROJECT_LIST = Object.freeze(Object.values(PROJECTS));

function normalizeProjectId(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PROJECTS, normalized) ? normalized : '';
}

function isProjectId(value) {
  return Boolean(normalizeProjectId(value));
}

function getProject(value) {
  return PROJECTS[normalizeProjectId(value)] || null;
}

export {
  PROJECT_IDS,
  PROJECTS,
  PROJECT_LIST,
  normalizeProjectId,
  isProjectId,
  getProject
};
