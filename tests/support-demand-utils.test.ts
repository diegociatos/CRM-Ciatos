import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demandError, isDefiniteDemandRejection, isDemandOverdue, toDeadline, toLocalDeadline } from '../lib/supportDemands';

test('only definitive database rejections allow correcting a submitted draft', () => {
  for (const code of ['23514', '22P02', '42501', '28000', 'P0001', '40001', 'PGRST202', 'PGRST301']) assert.equal(isDefiniteDemandRejection({ code }), true, code);
  for (const code of ['08006', '40003', '57014', 'PGRST000', 'XX000', '']) assert.equal(isDefiniteDemandRejection({ code }), false, code);
  assert.equal(isDefiniteDemandRejection(new Error('Network error')), false);
  assert.equal(isDefiniteDemandRejection(null), false);
});

test('only active demands can be overdue, even while waiting', () => {
  const due_at = '2026-01-01T00:00:00Z', now = Date.parse('2026-01-02T00:00:00Z');
  for (const status of ['OPEN', 'IN_PROGRESS', 'WAITING'] as const) assert.equal(isDemandOverdue({ status, due_at }, now), true);
  for (const status of ['RESOLVED', 'CANCELLED'] as const) assert.equal(isDemandOverdue({ status, due_at }, now), false);
  assert.equal(isDemandOverdue({ status: 'OPEN', due_at: null }, now), false);
  assert.equal(isDemandOverdue({ status: 'OPEN', due_at: 'invalid' }, now), false);
  assert.equal(isDemandOverdue({ status: 'OPEN', due_at }, Date.parse(due_at)), false);
});
test('actual database conflict reports a preserved draft and reload action', () => {
  assert.match(demandError({ code: '40001', message: 'Demand changed; reload before saving' }), /rascunho foi preservado/);
});
test('local deadline round-trip preserves local wall time and empty deadlines', () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = 'America/Sao_Paulo';
    assert.equal(toDeadline('2026-11-09T14:30'), '2026-11-09T17:30:00.000Z');
    assert.equal(toLocalDeadline('2026-11-09T17:30:00Z'), '2026-11-09T14:30');
    assert.equal(toDeadline(''), null);
    assert.equal(toLocalDeadline(null), '');
    assert.throws(() => toDeadline('invalid'), /válidos/);
    assert.throws(() => toDeadline('2026-02-31T14:30'), /válidos/);
  } finally { if (original === undefined) delete process.env.TZ; else process.env.TZ = original; }
});
