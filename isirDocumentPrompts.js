export const DOCUMENT_ANALYSIS_PROMPT = `Přečti vybraný dokument z insolvenčního rejstříku jako odborný asistent pro dluhového poradce.

Toto je pracovní odborný rozbor pouze dodaného dokumentu. Nejde o celkovou kazuistiku případu.
Vrať pouze validní JSON:
{
  "category": "stručný typ dokumentu",
  "working_analysis": {
    "what_document_says": ["věcná zjištění výslovně uvedená v dokumentu"],
    "practical_meaning_for_debt_advisor": ["praktický význam pro poradce"],
    "explicit_deadlines": [{"date_or_period":"","description":"","recipient":null,"source_document":""}],
    "explicit_debtor_obligations": [{"obligation":"","recipient":null,"deadline":null,"source_document":""}],
    "advisor_recommendations": ["co ověřit, vysvětlit nebo připravit"],
    "unclear_or_incomplete_information": ["nejasnosti nebo rozpory"]
  },
  "confidence": "nízká | střední | vysoká"
}

Pravidla:
- Piš česky, jednoduše a věcně.
- Nepiš právní rady ani závěry nad rámec dokumentu.
- Lhůty a povinnosti uváděj jen tehdy, jsou-li výslovně napsané.
- Pokud chybí, vrať u příslušného pole prázdný seznam.
- Nevymýšlej obecná rizika a neopisuj celý dokument.
- Pracovní rozbor nesmí přesáhnout 8 000 znaků.`;

export const DOCUMENT_FINAL_PROMPT = `Převeď pracovní rozbor jednoho dokumentu do krátkého finálního shrnutí pro webovou aplikaci.
Nepřidávej nové skutečnosti. Vrať pouze text ve třech sekcích:

[[SECTION:summary:Shrnutí]]
Maximálně 700 znaků. Typ dokumentu a jeho praktický význam.

[[SECTION:deadlines:Lhůty a povinnosti]]
Maximálně 1 200 znaků. Jen konkrétní lhůty, data a výslovné povinnosti. Pokud nejsou, napiš to jednou větou.

[[SECTION:other:Ostatní informace a doporučení]]
Maximálně 1 200 znaků. Další důležité informace, nejvýše 5 doporučení a na konci jistota shrnutí.

Celkem nejvýše 3 500 znaků. Shrnutí dokumentu není kazuistika. Nepiš právní rady, obecná rizika ani domněnky.`;

export const STRUCTURED_REPORT_EXTRACTION_PROMPT = `Přečti PDF z insolvenčního rejstříku jako specializovaný extractor formulářových dokumentů správce.

Dokument může obsahovat jeden nebo více těchto formulářů:
- Zpráva pro oddlužení a o přezkumu
- Seznam přihlášených pohledávek
- Soupis majetkové podstaty
- Vyrozumění o popření přihlášky
- Zpráva / Sdělení správce o plnění oddlužení
- Zpráva / Sdělení správce o splnění oddlužení
- Vyúčtování odměny a hotových výdajů insolvenčního správce
- Návrh na osvobození od placení zbývajících pohledávek

Úkol:
Nevytvářej běžné shrnutí. Vytěž strukturovaná data do JSON.
Pokud dokument obsahuje více formulářů, vyplň všechny relevantní bloky.
Pokud údaj nenajdeš, vrať null nebo prázdný seznam. Nehádej.
Datum vracej přednostně jako YYYY-MM-DD. Období typu „leden / 2025“ vrať jako 2025-01-01. Částky a procenta vrať jako číslo nebo přesný text z formuláře.

Důležité:
- Čti vizuální obsah formuláře, tabulky i zaškrtnutá pole.
- Textová extrakce z těchto PDF může být rozbitá; rozhodující je obsah viditelný ve formuláři.
- Částky a procenta opisuj přesně podle dokumentu.
- Dlouhá právní poučení neopisuj; vytěž jen rozhodná fakta.
- U dokumentů typu „Zpráva pro oddlužení“, „Zpráva o přezkumu“ a „Seznam přihlášených pohledávek“ vytěžuj jen souhrny.
- Nevytěžuj jednotlivé věřitele, jednotlivé pohledávky, distribuční schéma ani seznam přihlášek jako pole JSONu.
- Z pohledávkových tabulek ber pouze souhrnné údaje: počet přezkoumaných přihlášek, celkové částky zajištěných/nezajištěných/podřízených pohledávek, počet nepřezkoumaných pohledávek a informace o popření, pokud jsou uvedeny.

Vrať pouze validní JSON:
{
  "document_family":"debt_relief_structured_report",
  "document_type":"review_report | performance_report | completion_report | trustee_fee_accounting | mixed | unknown",
  "case_identification":{"court":null,"case_number":null,"debtor_name":null,"debtor_birth_date":null,"debtor_address":null,"trustee_name":null,"trustee_is_vat_payer":null},
  "document_dates":{"signed_at":null,"submitted_at":null,"report_period_from":null,"report_period_to":null,"report_periods":[]},
  "proceeding_state":{"bankruptcy_decision_date":null,"debt_relief_permitted_date":null,"debt_relief_approved_date":null,"last_payment_date":null,"stage":"review_completed | debt_relief_running | debt_relief_completed_by_trustee | awaiting_court_discharge_decision | unknown","main_conclusion":null},
  "claims_review":{"review_meeting_date":null,"review_meeting_time_from":null,"review_meeting_time_to":null,"debtor_present":null,"reviewed_claim_applications_count":null,"reviewed_unsecured_claims_total":null,"reviewed_unsecured_claims_without_subordinated_total":null,"secured_claims_total":null,"unreviewed_claims_count":null,"creditors_under_177_count":null,"creditors_without_voting_rights_count":null,"creditor_voting_result":null,"claims_denied_by_debtor":null,"claims_denied_by_trustee":null,"denial_notice_present":null,"debtor_proposed_debt_relief_form":null,"debtor_requests_different_payment_amount":null,"eu_creditors_known":null},
  "performance":{"debtor_fulfils_obligations":null,"trustee_statement":null,"payment_source":null,"regular_contribution_amount":null,"debtor_payment_summary":null,"extra_income_summary":null,"creditors_paid_total":null,"trustee_paid_total":null,"current_satisfaction_percent":null,"expected_satisfaction_3y_percent":null,"expected_satisfaction_5y_percent":null,"deposit_note":null},
  "completion":{"debt_relief_completed_under":null,"unsecured_satisfaction_percent":null,"unsecured_satisfaction_amount":null,"secured_satisfaction_percent":null,"secured_satisfaction_amount":null,"overpayment_amount":null,"debt_relief_interrupted":null,"debt_relief_extended":null,"income_payer_stop_deductions_date":null,"all_assets_sold":null,"debtor_fulfilled_all_obligations":null,"course_of_proceeding_summary":null},
  "trustee_accounting":{"trustee_total_fee_with_vat":null,"trustee_total_fee_without_vat":null,"review_fee":null,"reviewed_claims_count_for_fee":null,"duration_fee":null,"secured_asset_proceeds_fee":null,"unsecured_distribution_proceeds_fee":null,"cash_expenses":null,"unpaid_amount":null,"remaining_to_satisfy":null,"months_count":null,"period_from":null,"period_to":null,"last_income_payer":null,"comment":null},
  "trustee_recommendation":{"recommendation_text":null,"recommendation_category":"continue_debt_relief | approve_debt_relief | decide_completed | grant_discharge | cancel_or_problem | other | unknown"},
  "assets":{"asset_inventory_present":null,"assets_summary":null,"all_assets_sold":null},
  "attachments":[],
  "advisor_summary":{"short_conclusion":null,"what_to_check":[],"important_warnings":[]},
  "confidence":"low | medium | high",
  "warnings":[]
}

Pravidla:
- Piš česky tam, kde jde o textová pole.
- Nevyvozuj právní závěry.
- Do advisor_summary dej jen praktický závěr pro dluhového poradce.
- Pokud si nejsi jistý důležitým údajem, přidej vysvětlení do warnings a nastav nižší confidence.`;

export const STRUCTURED_REPORT_FINAL_PROMPT = `Převeď strukturované vytěžení formulářového dokumentu insolvenčního správce do krátkého shrnutí pro webovou aplikaci.

Vrať pouze text ve formátu sekcí. Nepoužívej JSON.
Použij přesně tyto tři sekce:

[[SECTION:summary:Shrnutí]]
Maximálně 700 znaků. Uveď typ dokumentu, fázi řízení a hlavní závěr. Pokud jde o plnění/splnění oddlužení, uveď výslovně doporučení správce a zda dlužník plní povinnosti.

[[SECTION:deadlines:Lhůty a povinnosti]]
Maximálně 1 000 znaků. Uveď jen konkrétní lhůty, termíny, povinnosti nebo úkony, které z dokumentu prakticky plynou. Pokud žádné aktuální lhůty nejsou, napiš to jednou větou.

[[SECTION:other:Ostatní informace a doporučení]]
Maximálně 1 200 znaků. Uveď nejdůležitější čísla a závěry podle typu dokumentu: přezkoumané pohledávky, míru uspokojení, částky věřitelům/správci, deponaci, popření, splnění oddlužení, vyúčtování správce. Přidej nejvýše 5 doporučení pro poradce a jistotu vytěžení.

Pravidla:
- Celý výstup max. 3 500 znaků.
- Nepiš právní rady.
- Nepřidávej nové skutečnosti mimo strukturované vytěžení.
- Neopisuj dlouhá právní poučení ani celé tabulky.
- U přezkumu/seznamu pohledávek uváděj jen souhrny, nikdy jednotlivé věřitele ani jednotlivé pohledávky.
- Pokud je údaj nejistý, označ ho jako nejistý.
- Pokud je doporučení správce negativní nebo problémové, uveď to už ve Shrnutí.`;

export const DATA_VERIFICATION_PROMPT = `Porovnej údaje uložené v aplikaci s obsahem přiložených PDF z ISIR.
Nejde o právní posouzení. Navrhuj pouze opravy, které jsou přímo a jednoznačně doložené dokumenty.

Vrať pouze validní JSON:
{
  "overall_result":"bez rozdílů | navrženy změny | nelze bezpečně ověřit",
  "verified_fields":[{"field":"","label":"","application_value":null,"pdf_value":null,"source_document_id":"","confidence":"high | medium | low"}],
  "recommended_corrections":[{"field":"","label":"","current_value":null,"proposed_value":null,"source_document_id":"","reason":"","confidence":"high | medium | low"}],
  "uncertainties":[],
  "safe_summary":"stručný výsledek kontroly"
}

Povolená pole návrhů jsou pouze:
case_status, proceeding_started_at, proceeding_ended_at, claims_deadline, claims_count, claims_total_amount, last_event_at, last_event_title.

Pravidla:
- Návrh změny vytvoř jen s jistotou high nebo medium a s ID zdrojového dokumentu.
- U výše pohledávek použij pouze pole „V. Pohledávky celkem“ z hlavních přihlášek; přílohy nezapočítávej.
- Částky musí být čísla bez měny, počty celá čísla, data YYYY-MM-DD.
- Nic neopravuj automaticky. Pouze připrav kontrolní návrhy pro uživatele.
- Pokud dokumenty odporují, uveď to mezi nejistotami a opravu nenavrhuj.`;

export const CLAIM_AMOUNT_EXTRACTION_PROMPT = `Přečti jedno PDF z insolvenčního rejstříku a vytěž pouze celkovou částku přihlášené pohledávky.

Hledej především pole:
1. „V. Pohledávky celkem“ nebo „Celková výše přihlášených pohledávek“ v Přihlášce pohledávky.
2. „Zbývá k uspokojení“ v návrhu na uspokojení pohledávky za majetkovou podstatou.

Vrať pouze validní JSON:
{"document_type":"claim_application | estate_claim | unknown","amount":null,"currency":"CZK","evidence":"","confidence":"low | medium | high"}

Částku vrať jako číslo bez měny. Nikdy ji neodhaduj ani nesčítej z nejednoznačných dílčích řádků. Pokud cílové pole bezpečně nenajdeš, amount musí být null.`;

export const isClaimApplicationDocument = (document) => {
  const text = `${document?.title || ''} ${document?.document_type || ''}`.toLocaleLowerCase('cs');
  return /(p[řr]ihl[aá][šs]ka.*pohled[aá]vk|n[aá]vrh.*uspokojen[ií].*pohled[aá]vk)/i.test(text);
};

export const isStructuredIsirDocument = (document) => {
  const text = `${document?.title || ''} ${document?.document_type || ''}`
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  return [
    'zprava pro oddluzeni',
    'zprava o prezkumu',
    'zprave o prezkumu',
    'seznam prihlasenych pohledavek',
    'soupis majetkove podstaty',
    'vyrozumeni o popreni',
    'sdeleni spravce o plneni oddluzeni',
    'zdeleni spravce o plneni oddluzeni',
    'zprava o plneni oddluzeni',
    'zprava spravce o plneni oddluzeni',
    'sdeleni spravce o splneni oddluzeni',
    'zprava o splneni oddluzeni',
    'vyuctovani odmeny',
    'vyuctovani hotovych vydaju',
    'navrh na osvobozeni',
    'zopo'
  ].some((phrase) => text.includes(phrase));
};

export const isCaseStudyRelevantDocument = (document) => {
  if (String(document?.is_main || '') !== 'Ano') return false;
  const text = String(document?.title || '').toLocaleLowerCase('cs');
  return [
    'insolvenční návrh',
    'návrh na povolení oddlužení',
    'usnesení',
    'vyhláška',
    'sdělení insolvenčního správce',
    'insolvenční správce',
    'zpráva',
    'přezkumn',
    'seznam',
    'oddlužení',
    'opatření',
    'soupis',
    'neschválení',
    'zrušení oddlužení',
    'ukončení',
    'odškrtnutí',
    'přihláška pohledávky'
  ].some((phrase) => text.includes(phrase));
};

export const buildDocumentAnalysisPrompt = (document) => `${DOCUMENT_ANALYSIS_PROMPT}

METADATA DOKUMENTU:
${JSON.stringify({
  document_id: document?.document_id || '',
  title: document?.title || '',
  event_date: document?.event_date || '',
  is_main: document?.is_main || ''
}, null, 2)}`;

export const buildDocumentFinalPrompt = (workingAnalysis) => `${DOCUMENT_FINAL_PROMPT}

PRACOVNÍ ROZBOR:
${JSON.stringify(workingAnalysis, null, 2)}`;

export const buildStructuredFinalPrompt = (structuredExtraction) => `${STRUCTURED_REPORT_FINAL_PROMPT}

STRUKTUROVANÁ DATA:
${JSON.stringify(structuredExtraction, null, 2)}`;

export const buildDataVerificationPrompt = ({ caseItem, documents }) => `${DATA_VERIFICATION_PROMPT}

ÚDAJE ULOŽENÉ V APLIKACI:
${JSON.stringify({
  case_status: caseItem?.case_status || '',
  proceeding_started_at: caseItem?.proceeding_started_at || '',
  proceeding_ended_at: caseItem?.proceeding_ended_at || '',
  claims_deadline: caseItem?.claims_deadline || '',
  claims_count: caseItem?.claims_count ?? null,
  claims_total_amount: caseItem?.claims_total_amount ?? null,
  last_event_at: caseItem?.last_event_at || '',
  last_event_title: caseItem?.last_event_title || ''
}, null, 2)}

PŘILOŽENÉ DOKUMENTY:
${documents.map((item) => `${item.document_id}: ${item.title} (${item.event_date || 'bez data'})`).join('\n')}`;
