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
      active: 'border-indigo-200 bg-indigo-600 text-white shadow-[0_10px_24px_-14px_rgba(79,70,229,0.8)]',
      idle: 'border-transparent bg-transparent text-slate-500 hover:border-indigo-100 hover:bg-indigo-50/70 hover:text-indigo-800',
      badge: 'border-indigo-100 bg-indigo-50/80 text-indigo-700',
      page: 'bg-[radial-gradient(circle_at_top_left,#eef2ff_0,#f8faff_32%,#fbfdff_68%,#ffffff_100%)]',
      header: 'border-stone-200/90 bg-[#eadfce]/95',
      ambient: 'bg-indigo-200/20',
      label: 'text-indigo-600'
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
      active: 'border-emerald-200 bg-emerald-600 text-white shadow-[0_10px_24px_-14px_rgba(5,150,105,0.75)]',
      idle: 'border-transparent bg-transparent text-slate-500 hover:border-emerald-100 hover:bg-emerald-50/70 hover:text-emerald-800',
      badge: 'border-emerald-100 bg-emerald-50/80 text-emerald-700',
      page: 'bg-[radial-gradient(circle_at_top_left,#ecfdf5_0,#f7fdf9_32%,#fbfefc_68%,#ffffff_100%)]',
      header: 'border-stone-200/90 bg-[#eadfce]/95',
      ambient: 'bg-emerald-200/20',
      label: 'text-emerald-600'
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
