import { KA1_ACTIVITIES } from '../config/ka1Catalog.js';

const ACTIVITY_BY_CODE = new Map(
  KA1_ACTIVITIES.map((activity) => [activity.code, activity])
);

function text(value) {
  return value == null ? '' : String(value).trim();
}

function formatMinutes(value) {
  const minutes = Math.max(0, Math.round(Number(value || 0)));
  if (!minutes) return '';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours && rest) return `${hours} h ${rest} min`;
  if (hours) return `${hours} h`;
  return `${rest} min`;
}

function shorten(value, limit = 220) {
  const normalized = text(value).replace(/\s+/g, ' ');
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit - 1).trimEnd()}…`;
}

export function normalizePerformanceTime(value) {
  const raw = text(value);
  if (!raw) return '';

  const direct = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (direct) {
    const hours = Number(direct[1]);
    const minutes = Number(direct[2]);
    if (hours <= 23 && minutes <= 59) {
      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    }
  }

  const sheetSerial = raw.match(/^1899-12-30T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?Z$/);
  if (sheetSerial) {
    // Google serializuje čistý čas listu Europe/Prague jako zimní UTC čas roku 1899.
    const localHours = (Number(sheetSerial[1]) + 1) % 24;
    return `${String(localHours).padStart(2, '0')}:${sheetSerial[2]}`;
  }

  const isoTime = raw.match(/T(\d{2}):(\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?$/);
  if (isoTime) return `${isoTime[1]}:${isoTime[2]}`;

  return raw;
}

export function formatLegacyActivity(activityCode) {
  const code = text(activityCode);
  if (!code) return '';
  const activity = ACTIVITY_BY_CODE.get(code);
  return activity ? `${code} – ${activity.title}` : code;
}

function legacyPerformanceFields(record) {
  const payload = record?.payload || {};
  const startTime = normalizePerformanceTime(payload.startTime);
  const endTime = normalizePerformanceTime(payload.endTime);
  const timeRange = startTime && endTime
    ? `${startTime}–${endTime}`
    : startTime || endTime;
  const activityCodes = Array.isArray(payload.activityCodes)
    ? payload.activityCodes.filter(Boolean)
    : [];
  const note = text(record?.documentText || payload.topics);

  return {
    meetingForm: text(payload.meetingForm),
    place: text(payload.place),
    timeRange,
    duration: formatMinutes(payload.durationMinutes),
    activityCodes,
    activities: activityCodes.map(formatLegacyActivity).filter(Boolean),
    note
  };
}

export function buildLegacyPerformanceSummary(record) {
  const fields = legacyPerformanceFields(record);
  const facts = [
    fields.meetingForm,
    fields.place,
    fields.timeRange,
    fields.duration,
    fields.activityCodes.join(', ')
  ].filter(Boolean);
  const prefix = facts.join(' · ');
  if (!fields.note) return prefix || 'Historický výkon bez doplňující poznámky.';
  return shorten([prefix, fields.note].filter(Boolean).join(' — '));
}

export function buildLegacyPerformanceDetail(record) {
  const fields = legacyPerformanceFields(record);
  const lines = [
    fields.meetingForm ? `Forma jednání: ${fields.meetingForm}` : '',
    fields.place ? `Místo: ${fields.place}` : '',
    fields.timeRange ? `Čas: ${fields.timeRange}` : '',
    fields.duration ? `Délka: ${fields.duration}` : '',
    fields.activities.length ? `Činnosti:\n${fields.activities.map((item) => `• ${item}`).join('\n')}` : '',
    fields.note ? `Poznámka:\n${fields.note}` : ''
  ].filter(Boolean);

  return lines.join('\n\n') || 'Historický výkon neobsahuje další čitelné údaje.';
}
