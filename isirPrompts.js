export const CASE_STUDY_ANALYSIS_PROMPT = `Vytvoř pracovní odborný rozbor insolvenčního řízení pro dluhového poradce.

Toto je 1. krok zpracování kazuistiky: interní procesní analýza.
Cílem není finální text pro web, ale přesné zachycení toho, co se v řízení děje právě teď, co je potřeba řešit, a jaký je dosavadní vývoj.

Dostaneš:
1. ověřená systémová data z aplikace,
2. STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF uložená v databázi,
3. seznam dokumentů z insolvenčního rejstříku,
4. vybraná PDF pro kontext řízení.

Priorita zdrojů:
- Pro finanční a procentuální údaje používej přednostně STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF.
- PDF používej hlavně pro kontext řízení a vysvětlení vývoje.
- Lhůtu přihlášek, počet přihlášek a celkovou výši pohledávek přebírej výhradně ze systémových/strukturovaných dat dodaných aplikací.
- Pokud strukturovaná data obsahují konkrétní částku, procento, počet, datum nebo doporučení správce, nesmíš je nahrazovat odhadem z textu PDF.

Důležité pravidlo času:
- Vždy pracuj s aktuálním datem zpracování uvedeným v systémových datech.
- Termíny, které jsou před aktuálním datem zpracování, nejsou nejbližší budoucí termíny.
- Minulé termíny nedávej do „nearest_deadlines_and_events“ jako něco, co se teprve očekává. Patří pouze do historie nebo mezi nejasnosti, pokud ovlivňují aktuální práci.
- Pokud dokument z roku 2018 uvádí očekávaný budoucí krok, ale aktuální datum zpracování je pozdější, neformuluj ho jako aktuálně očekávaný krok.

Vrať pouze validní JSON v tomto formátu:
{
  "working_case_analysis": {
    "current_state_now": ["co se v případu děje právě teď a v jaké fázi řízení je"],
    "latest_important_change": ["poslední významná změna nebo dokument a jeho praktický význam"],
    "nearest_deadlines_and_events": ["datum – událost – co hlídat"],
    "advisor_tasks_now": ["co má poradce s klientem ověřit, vysvětlit nebo připravit nyní"],
    "client_tasks_now": ["co má klient udělat nyní nebo v nejbližší době"],
    "finance_and_claims_now": ["finanční a pohledávkové údaje významné pro aktuální postup; používat přesné údaje ze strukturovaných dat; systémové částky nepřepočítávat ani neodhadovat"],
    "debt_relief_evaluation": ["pokud existují strukturovaná data o plnění nebo splnění oddlužení, uveď přehled očekávání/průběh/skutečnost: přezkoumané pohledávky, průběžné uspokojení, konečné uspokojení, doporučení správce, osvobození nebo čekání na rozhodnutí soudu"],
    "uncertainties_affecting_current_work": ["neověřené, rozporné nebo průběžné údaje, které ovlivňují aktuální práci poradce"],
    "case_history_summary": ["stručný dosavadní vývoj případu"],
    "timeline": ["datum – dokument nebo událost – praktický význam"],
    "confidence": "nízká | střední | vysoká"
  }
}

Pravidla:
- Vrať pouze validní JSON.
- Piš česky, jednoduše a věcně.
- Piš pro dluhového poradce.
- Hlavní důraz dej na aktuální stav a aktuální práci poradce, ne na historický popis.
- Nepiš právní rady.
- Nevyvozuj právní závěry nad rámec dokumentů.
- Nevypočítávej lhůtu přihlášek.
- Nevypočítávej počet přihlášek.
- Nevypočítávej celkovou výši pohledávek.
- Nepoužívej formulace „cca“, „odhadem“, „pravděpodobně“ u částek a procent, pokud jsou ve strukturovaných datech konkrétní hodnoty.
- Pokud existují strukturovaná data o přezkumu, plnění nebo splnění oddlužení, musí se objevit v části finance_and_claims_now a případně debt_relief_evaluation.
- Pokud systémový údaj chybí, napiš „není bezpečně ověřeno“.
- Pokud údaj není jistý, označ ho jako neověřený, průběžný nebo rozporný.
- Neopakuj stejné informace vícekrát.
- Neuváděj obecné právní poučky.
- U každého termínu posuzuj, zda je vzhledem k aktuálnímu datu zpracování budoucí, dnešní, nebo minulý.
- Do aktuálních úkolů dávej pouze věci, které jsou stále relevantní k aktuálnímu datu zpracování.
- Pracovní rozbor nesmí přesáhnout 15 000 znaků.`;

export const CASE_STUDY_FINAL_PROMPT = `Převeď pracovní odborný rozbor do finální kazuistiky pro webovou aplikaci.

Toto je 2. krok zpracování: kontrola správnosti, zkrácení, odstranění duplicit a rozdělení do sekcí.
Kazuistika se pravidelně aktualizuje s novými dokumenty. Její hlavní funkce je rychle ukázat, co se v případu děje právě teď a co je potřeba řešit.

Při finálním zpracování vždy respektuj aktuální datum zpracování uvedené v systémových datech. Minulé termíny nesmí být popsány jako nejbližší očekávané kroky. Pokud je termín starý, patří do historie, případně do nejistot pouze tehdy, pokud z podkladů není jasné, jak byl vyřešen.

Vrať pouze text ve formátu sekcí. Nepoužívej JSON.
Nepřidávej žádný úvod ani závěr mimo sekce.

Použij přesně tyto 2 sekce:

Pokud ověřená systémová data obsahují STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF, musí se jejich klíčové finanční a procentuální údaje promítnout do první sekce. Neignoruj je.

[[SECTION:current:Aktuální stav a co řešit]]
Max. 3 500 znaků. Tato sekce je hlavní pracovní část pro poradce.
Uveď:
- aktuální stav řízení,
- poslední významnou změnu,
- nejbližší termíny,
- co má poradce ověřit,
- co má klient udělat,
- finanční nebo pohledávkové údaje ze strukturovaných dat, pokud existují,
- u ukončeného oddlužení krátké vyhodnocení očekávání / průběh / skutečnost,
- neověřené nebo průběžné údaje, pokud ovlivňují aktuální práci,
- jistotu výstupu.

Doporučená vnitřní struktura:
Stav nyní:
...

Nejbližší termíny:
- ...

Co ověřit / řešit s klientem:
- ...

Co má udělat klient:
- ...

Finance a pohledávky:
- Přezkoumané pohledávky: ...
- Poslední průběžné uspokojení: ...
- Konečné uspokojení / splnění oddlužení: ...
- Doporučení správce: ...

Vyhodnocení oddlužení, pokud je případ ukončený nebo je k dispozici zpráva o splnění:
- Očekávání / průběh / skutečnost: ...

Nejistoty pro aktuální práci:
- ...

Jistota výstupu: nízká / střední / vysoká

[[SECTION:history:Vývoj řízení]]
Max. 2 500 znaků. Tato sekce je stručná historie případu.
Uveď:
- stručný vývoj případu ve 3–5 větách,
- časovou osu nejdůležitějších událostí,
- maximálně 12 položek časové osy,
- starší méně významné události slučuj.

Doporučená vnitřní struktura:
Stručný vývoj:
...

Časová osa:
- datum – dokument/událost – praktický význam

Limity:
- Celý výstup nesmí přesáhnout 6 000 znaků včetně mezer.
- Nevytvářej jiné hlavní sekce.
- Neopakuj informace mezi oběma sekcemi.
- Aktuální úkoly, termíny, finance a nejistoty patří do první sekce, pokud ovlivňují aktuální práci.
- Historické procesní informace patří do druhé sekce.

Pravidla:
- Piš česky, stručně a věcně.
- Nepřidávej nové informace mimo pracovní rozbor a systémová data.
- Nepiš právní rady.
- Nevyvozuj právní závěry.
- Nepiš obecné právní poučky.
- Pokud údaj není jistý, označ ho jako neověřený, průběžný nebo rozporný.
- Lhůtu přihlášek, počet přihlášek a celkovou výši pohledávek přebírej pouze ze systémových/strukturovaných dat.
- Pro přezkoumané pohledávky, procenta uspokojení, částky vyplacené věřitelům/správci, splnění oddlužení a doporučení správce používej přednostně STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF.
- Pokud jsou strukturovaná data dostupná, nepiš místo nich obecné odhady ani „cca“.
- Nepoužívej markdownové zvýraznění pomocí **hvězdiček**. Piš čistý text, odrážky a krátké popisky.
- Termíny starší než aktuální datum zpracování neuváděj v první sekci jako „nejbližší termíny“ ani jako budoucí očekávané kroky.
- Jestliže pracovní rozbor obsahuje starý termín jako aktuální, ve finálním výstupu ho oprav: přesuň ho do historie nebo napiš, že z dostupných dokumentů není zřejmé, jak byl po tomto termínu vyřešen.`;

export const buildCaseStudyAnalysisPrompt = ({ client, caseItem, documents, currentDate }) => {
  const structuredDocuments = documents
    .map((document) => {
      if (!document.analysis_json) return null;
      try {
        const value = typeof document.analysis_json === 'object'
          ? document.analysis_json
          : JSON.parse(document.analysis_json);
        return { document_id: document.document_id, title: document.title, data: value };
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return `${CASE_STUDY_ANALYSIS_PROMPT}

OVĚŘENÁ SYSTÉMOVÁ DATA:
${JSON.stringify({
    current_date: currentDate,
    client: {
      name: client?.fullName || '',
      project: client?.projectId || ''
    },
    case: {
      case_number: caseItem?.case_number || '',
      case_status: caseItem?.case_status || '',
      proceeding_started_at: caseItem?.proceeding_started_at || '',
      claims_deadline: caseItem?.claims_deadline || 'není bezpečně ověřeno',
      claims_count: caseItem?.claims_count ?? 'není bezpečně ověřeno',
      claims_total_amount: caseItem?.claims_total_amount || 'není bezpečně ověřeno',
      last_event_at: caseItem?.last_event_at || '',
      last_event_title: caseItem?.last_event_title || ''
    }
  }, null, 2)}

STRUKTUROVANÁ DATA Z FORMULÁŘOVÝCH PDF:
${structuredDocuments.length ? JSON.stringify(structuredDocuments, null, 2) : 'Nejsou k dispozici.'}

Kompletní seznam dokumentů podle ISIR:
${documents.map((document, index) =>
    `${index + 1}. ${document.event_date || 'bez data'} – ${document.title || 'Dokument ISIR'} – ID ${document.document_id}`
  ).join('\n')}`;
};

export const buildCaseStudyFinalPrompt = ({ workingAnalysis, caseItem, currentDate }) => `${CASE_STUDY_FINAL_PROMPT}

AKTUÁLNÍ DATUM ZPRACOVÁNÍ: ${currentDate}

OVĚŘENÁ SYSTÉMOVÁ DATA:
${JSON.stringify({
  case_number: caseItem?.case_number || '',
  case_status: caseItem?.case_status || '',
  claims_deadline: caseItem?.claims_deadline || 'není bezpečně ověřeno',
  claims_count: caseItem?.claims_count ?? 'není bezpečně ověřeno',
  claims_total_amount: caseItem?.claims_total_amount || 'není bezpečně ověřeno'
}, null, 2)}

PRACOVNÍ ODBORNÝ ROZBOR:
${JSON.stringify(workingAnalysis, null, 2)}`;

export const buildCaseStudyShorteningPrompt = (caseStudy) => `Zkrať následující finální kazuistiku na nejvýše 6 000 znaků včetně mezer.
Zachovej stejný formát značek [[SECTION:key:Název]].
Neměň význam, nepřidávej nové informace a nevynechávej konkrétní lhůty nebo povinnosti.

${caseStudy}`;
