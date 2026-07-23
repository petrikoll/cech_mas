function doGet(e) {
  try {
    const parameters = e && e.parameter ? e.parameter : {};
    assertApiToken_(parameters.token);
    const action = String(parameters.action || '').trim();

    if (action === 'ping') {
      return jsonResponse_({
        ok: true,
        service: 'CECH_MAS_REPORTING',
        timeZone: BACKEND_CONFIG.timeZone
      });
    }

    const projectId = requireProjectId_(parameters.project_id);
    const context = assertProjectAccess_(parameters.actor_id, projectId, []);

    if (action === 'listClients') {
      return jsonResponse_({ ok: true, clients: listClients_(projectId) });
    }
    if (action === 'listPerformances') {
      return jsonResponse_({ ok: true, performances: listPerformances_(projectId) });
    }
    if (action === 'getProjectConfig') {
      return jsonResponse_({ ok: true, project: PROJECT_CONFIG[projectId] });
    }
    if (action === 'getBridgeStatus') {
      return jsonResponse_({ ok: true, bridge: getBridgeStatus_() });
    }
    if ([
      'listIndividualPlans', 'listMeetings', 'listNetworkMeetings', 'listPartners',
      'listEducation', 'listSupervision', 'listStatistics'
    ].includes(action)) {
      const emptyPayload = { ok: true };
      if (action === 'listIndividualPlans') emptyPayload.individualPlans = [];
      if (action === 'listMeetings') emptyPayload.meetings = [];
      if (action === 'listNetworkMeetings') emptyPayload.networkMeetings = [];
      if (action === 'listPartners') emptyPayload.partners = [];
      if (action === 'listEducation') emptyPayload.education = [];
      if (action === 'listSupervision') emptyPayload.supervision = [];
      if (action === 'listStatistics') emptyPayload.statistics = [];
      return jsonResponse_(emptyPayload);
    }

    writeAudit_(context, 'GET', 'API', action, 'ERROR', 'Unknown action');
    return jsonResponse_({ ok: false, error: 'Neznámá akce.' });
  } catch (error) {
    return jsonResponse_(errorPayload_(error));
  }
}

function doPost(e) {
  let context = null;
  try {
    const payload = JSON.parse(
      e && e.postData && e.postData.contents ? e.postData.contents : '{}'
    );
    assertApiToken_(payload.token);
    const action = String(payload.action || '').trim();
    const projectId = requireProjectId_(payload.project_id);
    context = assertProjectAccess_(payload.actor_id, projectId, []);

    if (action === 'saveClient') {
      return jsonResponse_({ ok: true, client: saveClient_(payload.client || {}, context) });
    }
    if (action === 'savePerformance') {
      return jsonResponse_({
        ok: true,
        performance: savePerformance_(payload.performance || {}, context)
      });
    }
    if (action === 'deletePerformance') {
      return jsonResponse_({
        ok: true,
        performance: deletePerformance_(payload.id, context)
      });
    }
    if (action === 'rebuildLegacyBridge') {
      context = assertProjectAccess_(payload.actor_id, projectId, ['GARANT', 'ADMIN']);
      return jsonResponse_({
        ok: true,
        bridge: rebuildLegacyBridge_(context, payload.all_projects ? '' : projectId)
      });
    }
    if (action === 'syncLegacyPerformances') {
      context = assertProjectAccess_(payload.actor_id, projectId, ['GARANT', 'ADMIN']);
      return jsonResponse_({
        ok: true,
        import: syncLegacyPerformances_(context, {
          offset: payload.offset,
          batchSize: payload.batch_size,
          dryRun: payload.dry_run === true,
          force: payload.force === true,
          projectId: payload.all_projects ? '' : projectId
        })
      });
    }

    writeAudit_(context, 'POST', 'API', action, 'ERROR', 'Unknown action');
    return jsonResponse_({ ok: false, error: 'Neznámá akce.' });
  } catch (error) {
    if (context) writeAudit_(context, 'POST', 'API', '', 'ERROR', error.message);
    return jsonResponse_(errorPayload_(error));
  }
}
