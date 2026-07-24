import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIsirDocumentUrl } from '../isirDocumentProxy.js';

test('PDF proxy přijme pouze oficiální dokument ISIR s číselným ID', () => {
  const parsed = parseIsirDocumentUrl('https://isir.justice.cz/isir/doc/dokument.PDF?id=69279291');
  assert.equal(parsed?.hostname, 'isir.justice.cz');
  assert.equal(parsed?.searchParams.get('id'), '69279291');
});

test('PDF proxy odmítne cizí host, jiné schéma i neplatnou cestu', () => {
  assert.equal(parseIsirDocumentUrl('https://example.com/isir/doc/dokument.PDF?id=69279291'), null);
  assert.equal(parseIsirDocumentUrl('http://isir.justice.cz/isir/doc/dokument.PDF?id=69279291'), null);
  assert.equal(parseIsirDocumentUrl('https://isir.justice.cz/isir/doc/jiny.PDF?id=69279291'), null);
  assert.equal(parseIsirDocumentUrl('https://isir.justice.cz/isir/doc/dokument.PDF?id=abc'), null);
});
