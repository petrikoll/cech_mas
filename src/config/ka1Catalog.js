const KA1_PHASES = Object.freeze([
  Object.freeze({
    code: 'A',
    title: 'Jednání se zájemcem o službu',
    activities: Object.freeze([
      Object.freeze({ code: 'A1', title: 'Seznámení s nabídkou služby' }),
      Object.freeze({ code: 'A2', title: 'Základní anamnéza a ověření cílové skupiny' }),
      Object.freeze({ code: 'A3', title: 'Uzavření smlouvy a souhlasu s monitoringem' }),
      Object.freeze({ code: 'A4', title: 'První stabilizační kroky' })
    ])
  }),
  Object.freeze({
    code: 'B',
    title: 'Mapování závazků a příčin předlužení',
    activities: Object.freeze([
      Object.freeze({ code: 'B1', title: 'Systematické mapování závazků' }),
      Object.freeze({ code: 'B2', title: 'Zpracování přehledu dluhů' }),
      Object.freeze({ code: 'B3', title: 'Analýza příčin předlužení' })
    ])
  }),
  Object.freeze({
    code: 'C',
    title: 'Hledání, příprava a realizace řešení',
    activities: Object.freeze([
      Object.freeze({ code: 'C1', title: 'Vyhodnocení nejvhodnějšího řešení' }),
      Object.freeze({ code: 'C2', title: 'Vyjednání splátkových kalendářů' }),
      Object.freeze({ code: 'C3', title: 'Příprava a podání oddlužení' }),
      Object.freeze({ code: 'C4', title: 'Jiná řešení dluhové situace' }),
      Object.freeze({ code: 'C5', title: 'Zaměstnání, srážky ze mzdy a zvýšení příjmu' }),
      Object.freeze({ code: 'C6', title: 'Bezpečná digitální komunikace a právní gramotnost' }),
      Object.freeze({ code: 'C7', title: 'Právní poradenství' })
    ])
  })
]);

const KA1_ACTIVITIES = Object.freeze(
  KA1_PHASES.flatMap((phase) =>
    phase.activities.map((activity) => Object.freeze({
      ...activity,
      phaseCode: phase.code,
      phaseTitle: phase.title
    }))
  )
);

export { KA1_PHASES, KA1_ACTIVITIES };
