import assert from 'node:assert/strict'
import test from 'node:test'
import {
  activeQueryIndex, clampPreviewTop, normalizeQueryText, queryPreviewFromData,
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
})

test('keeps hover cards inside the viewport', () => {
  assert.equal(clampPreviewTop(4, 800), 12)
  assert.equal(clampPreviewTop(780, 800), 672)
  assert.equal(clampPreviewTop(200, 800), 190)
})
