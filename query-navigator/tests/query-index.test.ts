import assert from 'node:assert/strict'
import test from 'node:test'
import { compactQueryPreview, queryIndexProjectionDefinition } from '../src/query-index.ts'

function event(type: string, seq: number, data: unknown) {
  return { type, seq, data }
}

test('indexes only the first human query in each turn', () => {
  let state = queryIndexProjectionDefinition.init()
  const events = [
    event('turn/start', 0, { turn: 1 }),
    event('user/message', 1, { source: { kind: 'plugin' }, content: [{ type: 'text', text: 'context' }] }),
    event('user/message', 2, { source: { kind: 'user' }, content: [{ type: 'text', text: 'first query' }] }),
    event('user/message', 3, { source: { kind: 'user' }, content: [{ type: 'text', text: 'steering' }] }),
    event('turn/end', 4, { turn: 1 }),
    event('turn/start', 5, { turn: 2 }),
    event('user/message', 6, { source: { kind: 'user' }, content: [{ type: 'text', text: 'second query' }] }),
  ]
  for (const item of events) state = queryIndexProjectionDefinition.apply(state, item)

  assert.deepEqual(queryIndexProjectionDefinition.wire.view(state), { items: [
    { turn: 1, seq: 2, preview: 'first query' },
    { turn: 2, seq: 6, preview: 'second query' },
  ] })
})

test('caps projected text and keeps a lightweight image hint', () => {
  const long = '查'.repeat(90)
  assert.equal(compactQueryPreview({ content: [
    { type: 'text', text: `  ${long}\n` },
    { type: 'image' },
  ] }), `${'查'.repeat(80)}… · 1 张图片`)
})
