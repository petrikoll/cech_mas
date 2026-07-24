const state = {
  contactData: { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] },
  selectedContact: null,
  documentRecipient: null,
  currentCategory: 'all'
};

function byId(id) { return document.getElementById(id); }
function showToast(message, timeout = 3000) { const toast = byId('toast'); if (!toast) return; toast.innerText = message; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), timeout); }
function showError(message) { showToast(`Chyba: ${message}`, 4500); }
function escapeHtml(value) { return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;'); }
function getSelectedFile() { return byId('fileInput')?.files?.[0] || null; }
function getTotalContacts() { return Object.values(state.contactData).reduce((sum, list) => sum + list.length, 0); }
function updateTotalCount() { const el = byId('totalCount'); if (el) el.innerText = `${getTotalContacts()} kontaktů`; }


function updateRecipientUi(){ const btn=byId('useAsRecipientBtn'); const status=byId('recipientStatus'); const sel=state.selectedContact; const rec=state.documentRecipient; const same=sel&&rec&&sel.id===rec.id; if(btn){ btn.textContent=same?'Adresát nastaven':'Použít jako adresáta'; } if(status){ if(same) status.textContent='Tento kontakt bude použit jako adresát listiny.'; else if(rec) status.textContent=`Aktuální adresát: ${rec.nazev}`; else status.textContent='Adresát zatím není vybrán.'; }}
function setDocumentRecipientFromSelected(){ if(!state.selectedContact){ showError('Nejdřív otevřete kontakt.'); return;} state.documentRecipient=state.selectedContact; updateRecipientUi(); renderResults(); showToast('Kontakt byl nastaven jako adresát listiny.'); }

function updateStatus() {
  const promptInput = byId('aiPromptInput');
  const hasFile = !!getSelectedFile();
  const hasContact = state.selectedContact !== null || state.documentRecipient !== null;
  const hasPrompt = !!promptInput && promptInput.value.trim().length > 2;

  const indicator = byId('statusIndicator');
  const text = byId('statusText');
  if (!indicator || !text) return;

  if (hasPrompt) {
    indicator.style.background = '#22c55e';
    indicator.style.boxShadow = '0 0 0 6px rgba(34,197,94,.12)';
    text.innerText = 'Připraveno k vytvoření';
    return;
  }

  if (hasFile || hasContact) {
    indicator.style.background = '#f59e0b';
    indicator.style.boxShadow = 'none';
    text.innerText = 'Doplňte účel listiny';
    return;
  }

  indicator.style.background = '#475569';
  indicator.style.boxShadow = 'none';
  text.innerText = 'Čekám na zadání';
}


function setLoading(isLoading) {
  const btn = byId('aiGenerateBtn');
  const btnText = byId('btnText');
  const btnSpinner = byId('btnSpinner');
  const btnIcon = byId('btnIcon');
  if (btn) btn.disabled = isLoading;
  if (btnText) btnText.innerText = isLoading ? 'VYTVÁŘÍM LISTINU...' : 'VYTVOŘIT LISTINU';
  if (btnSpinner) btnSpinner.classList.toggle('hidden', !isLoading);
  if (btnIcon) btnIcon.classList.toggle('hidden', isLoading);
}

function setFileUi(file) {
  const fileNameDisplay = byId('fileNameDisplay');
  const fileIndicator = byId('fileIndicator');
  const clearFileBtn = byId('clearFile');
  if (file) {
    if (fileNameDisplay) fileNameDisplay.innerText = file.name;
    if (fileIndicator) fileIndicator.classList.remove('hidden');
    if (clearFileBtn) clearFileBtn.classList.remove('hidden');
  } else {
    if (fileNameDisplay) fileNameDisplay.innerText = 'Nahrát PDF odesílatele';
    if (fileIndicator) fileIndicator.classList.add('hidden');
    if (clearFileBtn) clearFileBtn.classList.add('hidden');
  }
  updateStatus();
}

function openContactDetail(item, category) {
  const detail = byId('contactDetail');
  if (!detail) return;
  byId('detailTitle').innerText = item.nazev || '--';
  byId('detailMesto').innerText = item.mesto || item.adresa || '--';
  byId('detailDS').innerText = item.ds || '---';
  byId('detailTel').innerText = item.tel || '---';
  byId('detailEmail').innerText = item.email || '---';
  byId('detailWeb').innerText = item.web || '---';
  byId('detailHours').innerText = item.oteviraciDoba || '---';
  const tag = byId('detailTag');
  tag.innerText = category;
  tag.className = `category-tag cat-${category}`;
  detail.classList.remove('hidden');
}

function closeContactDetail() { state.selectedContact = null; byId('contactDetail')?.classList.add('hidden'); renderResults(); updateStatus(); }

function getVisibleItems() {
  const q = (byId('searchInput')?.value || '').trim().toLowerCase();
  const categories = state.currentCategory === 'all' ? Object.keys(state.contactData) : [state.currentCategory];
  const items = [];
  categories.forEach((cat) => {
    (state.contactData[cat] || []).forEach((item) => {
      const haystack = String(item.search || '').toLowerCase();
      if (!q || haystack.includes(q)) items.push({ ...item, category: cat });
    });
  });
  return items;
}

function renderResults() {
  const res = byId('results'); if (!res) return;
  const items = getVisibleItems(); res.innerHTML = '';
  items.forEach((item) => {
  const subtitle = item.adresa && item.mesto && !item.adresa.includes(item.mesto)
  ? `${item.adresa}, ${item.mesto}`
  : (item.adresa || item.mesto || '');

  const div = document.createElement('button');
  div.type = 'button';
  div.className = `contact-row ${state.selectedContact?.id === item.id ? 'selected' : ''}`;
  div.innerHTML = `<div class="contact-text"><span class="contact-title">${escapeHtml(item.nazev)}</span><span class="contact-subtitle">${escapeHtml(subtitle)}</span></div><span class="category-tag cat-${escapeHtml(item.category)}">${escapeHtml(item.category.substring(0,4))}</span>`;
  div.addEventListener('click', () => { state.selectedContact = item; openContactDetail(item, item.category); renderResults(); updateStatus(); });
  res.appendChild(div);
});
}

async function loadContactsFromServer() {
  const response = await fetch('/document-creator/api/contacts');
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error || 'Nepodařilo se načíst kontakty ze serveru.');
  state.contactData = { exekutori: [], banky: [], ossz: [], pojistovny: [], soudy: [] };
  for (const item of result.items || []) {
    const category = item.category || 'banky';
    if (state.contactData[category]) state.contactData[category].push(item);
  }
  updateTotalCount(); renderResults(); updateStatus();
}

function renderDocument(result) {
  byId('docPlaceholder')?.classList.add('hidden');
  byId('docContent')?.classList.remove('hidden');
  byId('docSenderName').innerText = result.senderName || 'Neuvedeno';
  byId('docSenderAddress').innerText = result.senderAddress || 'Neuvedeno';
  const recipient = state.documentRecipient || state.selectedContact;
  byId('docTargetTitle').innerText = recipient?.nazev || '--';
  byId('docTargetAddress').innerText = recipient?.adresa || recipient?.mesto || '--';
  byId('docRefData').innerText = result.refData || '---';
  byId('docMainTitle').innerText = result.title || 'ÚŘEDNÍ LISTINA';
  byId('docBodyText').innerText = result.body || '';
  const city = (result.senderAddress || '').split(',')[0]?.trim() || 'Praze';
  byId('docDate').innerText = `V ${city} dne ${new Date().toLocaleDateString('cs-CZ')}`;
}

function isInstallmentPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('splátkový kalendář') || v.includes('splátkovy kalendar'); }
function isStopExecutionPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('zastavení exekuce') || v.includes('zastaveni exekuce'); }
function isPostponementPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('odklad exekuce') || v.includes('odklad výkonu'); }
function isExclusionPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('vyškrtnutí ze soupisu') || v.includes('vyškrtnuti ze soupisu'); }
function isMergeExecutionsPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('sloučení exekucí') || v.includes('slouceni exekuci'); }
function isExclusionLawsuitPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('vylučovací žaloba') || v.includes('vylucovaci zaloba'); }
function isCooperationPrompt(value) {
  const v = String(value || '').toLowerCase();
  return v.includes('součinnost') || v.includes('soucinnost');
}
function isDebtStatementPrompt(value) { const v = String(value || '').toLowerCase(); return v.includes('vyčíslení dluhu') || v.includes('vycisleni dluhu'); }

function clearInstallmentFields() { ['debtAmountInput','monthsInput','monthlyPaymentInput'].forEach((id)=>{const el=byId(id); if(el) el.value='';}); const hint=byId('installmentHint'); if(hint){hint.innerText=''; hint.classList.add('hidden');}}
function toggleInstallmentFields() { const wrapper=byId('installmentFields'); const prompt=byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show=isInstallmentPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(!show) clearInstallmentFields(); }
function parseCzNumber(value){ const raw=String(value||'').replace(/\s/g,'').replace(',','.').trim(); const num=Number(raw); return Number.isFinite(num)?num:NaN; }
function formatCzNumber(value, decimals=2){ if(!Number.isFinite(value)) return ''; return new Intl.NumberFormat('cs-CZ',{minimumFractionDigits:decimals, maximumFractionDigits:decimals}).format(value); }
function round2(value){ return Math.round(value*100)/100; }
function updateInstallmentHint(message=''){ const hint=byId('installmentHint'); if(!hint) return; if(!message){hint.innerText=''; hint.classList.add('hidden'); return;} hint.innerText=message; hint.classList.remove('hidden'); }
function recalcInstallmentFields(triggeredBy=null){ const debtInput=byId('debtAmountInput'); const monthsInput=byId('monthsInput'); const paymentInput=byId('monthlyPaymentInput'); if(!debtInput||!monthsInput||!paymentInput) return; const debt=parseCzNumber(debtInput.value); const months=Number(monthsInput.value); const payment=parseCzNumber(paymentInput.value); if(!Number.isFinite(debt)||debt<=0){updateInstallmentHint('');return;} if(triggeredBy==='months'&&Number.isFinite(months)&&months>0){paymentInput.value=formatCzNumber(round2(debt/months)); updateInstallmentHint('Měsíční splátka byla dopočtena z dlužné částky a počtu měsíců.'); return;} if(triggeredBy==='payment'&&Number.isFinite(payment)&&payment>0){monthsInput.value=String(Math.ceil(debt/payment)); updateInstallmentHint('Počet měsíců byl dopočten z dlužné částky a měsíční splátky.'); return;} if(triggeredBy==='debt'){ if(Number.isFinite(months)&&months>0){paymentInput.value=formatCzNumber(round2(debt/months)); updateInstallmentHint('Měsíční splátka byla přepočtena podle nové dlužné částky.'); return;} if(Number.isFinite(payment)&&payment>0){monthsInput.value=String(Math.ceil(debt/payment)); updateInstallmentHint('Počet měsíců byl přepočten podle nové dlužné částky.'); return;} } updateInstallmentHint(''); }

function getRadioValue(name) { return document.querySelector(`input[name="${name}"]:checked`)?.value || ''; }
function setPrompt(value) {
  const input = byId('aiPromptInput');
  if (!input) return;
  input.value = value;
  toggleInstallmentFields();
  toggleStopExecutionFields();
  togglePostponementFields();
  toggleCooperationFields();
  toggleDebtStatementFields();
  toggleExclusionFields();
  ensureExclusionItemRows();
  toggleMergeFields();
  toggleLawsuitFields();
  toggleCommonFormActions();
  updateRecipientUi();
  updateStatus();
}


function prefillCooperationDefaults() { }

function toggleCooperationFields() {
  const wrapper = byId('cooperationFields');
  const prompt = byId('aiPromptInput')?.value || '';
  if (!wrapper) return;

  const show = isCooperationPrompt(prompt);
  wrapper.classList.toggle('hidden', !show);
}

function buildCooperationContext() {
  const val = (id) => byId(id)?.value?.trim() || '';
  const attachments = getRadioValue('coAttachments');

  const lines = [
    'FORMULÁŘ: ŽÁDOST O SOUČINNOST',
    val('coCaseNo') ? `Spisová značka / č. j.: ${val('coCaseNo')}` : '',
    val('coSubject') ? `Koho se věc týká: ${val('coSubject')}` : '',
    '',
    val('coRequest') ? `Požadovaná součinnost: ${val('coRequest')}` : '',
    val('coReason') ? `Odůvodnění: ${val('coReason')}` : '',
    attachments ? `Přílohy: ${attachments}` : '',
    '',
    'ZÁVĚR:',
    'Žádám o poskytnutí výše uvedené součinnosti v přiměřené lhůtě.'
  ];

  return lines.filter(Boolean).join('\\n');
}

function prefillDebtStatementDefaults(){ const dateInput=byId('dsDueDate'); if(dateInput && !dateInput.value) dateInput.value=new Date().toISOString().slice(0,10); }
function toggleDebtStatementFields(){ const wrapper=byId('debtStatementFields'); const prompt=byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show=isDebtStatementPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show) prefillDebtStatementDefaults(); }
function buildDebtStatementContext(){ const val=(id)=>byId(id)?.value?.trim()||''; const breakdown=getRadioValue('dsBreakdown'); const breakdownMap={full:'celkový dluh', principal:'jen jistina', principal_accessories:'jistina a příslušenství', costs:'jen náklady'}; const lines=['FORMULÁŘ: ŽÁDOST O VYČÍSLENÍ DLUHU',val('dsDueDate')?`Vyčíslení ke dni: ${val('dsDueDate')}`:'',val('dsCaseNo')?`Číslo jednací / číslo exekuce: ${val('dsCaseNo')}`:'',val('dsRecipientInfo')?`Adresát / oprávněný / exekutor: ${val('dsRecipientInfo')}`:'',val('dsDebtorInfo')?`Dlužník / povinný: ${val('dsDebtorInfo')}`:'',breakdownMap[breakdown]?`Požadovaný rozsah vyčíslení: ${breakdownMap[breakdown]}`:'',val('dsNote')?`Upřesnění: ${val('dsNote')}`:'','ZÁVĚR:','Žádám o sdělení aktuální výše dluhu ke zvolenému dni, ideálně s přehledným rozpisem jednotlivých složek dluhu.']; return lines.filter(Boolean).join('\n'); }
function prefillStopExecutionDefaults(){ const dateInput=byId('seDate'); if(dateInput&&!dateInput.value) dateInput.value=new Date().toISOString().slice(0,10); }
function toggleStopExecutionSubsections(){ const role=getRadioValue('seNavrhovatelRole')||'povinny'; const opravnenyPO=!!byId('seOpravnenyPO')?.checked; const povinnyPO=!!byId('sePovinnyPO')?.checked; const spouseActive=!!byId('seSpouseActive')?.checked; const costsActive=!!byId('seCostsActive')?.checked; const noticeNotDelivered=!!byId('seNoticeNotDelivered')?.checked; const filingType=getRadioValue('seFilingType')||'listinne'; byId('seOpravnenyRepWrap')?.classList.toggle('hidden', !opravnenyPO); byId('sePovinnyRepWrap')?.classList.toggle('hidden', !povinnyPO); byId('seSpouseWrap')?.classList.toggle('hidden', !spouseActive); byId('seCostsWrap')?.classList.toggle('hidden', !costsActive); byId('seCopiesWrap')?.classList.toggle('hidden', filingType!=='listinne'); const noticeDate=byId('seNoticeDate'); if(noticeDate){noticeDate.disabled=noticeNotDelivered; if(noticeNotDelivered) noticeDate.value='';} byId('seTimeSection')?.classList.toggle('hidden', role!=='povinny'); byId('seOpravnenySection')?.classList.toggle('hidden', role==='manzel_povinneho'); byId('seCostsSection')?.classList.toggle('hidden', role==='manzel_povinneho'); byId('seSpouseSection')?.classList.toggle('hidden', role!=='manzel_povinneho' && !spouseActive); }
function toggleStopExecutionFields(){ const wrapper=byId('stopExecutionFields'); const prompt=byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show=isStopExecutionPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show) prefillStopExecutionDefaults(); toggleStopExecutionSubsections(); }
function fillStopExecutionForm(data){ if(!data) return; if(data.exekutor&&byId('seExecutorName')) byId('seExecutorName').value=data.exekutor; if(data.exekutorskyUrad&&byId('seOfficeName')) byId('seOfficeName').value=data.exekutorskyUrad; if(data.adresaUradu&&byId('seOfficeAddress')) byId('seOfficeAddress').value=data.adresaUradu; if(data.spisovaZnacka&&byId('seCaseNo')) byId('seCaseNo').value=data.spisovaZnacka; if(data.opravneny&&byId('seOpravnenyName')) byId('seOpravnenyName').value=data.opravneny; if(data.povinny&&byId('sePovinnyName')) byId('sePovinnyName').value=data.povinny; if(data.exekucniTitul&&byId('seTitleBasis')) byId('seTitleBasis').value=data.exekucniTitul; if(data.datumVyzvy&&byId('seNoticeDate')) byId('seNoticeDate').value=data.datumVyzvy; toggleStopExecutionSubsections(); }

function prefillPostponementDefaults(){ const dateInput=byId('peDate'); if(dateInput && !dateInput.value) dateInput.value=new Date().toISOString().slice(0,10); }
function togglePostponementSubsections(){ const untilDate=byId('peUntilDate'); const months=byId('peMonths'); if(!untilDate||!months) return; if(untilDate.value){ months.disabled=true; months.value=''; } else { months.disabled=false; } if(months.value){ untilDate.disabled=true; untilDate.value=''; } else { untilDate.disabled=false; } }
function togglePostponementFields(){ const wrapper=byId('postponementFields'); const prompt=byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show=isPostponementPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show){ prefillPostponementDefaults(); togglePostponementSubsections(); } }

function buildPostponementContext(){
  const val=(id)=>byId(id)?.value?.trim() || '';
  const radio=(name)=>document.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const executor=val('peExecutor'); const office=val('peOffice'); const officeAddress=val('peOfficeAddress'); const caseNo=val('peCaseNo'); const place=val('pePlace'); const date=val('peDate');
  const applicant=radio('peApplicant');
  const debtorName=val('peDebtorName'); const debtorId=val('peDebtorId'); const debtorAddress=val('peDebtorAddress');
  const reasonType=radio('peReasonType'); const reasonText=val('peReasonText');
  const untilDate=val('peUntilDate'); const months=val('peMonths');
  const outcome=radio('peOutcome'); const attachments=radio('peAttachments');
  const reasonTypeMap={davky:'čekání na vyplacení příjmu nebo dávky', rizeni:'probíhající jiné řízení, které může ovlivnit exekuci', zdravotni:'zdravotní nebo sociální důvody', splatky:'probíhající jednání o splátkách', jine:'jiný závažný důvod'};
  const outcomeMap={splatky:'zahájení splácení', uhrada:'úhrada dluhu', zastaveni:'zastavení exekuce', jine:'jiné řešení'};
  const durationText=untilDate ? `Odklad je navrhován do ${untilDate}.` : months ? `Odklad je navrhován na dobu ${months} měsíců.` : '';
  const applicantText=applicant==='opravneny' ? 'Oprávněný' : applicant==='manzel' ? 'Manžel/manželka povinného' : 'Povinný';
  const lines=[
    'FORMULÁŘ: ŽÁDOST O ODKLAD EXEKUCE','',
    executor || office ? `Soudní exekutor: ${executor || ''}${office ? ', ' + office : ''}` : '',
    officeAddress ? `Adresa exekutorského úřadu: ${officeAddress}` : '',
    caseNo ? `Spisová značka: ${caseNo}` : '',
    place || date ? `Místo a datum: ${place}${place && date ? ', ' : ''}${date}` : '', '',
    `Navrhovatel: ${applicantText}`,'',
    debtorName ? `Povinný: ${debtorName}` : '',
    debtorId ? `Identifikátor povinného: ${debtorId}` : '',
    debtorAddress ? `Bydliště / sídlo povinného: ${debtorAddress}` : '', '',
    'PRÁVNÍ ZÁKLAD:','Žádost je podávána podle § 54 zákona č. 120/2001 Sb., exekuční řád.','',
    'DŮVODY ODKLADU:', reasonTypeMap[reasonType] ? `Důvod odkladu: ${reasonTypeMap[reasonType]}.` : '', reasonText,'',
    durationText,'', outcomeMap[outcome] ? `Po dobu odkladu lze očekávat: ${outcomeMap[outcome]}.` : '','',
    attachments==='ne' ? 'Navrhovatel nepřikládá žádné listinné důkazy.' : 'Důkazy jsou přiloženy dle textu žádosti.','',
    'NÁVRH:','Navrhuji, aby soudní exekutor podle § 54 zákona č. 120/2001 Sb., exekuční řád, povolil odklad exekuce v uvedeném rozsahu.'
  ];
  return lines.filter(Boolean).join('\n');
}

function buildStopExecutionContext(){
  const data={executorName:byId('seExecutorName')?.value?.trim()||'', officeName:byId('seOfficeName')?.value?.trim()||'', officeAddress:byId('seOfficeAddress')?.value?.trim()||'', caseNo:byId('seCaseNo')?.value?.trim()||'', place:byId('sePlace')?.value?.trim()||'', date:byId('seDate')?.value?.trim()||'', navrhovatelRole:getRadioValue('seNavrhovatelRole'), opravnenyPO:!!byId('seOpravnenyPO')?.checked, opravnenyName:byId('seOpravnenyName')?.value?.trim()||'', opravnenyId:byId('seOpravnenyId')?.value?.trim()||'', opravnenyAddress:byId('seOpravnenyAddress')?.value?.trim()||'', opravnenyDelivery:byId('seOpravnenyDelivery')?.value?.trim()||'', opravnenyRep:byId('seOpravnenyRep')?.value?.trim()||'', opravnenyRepBasis:byId('seOpravnenyRepBasis')?.value?.trim()||'', povinnyPO:!!byId('sePovinnyPO')?.checked, povinnyName:byId('sePovinnyName')?.value?.trim()||'', povinnyId:byId('sePovinnyId')?.value?.trim()||'', povinnyAddress:byId('sePovinnyAddress')?.value?.trim()||'', povinnyDelivery:byId('sePovinnyDelivery')?.value?.trim()||'', povinnyRep:byId('sePovinnyRep')?.value?.trim()||'', povinnyRepBasis:byId('sePovinnyRepBasis')?.value?.trim()||'', spouseActive:!!byId('seSpouseActive')?.checked, spouseName:byId('seSpouseName')?.value?.trim()||'', spouseId:byId('seSpouseId')?.value?.trim()||'', spouseAddress:byId('seSpouseAddress')?.value?.trim()||'', filingType:getRadioValue('seFilingType'), copies:byId('seCopies')?.value?.trim()||'', attachmentsType:getRadioValue('seAttachmentsType'), titleBasis:byId('seTitleBasis')?.value?.trim()||'', reasons:byId('seReasons')?.value?.trim()||'', evidence:byId('seEvidence')?.value?.trim()||'', costsActive:!!byId('seCostsActive')?.checked, costsAmount:byId('seCostsAmount')?.value?.trim()||'', costsBreakdown:byId('seCostsBreakdown')?.value?.trim()||'', costsEvidence:byId('seCostsEvidence')?.value?.trim()||'', reasonKnownDate:byId('seReasonKnownDate')?.value?.trim()||'', reasonKnownHow:byId('seReasonKnownHow')?.value?.trim()||'', noticeDate:byId('seNoticeDate')?.value?.trim()||'', noticeNotDelivered:!!byId('seNoticeNotDelivered')?.checked, timeEvidence:byId('seTimeEvidence')?.value?.trim()||''};
  const lines=['FORMULÁŘ: NÁVRH NA ZASTAVENÍ EXEKUCE', data.executorName?`Soudní exekutor: ${data.executorName}`:'', data.officeName?`Exekutorský úřad: ${data.officeName}`:'', data.officeAddress?`Adresa exekutorského úřadu: ${data.officeAddress}`:'', data.caseNo?`Spisová značka: ${data.caseNo}`:'', data.place?`Místo sepsání: ${data.place}`:'', data.date?`Datum: ${data.date}`:'', data.navrhovatelRole?`Navrhovatel: ${data.navrhovatelRole}`:'', data.opravnenyName?`Oprávněný: ${data.opravnenyName}`:'', data.opravnenyId?`Oprávněný identifikátor: ${data.opravnenyId}`:'', data.opravnenyAddress?`Oprávněný adresa: ${data.opravnenyAddress}`:'', data.opravnenyDelivery?`Oprávněný doručovací adresa: ${data.opravnenyDelivery}`:'', data.opravnenyPO?'Oprávněný je právnická osoba.':'', data.opravnenyRep?`Za oprávněného jedná: ${data.opravnenyRep}`:'', data.opravnenyRepBasis?`Na základě: ${data.opravnenyRepBasis}`:'', data.povinnyName?`Povinný: ${data.povinnyName}`:'', data.povinnyId?`Povinný identifikátor: ${data.povinnyId}`:'', data.povinnyAddress?`Povinný adresa: ${data.povinnyAddress}`:'', data.povinnyDelivery?`Povinný doručovací adresa: ${data.povinnyDelivery}`:'', data.povinnyPO?'Povinný je právnická osoba.':'', data.povinnyRep?`Za povinného jedná: ${data.povinnyRep}`:'', data.povinnyRepBasis?`Na základě: ${data.povinnyRepBasis}`:'', data.spouseActive?'Manžel/ka povinného je účastníkem řízení.':'', data.spouseName?`Manžel povinného: ${data.spouseName}`:'', data.spouseId?`Manžel povinného identifikátor: ${data.spouseId}`:'', data.spouseAddress?`Manžel povinného adresa: ${data.spouseAddress}`:'', data.filingType?`Forma podání: ${data.filingType}`:'', data.filingType==='listinne'&&data.copies?`Počet vyhotovení: ${data.copies}`:'', data.attachmentsType?`Přílohy: ${data.attachmentsType}`:'', data.titleBasis?`Exekuční titul: ${data.titleBasis}`:'', data.reasons?`Důvod zastavení exekuce: ${data.reasons}`:'', data.evidence?`Důkazy: ${data.evidence}`:'', data.costsActive?'Navrhovatel uplatňuje nárok na náhradu nákladů.':'', data.costsAmount?`Výše nákladů: ${data.costsAmount}`:'', data.costsBreakdown?`Rozpis nákladů: ${data.costsBreakdown}`:'', data.costsEvidence?`Důkazy k nákladům: ${data.costsEvidence}`:'', data.reasonKnownDate?`Datum, kdy se navrhovatel dozvěděl o důvodu: ${data.reasonKnownDate}`:'', data.reasonKnownHow?`Jak se navrhovatel o důvodu dozvěděl: ${data.reasonKnownHow}`:'', data.noticeNotDelivered?'Výzva ke splnění vymáhané povinnosti nebyla doručena.':'', !data.noticeNotDelivered&&data.noticeDate?`Výzva ke splnění byla doručena dne: ${data.noticeDate}`:'', data.timeEvidence?`Důkazy k časovým údajům: ${data.timeEvidence}`:'', 'Na základě výše uvedeného má být vytvořen formální návrh na zastavení exekuce v češtině.'];
  return lines.filter(Boolean).join('\n');
}




function createExclusionItemRow(item = {}, index = 0) {
  const wrapper = document.createElement('div');
  wrapper.className = 'installment-box exclusion-item-row';
  wrapper.setAttribute('data-ex-item', '1');
  wrapper.innerHTML = `<div class="installment-head" style="margin-bottom:8px;"><span class="quick-label">Položka ${index + 1}</span><button class="btn btn-secondary btn-small ex-remove-item-btn${index === 0 ? ' hidden' : ''}" type="button">Odebrat</button></div><div class="stop-grid stop-grid-2"><div class="stop-col-span-2"><label class="detail-label">Popis věci</label><textarea class="field textarea compact-textarea ex-item-description">${item.description || ''}</textarea></div><div><label class="detail-label">Číslo položky v soupisu</label><input class="field compact-field ex-item-number" type="text" value="${item.number || ''}"></div></div>`;
  return wrapper;
}
function refreshExclusionItemRows() {
  const container = byId('exItemsContainer');
  if (!container) return;
  const rows = [...container.querySelectorAll('[data-ex-item]')];
  rows.forEach((row, idx) => {
    const label = row.querySelector('.quick-label');
    if (label) label.innerText = `Položka ${idx + 1}`;
    const removeBtn = row.querySelector('.ex-remove-item-btn');
    if (removeBtn) removeBtn.classList.toggle('hidden', rows.length === 1 || idx === 0);
  });
}
function ensureExclusionItemRows() {
  const container = byId('exItemsContainer');
  if (!container) return;
  if (!container.querySelector('[data-ex-item]')) container.appendChild(createExclusionItemRow({}, 0));
  refreshExclusionItemRows();
}
function addExclusionItemRow(item = {}) {
  const container = byId('exItemsContainer');
  if (!container) return;
  const rows = [...container.querySelectorAll('[data-ex-item]')];
  container.appendChild(createExclusionItemRow(item, rows.length));
  refreshExclusionItemRows();
}
function collectExclusionItems() {
  const container = byId('exItemsContainer');
  if (!container) return [];
  return [...container.querySelectorAll('[data-ex-item]')]
    .map((row) => ({
      description: row.querySelector('.ex-item-description')?.value?.trim() || '',
      number: row.querySelector('.ex-item-number')?.value?.trim() || ''
    }))
    .filter((item) => item.description || item.number);
}
function prefillExclusionDefaults(){ const dateInput = byId('exDate'); if(dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10); }
function toggleExclusionFields(){ const wrapper = byId('exclusionFields'); const prompt = byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show = isExclusionPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show){ prefillExclusionDefaults(); ensureExclusionItemRows(); } }
function buildExclusionContext(){
  const val=(id)=>byId(id)?.value?.trim()||'';
  const checked=(id)=>!!byId(id)?.checked;
  const attachmentsType=getRadioValue('exAttachmentsType');
  const proofs=[checked('exProofInvoice')?'faktura / daňový doklad':'',checked('exProofGift')?'darovací smlouva':'',checked('exProofInheritance')?'dědické rozhodnutí':'',checked('exProofPhotos')?'fotografie':'',checked('exProofWitness')?'svědecké výpovědi':'',checked('exProofOtherCheck')?'jiný důkaz':''].filter(Boolean);
  const items = collectExclusionItems();
  const itemLines = [];
  items.forEach((item, idx) => {
    if (item.description) itemLines.push(`Položka ${idx + 1} - popis věci: ${item.description}`);
    if (item.number) itemLines.push(`Položka ${idx + 1} - číslo položky v soupisu: ${item.number}`);
  });
  const lines=[
    'FORMULÁŘ: NÁVRH NA VYŠKRTNUTÍ VĚCI ZE SOUPISU EXEKUCE',
    val('exOfficeName')?`Exekutorský úřad: ${val('exOfficeName')}`:'',
    val('exOfficeAddress')?`Sídlo exekutorského úřadu: ${val('exOfficeAddress')}`:'',
    val('exCaseNo')?`Spisová značka: ${val('exCaseNo')}`:'',
    val('exOrderNo')?`Č. j. exekučního příkazu: ${val('exOrderNo')}`:'',
    '',
    val('exApplicantName')?`Navrhovatel: ${val('exApplicantName')}`:'',
    val('exApplicantBirth')?`Datum narození navrhovatele: ${val('exApplicantBirth')}`:'',
    val('exApplicantAddress')?`Bydliště navrhovatele: ${val('exApplicantAddress')}`:'',
    '',
    val('exCreditorName')?`Oprávněný: ${val('exCreditorName')}`:'',
    val('exDebtorName')?`Povinný: ${val('exDebtorName')}`:'',
    val('exDebtorAddress')?`Bydliště / sídlo povinného: ${val('exDebtorAddress')}`:'',
    val('exDebtorBirth')?`Datum narození povinného: ${val('exDebtorBirth')}`:'',
    val('exExecutionType')?`Typ exekuce: ${val('exExecutionType')==='nemovite'?'prodej nemovitých věcí':'prodej movitých věcí'}`:'',
    '',
    ...itemLines,
    val('exInventoryDate')?`Datum soupisu: ${val('exInventoryDate')}`:'',
    val('exInventoryRecordNo')?`Č. j. soupisu / označení soupisu: ${val('exInventoryRecordNo')}`:'',
    '',
    val('exOwnershipReason')?`Odůvodnění vlastnictví: ${val('exOwnershipReason')}`:'',
    proofs.length?`Důkazy vlastnictví: ${proofs.join(', ')}`:'',
    val('exProofOtherText')?`Upřesnění důkazů: ${val('exProofOtherText')}`:'',
    '',
    val('exLearnedDate')?`Navrhovatel se o soupisu dozvěděl dne: ${val('exLearnedDate')}`:'',
    val('exPlace')?`Místo sepsání: ${val('exPlace')}`:'',
    val('exDate')?`Datum návrhu: ${val('exDate')}`:'',
    attachmentsType?`Přílohy: ${attachmentsType}`:'',
    '',
    'NÁVRH:',
    'Žádám, aby výše uvedená věc / věci byly vyškrtnuty ze soupisu exekuce, protože jsou v mém výlučném vlastnictví a nepodléhají výkonu exekuce.'
  ];
  return lines.filter(Boolean).join('\n');
}
function prefillMergeDefaults(){ const dateInput = byId('meDate'); if(dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10); }
function toggleMergeFields(){ const wrapper = byId('mergeFields'); const prompt = byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show = isMergeExecutionsPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show) prefillMergeDefaults(); }
function buildMergeContext(){ const val=(id)=>byId(id)?.value?.trim()||''; const lines=['FORMULÁŘ: NÁVRH NA SLOUČENÍ EXEKUCÍ',val('meCourtName')?`Soud: ${val('meCourtName')}`:'',val('meCourtAddress')?`Adresa soudu: ${val('meCourtAddress')}`:'',val('meApplicantName')?`Navrhovatel: ${val('meApplicantName')}`:'',val('meApplicantBirth')?`Datum narození navrhovatele: ${val('meApplicantBirth')}`:'',val('meApplicantAddress')?`Bydliště navrhovatele: ${val('meApplicantAddress')}`:'',val('mePlace')?`Místo sepsání: ${val('mePlace')}`:'',val('meDate')?`Datum návrhu: ${val('meDate')}`:'','',val('meCreditorName')?`Společný oprávněný: ${val('meCreditorName')}`:'',val('meStartYear')?`Rok zahájení řízení: ${val('meStartYear')}`:'',val('mePrincipalLimit')?`Výše jistiny: ${val('mePrincipalLimit')}`:'',val('meLeadExecutor')?`Navržený vedoucí exekutor: ${val('meLeadExecutor')}`:'','',val('meExecutor1')?`Exekutor XX: ${val('meExecutor1')}`:'',val('meCases1')?`Exekuce u exekutora XX: ${val('meCases1')}`:'',val('meExecutor2')?`Exekutor YY: ${val('meExecutor2')}`:'',val('meCases2')?`Exekuce u exekutora YY: ${val('meCases2')}`:'','',val('meReasonText')?`Odůvodnění spojení: ${val('meReasonText')}`:'',val('meEvidence')?`Důkazy: ${val('meEvidence')}`:'','', 'PRÁVNÍ ZÁKLAD:','Návrh má být zpracován s odkazem na § 112 občanského soudního řádu a § 37 exekučního řádu.', '', 'NÁVRH:','Žádám, aby uvedená exekuční řízení byla spojena ke společnému řízení a aby byly náklady oprávněného a exekutora uplatněny jen jednou v souladu se zákonem.']; return lines.filter(Boolean).join('\n'); }
function prefillLawsuitDefaults(){ const dateInput = byId('vlDate'); if(dateInput && !dateInput.value) dateInput.value = new Date().toISOString().slice(0,10); }
function toggleLawsuitFields(){ const wrapper = byId('lawsuitFields'); const prompt = byId('aiPromptInput')?.value || ''; if(!wrapper) return; const show = isExclusionLawsuitPrompt(prompt); wrapper.classList.toggle('hidden', !show); if(show) prefillLawsuitDefaults(); }
function buildLawsuitContext(){ const val=(id)=>byId(id)?.value?.trim()||''; const lines=['FORMULÁŘ: VYLUČOVACÍ ŽALOBA',val('vlCourtName')?`Soud: ${val('vlCourtName')}`:'',val('vlCourtAddress')?`Adresa soudu: ${val('vlCourtAddress')}`:'',val('vlPlaintiffName')?`Žalobce: ${val('vlPlaintiffName')}`:'',val('vlPlaintiffBirth')?`Datum narození žalobce: ${val('vlPlaintiffBirth')}`:'',val('vlPlaintiffAddress')?`Bydliště žalobce: ${val('vlPlaintiffAddress')}`:'',val('vlDefendantName')?`Žalovaný (oprávněný): ${val('vlDefendantName')}`:'',val('vlDefendantId')?`Identifikace žalovaného: ${val('vlDefendantId')}`:'',val('vlDefendantAddress')?`Bydliště / sídlo žalovaného: ${val('vlDefendantAddress')}`:'','',val('vlOfficeName')?`Exekutorský úřad: ${val('vlOfficeName')}`:'',val('vlCaseNo')?`Spisová značka / EXE: ${val('vlCaseNo')}`:'',val('vlDebtorName')?`Povinný: ${val('vlDebtorName')}`:'',val('vlStartDate')?`Datum zahájení / rozhodnutí: ${val('vlStartDate')}`:'',val('vlItemDescription')?`Věc k vyloučení: ${val('vlItemDescription')}`:'',val('vlItemNo')?`Položka v soupisu: ${val('vlItemNo')}`:'',val('vlInventoryDate')?`Datum soupisu: ${val('vlInventoryDate')}`:'','',val('vlReasonText')?`Odůvodnění žaloby: ${val('vlReasonText')}`:'',val('vlRejectionDate')?`Zamítnutí žádosti o vyškrtnutí dne: ${val('vlRejectionDate')}`:'',val('vlEvidence')?`Důkazy: ${val('vlEvidence')}`:'','',val('vlPlace')?`Místo sepsání: ${val('vlPlace')}`:'',val('vlDate')?`Datum žaloby: ${val('vlDate')}`:'',val('vlFeeInfo')?`Soudní poplatek / osvobození: ${val('vlFeeInfo')}`:'','', 'NÁVRH ROZSUDKU:','Navrhuji, aby soud rozhodl o vyloučení označené věci z exekuce a přiznal žalobci náhradu nákladů řízení.']; return lines.filter(Boolean).join('\n'); }
function toggleCommonFormActions(){ const wrapper = byId('commonFormActions'); if(!wrapper) return; const prompt = byId('aiPromptInput')?.value || '';
const show = isInstallmentPrompt(prompt) ||
  isPostponementPrompt(prompt) ||
  isCooperationPrompt(prompt) ||
  isExclusionPrompt(prompt) ||
  isMergeExecutionsPrompt(prompt) ||
  isExclusionLawsuitPrompt(prompt) ||
  isStopExecutionPrompt(prompt) ||
  prompt.trim().length > 0;
 wrapper.classList.toggle('hidden', !show); }
async function handleCommonExtractFromPdf(){ const prompt = byId('aiPromptInput')?.value || ''; if(isInstallmentPrompt(prompt)){ const debtAmount = await extractDebtAmountFromPdf(); const debtInput = byId('debtAmountInput'); if(debtInput){ debtInput.value = debtAmount; recalcInstallmentFields('debt'); } showToast(debtAmount ? 'Dlužná částka byla načtena z PDF.' : 'Dlužná částka v PDF nebyla nalezena.'); return; } if(isDebtStatementPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.spisovaZnacka && byId('dsCaseNo')) byId('dsCaseNo').value = data.spisovaZnacka; const recipientInfo = [data.exekutorskyUrad, data.exekutor, data.opravneny].filter(Boolean).join(' | '); if(recipientInfo && byId('dsRecipientInfo')) byId('dsRecipientInfo').value = recipientInfo; if(data.povinny && byId('dsDebtorInfo')) byId('dsDebtorInfo').value = data.povinny; showToast('Základní údaje pro vyčíslení dluhu byly načteny z PDF.'); return; } if(isStopExecutionPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); fillStopExecutionForm(data); showToast('Formulář zastavení exekuce byl předvyplněn z PDF.'); return; } if(isPostponementPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.exekutor && byId('peExecutor')) byId('peExecutor').value = data.exekutor; if(data.exekutorskyUrad && byId('peOffice')) byId('peOffice').value = data.exekutorskyUrad; if(data.adresaUradu && byId('peOfficeAddress')) byId('peOfficeAddress').value = data.adresaUradu; if(data.spisovaZnacka && byId('peCaseNo')) byId('peCaseNo').value = data.spisovaZnacka; if(data.povinny && byId('peDebtorName')) byId('peDebtorName').value = data.povinny; showToast('Základní údaje pro odklad exekuce byly načteny z PDF.'); return; } if(isCooperationPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.spisovaZnacka && byId('coCaseNo')) byId('coCaseNo').value = data.spisovaZnacka; if(data.povinny && byId('coSubject')) byId('coSubject').value = data.povinny; showToast('Základní údaje pro součinnost byly načteny z PDF.'); return; } if(isExclusionPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.exekutorskyUrad && byId('exOfficeName')) byId('exOfficeName').value = data.exekutorskyUrad; if(data.adresaUradu && byId('exOfficeAddress')) byId('exOfficeAddress').value = data.adresaUradu; if(data.spisovaZnacka && byId('exCaseNo')) byId('exCaseNo').value = data.spisovaZnacka; if(data.opravneny && byId('exCreditorName')) byId('exCreditorName').value = data.opravneny; if(data.povinny && byId('exDebtorName')) byId('exDebtorName').value = data.povinny; showToast('Základní údaje pro vyškrtnutí byly načteny z PDF.'); return; } if(isMergeExecutionsPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.opravneny && byId('meCreditorName')) byId('meCreditorName').value = data.opravneny; if(data.povinny && byId('meApplicantName')) byId('meApplicantName').value = data.povinny; if(data.exekutor && byId('meExecutor1')) byId('meExecutor1').value = data.exekutor; if(data.spisovaZnacka && byId('meCases1')) byId('meCases1').value = data.spisovaZnacka; showToast('Základní údaje pro sloučení exekucí byly načteny z PDF.'); return; } if(isExclusionLawsuitPrompt(prompt)){ const data = await extractStopExecutionFromPdf(); if(data.opravneny && byId('vlDefendantName')) byId('vlDefendantName').value = data.opravneny; if(data.povinny && byId('vlDebtorName')) byId('vlDebtorName').value = data.povinny; if(data.exekutorskyUrad && byId('vlOfficeName')) byId('vlOfficeName').value = data.exekutorskyUrad; if(data.spisovaZnacka && byId('vlCaseNo')) byId('vlCaseNo').value = data.spisovaZnacka; showToast('Základní údaje pro vylučovací žalobu byly načteny z PDF.'); return; } showError('Pro tento typ formuláře zatím nemáme automatické načtení z PDF.'); }
async function extractDebtAmountFromPdf(){ const file=getSelectedFile(); if(!file) throw new Error('Nejdřív nahrajte PDF.'); const formData=new FormData(); formData.append('pdf',file); const response=await fetch('/document-creator/api/extract-debt',{method:'POST',body:formData}); const result=await response.json(); if(!response.ok||!result.ok) throw new Error(result.error||'Nepodařilo se načíst dlužnou částku z PDF.'); return result.debtAmount||''; }
async function extractStopExecutionFromPdf(){ const file=getSelectedFile(); if(!file) throw new Error('Nejdřív nahrajte PDF.'); const formData=new FormData(); formData.append('pdf',file); const response=await fetch('/document-creator/api/extract-stop-execution',{method:'POST',body:formData}); const result=await response.json(); if(!response.ok||!result.ok) throw new Error(result.error||'Extrakce údajů z PDF selhala.'); return result.data||{}; }



async function downloadDocx(){
  const payload = {
    senderName: byId('docSenderName')?.innerText || '',
    senderAddress: byId('docSenderAddress')?.innerText || '',
    recipientName: byId('docTargetTitle')?.innerText || '',
    recipientAddress: byId('docTargetAddress')?.innerText || '',
    refData: byId('docRefData')?.innerText || '',
    dateText: byId('docDate')?.innerText || '',
    title: byId('docMainTitle')?.innerText || '',
    body: byId('docBodyText')?.innerText || ''
  };
  const response = await fetch('/document-creator/api/export-docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    throw new Error(result.error || 'Stažení DOCX selhalo.');
  }
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'listina.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}



async function generateDocumentViaServer(){
  const file = getSelectedFile();
  const prompt = byId('aiPromptInput')?.value?.trim() || '';
  let aiContext = byId('inputAiContext')?.value?.trim() || '';

  const recipient = state.documentRecipient || state.selectedContact || {
    nazev: 'Příjemce neuveden',
    adresa: '',
    mesto: '',
    ds: ''
  };

  if (prompt.length < 3) {
    throw new Error('Zadejte konkrétnější účel listiny.');
  }

  if (isInstallmentPrompt(prompt)) {
    const debt = byId('debtAmountInput')?.value?.trim() || '';
    const months = byId('monthsInput')?.value?.trim() || '';
    const payment = byId('monthlyPaymentInput')?.value?.trim() || '';
    const ctx = [
      debt ? `Dlužná částka: ${debt} Kč` : '',
      months ? `Počet měsíců: ${months}` : '',
      payment ? `Měsíční splátka: ${payment} Kč` : ''
    ].filter(Boolean).join('\\n');

    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (isStopExecutionPrompt(prompt)) {
    const ctx = buildStopExecutionContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (isPostponementPrompt(prompt)) {
    const ctx = buildPostponementContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (typeof isCooperationPrompt === 'function' && isCooperationPrompt(prompt)) {
    const ctx = buildCooperationContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (isExclusionPrompt(prompt)) {
    const ctx = buildExclusionContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (isMergeExecutionsPrompt(prompt)) {
    const ctx = buildMergeContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  if (isExclusionLawsuitPrompt(prompt)) {
    const ctx = buildLawsuitContext();
    if (ctx) aiContext = aiContext ? `${aiContext}\\n\\n${ctx}` : ctx;
  }

  const formData = new FormData();

  if (file) {
    formData.append('pdf', file);
  }

  formData.append('prompt', prompt);
  formData.append('aiContext', aiContext);
  formData.append('recipient', JSON.stringify(recipient));

  const response = await fetch('/document-creator/api/generate', {
    method: 'POST',
    body: formData
  });

  const result = await response.json();

  if (!response.ok || !result.ok) {
    throw new Error(result.error || 'Generování selhalo.');
  }

  return result.document;
}



function bindEvents(){
  byId('fileInput')?.addEventListener('change',(e)=>{ const file=e.target.files?.[0]||null; if(file&&file.type!=='application/pdf'){ e.target.value=''; setFileUi(null); showError('Vybraný soubor není PDF.'); return;} setFileUi(file); });
  byId('clearFile')?.addEventListener('click',()=>{ const input=byId('fileInput'); if(input) input.value=''; setFileUi(null); });
  document.querySelectorAll('.filter-btn').forEach((btn)=>btn.addEventListener('click',()=>{ document.querySelectorAll('.filter-btn').forEach((b)=>b.classList.remove('active')); btn.classList.add('active'); state.currentCategory=btn.dataset.category; renderResults(); }));
  document.querySelectorAll('.quick-tag').forEach((tag)=>tag.addEventListener('click',()=>setPrompt(tag.dataset.prompt || '')));
  byId('searchInput')?.addEventListener('input',renderResults);
  byId('aiPromptInput')?.addEventListener('input',()=>{
  toggleInstallmentFields();
  toggleStopExecutionFields();
  togglePostponementFields();
  toggleCooperationFields();
  toggleDebtStatementFields();
  toggleExclusionFields();
  ensureExclusionItemRows();
  toggleMergeFields();
  toggleLawsuitFields();
  toggleCommonFormActions();
  updateRecipientUi();
  updateStatus();
});
  byId('closeDetail')?.addEventListener('click',closeContactDetail);
  byId('useAsRecipientBtn')?.addEventListener('click',setDocumentRecipientFromSelected);
  byId('toggleContextBtn')?.addEventListener('click',()=>byId('contextWrapper')?.classList.toggle('hidden'));
  byId('debtAmountInput')?.addEventListener('input',()=>recalcInstallmentFields('debt'));
  byId('monthsInput')?.addEventListener('input',()=>recalcInstallmentFields('months'));
  byId('monthlyPaymentInput')?.addEventListener('input',()=>recalcInstallmentFields('payment'));
  byId('commonExtractBtn')?.addEventListener('click', async()=>{ try{ await handleCommonExtractFromPdf(); } catch(error){ showError(error.message);} });
  byId('commonPrintBtn')?.addEventListener('click',()=>{ if (byId('docContent')?.classList.contains('hidden')) { showError('Nejdřív vygenerujte listinu.'); return; } window.print(); });
  byId('commonDocxBtn')?.addEventListener('click', async()=>{ try{ await downloadDocx(); showToast('Soubor DOCX byl stažen.'); } catch(error){ showError(error.message);} });
  byId('commonPdfBtn')?.addEventListener('click',()=>{ if (byId('docContent')?.classList.contains('hidden')) { showError('Nejdřív vygenerujte listinu.'); return; } window.print(); });
  byId('seOpravnenyPO')?.addEventListener('change',toggleStopExecutionSubsections); byId('sePovinnyPO')?.addEventListener('change',toggleStopExecutionSubsections); byId('seSpouseActive')?.addEventListener('change',toggleStopExecutionSubsections); byId('seCostsActive')?.addEventListener('change',toggleStopExecutionSubsections); byId('seNoticeNotDelivered')?.addEventListener('change',toggleStopExecutionSubsections); document.querySelectorAll('input[name="seFilingType"]').forEach((el)=>el.addEventListener('change',toggleStopExecutionSubsections)); document.querySelectorAll('input[name="seNavrhovatelRole"]').forEach((el)=>el.addEventListener('change',toggleStopExecutionSubsections));
  byId('peUntilDate')?.addEventListener('input',togglePostponementSubsections); byId('peMonths')?.addEventListener('input',togglePostponementSubsections);  byId('addExclusionItemBtn')?.addEventListener('click',()=>addExclusionItemRow());
  byId('exItemsContainer')?.addEventListener('click',(e)=>{ const btn = e.target.closest('.ex-remove-item-btn'); if(!btn) return; const row = btn.closest('[data-ex-item]'); row?.remove(); ensureExclusionItemRows(); });

  byId('aiGenerateBtn')?.addEventListener('click',async()=>{ try{ setLoading(true); const result=await generateDocumentViaServer(); renderDocument(result); showToast('Listina byla úspěšně vygenerována.'); } catch(error){ showError(error.message);} finally{ setLoading(false);} });
  byId('printBtn')?.addEventListener('click',()=>window.print());
  byId('downloadDocxBtn')?.addEventListener('click', async()=>{ try{ await downloadDocx(); showToast('Soubor DOCX byl stažen.'); } catch(error){ showError(error.message);} });
  byId('downloadPdfBtn')?.addEventListener('click',()=>window.print());
}


async function initApp(){
  bindEvents();
  try{
    await loadContactsFromServer();
  } catch(error){
    console.error('Chyba při načítání kontaktů:',error);
    showError(error.message);
  }
  toggleInstallmentFields();
  toggleStopExecutionFields();
  togglePostponementFields();
  toggleCooperationFields();
  toggleDebtStatementFields();
  toggleExclusionFields();
  ensureExclusionItemRows();
  toggleMergeFields();
  toggleLawsuitFields();
  toggleCommonFormActions();
  updateRecipientUi();
  updateStatus();
}

initApp();
