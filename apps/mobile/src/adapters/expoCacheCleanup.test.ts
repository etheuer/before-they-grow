jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock/cache/',
}))

import { File } from 'expo-file-system'
import { cleanStaleCaptureCache } from './expoCacheCleanup'

describe('cleanStaleCaptureCache', () => {
  it('removes stale recording cache files on process bootstrap but keeps unrelated cache files', async () => {
    const recording = new File('file:///mock/cache/stale-reliability.m4a')
    recording.create({ intermediates: true })
    recording.write('audio')
    const unrelated = new File('file:///mock/cache/keep-reliability.txt')
    unrelated.create({ intermediates: true })
    unrelated.write('keep')

    await cleanStaleCaptureCache()

    expect(recording.exists).toBe(false)
    expect(unrelated.exists).toBe(true)
    await unrelated.delete()
  })
})
