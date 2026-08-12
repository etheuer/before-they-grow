jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///mock/private/',
  cacheDirectory: 'file:///mock/cache/',
}))

import { File } from 'expo-file-system'
import {
  SaveCapacityError,
  SaveIndeterminateError,
} from '@before-they-grow/application'
import { createExpoMediaStorePort } from './expoMediaStore'
import type { BackupExclusionPort } from './backupExclusion'

function exclusion(): BackupExclusionPort & { allowed: boolean; applied: string[] } {
  const state: BackupExclusionPort & { allowed: boolean; applied: string[] } = {
    allowed: true,
    applied: [],
    async apply(path: string) {
      state.applied.push(path)
      return state.allowed
    },
  }
  return state
}

function cacheFile(name: string): File {
  const file = new File(`file:///mock/cache/${name}`)
  if (!file.exists) file.create({ intermediates: true })
  file.write('audio')
  return file
}

describe('createExpoMediaStorePort', () => {
  it('turns a failed post-move backup exclusion check into Indeterminate and reconciles it later', async () => {
    const gate = exclusion()
    gate.allowed = false
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-gate.m4a')

    await expect(store.commit(source.uri, 'media/reliability-gate.m4a')).rejects.toEqual(
      new SaveIndeterminateError('backup-control-failed'),
    )

    const final = new File('file:///mock/private/BeforeTheyGrow/layout-v1/media/reliability-gate.m4a')
    expect(final.exists).toBe(true)

    gate.allowed = true
    await expect(store.reconcileFinal?.('media/reliability-gate.m4a')).resolves.toBe(true)
    await store.removeFinal('media/reliability-gate.m4a')
    expect(final.exists).toBe(false)
  })

  it('refuses to overwrite an existing managed final and reports low preflight capacity', async () => {
    const gate = exclusion()
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-existing.m4a')
    await store.commit(source.uri, 'media/reliability-existing.m4a')

    const retrySource = cacheFile('reliability-existing-retry.m4a')
    await expect(store.commit(retrySource.uri, 'media/reliability-existing.m4a')).rejects.toEqual(
      new SaveIndeterminateError('media-commit-uncertain'),
    )
    await expect(store.preflight?.(Number.MAX_SAFE_INTEGER)).rejects.toBeInstanceOf(SaveCapacityError)
    await store.removeFinal('media/reliability-existing.m4a')
  })

  it('removes a cancelled cache recording without touching managed media', async () => {
    const gate = exclusion()
    const store = createExpoMediaStorePort(gate)
    const source = cacheFile('reliability-cancel.m4a')
    await store.removeCache?.(source.uri)
    expect(source.exists).toBe(false)
  })
})
