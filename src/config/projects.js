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
      active: 'border-indigo-700 bg-indigo-700 text-white',
      idle: 'border-indigo-200 bg-white text-indigo-900 hover:bg-indigo-50',
      badge: 'border-indigo-200 bg-indigo-50 text-indigo-800'
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
      active: 'border-emerald-700 bg-emerald-700 text-white',
      idle: 'border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-50',
      badge: 'border-emerald-200 bg-emerald-50 text-emerald-800'
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
