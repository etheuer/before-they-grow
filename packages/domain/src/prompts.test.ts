import { describe, expect, it } from 'vitest'
import { getPromptForDate, type AgeBand } from './prompts'

const bands: AgeBand[] = ['3-5', '6-8', '9-12']

describe('getPromptForDate', () => {
  it('returns the same prompt for the same local date and age band', () => {
    const first = getPromptForDate(new Date('2026-08-10T20:00:00'), '3-5')
    const second = getPromptForDate(new Date('2026-08-10T21:30:00'), '3-5')

    expect(second).toEqual(first)
  })

  it('rotates to a different prompt on the next day', () => {
    const today = getPromptForDate(new Date('2026-08-10T20:00:00'), '6-8')
    const tomorrow = getPromptForDate(new Date('2026-08-11T20:00:00'), '6-8')

    expect(tomorrow.id).not.toBe(today.id)
  })

  it.each(bands)('returns a complete, age-appropriate prompt for %s', (band) => {
    const prompt = getPromptForDate(new Date('2026-08-10T20:00:00'), band)

    expect(prompt.ageBand).toBe(band)
    expect(prompt.question.length).toBeGreaterThan(12)
    expect(prompt.followUp.length).toBeGreaterThan(8)
    expect(['wonder', 'memory', 'feelings', 'family', 'play']).toContain(prompt.category)
  })
})
