import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLegacyIsirCaseStudy } from '../src/lib/legacyIsirCaseStudy.js';

test('přenese původní sekce kazuistiky do polí používaných detailem klienta', () => {
  const source = `[[SECTION:current:Aktuální stav a co řešit]]
Stav nyní:
Případ Pavla Bednaříka se nachází ve fázi oddlužení.

Nejbližší termíny:
- 29.07.2026 – Uplynutí lhůty pro věřitele.

Co ověřit / řešit s klientem:
- Ověřit, zda klient rozumí zprávě.

Co má udělat klient:
- Pokračovat v plnění povinností.

Finance a pohledávky:
- Přezkoumané pohledávky: 8 přihlášek.

Vyhodnocení oddlužení, pokud je případ ukončený nebo je k dispozici zpráva o splnění:
Správce doporučuje schválení oddlužení.

Nejistoty pro aktuální práci:
- Vyřešit popřené pohledávky.

Jistota výstupu: vysoká

[[SECTION:history:Vývoj řízení]]
Stručný vývoj:
Řízení bylo zahájeno v březnu.

Časová osa:
- 16.03.2026 – Podání insolvenčního návrhu.`;

  const result = parseLegacyIsirCaseStudy(source);

  assert.equal(result.status_now, 'Případ Pavla Bednaříka se nachází ve fázi oddlužení.');
  assert.deepEqual(result.nearest_deadlines, [{ date: '2026-07-29', label: 'Uplynutí lhůty pro věřitele.' }]);
  assert.deepEqual(result.advisor_actions, ['Ověřit, zda klient rozumí zprávě.']);
  assert.deepEqual(result.client_actions, ['Pokračovat v plnění povinností.']);
  assert.deepEqual(result.finance_summary_lines, ['Přezkoumané pohledávky: 8 přihlášek.']);
  assert.equal(result.insolvency_evaluation, 'Správce doporučuje schválení oddlužení.');
  assert.deepEqual(result.uncertainties, ['Vyřešit popřené pohledávky.']);
  assert.equal(result.confidence, 'vysoká');
  assert.equal(result.history_summary, 'Řízení bylo zahájeno v březnu.');
  assert.deepEqual(result.proceeding_evolution, [{ date: '2026-03-16', label: 'Podání insolvenčního návrhu.' }]);
});

test('běžný text bez původních značek ponechá beze změny', () => {
  assert.deepEqual(parseLegacyIsirCaseStudy('Pouhý souhrn bez sekcí.'), {});
});
