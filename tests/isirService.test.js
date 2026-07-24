import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addMonths,
  buildSoapRequest,
  parseDocumentsFromDetail,
  parseSoapResponse
} from '../isirService.js';

test('lhůta přihlášek se počítá dva měsíce od usnesení a drží konec měsíce', () => {
  assert.equal(addMonths('2026-12-31', 2), '2027-02-28');
  assert.equal(addMonths('2026-03-15', 2), '2026-05-15');
});

test('ISIR SOAP request keeps child fields unqualified as required by the official XSD', () => {
  const xml = buildSoapRequest({
    firstName: 'Jan',
    lastName: 'Novák & syn',
    birthDate: '1980-01-02'
  });
  assert.match(xml, /<typ:getIsirWsCuzkDataRequest>/);
  assert.match(xml, /<nazevOsoby>Novák &amp; syn<\/nazevOsoby>/);
  assert.doesNotMatch(xml, /<typ:nazevOsoby>/);
});

test('ISIR SOAP response maps case data', () => {
  const xml = `<?xml version="1.0"?>
    <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
        <getIsirWsCuzkDataResponse xmlns="http://isirws.cca.cz/types/">
          <data>
            <cisloSenatu>12</cisloSenatu><druhVec>INS</druhVec>
            <bcVec>123</bcVec><rocnik>2026</rocnik>
            <druhStavKonkursu>ODDLUŽENÍ</druhStavKonkursu>
            <urlDetailRizeni>https://isir.justice.cz/detail</urlDetailRizeni>
            <datumPmZahajeniUpadku>2026-04-03</datumPmZahajeniUpadku>
          </data>
          <stav><pocetVysledku>1</pocetVysledku><relevanceVysledku>4</relevanceVysledku></stav>
        </getIsirWsCuzkDataResponse>
      </soap:Body>
    </soap:Envelope>`;
  assert.deepEqual(parseSoapResponse(xml)[0], {
    case_id: '12-INS-123-2026',
    case_number: '12 INS 123/2026',
    proceeding_started_at: '2026-04-03',
    proceeding_ended_at: '',
    case_status: 'ODDLUŽENÍ',
    detail_url: 'https://isir.justice.cz/detail',
    relevance: 4,
    additional_debtor: false,
    city: ''
  });
});

test('ISIR detail parser deduplicates PDF links and keeps event date', () => {
  const html = `
    <tr>
      <td>A-12</td><td>3. 4. 2026</td><td>10:15</td>
      <td>Usnesení o úpadku spojené s povolením oddlužení</td>
      <td>
        <a href="/isir/doc/dokument.PDF?id=1">plný text</a>
        <a href="/isir/doc/dokument.PDF?id=2">plný text</a>
      </td>
    </tr>
    <a href="/isir/doc/dokument.PDF?id=1">duplikát</a>`;
  const documents = parseDocumentsFromDetail(html, '12-INS-123-2026');
  assert.equal(documents.length, 2);
  assert.equal(documents[0].event_date, '2026-04-03');
  assert.equal(documents[0].title, 'Usnesení o úpadku spojené s povolením oddlužení');
  assert.equal(documents[0].document_type, 'hlavní dokument');
  assert.equal(documents[0].is_main, 'Ano');
  assert.equal(documents[1].title, 'Usnesení o úpadku spojené s povolením oddlužení');
  assert.equal(documents[1].document_type, 'vedlejší dokument');
  assert.equal(documents[1].is_main, 'Ne');
  assert.match(documents[0].source_url, /^https:\/\/isir\.justice\.cz/);
});
