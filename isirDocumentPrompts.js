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

export const STRUCTURED_REPORT_EXTRACTION_PROMPT = `Přečti formulářový dokument insolvenčního správce. Může jít o zprávu o přezkumu, soupis přihlášek, zprávu o plnění nebo splnění oddlužení, vyúčtování správce či jejich kombinaci.

Čti vizuálně tabulky, zaškrtnutá pole a číselné hodnoty. Vrať pouze validní JSON:
{
  "document_family":"debt_relief_structured_report",
  "document_type":"review_report | performance_report | completion_report | trustee_fee_accounting | mixed | unknown",
  "case_identification":{"court":null,"case_number":null,"debtor_name":null,"debtor_birth_date":null,"debtor_address":null,"trustee_name":null,"trustee_is_vat_payer":null},
  "document_dates":{"signed_at":null,"submitted_at":null,"report_period_from":null,"report_period_to":null,"report_periods":[]},
  "proceeding_state":{"bankruptcy_decision_date":null,"debt_relief_permitted_date":null,"debt_relief_approved_date":null,"last_payment_date":null,"stage":"unknown","main_conclusion":null},
  "claims_review":{"review_meeting_date":null,"debtor_present":null,"reviewed_claim_applications_count":null,"reviewed_unsecured_claims_total":null,"reviewed_unsecured_claims_without_subordinated_total":null,"secured_claims_total":null,"unreviewed_claims_count":null,"claims_denied_by_debtor":null,"claims_denied_by_trustee":null},
  "performance":{"debtor_fulfils_obligations":null,"trustee_statement":null,"payment_source":null,"regular_contribution_amount":null,"creditors_paid_total":null,"trustee_paid_total":null,"current_satisfaction_percent":null,"expected_satisfaction_3y_percent":null,"expected_satisfaction_5y_percent":null},
  "completion":{"unsecured_satisfaction_percent":null,"unsecured_satisfaction_amount":null,"secured_satisfaction_percent":null,"secured_satisfaction_amount":null,"overpayment_amount":null,"debt_relief_interrupted":null,"debt_relief_extended":null,"all_assets_sold":null,"debtor_fulfilled_all_obligations":null,"course_of_proceeding_summary":null},
  "trustee_accounting":{"trustee_total_fee_with_vat":null,"trustee_total_fee_without_vat":null,"review_fee":null,"reviewed_claims_count_for_fee":null,"duration_fee":null,"cash_expenses":null,"unpaid_amount":null,"remaining_to_satisfy":null,"months_count":null,"period_from":null,"period_to":null,"comment":null},
  "trustee_recommendation":{"recommendation_text":null,"recommendation_category":"unknown"},
  "assets":{"asset_inventory_present":null,"assets_summary":null,"all_assets_sold":null},
  "attachments":[],
  "advisor_summary":{"short_conclusion":null,"what_to_check":[],"important_warnings":[]},
  "confidence":"low | medium | high",
  "warnings":[]
}

Pravidla:
- Neznámý údaj vrať jako null; datum jako YYYY-MM-DD.
- U soupisu pohledávek vytěž pouze agregované součty a počty, nikdy seznam jednotlivých věřitelů.
- Částky a procenta neodhaduj. Při nejistotě přidej varování a sniž confidence.
- Textová pole piš česky a nevyvozuj právní závěry.`;

export const STRUCTURED_REPORT_FINAL_PROMPT = `Převeď strukturované vytěžení formulářového dokumentu insolvenčního správce do krátkého shrnutí pro webovou aplikaci.
Vrať pouze text ve třech sekcích:

[[SECTION:summary:Shrnutí]]
Maximálně 700 znaků. Co formulář potvrzuje a jaký je praktický význam. Negativní doporučení správce uveď zde.

[[SECTION:deadlines:Lhůty a povinnosti]]
Maximálně 1 000 znaků. Jen konkrétní lhůty a výslovné povinnosti.

[[SECTION:other:Ostatní informace a doporučení]]
Maximálně 1 200 znaků. Klíčové agregované částky, procenta a nejvýše 5 doporučení.

Celkem nejvýše 3 500 znaků. Nepřidávej nové skutečnosti ani právní rady. U pohledávek uváděj pouze agregáty, nikdy jednotlivé věřitele. Nejisté údaje označ.`;

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
  const text = `${document?.title || ''} ${document?.document_type || ''}`.toLocaleLowerCase('cs');
  return /(zpr[aá]va.*(p[řr]ezkum|oddlu[žz]en|pln[eě]n|spln[eě]n)|soupis.*(majet|p[řr]ihl[aá][šs])|seznam.*p[řr]ihl[aá][šs]|z[aá]znam.*jedn[aá]n[ií].*dlu[žz]n[ií]k|p[řr]ezkumn|vy[uú][čc]tov[aá]n|odm[eě]n[a-y].*spr[aá]vc)/i.test(text);
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
