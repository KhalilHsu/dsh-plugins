import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeQueryIndex, buildTurnMarkers, clampPreviewTop, normalizeQueryText, queryPreviewFromData,
} from '../src/client/query-model.ts'

test('normalizes whitespace and extracts text plus image count', () => {
  assert.equal(normalizeQueryText('  first\n\nsecond  '), 'first second')
  assert.equal(queryPreviewFromData({
    content: [
      { type: 'text', text: '  帮我\n升级  ' },
      { type: 'image', attachment: {} },
      { type: 'image', attachment: {} },
    ],
  }), '帮我 升级 · 2 张图片')
})

test('falls back for payloads without presentable content', () => {
  assert.equal(queryPreviewFromData(null), '未命名 Query')
  assert.equal(queryPreviewFromData({ content: [{ type: 'tool-call' }] }), '未命名 Query')
})

test('selects the last query that crossed the reading line', () => {
  assert.equal(activeQueryIndex([20, 120, 260], 119), 0)
  assert.equal(activeQueryIndex([20, 120, 260], 121), 1)
  assert.equal(activeQueryIndex([null, 120, 260], 300), 2)
  assert.equal(activeQueryIndex([null, null, 260], 100), 2)
  assert.equal(activeQueryIndex([null, null], 100), 0)
})

test('keeps hover cards inside the viewport', () => {
  assert.equal(clampPreviewTop(4, 800), 12)
  assert.equal(clampPreviewTop(780, 800), 672)
  assert.equal(clampPreviewTop(200, 800), 190)
})

test('builds placeholders for unloaded turns and hydrates loaded turns', () => {
  assert.deepEqual(buildTurnMarkers(5, [
    { key: 'turn-4', preview: '第四轮', turn: 4 },
    { key: 'turn-5', preview: '第五轮', turn: 5 },
  ]), [
    { turn: 1, key: null, preview: null },
    { turn: 2, key: null, preview: null },
    { turn: 3, key: null, preview: null },
    { turn: 4, key: 'turn-4', preview: '第四轮' },
    { turn: 5, key: 'turn-5', preview: '第五轮' },
  ])
})

test('uses the highest observed turn when the projection is absent or behind', () => {
  assert.equal(buildTurnMarkers(0, [{ key: 'turn-7', preview: '运行中', turn: 7 }]).length, 7)
  assert.equal(buildTurnMarkers(3, [{ key: 'turn-7', preview: '运行中', turn: 7 }]).length, 7)
})

test('uses lightweight indexed previews before a turn is loaded', () => {
  assert.deepEqual(buildTurnMarkers(3, [
    { key: 'turn-3', preview: '已加载正文', turn: 3 },
  ], [
    { turn: 1, preview: '第一轮摘要' },
    { turn: 2, preview: '第二轮摘要' },
    { turn: 3, preview: '索引摘要会被正文覆盖' },
  ]), [
    { turn: 1, key: null, preview: '第一轮摘要' },
    { turn: 2, key: null, preview: '第二轮摘要' },
    { turn: 3, key: 'turn-3', preview: '已加载正文' },
  ])
})
