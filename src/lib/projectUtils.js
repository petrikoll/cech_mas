import { REPORT_PROMPTS, TARGETS } from '../config/projectConfig.js';
import { normalizeProjectId } from '../config/projects.js';

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function durationMinutesFromTimes(startTime, endTime) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) return 0;
  const duration = endMinutes >= startMinutes ? endMinutes - startMinutes : endMinutes + 24 * 60 - startMinutes;
  return duration > 0 ? duration : 0;
}

function getKa02DurationMinutes(draft) {
  return durationMinutesFromTimes(draft.ka02StartTime, draft.ka02EndTime);
}

function mapSheetRowToClient(row, index) {
  if (Array.isArray(row)) {
    const projectId = normalizeProjectId(row[0]);
    if (!projectId) return null;
    const clientNumber = String(row[21] || '').trim();
    return enrichClient({
      id: clientNumber ? `client-${clientNumber}` : buildSheetClientId(row.slice(1), index),
      clientNumber,
      projectId,
      source: 'sheets',
      sourceSystem: 'LEGACY_REGISTRY',
      sheetRowKey: `row-${index}`,
      jmeno: row[1] || '',
      prijmeni: row[2] || '',
      datumNarozeni: formatDate(row[3]),
      ulice: row[4] || '',
      cisloPopisne: row[5] || '',
      mesto: row[6] || '',
      psc: row[7] || '',
      spadoveMesto: row[8] || '',
      email: row[9] || '',
      telefon: row[10] || '',
      pohlavi: row[11] || '',
      postaveniNaTrhu: row[12] || '',
      vzdelani: row[13] || '',
      znevyhodneni: row[14] || '',
      datumVstupu: formatDate(row[15]),
      datumVystupu: formatDate(row[16]),
      situacePoUkonceni: row[17] || '',
      insolvency: row[18] || '',
      paymentSchedule: row[19] || '',
      contactCount: row[20] || ''
    });
  }

  if (row && typeof row === 'object' && ('klient_id' in row || 'jmeno' in row || 'prijmeni' in row)) {
    const projectId = normalizeProjectId(row.project_id || row.projekt || row.project || row.PROJEKT);
    if (!projectId) return null;
    const status = String(row.stav_klienta || row.status || 'Aktivn?').trim().toLowerCase();
    if (status && status.startsWith('neaktiv')) return null;
    const clientNumber = String(row.client_number || row.cislo_klienta || row.klient_cislo || '').trim();
    return enrichClient({
      id: row.klient_id || (clientNumber ? `client-${clientNumber}` : buildManualClientId({ jmeno: row.jmeno || '', prijmeni: row.prijmeni || '' })),
      clientNumber,
      projectId,
      source: 'google-apps-script',
      sourceSystem: row.source_system || row.zdrojovy_system || 'NEW_APP',
      sheetRowKey: row.klient_id || `row-${index}`,
      jmeno: row.jmeno || '',
      prijmeni: row.prijmeni || '',
      datumNarozeni: normalizeDateIso(row.datum_narozeni),
      ulice: row.ulice || row.trvale_bydliste_ulice || '',
      cisloPopisne: row.cislo_popisne || '',
      mesto: row.mesto || row.obec_cast || '',
      psc: row.psc || '',
      spadoveMesto: row.spadove_mesto || row.mesto || '',
      email: row.email || row.email_datova_schranka || '',
      datovaSchranka: row.datova_schranka || '',
      telefon: row.telefon || '',
      pohlavi: row.pohlavi || '',
      postaveniNaTrhu: row.postaveni_na_trhu_prace || '',
      vzdelani: row.dosazene_vzdelani || row.nejvyssi_dosazene_vzdelani || '',
      znevyhodneni: row.znevyhodneni || row.typ_znevyhodneni || '',
      datumVstupu: normalizeDateIso(row.datum_vstupu_do_projektu),
      datumVystupu: normalizeDateIso(row.datum_vystupu_z_projektu),
      stavKlienta: row.stav_klienta || '',
      keyWorker: row.klicovy_pracovnik || row.klicovyPracovnik || '',
      caseManagementPotreba: row.case_management_potreba || 'Ne',
      caseManagementDuvod: row.case_management_duvod || '',
      caseManagementOd: normalizeDateIso(row.case_management_od),
      poznamka: row.poznamka || '',
      rodina: /^(ano|true|1)$/i.test(String(row.rodina || '').trim()),
      situacePoUkonceni: row.situace_po_ukonceni || '',
      insolvency: row.oddluzeni || '',
      paymentSchedule: row.splatkovy_kalendar || '',
      driveFolderUrl: row.drive_folder_url || '',
      monitoringListUrl: row.monitoring_list_url || '',
      projectStatus: mapClientStatus(status)
    });
  }

  if (row && typeof row === 'object' && ('A' in row || 'a' in row)) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVW'.split('');
    return mapSheetRowToClient(
      letters.map((key) => row[key] ?? row[key.toLowerCase()] ?? ''),
      index
    );
  }

  return null;
}

function mapClientStatus(value) {
  const status = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (status.startsWith('ukon')) return 'completed';
  if (status.startsWith('storn') || status.startsWith('neaktiv')) return 'inactive';
  if (status.startsWith('rozprac') || status.startsWith('cek')) return 'waiting';
  return 'active';
}

function enrichClient(client) {
  const normalizedClient = {
    ...client,
    datumNarozeni: formatDate(client.datumNarozeni),
    datumVstupu: formatDate(client.datumVstupu),
    datumVystupu: formatDate(client.datumVystupu)
  };
  const projectStatus = deriveProjectStatus(normalizedClient);
  return {
    ...normalizedClient,
    fullName: [normalizedClient.jmeno, normalizedClient.prijmeni].filter(Boolean).join(' ').trim(),
    projectStatus,
    projectStatusLabel: translateProjectStatus(projectStatus)
  };
}

function deriveProjectStatus(client) {
  if (client.projectStatus) return client.projectStatus;
  if (client.datumVystupu) return 'completed';
  return 'active';
}

function translateProjectStatus(status) {
  if (status === 'waiting') return 'Čekací listina';
  if (status === 'completed') return 'Ukončen';
  if (status === 'inactive') return 'Neaktivní';
  return 'Aktivní';
}

function buildSheetClientId(columns, index) {
  const birthDate = formatDate(columns[2]);
  const seed = `${columns[0] || 'klient'}-${columns[1] || 'bezprijmeni'}-${birthDate || index}`;
  return `sheet-${slugify(seed)}`;
}

function buildManualClientId(clientDraft) {
  return `manual-${slugify(`${clientDraft.jmeno}-${clientDraft.prijmeni}-${Date.now()}`)}`;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDate(value) {
  if (!value) return '';
  const stringValue = String(value).trim();
  const isoMatch = stringValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${Number(isoMatch[3])}.${Number(isoMatch[2])}.${isoMatch[1]}`;
  }

  const czechMatch = stringValue.match(/^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})/);
  if (czechMatch) {
    return `${Number(czechMatch[1])}.${Number(czechMatch[2])}.${czechMatch[3]}`;
  }

  const date = new Date(stringValue);
  if (!Number.isNaN(date.getTime())) {
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}`;
  }
  return stringValue;
}

function normalizeDateIso(value) {
  if (!value) return '';
  if (typeof value?.toDate === 'function') return value.toDate().toISOString().slice(0, 10);
  const stringValue = String(value).trim();
  const isoMatch = stringValue.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${String(Number(isoMatch[2])).padStart(2, '0')}-${String(Number(isoMatch[3])).padStart(2, '0')}`;
  }
  const czechMatch = stringValue.match(/^(\d{1,2})[./]\s*(\d{1,2})[./]\s*(\d{4})/);
  if (czechMatch) {
    return `${czechMatch[3]}-${String(Number(czechMatch[2])).padStart(2, '0')}-${String(Number(czechMatch[1])).padStart(2, '0')}`;
  }
  const date = new Date(stringValue);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return '';
}

function getMockClients() {
  return [
    enrichClient({
      id: 'mock-jan-novak',
      source: 'mock',
      sheetRowKey: null,
      jmeno: 'Jan',
      prijmeni: 'NovĂˇk',
      datumNarozeni: '15.04.1985',
      ulice: 'HlavnĂ­',
      cisloPopisne: '12',
      mesto: 'DĂ­vÄŤĂ­ Hrad',
      psc: '793 99',
      spadoveMesto: 'Krnov',
      email: 'jan.novak@email.cz',
      telefon: '777 123 456',
      pohlavi: 'MuĹľ',
      postaveniNaTrhu: 'DlouhodobÄ› nezamÄ›stnanĂ˝',
      vzdelani: 'ZĹ ',
      znevyhodneni: 'Exekuce, nĂ­zkĂˇ kvalifikace',
      datumVstupu: '01.09.2023',
      datumVystupu: '',
      situacePoUkonceni: '',
      keyWorker: 'Sociální pracovník'
    }),
    enrichClient({
      id: 'mock-eva-kolarova',
      source: 'mock',
      sheetRowKey: null,
      jmeno: 'Eva',
      prijmeni: 'KolĂˇĹ™ovĂˇ',
      datumNarozeni: '03.02.1992',
      ulice: 'SadovĂˇ',
      cisloPopisne: '8',
      mesto: 'Hlinka',
      psc: '793 99',
      spadoveMesto: 'Krnov',
      email: 'eva.kolarova@email.cz',
      telefon: '777 987 654',
      pohlavi: 'Ĺ˝ena',
      postaveniNaTrhu: 'Osoba mimo evidenci ĂšP',
      vzdelani: 'SOU',
      znevyhodneni: 'NĂ­zkĂ© sebevÄ›domĂ­, dluhy',
      datumVstupu: '15.10.2023',
      datumVystupu: '',
      situacePoUkonceni: '',
      keyWorker: 'Case manager'
    })
  ];
}

function groupRecordsByType(records) {
  return records.reduce((accumulator, record) => {
    if (!accumulator[record.entityType]) {
      accumulator[record.entityType] = [];
    }
    accumulator[record.entityType].push(record);
    return accumulator;
  }, {});
}

function buildPartnerStats({ records = [], partners = [], projectStartDate = '', referenceDate = todayIso() } = {}) {
  const normalizeDate = (value) => {
    const date = String(value || '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : '';
  };
  const normalizeIds = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(/[;,]/);
    return [...new Set(values.map((id) => String(id || '').trim()).filter(Boolean))];
  };
  const normalizeOrigin = (value) =>
    String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const makeRow = (partnerId, partner = {}) => ({
    partnerId,
    name: partner.payload?.name || partner.title || partnerId,
    registryOrigin: partner.payload?.networkOrigin || '',
    joinedNetworkDate: normalizeDate(partner.payload?.joinedNetworkDate),
    caseManagementCount: 0,
    networkMeetingCount: 0,
    totalActivityCount: 0,
    firstActivityDate: '',
    lastActivityDate: ''
  });

  const normalizedStart = normalizeDate(projectStartDate);
  const normalizedReference = normalizeDate(referenceDate) || todayIso();
  const cutoff = new Date(normalizedReference + 'T00:00:00');
  cutoff.setDate(cutoff.getDate() - 89);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  const partnerMap = new Map();

  partners.forEach((partner) => {
    const partnerId = String(partner?.id || '').trim();
    if (partnerId) partnerMap.set(partnerId, makeRow(partnerId, partner));
  });

  const seenRecordIds = new Set();
  records.forEach((record) => {
    const recordId = String(record?.id || '').trim();
    if (recordId && seenRecordIds.has(recordId)) return;
    if (recordId) seenRecordIds.add(recordId);
    const partnerIds = normalizeIds(record?.payload?.selectedPartnerIds || record?.payload?.partnerIds);
    if (!partnerIds.length) return;
    const activityDate = normalizeDate(record.activityDate);

    partnerIds.forEach((partnerId) => {
      const row = partnerMap.get(partnerId) || makeRow(partnerId);
      if (record.payload?.caseManagementMode) row.caseManagementCount += 1;
      if (record.entityType === 'network_activities') row.networkMeetingCount += 1;
      row.totalActivityCount += 1;
      if (activityDate && (!row.firstActivityDate || activityDate < row.firstActivityDate)) row.firstActivityDate = activityDate;
      if (activityDate && (!row.lastActivityDate || activityDate > row.lastActivityDate)) row.lastActivityDate = activityDate;
      partnerMap.set(partnerId, row);
    });
  });

  return [...partnerMap.values()]
    .map((row) => {
      const isActiveInProject = row.totalActivityCount > 0;
      const origin = normalizeOrigin(row.registryOrigin);
      return {
        ...row,
        isActiveInProject,
        isNewInProject: isActiveInProject && (
          origin.includes('nove zapojen') ||
          Boolean(normalizedStart && row.joinedNetworkDate && row.joinedNetworkDate >= normalizedStart)
        ),
        isActiveLast90Days: isActiveInProject && Boolean(row.lastActivityDate && row.lastActivityDate >= cutoffDate)
      };
    })
    .sort((a, b) => b.totalActivityCount - a.totalActivityCount || a.name.localeCompare(b.name, 'cs'));
}

function buildIndicators({ clients, records }) {
  const counts = computedIndicatorsMapRaw(clients, records);
  return [
    makeIndicator('ka01Meetings', 'KA2', 'Koordinační setkání', TARGETS.ka01Meetings, counts),
    makeIndicator('ka01Materials', 'KA2', 'Distribuované materiály', TARGETS.ka01Materials, counts),
    makeIndicator('ka01TeamMeetings', 'KA2', 'Porady realizačního týmu', TARGETS.ka01TeamMeetings, counts),
    makeIndicator('ka01NetworkSize', 'KA2', 'Síť aktérů', TARGETS.ka01NetworkSize, counts),
    makeIndicator('ka02Plans', 'KA1', 'Individuální plány', TARGETS.ka02Plans, counts),
    makeIndicator('ka02Consultations', 'KA1/KA2', 'Zápisy podpory', TARGETS.ka02Consultations, counts),
    makeIndicator('ka02SupportedClients', 'KA1/KA2', 'Klienti s podporou', TARGETS.ka02SupportedClients, counts)
  ];
}

function computedIndicatorsMap(indicators) {
  return indicators.reduce((accumulator, item) => {
    accumulator[item.key] = item;
    return accumulator;
  }, {});
}

function computedIndicatorsMapRaw(clients, records) {
  const map = createIndicatorAccumulator();
  const normalizeType = (value) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  records.forEach((record) => {
    const flags = record.indicatorFlags || {};
    Object.entries(flags).forEach(([key, value]) => {
      if (!(key in map)) return;
      if (typeof value === 'number') {
        if (value <= 0) return;
        map[key].current += value;
        map[key].currentIds.push(record.id);
      } else if (value) {
        map[key].current += 1;
        map[key].currentIds.push(record.id);
      }
    });
  });

  const networkRecords = records.filter((record) => record.entityType === 'network_activities');
  const meetingRecords = networkRecords.filter((record) => normalizeType(record.payload?.type).includes('koordinacni setkani'));
  const teamMeetingRecords = networkRecords.filter((record) => normalizeType(record.payload?.type).includes('porada tymu'));
  const networkSupportRecords = networkRecords.filter((record) => {
    const type = normalizeType(record.payload?.type);
    return type.includes('sit akteru') || type.includes('rozsireni nebo udrzeni site');
  });
  map.ka01Meetings.current = meetingRecords.length;
  map.ka01Meetings.currentIds = meetingRecords.map((record) => record.id);
  map.ka01TeamMeetings.current = teamMeetingRecords.length;
  map.ka01TeamMeetings.currentIds = teamMeetingRecords.map((record) => record.id);
  map.ka01NetworkSize.current = networkSupportRecords.length > 0 ? 1 : 0;
  map.ka01NetworkSize.currentIds = networkSupportRecords.length > 0 ? [networkSupportRecords[0].id] : [];

  const planRecords = records.filter((record) => record.entityType === 'plans');
  map.ka02Plans.current = planRecords.length;
  map.ka02Plans.currentIds = planRecords.map((record) => record.id);

  const supportRecords = records.filter((record) =>
    ['consultations', 'case_management'].includes(record.entityType)
  );
  map.ka02Consultations.current = supportRecords.length;
  map.ka02Consultations.currentIds = supportRecords.map((record) => record.id);

  const supportedClientIds = new Set(
    records
      .filter((record) => ['plans', 'consultations', 'case_management'].includes(record.entityType))
      .map((record) => record.clientId)
      .filter(Boolean)
  );
  map.ka02SupportedClients.current = supportedClientIds.size;
  map.ka02SupportedClients.currentIds = Array.from(supportedClientIds);

  return map;
}

function createIndicatorAccumulator() {
  return Object.keys(TARGETS).reduce((accumulator, key) => {
    accumulator[key] = { current: 0, currentIds: [] };
    return accumulator;
  }, {});
}

function makeIndicator(key, ka, label, target, counts) {
  return {
    key,
    ka,
    label,
    target,
    current: counts[key].current,
    currentIds: counts[key].currentIds
  };
}

function buildGeneratorRecord({ client, generatorDraft, generatedText, selectedTpmRecord = null }) {
  const config = REPORT_PROMPTS[generatorDraft.selectedKey];
  const linkedGoalPayload = {
    linkedPlanGoalId: generatorDraft.linkedPlanGoalId || '',
    linkedPlanGoalLabel: generatorDraft.linkedPlanGoalLabel || ''
  };
  const basePayload = {
    entityType: config.entityType,
    ka: config.ka,
    title: `${config.label} - ${client.fullName}`,
    activityDate: generatorDraft.date,
    worker: generatorDraft.worker,
    clientId: client.id,
    clientIds: [client.id],
    clientName: client.fullName,
    documentText: generatedText,
    ...linkedGoalPayload
  };
  const ka02SessionFields = {
    startTime: generatorDraft.ka02StartTime || '',
    endTime: generatorDraft.ka02EndTime || '',
    place: generatorDraft.ka02Place || ''
  };

  if (generatorDraft.selectedKey === 'plan') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        version: 1,
        currentSituation: generatorDraft.currentSituation,
        goals: generatorDraft.goals,
        barriers: generatorDraft.barriers,
        plannedSteps: generatorDraft.plannedSteps,
        durationMinutes: Number(String(generatorDraft.planDurationMinutes ?? '').trim() || 60)
      },
      indicatorFlags: { ka02Plans: true }
    };
  }

  if (generatorDraft.selectedKey === 'consultation') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        consultationType: generatorDraft.consultationType,
        supportArea: generatorDraft.supportArea || '',
        supportSpecific: generatorDraft.supportSpecific || {},
        kuSupportTypeCode: generatorDraft.kuSupportTypeCode || 'NONE',
        topics: generatorDraft.topics,
        outcome: generatorDraft.outcome,
        nextSteps: generatorDraft.nextSteps,
        durationMinutes: getKa02DurationMinutes(generatorDraft),
        caseManagementMode: Boolean(generatorDraft.caseManagementMode),
        selectedPartnerIds: generatorDraft.selectedPartnerIds || [],
        registeredPartnerNames: generatorDraft.registeredPartnerNames || [],
        manualPartnerNames: generatorDraft.manualPartnerNames || [],
        partnerNames: generatorDraft.partnerNames || [],
        partners: (generatorDraft.partnerNames || []).join('; '),
        participantCount: Number(generatorDraft.participantCount || 0)
      },
      indicatorFlags: { ka02Consultations: true }
    };
  }

  if (generatorDraft.selectedKey === 'debt') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        debtSummary: generatorDraft.debtSummary,
        debtCauses: generatorDraft.debtCauses,
        debtStage: generatorDraft.debtStage,
        solutionPlan: generatorDraft.solutionPlan,
        durationMinutes: getKa02DurationMinutes(generatorDraft)
      },
      indicatorFlags: { ka02DebtMappedClients: true }
    };
  }

  if (generatorDraft.selectedKey === 'therapy') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        sessionOrder: Number(generatorDraft.sessionOrder || 1),
        themes: generatorDraft.themes,
        mentalState: generatorDraft.mentalState,
        recommendations: generatorDraft.recommendations,
        durationMinutes: getKa02DurationMinutes(generatorDraft)
      },
      indicatorFlags: {}
    };
  }

  if (generatorDraft.selectedKey === 'cv') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        targetJob: generatorDraft.targetJob,
        experience: generatorDraft.experience,
        skills: generatorDraft.skills,
        durationMinutes: getKa02DurationMinutes(generatorDraft)
      },
      indicatorFlags: { ka02CvOutputs: true }
    };
  }

  if (generatorDraft.selectedKey === 'simulator') {
    return {
      ...basePayload,
      payload: {
        ...linkedGoalPayload,
        ...ka02SessionFields,
        position: generatorDraft.position,
        feedback: generatorDraft.feedback,
        strengths: generatorDraft.strengths,
        developmentAreas: generatorDraft.developmentAreas,
        durationMinutes: getKa02DurationMinutes(generatorDraft)
      },
      indicatorFlags: { ka02SimulatorRuns: true }
    };
  }

  return {
    ...basePayload,
    entityType: 'mentor_report_document',
    worker: 'Mentor/Kouč',
    payload: {
      ...linkedGoalPayload,
      tpmRecordId: generatorDraft.tpmRecordId || selectedTpmRecord?.id || '',
      tpmEmployer: selectedTpmRecord?.payload?.employer || '',
      tpmStartDate: selectedTpmRecord?.payload?.startDate || '',
      workplace: generatorDraft.workplace,
      progressSummary: generatorDraft.nextSteps || generatorDraft.progressSummary,
      barriers: generatorDraft.barriers,
      nextSupportSteps: generatorDraft.nextSteps
    },
    indicatorFlags: { ka03MentorReports: true }
  };
}

function buildKa02Record(entityType, draft, client) {
  const basePayload = {
    ka: 'KA02',
    activityDate: draft.date,
    worker: draft.worker,
    clientId: client.id,
    clientIds: [client.id],
    clientName: client.fullName
  };
  const ka02SessionFields = {
    startTime: draft.ka02StartTime || '',
    endTime: draft.ka02EndTime || '',
    place: draft.ka02Place || ''
  };

  if (entityType === 'plans') {
    return {
      ...basePayload,
      entityType,
      title: `IPR v${draft.planVersion} - ${client.fullName}`,
      payload: {
        ...ka02SessionFields,
        version: Number(draft.planVersion || 1),
        currentSituation: draft.currentSituation,
        goals: draft.goals,
        barriers: draft.barriers,
        plannedSteps: draft.plannedSteps,
        durationMinutes: Number(String(draft.planDurationMinutes ?? '').trim() || 60)
      },
      indicatorFlags: { ka02Plans: true }
    };
  }

  if (entityType === 'consultations') {
    return {
      ...basePayload,
      entityType,
      title: `Konzultace - ${draft.consultationType} - ${client.fullName}`,
      payload: {
        ...ka02SessionFields,
        consultationType: draft.consultationType,
        durationMinutes: getKa02DurationMinutes(draft),
        topics: draft.topics,
        outcome: draft.outcome,
        nextSteps: draft.nextSteps
      },
      indicatorFlags: { ka02Consultations: true }
    };
  }

  if (entityType === 'debt_cases') {
    return {
      ...basePayload,
      entityType,
      title: `DluhovĂ© poradenstvĂ­ - ${client.fullName}`,
      payload: {
        ...ka02SessionFields,
        debtSummary: draft.debtSummary,
        debtCauses: draft.debtCauses,
        debtStage: draft.debtStage,
        solutionPlan: draft.solutionPlan,
        hasRepaymentArrangement: draft.hasRepaymentArrangement,
        educationTopic: draft.educationTopic,
        durationMinutes: getKa02DurationMinutes(draft)
      },
      indicatorFlags: {
        ka02DebtMappedClients: true,
        ka02RepaymentArrangements: draft.hasRepaymentArrangement
      }
    };
  }

  if (entityType === 'therapy_sessions') {
    return {
      ...basePayload,
      entityType,
      title: `Terapie ${draft.therapyOrder}/3 - ${client.fullName}`,
      payload: {
        ...ka02SessionFields,
        sessionOrder: Number(draft.therapyOrder || 1),
        durationMinutes: getKa02DurationMinutes(draft),
        themes: draft.therapyThemes,
        mentalState: draft.therapyMentalState,
        recommendations: draft.therapyRecommendations
      },
      indicatorFlags: {}
    };
  }

  if (entityType === 'cv_outputs') {
    return {
      ...basePayload,
      entityType,
      title: `Archivní výstup - ${client.fullName}`,
      payload: {
        ...ka02SessionFields,
        targetJob: draft.targetJob,
        experience: draft.experience,
        skills: draft.skills,
        durationMinutes: getKa02DurationMinutes(draft)
      },
      indicatorFlags: { ka02CvOutputs: true }
    };
  }

  return {
    ...basePayload,
    entityType,
    title: draft.simulatorLabel || `PracovnĂ­ simulĂˇtor - ${client.fullName}`,
    payload: {
      ...ka02SessionFields,
      position: draft.simulatorPosition,
      participants: splitMultiValue(draft.simulatorParticipants),
      committee: splitMultiValue(draft.simulatorCommittee),
      feedback: draft.simulatorFeedback,
      durationMinutes: getKa02DurationMinutes(draft)
    },
    indicatorFlags: { ka02SimulatorRuns: true }
  };
}

function buildKa03Record(entityType, draft, client) {
  const linkedGoalId =
    entityType === 'employment_records'
      ? draft.employmentLinkedPlanGoalId || ''
      : draft.tpmLinkedPlanGoalId || '';
  const linkedGoalLabel =
    entityType === 'employment_records'
      ? draft.employmentLinkedPlanGoalLabel || ''
      : draft.tpmLinkedPlanGoalLabel || '';
  const linkedGoalPayload = {
    linkedPlanGoalId: linkedGoalId,
    linkedPlanGoalLabel: linkedGoalLabel
  };
  const basePayload = {
    ka: 'ARCHIV',
    activityDate: draft.date,
    worker: draft.worker,
    clientId: client.id,
    clientIds: [client.id],
    clientName: client.fullName,
    ...linkedGoalPayload
  };

  if (entityType === 'tpm_records') {
    return {
      ...basePayload,
      entityType,
      title: `Archivní aktivita - ${client.fullName}`,
      payload: {
        ...linkedGoalPayload,
        employer: draft.employer,
        startDate: draft.startDate,
        endDate: draft.endDate,
        plannedMonths: Number(draft.plannedMonths || 0),
        actualMonths: Number(draft.actualMonths || 0)
      },
      indicatorFlags: { ka03TpmRecords: true }
    };
  }

  if (entityType === 'mentoring_records') {
    return {
      ...basePayload,
      entityType,
      title: `Mentoring Archivní aktivita - ${client.fullName}`,
      payload: {
        ...linkedGoalPayload,
        employer: draft.employer,
        workplace: draft.workplace,
        mentoringFrequency: draft.mentoringFrequency,
        progressSummary: draft.progressSummary,
        barriers: draft.barriers,
        nextSupportSteps: draft.nextSupportSteps
      },
      indicatorFlags: {}
    };
  }

  if (entityType === 'employment_records') {
    return {
      ...basePayload,
      entityType,
      title: `Archivní uplatnění - ${client.fullName}`,
      payload: {
        ...linkedGoalPayload,
        employmentType: 'Archivní uplatnění',
        employer: draft.employer,
        employmentStartDate: draft.employmentStartDate,
        employmentEndDate: draft.employmentEndDate || '',
        employmentPlannedMonths: Number(draft.employmentPlannedMonths || 0),
        employmentActualMonths: Number(draft.employmentActualMonths || 0)
      },
      indicatorFlags: {
        ka03EmploymentRecords: true
      }
    };
  }

  return {
    ...basePayload,
    entityType: 'mentor_report_document',
    title: draft.mentorReportTitle || `ReferenÄŤnĂ­ zprĂˇva mentora - ${client.fullName}`,
    documentText: draft.mentorReportText,
    payload: {
      ...linkedGoalPayload,
      workplace: draft.workplace,
      employer: draft.employer
    },
    indicatorFlags: { ka03MentorReports: true }
  };
}

function buildFallbackGeneratedText(label, client, fields) {
  if (fields?.selectedKey === 'consultation') {
    const facts = [
      fields.topics ? String(fields.topics).trim() : '',
      fields.outcome ? String(fields.outcome).trim() : ''
    ].filter(Boolean);
    const nextSteps = String(fields.nextSteps || '').trim();
    const parts = [];

    if (facts.length) {
      parts.push(facts.join(' '));
    } else {
      parts.push('Byla poskytnuta individuální podpora klientovi podle údajů vyplněných ve formuláři.');
    }

    if (nextSteps) {
      parts.push('Další postup: ' + nextSteps);
    }

    return [
      'Pracovní návrh zápisu podpory',
      '',
      parts.join('\n\n'),
      '',
      'Poznámka: Tento text byl vytvořen z ručně vyplněných polí, protože AI generátor není aktivní nebo se výstup nepodařilo ověřit.'
    ].join('\n');
  }

  const lines = [
    `${label}`,
    '',
    `Klient: ${client.fullName}`,
    `Datum: ${fields.date || todayIso()}`,
    `PracovnĂ­k: ${fields.worker || 'Neuvedeno'}`,
    '',
    'PracovnĂ­ podklad:'
  ];

  Object.entries(fields).forEach(([key, value]) => {
    if (['clientId', 'tpmRecordId', 'selectedKey', 'worker', 'date', 'generatedText'].includes(key)) return;
    if (value === '' || value === false || value == null) return;
    lines.push(`${translateFieldLabel(key)}: ${String(value)}`);
  });

  lines.push('');
  lines.push('PoznĂˇmka: Tento text byl vytvoĹ™en z ruÄŤnÄ› vyplnÄ›nĂ˝ch polĂ­, protoĹľe AI generĂˇtor nenĂ­ aktivnĂ­.');
  return lines.join('\n');
}

function anonymizeStyleMemoryText(value, client) {
  let text = String(value || '');
  if (!text.trim()) return '';

  const fullName = String(client?.fullName || '').trim();
  const firstName = String(client?.jmeno || '').trim();
  const lastName = String(client?.prijmeni || '').trim();
  const escape = (input) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  [fullName, firstName, lastName].filter(Boolean).forEach((name) => {
    text = text.replace(new RegExp(escape(name), 'gi'), '[KLIENT]');
  });

  text = text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/(?<!\d)(\+?\d[\d\s-]{7,}\d)(?!\d)/g, '[KONTAKT]')
    .replace(/\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/g, '[DATUM]')
    .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '[DATUM]');

  return text.replace(/\s{3,}/g, ' ').trim();
}

function buildAiStyleMemoryRecord({ client, generatorDraft, generatedText, promptText, config }) {
  const rating = Number(generatorDraft.aiStyleRating || 0);
  const feedback = anonymizeStyleMemoryText(generatorDraft.aiStyleFeedback || '', client);
  const promptAnonymized = anonymizeStyleMemoryText(promptText || '', client);
  const outputAnonymized = anonymizeStyleMemoryText(generatedText || '', client);

  return {
    entityType: 'ai_style_memory',
    ka: config.ka || '',
    title: `AI stylova pamet - ${config.label}`,
    activityDate: generatorDraft.date || todayIso(),
    worker: generatorDraft.worker || 'Neuvedeno',
    clientId: '',
    clientIds: [],
    clientName: 'Anonymizovano',
    documentText: '',
    payload: {
      version: 1,
      documentType: generatorDraft.selectedKey,
      documentLabel: config.label,
      workerRole: generatorDraft.worker || 'Neuvedeno',
      workerRating: Number.isFinite(rating) ? Math.min(5, Math.max(1, rating)) : 3,
      workerFeedback: feedback,
      promptAnonymized: truncate(promptAnonymized, 1800),
      outputAnonymized: truncate(outputAnonymized, 1800)
    },
    indicatorFlags: {}
  };
}

function buildStyleMemoryContext(records, { selectedKey, worker, maxItems = 3 }) {
  const items = records
    .filter((record) => record.entityType === 'ai_style_memory')
    .filter((record) => record.payload?.documentType === selectedKey)
    .filter((record) => !worker || !record.payload?.workerRole || record.payload.workerRole === worker)
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    .slice(0, maxItems);

  if (items.length === 0) return '';

  const lines = items.map((item, index) => {
    const rating = item.payload?.workerRating ?? '?';
    const feedback = String(item.payload?.workerFeedback || '').trim();
    const prompt = String(item.payload?.promptAnonymized || '').trim();
    const output = String(item.payload?.outputAnonymized || '').trim();
    return [
      `Vzor ${index + 1} (hodnoceni ${rating}/5):`,
      feedback ?`Zpetna vazba pracovnika: ${feedback}` : '',
      prompt ?`Anonymizovany prompt: ${truncate(prompt, 600)}` : '',
      output ?`Anonymizovany vystup: ${truncate(output, 700)}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  });

  return `INTERNÍ STYLOVÁ PAMĚŤ PROJEKTU (anonymizované vzory) – pouze vodítko tónu a struktury, nikdy zdroj faktů aktuálního zápisu:\n${lines.join('\n\n')}\n\nPoužij jen přiměřený styl, stručnost a strukturu. Nepřebírej z těchto vzorů žádné konkrétní osoby, instituce, úkony, výsledky, dohody, termíny ani navazující kroky.`;
}

function extractGeminiText(result) {
  const candidate = result?.candidates?.[0];
  const parts = candidate?.content?.parts || [];
  const text = parts
    .map((part) => part.text || '')
    .filter(Boolean)
    .join('\n\n')
    .trim();

  if (text) return cleanGeneratedText(text);

  if (candidate?.finishReason) {
    const safety = candidate.safetyRatings
      ?.map((rating) => `${rating.category}: ${rating.probability}`)
      .join(', ');
    throw new Error(`AI nevr\u00e1tila text. D\u016fvod: ${candidate.finishReason}${safety ? ` (${safety})` : ''}`);
  }

  if (result?.promptFeedback?.blockReason) {
    throw new Error(`AI po\u017eadavek byl zablokov\u00e1n: ${result.promptFeedback.blockReason}`);
  }

  throw new Error('AI nevr\u00e1tila text v o\u010dek\u00e1van\u00e9 struktu\u0159e.');
}

function cleanGeneratedText(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

function translateFieldLabel(key) {
  const labels = {
    currentSituation: 'Výchozí situace',
    goals: 'Cíle',
    barriers: 'Bariéry',
    plannedSteps: 'Plánované kroky',
    consultationType: 'Typ podpory',
    supportArea: 'Oblast podpory',
    supportSpecific: 'Specifick\u00e9 \u00fadaje',
    activityCodes: 'Činnosti',
    meetingForm: 'Forma jednání',
    topics: 'Témata',
    outcome: 'Vyhodnocení',
    nextSteps: 'Další kroky',
    durationMinutes: 'Délka v minutách',
    place: 'Místo',
    startTime: 'Čas od',
    endTime: 'Čas do',
    linkedPlanGoalLabel: 'Vazba na cíl plánu',
    debtSummary: 'Mapované závazky',
    debtCauses: 'Příčiny předlužení',
    debtStage: 'Fáze řešení',
    solutionPlan: 'Plán řešení',
    educationTopic: 'Edukace',
    sessionOrder: 'Pořadí setkání',
    themes: 'Témata setkání',
    mentalState: 'Psychický stav',
    recommendations: 'Doporučení',
    targetJob: 'Cílová pozice',
    experience: 'Zkušenosti',
    skills: 'Dovednosti',
    position: 'Simulovaná pozice',
    feedback: 'Průběh a výkon',
    strengths: 'Silné stránky',
    developmentAreas: 'Rozvojové oblasti',
    workplace: 'Pracoviště',
    progressSummary: 'Pokrok',
    consultationType: 'Typ konzultace'
  };
  return labels[key] || key;
}

const CLIENT_SUPPORT_TYPE_META = [
  { key: 'plans', label: 'Plány rozvoje' },
  { key: 'consultations', label: 'Konzultace' },
  { key: 'debt_cases', label: 'Dluhové poradenství' },
  { key: 'therapy_sessions', label: 'Terapie' },
  { key: 'cv_outputs', label: 'Archivní výstup' },
  { key: 'job_simulators', label: 'Pracovní simulátor' },
  { key: 'tpm_records', label: 'Archivní aktivita' },
  { key: 'mentoring_records', label: 'Mentoring' },
  { key: 'employment_records', label: 'Pracovní uplatnění' },
  { key: 'mentor_report_document', label: 'Archivní zpráva' }
];

function extractSupportMinutes(record) {
  const payload = record.payload || {};
  if (record.entityType === 'plans') {
    if (payload.durationMinutes === null || payload.durationMinutes === undefined || String(payload.durationMinutes).trim() === '') return 60;
    const durationMinutes = Number(payload.durationMinutes);
    return Number.isFinite(durationMinutes) && durationMinutes >= 0 ? durationMinutes : 60;
  }
  if (['consultations', 'debt_cases', 'therapy_sessions', 'cv_outputs', 'job_simulators'].includes(record.entityType)) {
    const timedMinutes = durationMinutesFromTimes(payload.startTime, payload.endTime);
    const durationMinutes = Number(payload.durationMinutes || 0);
    return timedMinutes || (Number.isFinite(durationMinutes) && durationMinutes > 0 ? durationMinutes : 0);
  }
  const actualHours = Number(payload.actualHours);
  if (Number.isFinite(actualHours) && actualHours > 0) return Math.round(actualHours * 60);
  const durationMinutes = Number(payload.durationMinutes);
  if (Number.isFinite(durationMinutes) && durationMinutes > 0) return durationMinutes;
  return 0;
}

function getClientSupportBreakdown(clientId, records) {
  const supportedEntityTypes = new Set(CLIENT_SUPPORT_TYPE_META.map((item) => item.key));
  const related = records.filter((record) => {
    const clientIds = Array.isArray(record.clientIds) ?record.clientIds : [];
    const belongsToClient = clientIds.includes(clientId) || record.clientId === clientId;
    return belongsToClient && supportedEntityTypes.has(record.entityType);
  });

  const byType = CLIENT_SUPPORT_TYPE_META.map((item) => {
    const matching = related.filter((record) => record.entityType === item.key);
    const minutes = Math.round(matching.reduce((sum, record) => sum + extractSupportMinutes(record), 0));
    return {
      key: item.key,
      label: item.label,
      count: matching.length,
      minutes,
      hours: minutes / 60
    };
  }).filter((item) => item.count > 0 || item.minutes > 0);

  const totalMinutes = byType.reduce((sum, item) => sum + item.minutes, 0);

  return {
    totalCount: related.length,
    totalDocuments: related.filter((record) => Boolean(record.documentText)).length,
    totalHours: totalMinutes / 60,
    totalMinutes,
    byType
  };
}

function getClientStats(clientId, records) {
  const summary = getClientSupportBreakdown(clientId, records);

  return {
    activities: summary.totalCount,
    documents: summary.totalDocuments,
    supportMinutes: summary.totalMinutes,
    supportHours: summary.totalHours
  };
}

function splitMultiValue(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAddress(client) {
  return [client.ulice, client.cisloPopisne].filter(Boolean).join(' ') + (client.mesto ?`, ${client.mesto}` : '');
}

function truncate(value, length) {
  const stringValue = String(value || '');
  if (stringValue.length <= length) return stringValue;
  return `${stringValue.slice(0, length)}...`;
}

function copyToClipboard(text, setCopied) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
    return;
  }

  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  document.body.removeChild(input);
  setCopied(true);
  window.setTimeout(() => setCopied(false), 1800);
}

function downloadCsv(headers, rows, filename) {
  const content = [headers, ...rows]
    .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n');
  const href = `data:text/csv;charset=utf-8,\ufeff${encodeURIComponent(content)}`;
  downloadHref(href, filename);
}

function downloadHtmlDocument(htmlContent, filename) {
  const rawHtml = String(htmlContent || '');
  let normalizedHtml = rawHtml;

  if (/<meta[^>]*charset=/i.test(normalizedHtml)) {
    normalizedHtml = normalizedHtml.replace(/<meta[^>]*charset=[^>]*>/i, '<meta charset="utf-8" />');
  } else if (/<head[^>]*>/i.test(normalizedHtml)) {
    normalizedHtml = normalizedHtml.replace(/<head[^>]*>/i, '$&\n<meta charset="utf-8" />');
  } else {
    normalizedHtml = `<!DOCTYPE html><html><head><meta charset="utf-8" /></head><body>${normalizedHtml}</body></html>`;
  }

  const blob = new Blob([`\ufeff${normalizedHtml}`], { type: 'application/msword;charset=utf-8' });
  const href = window.URL.createObjectURL(blob);
  downloadHref(href, filename);
  window.setTimeout(() => window.URL.revokeObjectURL(href), 4000);
}

function buildDriveUploadPayload(record, client) {
  const safeClient = client || {
    id: record.clientId || 'bez-id',
    fullName: record.clientName || 'Bez klienta'
  };
  const filename = `${record.activityDate || todayIso()} - ${record.ka || 'KA'} - ${record.title || record.entityType || 'zaznam'}`;
  return {
    client: {
      id: safeClient.id || record.clientId || 'bez-id',
      fullName: safeClient.fullName || record.clientName || 'Bez klienta',
      sheetRowKey: safeClient.sheetRowKey || '',
      source: safeClient.source || '',
      datumNarozeni: safeClient.datumNarozeni || '',
      mesto: safeClient.mesto || ''
    },
    record: {
      id: record.id || '',
      title: record.title || 'ZĂˇznam',
      filename,
      entityType: record.entityType || '',
      ka: record.ka || '',
      activityDate: record.activityDate || '',
      worker: record.worker || '',
      clientName: record.clientName || safeClient.fullName || '',
      payload: record.payload || {},
      indicatorFlags: record.indicatorFlags || {},
      documentText: record.documentText || ''
    },
    contentHtml: buildRecordHtmlDocument(record, safeClient)
  };
}

function buildDriveProvisionPayload(client) {
  const safeClient = client || {};
  return {
    action: 'provisionClientFolder',
    client: {
      id: safeClient.id || 'bez-id',
      fullName: safeClient.fullName || 'Bez klienta',
      jmeno: safeClient.jmeno || '',
      prijmeni: safeClient.prijmeni || '',
      datumNarozeni: safeClient.datumNarozeni || '',
      mesto: safeClient.mesto || '',
      ulice: safeClient.ulice || '',
      cisloPopisne: safeClient.cisloPopisne || '',
      psc: safeClient.psc || '',
      email: safeClient.email || '',
      telefon: safeClient.telefon || '',
      spadoveMesto: safeClient.spadoveMesto || '',
      pohlavi: safeClient.pohlavi || '',
      postaveniNaTrhu: safeClient.postaveniNaTrhu || '',
      vzdelani: safeClient.vzdelani || '',
      znevyhodneni: safeClient.znevyhodneni || ''
    }
  };
}

function formatPlanExportDate(value) {
  if (!value) return '';
  const dateValue = typeof value?.toDate === 'function' ? value.toDate() : new Date(value);
  if (Number.isNaN(dateValue.getTime())) return String(value);
  return new Intl.DateTimeFormat('cs-CZ').format(dateValue);
}

function getPlanExportGoals(record) {
  if (Array.isArray(record.goals)) return record.goals;
  if (Array.isArray(record.payload?.goals)) return record.payload.goals;
  return [];
}

function buildPlanExportText(record, client) {
  const payload = record.payload || {};
  const acceptedPlanText = payload.acceptedPlanText || record.acceptedPlanText || '';
  if (acceptedPlanText) return acceptedPlanText;
  const goals = getPlanExportGoals(record);
  const lines = [
    'Individuální plán rozvoje',
    '',
    `Klient: ${client.fullName || record.clientName || ''}`,
    `Datum plánu: ${formatPlanExportDate(record.activityDate)}`,
    `Pracovník: ${record.worker || ''}`,
    '',
    'Popis situace',
    record.situationDescription || payload.situationDescription || 'Neuvedeno',
    '',
    '',
    'Cíle a plánované kroky'
  ];

  if (goals.length) {
    goals.forEach((goal, index) => {
      lines.push(`${index + 1}. ${goal.goalDescription || 'Bez popisu cíle.'}`);
      if (goal.actionSteps) lines.push(`   Kroky: ${goal.actionSteps}`);
      const targetDate = formatPlanExportDate(goal.targetDate);
      if (targetDate) lines.push(`   Termín: ${targetDate}`);
      lines.push(`   Stav: ${goal.isCompleted ? 'splněn' : 'otevřen'}`);
      if (goal.goalEvaluation) lines.push(`   Vyhodnocení: ${goal.goalEvaluation}`);
    });
  } else {
    lines.push('Cíle zatím nejsou doplněné.');
  }

  const finalEvaluation = record.finalEvaluation || payload.finalEvaluation || '';
  if (finalEvaluation) lines.push('', 'Závěrečné vyhodnocení', finalEvaluation);
  return lines.join('\n');
}
function buildPlanPrintHtml(record, client) {
  const payload = record.payload || {};
  const goals = getPlanExportGoals(record);
  const acceptedPlanText = payload.acceptedPlanText || record.acceptedPlanText || '';
  const strengths = record.situationDescription || payload.situationDescription || '';
  const barriers = record.barriers || payload.barriers || '';
  const finalEvaluation = record.finalEvaluation || payload.finalEvaluation || '';
  const planDate = formatPlanExportDate(record.activityDate) || '';
  const title = record.title || 'Individuální plán rozvoje';
  const goalsHtml = goals.length
    ? goals.map((goal, index) => `
      <section class="goal-block">
        <div class="goal-heading">Cíl ${index + 1}</div>
        <div class="goal-title">${escapeHtml(goal.goalDescription || 'Bez popisu cíle.')}</div>
        <table class="goal-table">
          <tr><th>Akční kroky</th><td>${escapeHtml(goal.actionSteps || 'Neuvedeno')}</td></tr>
          <tr><th>Termín</th><td>${escapeHtml(formatPlanExportDate(goal.targetDate) || 'Neuvedeno')}</td></tr>
          <tr><th>Stav</th><td>${escapeHtml(goal.isCompleted ? 'splněn' : 'otevřen')}</td></tr>
          ${goal.goalEvaluation ? `<tr><th>Vyhodnocení</th><td>${escapeHtml(goal.goalEvaluation)}</td></tr>` : ''}
        </table>
      </section>`).join('')
    : '<p class="muted">Cíle zatím nejsou doplněné.</p>';

  const acceptedHtml = acceptedPlanText
    ? `<section class="section page-break-avoid"><h2>Souhrnný text plánu</h2><div class="text-box">${escapeHtml(acceptedPlanText)}</div></section>`
    : '';

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.45; font-size: 11.5pt; }
      .document { max-width: 780px; margin: 0 auto; }
      .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
      .kicker { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #6b7280; font-weight: 700; }
      h1 { font-size: 23pt; margin: 5px 0 4px; color: #111827; }
      h2 { font-size: 14pt; margin: 0 0 8px; color: #111827; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-top: 12px; }
      .meta div, .info-row { border: 1px solid #d1d5db; padding: 7px 9px; background: #f9fafb; }
      .label { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
      .section { margin-top: 16px; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 8px; }
      .text-box { white-space: pre-wrap; }
      .goal-block { margin-top: 12px; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; page-break-inside: avoid; }
      .goal-heading { background: #eef2ff; color: #3730a3; font-weight: 700; padding: 7px 10px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: .04em; }
      .goal-title { padding: 10px; font-weight: 700; }
      .goal-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      .goal-table th { width: 25%; text-align: left; vertical-align: top; background: #f8fafc; color: #475569; }
      .goal-table th, .goal-table td { border-top: 1px solid #e2e8f0; padding: 8px 10px; }
      .agreement { margin-top: 22px; border: 2px solid #111827; padding: 14px; page-break-inside: avoid; }
      .agreement p { margin: 0 0 16px; font-weight: 700; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 26px; margin-top: 26px; }
      .signature-line { border-top: 1px solid #111827; padding-top: 6px; min-height: 34px; font-size: 10pt; }
      .date-place { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px; }
      .muted { color: #64748b; }
      .page-break-avoid { page-break-inside: avoid; }
      @media print { .document { max-width: none; } .section { border-radius: 0; } }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="header">
        <div class="kicker">Projektová klientská dokumentace</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          <div><span class="label">Klient</span>${escapeHtml(client.fullName || record.clientName || '')}</div>
          <div><span class="label">Interní ID</span>${escapeHtml(client.id || record.clientId || '')}</div>
          <div><span class="label">Datum plánu</span>${escapeHtml(planDate)}</div>
          <div><span class="label">Pracovník</span>${escapeHtml(record.worker || '')}</div>
        </div>
      </header>

      <section class="section">
        <h2>Popis situace</h2>
        <div class="text-box">${escapeHtml(strengths || 'Neuvedeno')}</div>
      </section>

      <section class="section">
        <h2>Identifikované bariéry</h2>
        <div class="text-box">${escapeHtml(barriers || 'Neuvedeno')}</div>
      </section>

      <section class="section">
        <h2>Cíle a akční kroky</h2>
        ${goalsHtml}
      </section>

      ${acceptedHtml}

      ${finalEvaluation ? `<section class="section page-break-avoid"><h2>Závěrečné vyhodnocení</h2><div class="text-box">${escapeHtml(finalEvaluation)}</div></section>` : ''}

      <section class="agreement">
        <p>Klient potvrzuje, že byl s nastaveným plánem osobního rozvoje seznámen, obsahu rozumí a s plánem souhlasí.</p>
        <div class="date-place">
          <div class="signature-line">Místo</div>
          <div class="signature-line">Datum</div>
        </div>
        <div class="signature-grid">
          <div class="signature-line">Podpis klienta</div>
          <div class="signature-line">Podpis pracovníka</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}

const EXPORT_HIDDEN_FIELDS = new Set([
  'linkedPlanGoalId',
  'clientId',
  'clientIds',
  'id',
  'recordId',
  'goalId',
  'createdAt',
  'updatedAt',
  'structuredPersonalDevelopmentPlan',
  'acceptedPlanText',
  'documentText',
  'supportSpecific',
  'legacySource',
  'caseManagementMode'
]);

function formatRecordExportDate(value) {
  return formatPlanExportDate(value) || String(value || '');
}

function formatRecordExportValue(value) {
  if (value === true) return 'Ano';
  if (value === false) return 'Ne';
  if (value == null) return '';
  if (typeof value?.toDate === 'function') return formatRecordExportDate(value);
  if (typeof value === 'object' && typeof value.seconds === 'number') return formatRecordExportDate(new Date(value.seconds * 1000));
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item == null) return '';
        if (typeof item === 'object') return Object.values(item).filter(Boolean).join(' - ');
        return String(item);
      })
      .filter(Boolean)
      .join('\n');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([key, nestedValue]) => !EXPORT_HIDDEN_FIELDS.has(key) && nestedValue !== '' && nestedValue != null && nestedValue !== false)
      .map(([key, nestedValue]) => `${translateFieldLabel(key)}: ${formatRecordExportValue(nestedValue)}`)
      .join('\n');
  }
  return String(value);
}

function formatRecordExportDuration(record) {
  const payload = record.payload || {};
  const minutes = Number(payload.durationMinutes || durationMinutesFromTimes(payload.startTime, payload.endTime) || 0);
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

function formatRecordExportTimeRange(record) {
  const payload = record.payload || {};
  if (payload.startTime && payload.endTime) return `${payload.startTime}-${payload.endTime}`;
  return payload.startTime || payload.endTime || '';
}

function getRecordExportTypeLabel(record) {
  return record.title || translateFieldLabel(record.entityType) || 'Záznam aktivity';
}
function getPrintablePayloadRows(record) {
  const hiddenForExport = new Set(EXPORT_HIDDEN_FIELDS);
  const entries = Object.entries(record.payload || {})
    .filter(([key, value]) => !hiddenForExport.has(key) && value !== '' && value !== false && value != null)
    .map(([key, value]) => [key, formatRecordExportValue(value)])
    .filter(([, value]) => value !== '');

  const linkedGoalLabel = record.linkedPlanGoalLabel || record.payload?.linkedPlanGoalLabel || '';
  if (linkedGoalLabel && !entries.some(([key]) => key === 'linkedPlanGoalLabel')) entries.push(['linkedPlanGoalLabel', linkedGoalLabel]);
  return entries;
}

function cleanBatchRecordText(record, client, text) {
  const title = String(record.title || '').trim().toLowerCase();
  const clientName = String(client.fullName || record.clientName || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const lines = String(text || '')
    .replace(/\r\n/g, '\n')
    .split('\n');
  const cleaned = [];
  let skippedLeadingBlank = false;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const normalized = trimmed.replace(/\s+/g, ' ').toLowerCase();
    const isLeadingTitle = index < 4 && trimmed && (normalized === title || normalized === 'individuální plán rozvoje' || normalized === 'zápis z individuální konzultace');
    const isRepeatedMeta = /^(klient|datum plánu|pracovník|typ konzultace|datum a rozsah konzultace)\s*:/i.test(trimmed);
    const isClientLine = clientName && normalized.startsWith('klient:') && normalized.includes(clientName);

    if (isLeadingTitle || isRepeatedMeta || isClientLine) return;
    if (!trimmed && cleaned.length === 0) return;
    if (!trimmed && skippedLeadingBlank) return;
    cleaned.push(line);
    skippedLeadingBlank = !trimmed;
  });

  return cleaned.join('\n').trim() || String(text || '').trim();
}
function buildSelectedJourneyPrintHtml(client, selectedRecords) {
  const records = (selectedRecords || []).filter(Boolean);
  const recordSections = records
    .map((record, index) => {
      const batchHeaderKeys = new Set(['durationMinutes', 'startTime', 'endTime']);
      const printableRows = record.entityType === 'plans' ? [] : getPrintablePayloadRows(record).filter(([key]) => !batchHeaderKeys.has(key));
      const payloadRows = printableRows
        .map(([key, value]) => `<tr><th>${escapeHtml(translateFieldLabel(key))}</th><td>${escapeHtml(value)}</td></tr>`)
        .join('');
      const timeRange = formatRecordExportTimeRange(record) || 'Neuvedeno';
      const duration = formatRecordExportDuration(record) || 'Neuvedeno';
      const rawText = record.entityType === 'plans'
        ? buildPlanExportText(record, client)
        : record.documentText || formatRecordExportValue(record.payload || {}) || 'Text zápisu není doplněn.';
      const text = cleanBatchRecordText(record, client, rawText);

      return `
        <section class="record-block">
          <div class="record-header">
            <div class="record-index">${index + 1}</div>
            <div>
              <h2>${escapeHtml(getRecordExportTypeLabel(record))}</h2>
              <div class="record-meta-grid">
                <div><span>Datum</span>${escapeHtml(formatRecordExportDate(record.activityDate) || 'Bez data')}</div>
                <div><span>Pracovník</span>${escapeHtml(record.worker || 'Bez pracovníka')}</div>
                <div><span>Typ</span>${escapeHtml(record.ka || record.entityType || 'Záznam')}</div>
                <div><span>Čas</span>${escapeHtml(timeRange)}</div>
                <div><span>Délka</span>${escapeHtml(duration)}</div>
              </div>
            </div>
          </div>
          ${payloadRows ? `<table class="compact-table">${payloadRows}</table>` : ''}
          <div class="record-text">${escapeHtml(text)}</div>
        </section>`;
    })
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Vybrané zápisy - ${escapeHtml(client.fullName || 'klient')}</title>
    <style>
      @page { size: A4; margin: 16mm 15mm 18mm 15mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.42; font-size: 10.8pt; }
      .document { max-width: 790px; margin: 0 auto; }
      .top-header { border-bottom: 2px solid #111827; padding-bottom: 10px; margin-bottom: 14px; }
      .kicker { text-transform: uppercase; letter-spacing: .08em; font-size: 8.5pt; color: #6b7280; font-weight: 700; }
      h1 { font-size: 20pt; margin: 4px 0 4px; color: #111827; }
      h2 { font-size: 13pt; margin: 0 0 2px; color: #111827; }
      .client-meta { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 7px; margin-top: 10px; font-size: 9.5pt; }
      .client-meta div { border: 1px solid #d1d5db; padding: 6px 8px; background: #f9fafb; }
      .label { display: block; font-size: 7.8pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
      .record-block { margin-top: 12px; padding: 10px 11px; border: 1px solid #d1d5db; page-break-inside: avoid; }
      .record-header { display: grid; grid-template-columns: 28px 1fr; gap: 9px; align-items: start; margin-bottom: 8px; }
      .record-index { height: 24px; width: 24px; border-radius: 999px; background: #111827; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 9pt; }
      .record-meta-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; margin-top: 6px; font-size: 8.8pt; }
      .record-meta-grid div { border: 1px solid #e2e8f0; background: #f8fafc; padding: 4px 5px; }
      .record-meta-grid span { display: block; color: #64748b; font-weight: 700; text-transform: uppercase; font-size: 7.2pt; margin-bottom: 1px; }
      .compact-table { width: 100%; border-collapse: collapse; margin: 7px 0; font-size: 9.4pt; }
      .compact-table th { width: 25%; text-align: left; vertical-align: top; background: #f8fafc; color: #475569; }
      .compact-table th, .compact-table td { border: 1px solid #e2e8f0; padding: 5px 7px; white-space: pre-wrap; }
      .record-text { white-space: pre-wrap; margin-top: 8px; }
      .agreement { margin-top: 22px; border: 2px solid #111827; padding: 14px; page-break-inside: avoid; }
      .agreement p { margin: 0 0 14px; font-weight: 700; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; margin-top: 30px; }
      .date-place { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 20px; }
      .signature-line { border-top: 1px solid #111827; padding-top: 6px; min-height: 32px; font-size: 10pt; }
      @media print { .document { max-width: none; } }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="top-header">
        <div class="kicker">Projektová klientská dokumentace</div>
        <h1>Vybrané zápisy klienta</h1>
        <div class="client-meta">
          <div><span class="label">Klient</span>${escapeHtml(client.fullName || '')}</div>
          <div><span class="label">Interní ID</span>${escapeHtml(client.id || '')}</div>
          <div><span class="label">Počet zápisů</span>${records.length}</div>
        </div>
      </header>

      ${recordSections || '<p>Nejsou vybrané žádné zápisy.</p>'}

      <section class="agreement">
        <p>Klient potvrzuje, že byl seznámen s výše uvedenými zápisy, jejich obsahu rozumí a bere je na vědomí.</p>
        <div class="date-place">
          <div class="signature-line">Místo</div>
          <div class="signature-line">Datum</div>
        </div>
        <div class="signature-grid">
          <div class="signature-line">Podpis klienta</div>
          <div class="signature-line">Podpis pracovníka</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
function buildRecordHtmlDocument(record, client) {
  if (record.entityType === 'plans') return buildPlanPrintHtml(record, client);

  const printableRows = getPrintablePayloadRows(record);
  const documentText = record.documentText || '';
  const title = record.title || 'Záznam aktivity';
  const activityDate = formatRecordExportDate(record.activityDate) || 'Bez data';
  const metaItems = [
    ['Klient', client.fullName || record.clientName || ''],
    ['Datum výkonu', activityDate],
    ['Klíčová aktivita', record.ka || ''],
    ['Pracovník', record.worker || ''],
    ['Interní ID klienta', client.id || record.clientId || '']
  ].filter(([, value]) => value);

  const payloadRows = printableRows
    .map(
      ([key, value]) => `
        <tr>
          <th>${escapeHtml(translateFieldLabel(key))}</th>
          <td>${escapeHtml(value)}</td>
        </tr>`
    )
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.5; font-size: 11.5pt; }
      .document { max-width: 780px; margin: 0 auto; }
      .header { border-bottom: 2px solid #111827; padding-bottom: 12px; margin-bottom: 18px; }
      .kicker { text-transform: uppercase; letter-spacing: .08em; font-size: 9pt; color: #6b7280; font-weight: 700; }
      h1 { font-size: 22pt; margin: 5px 0 4px; color: #111827; }
      h2 { font-size: 14pt; margin: 0 0 8px; color: #111827; }
      .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 18px; margin-top: 12px; }
      .meta div { border: 1px solid #d1d5db; padding: 7px 9px; background: #f9fafb; }
      .label { display: block; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; font-weight: 700; margin-bottom: 2px; }
      .section { margin-top: 16px; padding: 12px 14px; border: 1px solid #d1d5db; border-radius: 8px; page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
      th { width: 28%; text-align: left; vertical-align: top; background: #f8fafc; color: #475569; font-weight: 700; }
      th, td { border: 1px solid #e2e8f0; padding: 8px 10px; white-space: pre-wrap; }
      .text-box { white-space: pre-wrap; border: 1px solid #e2e8f0; background: #fcfcfb; padding: 12px; min-height: 90px; }
      .signature-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 34px; page-break-inside: avoid; }
      .signature-line { border-top: 1px solid #111827; padding-top: 6px; min-height: 34px; font-size: 10pt; }
      .muted { color: #64748b; }
      @media print { .document { max-width: none; } .section { border-radius: 0; } }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="header">
        <div class="kicker">Projektová klientská dokumentace</div>
        <h1>${escapeHtml(title)}</h1>
        <div class="meta">
          ${metaItems.map(([label, value]) => `<div><span class="label">${escapeHtml(label)}</span>${escapeHtml(value)}</div>`).join('')}
        </div>
      </header>

      ${payloadRows ? `<section class="section"><h2>Údaje k zápisu</h2><table>${payloadRows}</table></section>` : ''}

      <section class="section">
        <h2>Text zápisu</h2>
        <div class="text-box">${escapeHtml(documentText || 'Text zápisu není doplněn.')}</div>
      </section>

      <section class="section">
        <h2>Potvrzení</h2>
        <p class="muted">Zápis byl projednán s klientem / účastníkem podpory.</p>
        <div class="signature-grid">
          <div class="signature-line">Podpis klienta</div>
          <div class="signature-line">Podpis pracovníka</div>
        </div>
      </section>
    </main>
  </body>
</html>`;
}
function downloadHref(href, filename) {
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function resolveRecordClients(record, clientIndex) {
  const ids = Array.isArray(record.clientIds) ? record.clientIds : record.clientId ? [record.clientId] : [];
  const matchedClients = ids.map((id) => clientIndex[id]).filter(Boolean);
  if (matchedClients.length) return matchedClients;
  return [{ id: record.clientId || 'bez-klienta', fullName: record.clientName || 'Bez přiřazeného klienta' }];
}

function buildAllRecordsBackupHtml(records, clients) {
  const clientIndex = {};
  (clients || []).forEach((client) => {
    clientIndex[client.id] = client;
  });

  const supportRecords = (records || []).filter((record) => !record.isSynthetic && record.entityType === 'consultations');

  const grouped = new Map();
  supportRecords.forEach((record) => {
      resolveRecordClients(record, clientIndex).forEach((client) => {
        if (!grouped.has(client.id)) grouped.set(client.id, { client, records: [] });
        grouped.get(client.id).records.push(record);
      });
    });

  const clientSections = Array.from(grouped.values())
    .sort((a, b) => String(a.client.fullName || '').localeCompare(String(b.client.fullName || ''), 'cs'))
    .map(({ client, records: clientRecords }) => {
      const recordSections = clientRecords
        .sort((a, b) => String(b.activityDate || '').localeCompare(String(a.activityDate || '')))
        .map((record, index) => {
          const payload = record.payload || {};
          const rows = [
            ['Datum', formatRecordExportDate(record.activityDate) || 'Bez data'],
            ['Klient', client.fullName || record.clientName || 'Bez klienta'],
            ['KA', record.ka || 'Bez KA'],
            ['Typ podpory', payload.consultationType || record.title || 'Neuvedeno'],
            ['Oblast podpory', payload.supportArea || 'Neuvedeno'],
            ['Cíl individuálního plánu', record.linkedPlanGoalLabel || payload.linkedPlanGoalLabel || 'Jednorázová zakázka'],
            ['Pracovník', record.worker || 'Bez pracovníka'],
            ['Čas', formatRecordExportTimeRange(record) || 'Neuvedeno'],
            ['Délka', formatRecordExportDuration(record) || 'Neuvedeno']
          ].filter(([, value]) => value !== '' && value != null);
          const text = record.documentText || 'Text zápisu není doplněn.';

          return `
            <section class="record-block">
              <h3>${index + 1}. ${escapeHtml(record.title || getRecordExportTypeLabel(record))}</h3>
              <table>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`).join('')}</table>
              <h4>Celý zápis</h4>
              <div class="record-text">${escapeHtml(text)}</div>
            </section>`;
        })
        .join('');

      return `
        <section class="client-section">
          <h2>${escapeHtml(client.fullName || 'Bez klienta')}</h2>
          <div class="client-meta">Interní ID: ${escapeHtml(client.id || '')}${client.mesto ? ` | Obec: ${escapeHtml(client.mesto)}` : ''}</div>
          ${recordSections || '<p>Bez záznamů.</p>'}
        </section>`;
    })
    .join('');

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <title>Zápisy podpory klientů</title>
    <style>
      @page { size: A4; margin: 16mm 14mm 18mm 14mm; }
      body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; line-height: 1.42; font-size: 10.5pt; }
      .document { max-width: 820px; margin: 0 auto; }
      .top-header { border-bottom: 2px solid #111827; margin-bottom: 18px; padding-bottom: 10px; }
      .kicker { text-transform: uppercase; letter-spacing: .08em; color: #6b7280; font-weight: 700; font-size: 8.5pt; }
      h1 { margin: 4px 0; font-size: 21pt; }
      h2 { margin: 18px 0 4px; font-size: 16pt; page-break-after: avoid; }
      h3 { margin: 0 0 8px; font-size: 12.5pt; }
      h4 { margin: 9px 0 5px; font-size: 10.5pt; color: #334155; }
      .client-section { margin-top: 18px; page-break-before: auto; }
      .client-meta { color: #64748b; margin-bottom: 10px; }
      .record-block { border: 1px solid #cbd5e1; padding: 10px; margin-top: 10px; page-break-inside: avoid; }
      table { width: 100%; border-collapse: collapse; font-size: 9.4pt; }
      th { width: 25%; text-align: left; vertical-align: top; background: #f8fafc; color: #475569; font-weight: 700; }
      th, td { border: 1px solid #e2e8f0; padding: 5px 7px; white-space: pre-wrap; }
      .record-text { white-space: pre-wrap; border: 1px solid #e2e8f0; background: #fcfcfb; padding: 8px; }
      @media print { .document { max-width: none; } }
    </style>
  </head>
  <body>
    <main class="document">
      <header class="top-header">
        <div class="kicker">Export klientských zápisů</div>
        <h1>Zápisy podpory podle klientů</h1>
        <p>Vygenerováno: ${escapeHtml(formatRecordExportDate(todayIso()))} | Počet klientských složek v exportu: ${grouped.size} | Počet záznamů: ${supportRecords.length}</p>
      </header>
      ${clientSections || '<p>Nejsou uloženy žádné zápisy.</p>'}
    </main>
  </body>
</html>`;
}
function buildClientFolderHtml(client, timeline) {
  const sections = timeline
    .map((record) => {
      return `
        <section style="margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid #e2e8f0;">
          <h2 style="font-size:18px;margin-bottom:8px;">${escapeHtml(record.title || 'Aktivita')}</h2>
          <p style="color:#64748b;font-size:12px;">${escapeHtml(record.activityDate || '')} | ${escapeHtml(record.ka || '')} | ${escapeHtml(record.worker || '')}</p>
          <pre style="white-space:pre-wrap;font-family:Arial, sans-serif;font-size:13px;line-height:1.6;">${escapeHtml(
            record.entityType === 'plans' ? buildPlanExportText(record, client) : record.documentText || JSON.stringify(record.payload || {}, null, 2)
          )}</pre>
        </section>
      `;
    })
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SloĹľka klienta ${escapeHtml(client.fullName)}</title>
      </head>
      <body style="font-family:Arial, sans-serif;padding:32px;color:#1e293b;">
        <h1 style="font-size:28px;margin-bottom:8px;">SloĹľka klienta: ${escapeHtml(client.fullName)}</h1>
        <p style="color:#475569;">InternĂ­ ID: ${escapeHtml(client.id)} | Obec: ${escapeHtml(client.mesto || 'Neuvedeno')}</p>
        ${sections || '<p>Ĺ˝ĂˇdnĂ© zĂˇznamy.</p>'}
      </body>
    </html>
  `;
}

function buildMonitoringBundleHtml({ indicators, records, clients }) {
  const indicatorHtml = indicators
    .map(
      (indicator) => `
      <tr>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(indicator.ka)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(indicator.label)}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${indicator.current}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${indicator.target}</td>
      </tr>
    `
    )
    .join('');

  const activityHtml = records
    .slice(0, 50)
    .map(
      (record) => `
      <tr>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(record.activityDate || '')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(record.ka || '')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(record.entityType || '')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(record.clientName || '')}</td>
        <td style="padding:8px;border:1px solid #cbd5e1;">${escapeHtml(record.title || '')}</td>
      </tr>
    `
    )
    .join('');

  return `
    <html>
      <head>
        <meta charset="utf-8" />
        <title>SouhrnnĂˇ monitorovacĂ­ dokumentace</title>
      </head>
      <body style="font-family:Arial, sans-serif;padding:32px;color:#1e293b;">
        <h1>SouhrnnĂˇ monitorovacĂ­ dokumentace</h1>
        <p>Klienti v registru: ${clients.length} | Aktivity v systĂ©mu: ${records.length}</p>
        <h2>IndikĂˇtory</h2>
        <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">KA</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">IndikĂˇtor</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">Hodnota</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">CĂ­l</th>
            </tr>
          </thead>
          <tbody>${indicatorHtml}</tbody>
        </table>
        <h2>VĂ˝bÄ›r poslednĂ­ch aktivit</h2>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">Datum</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">KA</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">Entita</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">Klient</th>
              <th style="padding:8px;border:1px solid #cbd5e1;background:#f8fafc;">NĂˇzev</th>
            </tr>
          </thead>
          <tbody>${activityHtml}</tbody>
        </table>
      </body>
    </html>
  `;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function loadLocalRecords() {
  try {
    const stored = window.localStorage.getItem('projectReporting.records');
    return stored ?JSON.parse(stored) : [];
  } catch (error) {
    console.error('Local records load error:', error);
    return [];
  }
}

function saveLocalRecords(records) {
  try {
    window.localStorage.setItem('projectReporting.records', JSON.stringify(records));
  } catch (error) {
    console.error('Local records save error:', error);
  }
}

export {
  todayIso,
  mapSheetRowToClient,
  enrichClient,
  getMockClients,
  groupRecordsByType,
  buildPartnerStats,
  buildIndicators,
  computedIndicatorsMap,
  buildGeneratorRecord,
  buildKa02Record,
  buildKa03Record,
  anonymizeStyleMemoryText,
  buildAiStyleMemoryRecord,
  buildStyleMemoryContext,
  buildFallbackGeneratedText,
  extractGeminiText,
  cleanGeneratedText,
  getClientSupportBreakdown,
  getClientStats,
  buildAddress,
  truncate,
  copyToClipboard,
  downloadCsv,
  downloadHtmlDocument,
  buildDriveUploadPayload,
  buildDriveProvisionPayload,
  buildRecordHtmlDocument,
  buildSelectedJourneyPrintHtml,
  buildClientFolderHtml,
  buildAllRecordsBackupHtml,
  buildMonitoringBundleHtml,
  buildManualClientId,
  loadLocalRecords,
  saveLocalRecords,
  slugify,
  splitMultiValue
};
