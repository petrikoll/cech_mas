const KA1_PHASES = Object.freeze([
  Object.freeze({
    code: 'KA1_1',
    title: 'Jednání se zájemcem o službu',
    activities: Object.freeze([
      Object.freeze({ code: 'KA1_1_1', title: 'Seznámení s nabídkou služby' }),
      Object.freeze({ code: 'KA1_1_2', title: 'Základní anamnéza a ověření cílové skupiny' }),
      Object.freeze({ code: 'KA1_1_3', title: 'Uzavření smlouvy a souhlasu s monitoringem' }),
      Object.freeze({ code: 'KA1_1_4', title: 'První stabilizační kroky' })
    ])
  }),
  Object.freeze({
    code: 'KA1_2',
    title: 'Mapování závazků a příčin předlužení',
    activities: Object.freeze([
      Object.freeze({ code: 'KA1_2_1', title: 'Systematické mapování závazků' }),
      Object.freeze({ code: 'KA1_2_2', title: 'Zpracování přehledu dluhů' }),
      Object.freeze({ code: 'KA1_2_3', title: 'Analýza příčin předlužení' })
    ])
  }),
  Object.freeze({
    code: 'KA1_3',
    title: 'Hledání, příprava a realizace řešení',
    activities: Object.freeze([
      Object.freeze({ code: 'KA1_3_1', title: 'Vyhodnocení nejvhodnějšího řešení' }),
      Object.freeze({ code: 'KA1_3_2', title: 'Vyjednání splátkových kalendářů' }),
      Object.freeze({ code: 'KA1_3_3', title: 'Příprava a podání oddlužení' }),
      Object.freeze({ code: 'KA1_3_4', title: 'Jiná řešení dluhové situace' }),
      Object.freeze({ code: 'KA1_3_5', title: 'Zaměstnání, srážky ze mzdy a zvýšení příjmu' }),
      Object.freeze({ code: 'KA1_3_6', title: 'Bezpečná digitální komunikace a právní gramotnost' }),
      Object.freeze({ code: 'KA1_3_7', title: 'Právní poradenství' })
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
