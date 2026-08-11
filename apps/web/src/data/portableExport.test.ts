import { expect, it } from 'vitest'
import { buildPortableExport } from './portableExport'

it('exports profile, text, and playable audio without vendor lock-in', async () => {
  const result = await buildPortableExport(
    {
      childName: 'Milo',
      ageBand: '6-8',
      consentedAt: '2026-08-10T20:00:00.000Z',
    },
    [
      {
        id: 'memory-1',
        promptId: 'prompt-1',
        question: 'What made you laugh today?',
        answerText: 'The dog sneezed.',
        audio: new Blob(['voice-bytes'], { type: 'audio/webm' }),
        recordedAt: '2026-08-10T20:00:00.000Z',
      },
    ],
    new Date('2026-08-10T21:00:00.000Z'),
  )

  expect(result.version).toBe(1)
  expect(result.exportedAt).toBe('2026-08-10T21:00:00.000Z')
  expect(result.profile.childName).toBe('Milo')
  expect(result.memories[0]).toMatchObject({
    question: 'What made you laugh today?',
    answerText: 'The dog sneezed.',
    audio: {
      mimeType: 'audio/webm',
      dataBase64: 'dm9pY2UtYnl0ZXM=',
    },
  })
})
