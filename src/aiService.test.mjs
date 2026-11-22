import test from 'node:test'
import assert from 'node:assert/strict'
import { createAiService as createService } from '../aiService.mjs'

const createAiService = options => createService({ ...options, cache: {
  keyFor: () => 'test', get: async () => null, set: async () => undefined,
} })

const payload = { line: { text: 'Bonjour soleil', start: 0, end: 3 }, context: [{ text: 'Bonsoir lune étoile nuage' }] }
const laya = { systemOne: async () => ({ answers: { relevance: { choice: 'examine' }, word: { choice: '1' }, effect: { choice: 'pulse' }, difficulty: { score: 1 } } }) }
test('one loaded Laya session, partial results when LM Studio fails, and complete failure', async () => {
  let loads = 0
  const service = createAiService({ loadLaya: async () => { loads++; return laya }, fetcher: async () => { throw new Error('offline') } })
  const results = await Promise.all([service.analyze(payload), service.analyze(payload)])
  assert.equal(loads, 1)
  assert.equal(results[0].engines.laya, true)
  assert.equal(results[0].engines.lmStudio, false)
  assert.ok(results[0].suggestions.some(item => item.category === 'animation'))
  assert.ok(results[0].warnings.length)
  const failed = createAiService({ loadLaya: async () => { throw new Error('offline') }, fetcher: async () => { throw new Error('offline') } })
  const unavailable = await failed.analyze(payload)
  assert.equal(unavailable.selectedForLmStudio, false)
  assert.ok(unavailable.warnings.some(item => item.includes('présélection')))
})
test('LM Studio structured results are validated after Laya selection', async () => {
  const service = createAiService({ loadLaya: async () => laya, fetcher: async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.response_format.type, 'json_schema')
    const properties = request.response_format.json_schema.schema.properties.suggestions.items.properties
    assert.ok(!properties.category.enum.includes('section'))
    assert.equal(Object.hasOwn(properties, 'section'), false)
    assert.match(request.messages[0].content, /Ne propose jamais de détecter ou de modifier les sections/u)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ suggestions: [
      { category: 'qcm', target: { first: 1, last: 1 }, choices: ['lune', 'nuage', 'étoile'] },
      { category: 'style', target: { first: 100, last: 100 }, color: '#ffffff' },
      { category: 'section', section: 'Refrain' },
    ] }) } }] }) }
  } })
  const result = await service.analyze(payload)
  assert.equal(result.suggestions.filter(item => item.category === 'qcm').length, 1)
  assert.equal(result.suggestions.filter(item => item.category === 'style').length, 0)
  assert.equal(result.suggestions.filter(item => item.category === 'section').length, 0)
  assert.equal(result.engines.lmStudio, true)
})

test('Laya skips unselected phrases and failures never send lyrics to LM Studio', async () => {
  for (const loadLaya of [
    async () => ({ systemOne: async () => ({ answers: { relevance: { choice: 'skip' }, effect: { choice: 'none' }, difficulty: { score: 0 } } }) }),
    async () => { throw new Error('offline') },
  ]) {
    let calls = 0
    const service = createAiService({ loadLaya, fetcher: async () => { calls++; throw new Error('unexpected request') } })
    const result = await service.analyze(payload)
    assert.equal(calls, 0)
    assert.equal(result.selectedForLmStudio, false)
    assert.equal(result.engines.lmStudio, false)
  }
})
test('concurrent analyses are serialized and repetitions never suggest changing sections', async () => {
  let active = 0, maximum = 0
  const service = createAiService({ loadLaya: async () => ({ systemOne: async () => {
    active++; maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return { answers: { word: { choice: '0' }, effect: { choice: 'none' }, difficulty: { score: 0 } } }
  } }), fetcher: async () => { throw new Error('offline') } })
  const input = { ...payload, repetitions: 2, context: [{ text: 'Bonsoir lune étoile nuage', start: 2, end: 5 }] }
  const [result] = await Promise.all([service.analyze(input), service.analyze(input)])
  assert.equal(maximum, 1)
  assert.ok(result.suggestions.every(item => item.category !== 'section'))
  assert.ok(result.suggestions.some(item => item.category === 'review' && item.explanation.includes('chevauche')))
})
test('dedicated generated distractors create a quiz even without optional visual suggestions', async () => {
  const service = createAiService({ loadLaya: async () => laya, fetcher: async (_url, options) => {
    const request = JSON.parse(options.body)
    assert.equal(request.response_format.json_schema.schema.properties.qcmChoices.minItems, 3)
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ suggestions: [], qcmChoices: ['lune', 'nuage', 'étoile'] }) } }] }) }
  } })
  const result = await service.analyze(payload)
  const quiz = result.suggestions.find(item => item.category === 'qcm')
  assert.deepEqual(quiz.choices, ['lune', 'nuage', 'étoile'])
  assert.equal(quiz.engine, 'laya+lmstudio')
  assert.equal(quiz.target.text, 'soleil')
})

test('QCM eligibility is sparse and cannot be bypassed by generated suggestions', async () => {
  const service = createAiService({ loadLaya: async () => laya, fetcher: async (_url, options) => {
    const request = JSON.parse(options.body)
    const allowed = request.response_format.json_schema.schema.properties.qcmChoices.minItems === 3
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({
      qcmChoices: allowed ? ['lune', 'nuage', 'étoile'] : [],
      suggestions: [
        { category: 'qcm', target: { first: 1, last: 1 }, choices: ['lune', 'nuage', 'étoile'] },
        { category: 'style', target: { first: 1, last: 1 }, bold: true },
      ],
    }) } }] }) }
  } })
  const quizLines = []
  for (let lineIndex = 0; lineIndex < 12; lineIndex++) {
    const result = await service.analyze({ ...payload, lineIndex })
    if (result.suggestions.some(item => item.category === 'qcm')) quizLines.push(lineIndex)
    assert.ok(result.suggestions.some(item => item.category === 'style'))
  }
  assert.deepEqual(quizLines, [0, 4, 8])
  const annotated = await service.analyze({ ...payload, lineIndex: 4, line: {
    ...payload.line, text: 'Bonjour *cache:soleil*', gameModes: { isMissingWord: true, wordChoices: [['lune', 'nuage', 'étoile']] },
  } })
  assert.ok(!annotated.suggestions.some(item => item.category === 'qcm'))
})

test('offline LM Studio fallback respects QCM spacing and Laya rejection', async () => {
  const service = createAiService({ loadLaya: async () => laya, fetcher: async () => { throw new Error('offline') } })
  for (let lineIndex = 1; lineIndex < 4; lineIndex++) {
    assert.ok(!(await service.analyze({ ...payload, lineIndex })).suggestions.some(item => item.category === 'qcm'))
  }
  const skipped = createAiService({ loadLaya: async () => ({ systemOne: async () => ({ answers: {
    relevance: { choice: 'skip' }, word: { choice: '1' }, effect: { choice: 'none' }, difficulty: { score: 1 },
  } }) }), fetcher: async () => { throw new Error('must not run') } })
  assert.ok(!(await skipped.analyze(payload)).suggestions.some(item => item.category === 'qcm'))
})
