const CLIENT_CASE_AI_ENTITY_TYPES = new Set(['plans', 'consultations']);

function filterClientCaseAiRecords(records = []) {
  return records.filter((record) =>
    record && !record.isSynthetic && CLIENT_CASE_AI_ENTITY_TYPES.has(record.entityType)
  );
}

function buildClientCaseAiPrompt(deterministicSummary) {
  return `
Vytvoř pracovní souhrn zakázky klienta pro interní evidenci aktivního projektu dluhového poradenství CECH nebo MAS.

Účel výstupu:
Souhrn má pomoci pracovníkovi rychle pochopit, jaká zakázka klienta je v projektu řešena, jaká podpora už proběhla, co je doložený výsledek a co má následovat dál. Nejde o zápis jednotlivého výkonu ani o hodnotící zprávu o osobnosti klienta.

Povinná pravidla:
1. Piš česky, věcně, stručně a srozumitelně pro sociální práci.
2. Použij pouze data v podkladech níže. Nic nedomýšlej, nedoplňuj nové služby, instituce, termíny, diagnózy, výsledky ani doporučení, pokud nejsou v podkladech.
3. Rozlišuj doložená fakta, průběh podpory a doporučený další postup. Pokud je doložen pouze průběh, nepopisuj ho jako dosaženou změnu.
4. Neopisuj mechanicky všechny záznamy. Vyber podstatné informace a sluč je do přehledného souhrnu.
5. Pokud některá část není v podkladech dostatečně doložená, napiš to věcně jako chybějící nebo neúplný údaj. Nevymýšlej obsah.
6. Nepřidávej sekci indikátorů, kontrolu evidence, strojová varování ani tabulky indikátorů.
7. Výstup vrať jako prostý text s nadpisy. Nepřidávej komentář k tomu, že jsi AI.

Doporučená struktura:
Souhrn zakázky klienta
1. Stručné vymezení zakázky klienta
2. Aktuální situace a hlavní potřeby
3. Individuální plán a cíle
4. Dosavadní podpora v projektu
5. Doložené výsledky nebo posun
6. Otevřené oblasti a rizika
7. Navazující doporučený postup

Podklady:
${String(deterministicSummary || '').trim()}
`.trim();
}

export { buildClientCaseAiPrompt, filterClientCaseAiRecords };
