import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFallbackGeneratedText, getClientSupportBreakdown, mapSheetRowToClient } from '../src/lib/projectUtils.js';

test('import pole načte klienta CECH podle autoritativní struktury registru', () => {
  const row = Array(23).fill('');
  row[0] = 'CECH';
  row[1] = 'Jan';
  row[2] = 'Novák';
  row[8] = 'Osoblaha';
  row[21] = '70';

  const client = mapSheetRowToClient(row, 0);
  assert.equal(client.projectId, 'CECH');
  assert.equal(client.clientNumber, '70');
  assert.equal(client.id, 'client-70');
  assert.equal(client.spadoveMesto, 'Osoblaha');
});

test('import klienta PRAC bezpečně vyřadí', () => {
  const row = Array(23).fill('');
  row[0] = 'PRAC';
  row[1] = 'Jan';
  row[2] = 'Novák';
  row[21] = '70';

  assert.equal(mapSheetRowToClient(row, 0), null);
});

test('import objektu správně mapuje neaktivní stavy klienta', () => {
  const cancelled = mapSheetRowToClient({ project_id: 'CECH', klient_id: '1', jmeno: 'Jan', stav_klienta: 'Stornovaný' }, 0);
  const pending = mapSheetRowToClient({ project_id: 'MAS', klient_id: '2', jmeno: 'Eva', stav_klienta: 'Rozpracovaný' }, 1);

  assert.equal(cancelled.projectStatus, 'inactive');
  assert.equal(pending.projectStatus, 'waiting');
});

test('statistika použije délku v minutách, když nejsou časy od-do', () => {
  const summary = getClientSupportBreakdown('client-1', [{
    id: 'record-1',
    clientId: 'client-1',
    entityType: 'consultations',
    payload: { durationMinutes: 90 }
  }]);

  assert.equal(summary.totalMinutes, 90);
  assert.equal(summary.totalHours, 1.5);
});

test('pracovní fallback zápisu podpory nepůsobí jako export formuláře', () => {
  const text = buildFallbackGeneratedText('Zápis podpory', { fullName: 'Jan Novák' }, {
    selectedKey: 'consultation',
    consultationType: 'Základní sociální poradenství',
    supportArea: 'zdraví',
    topics: 'Klientovi byla poskytnuta informace o prodloužení pracovní neschopnosti.',
    nextSteps: 'V případě ukončení PN ohlásit tuto skutečnost ÚP.'
  });

  assert.match(text, /Klientovi byla poskytnuta informace/);
  assert.doesNotMatch(text, /Typ podpory:/);
  assert.doesNotMatch(text, /Oblast podpory:/);
});
