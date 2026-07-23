function normalizeProjectId_(value) {
  const normalized = String(value || '').trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(PROJECT_CONFIG, normalized) ? normalized : '';
}

function requireProjectId_(value) {
  const projectId = normalizeProjectId_(value);
  if (!projectId) throw new Error('Neplatný projekt. Povolené hodnoty jsou CECH a MAS.');
  return projectId;
}

function normalizeActorId_(value) {
  const actorId = String(value || '').trim();
  if (!actorId) throw new Error('Chybí identifikace pracovníka.');
  return actorId;
}

function assertApiToken_(providedToken) {
  const expectedToken = PropertiesService.getScriptProperties()
    .getProperty(BACKEND_CONFIG.apiTokenProperty);
  if (!expectedToken) throw new Error('API token není nakonfigurován.');
  if (String(providedToken || '') !== expectedToken) throw new Error('Neplatné API oprávnění.');
}

function getAuthorizedUser_(actorId) {
  const rows = readDataObjects_(DATA_SHEETS.users);
  const normalizedActorId = String(actorId || '').trim().toLowerCase();
  return rows.find((row) =>
    String(row.actor_id || '').trim().toLowerCase() === normalizedActorId &&
    isTruthy_(row.active)
  ) || null;
}

function assertProjectAccess_(actorId, projectId, requiredRoles) {
  const normalizedActorId = normalizeActorId_(actorId);
  const normalizedProjectId = requireProjectId_(projectId);
  const user = getAuthorizedUser_(normalizedActorId);
  if (!user) throw new Error('Pracovník nemá aktivní oprávnění.');

  const allowedProjects = splitList_(user.project_ids).map(normalizeProjectId_).filter(Boolean);
  if (!allowedProjects.includes(normalizedProjectId)) {
    throw new Error('Pracovník nemá oprávnění k projektu ' + normalizedProjectId + '.');
  }

  const role = String(user.role || '').trim().toUpperCase();
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [];
  if (roles.length && !roles.includes(role)) {
    throw new Error('Pracovník nemá požadovanou roli.');
  }

  return {
    actorId: normalizedActorId,
    displayName: String(user.display_name || normalizedActorId),
    role,
    projectId: normalizedProjectId
  };
}

function splitList_(value) {
  if (Array.isArray(value)) return value.map(String);
  return String(value || '').split(/[;,]/).map((item) => item.trim()).filter(Boolean);
}

function isTruthy_(value) {
  return /^(ano|true|1|aktivni|aktivní)$/i.test(String(value || '').trim());
}

function sanitizeAuditDetails_(value) {
  const text = String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.slice(0, 300);
}
