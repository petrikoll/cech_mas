import AdmZip from 'adm-zip';

const escapeXml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const paragraph = (text, { bold = false, size = 22, spacingAfter = 100 } = {}) => {
  const lines = String(text ?? '').split(/\r?\n/);
  const runs = lines.map((line, index) => `${index ? '<w:r><w:br/></w:r>' : ''}<w:r><w:rPr>${bold ? '<w:b/>' : ''}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r>`).join('');
  return `<w:p><w:pPr><w:spacing w:after="${spacingAfter}"/></w:pPr>${runs}</w:p>`;
};

const tableRow = (label, value) => `<w:tr>
  <w:tc><w:tcPr><w:tcW w:w="2600" w:type="dxa"/><w:shd w:fill="E2E8F0"/></w:tcPr>${paragraph(label, { bold: true, size: 19, spacingAfter: 0 })}</w:tc>
  <w:tc><w:tcPr><w:tcW w:w="6600" w:type="dxa"/></w:tcPr>${paragraph(value || 'Neuvedeno', { size: 19, spacingAfter: 0 })}</w:tc>
</w:tr>`;

function buildRecordDocx(payload = {}) {
  const title = String(payload.title || 'Záznam aktivity');
  const rows = Array.isArray(payload.rows) ? payload.rows.filter((row) => row && row.label) : [];
  const text = String(payload.text || '').trim();
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${paragraph(title, { bold: true, size: 34, spacingAfter: 180 })}
    ${rows.length ? `<w:tbl><w:tblPr><w:tblW w:w="9200" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="94A3B8"/><w:left w:val="single" w:sz="4" w:color="94A3B8"/><w:bottom w:val="single" w:sz="4" w:color="94A3B8"/><w:right w:val="single" w:sz="4" w:color="94A3B8"/><w:insideH w:val="single" w:sz="4" w:color="CBD5E1"/><w:insideV w:val="single" w:sz="4" w:color="CBD5E1"/></w:tblBorders></w:tblPr>${rows.map((row) => tableRow(row.label, row.value)).join('')}</w:tbl>` : ''}
    ${text ? paragraph('Výstup dokumentu', { bold: true, size: 24, spacingAfter: 80 }) + paragraph(text, { size: 21 }) : ''}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>
  </w:body>
</w:document>`;

  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`, 'utf8'));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`, 'utf8'));
  zip.addFile('word/document.xml', Buffer.from(documentXml, 'utf8'));
  return zip.toBuffer();
}

function readJsonBody(request, limit = 2_000_000) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) reject(new Error('Požadavek je příliš velký.'));
    });
    request.on('end', () => {
      try { resolve(body ? JSON.parse(body) : {}); }
      catch { reject(new Error('Neplatná data exportu.')); }
    });
    request.on('error', reject);
  });
}

async function handleDocxExportRequest(request, response) {
  try {
    const payload = await readJsonBody(request);
    const buffer = buildRecordDocx(payload);
    const filename = String(payload.filename || 'zaznam.docx').replace(/[^a-zA-Z0-9._-]/g, '-');
    response.writeHead(200, {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'Content-Disposition': `attachment; filename="${filename.endsWith('.docx') ? filename : `${filename}.docx`}"`,
      'Content-Length': buffer.length
    });
    response.end(buffer);
  } catch (error) {
    response.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: error.message || 'Export DOCX selhal.' }));
  }
}

export { buildRecordDocx, handleDocxExportRequest };