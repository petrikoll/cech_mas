import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import { buildRecordDocx } from '../docxExport.js';
import { buildTableXlsx } from '../xlsxExport.js';

test('XLSX export má čitelné sloupce, filtr a zamrzlé záhlaví', () => {
  const buffer = buildTableXlsx({
    sheetName: 'Klienti a podpora KA1',
    headers: ['Interní ID', 'Klient', 'Podpora KA1 (hod)'],
    rows: [['client-7', 'Vojtěch Drabík', 2.1]],
    columnWidths: [14, 28, 20]
  });
  const zip = new AdmZip(buffer);
  const sheet = zip.readAsText('xl/worksheets/sheet1.xml');
  const workbook = zip.readAsText('xl/workbook.xml');
  assert.match(sheet, /state="frozen"/);
  assert.match(sheet, /<autoFilter ref="A1:C2"\/>/);
  assert.match(sheet, /width="28"/);
  assert.match(sheet, /<v>2\.1<\/v>/);
  assert.match(workbook, /Klienti a podpora KA1/);
});

test('DOCX hromadný export odděluje klienty na nové stránky', () => {
  const buffer = buildRecordDocx({
    title: 'Zápisy podpory KA1',
    sections: [
      { heading: 'Klient A', rows: [{ label: 'Datum', value: '2026-07-24' }], text: 'První zápis.' },
      { heading: 'Klient B', pageBreakBefore: true, rows: [{ label: 'Datum', value: '2026-07-25' }], text: 'Druhý zápis.' }
    ]
  });
  const zip = new AdmZip(buffer);
  const document = zip.readAsText('word/document.xml');
  assert.match(document, /Klient A/);
  assert.match(document, /Klient B/);
  assert.match(document, /<w:pageBreakBefore\/>/);
  assert.match(document, /První zápis/);
});
