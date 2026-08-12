import { StyleSheet } from 'react-native'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import {
  StorageGateError,
  type ApplicationLifecyclePort,
  type ApplicationLifecycleState,
  type AuthenticationPort,
  type AuthenticationResult,
  type CredentialAvailability,
  type CreateProfileInput,
  type CreateProfileResult,
  type ProtectedHomeState,
  type TranscriptionOutcome,
  type UnavailableMemory,
  type ValidateCapturedAudioResult,
  type ValidatedAudio,
} from '@before-they-grow/application'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { ProtectedAreaServices } from './services'
import { LockedNativeShell } from './App'

class FakeLifecycle implements ApplicationLifecyclePort {
  private listeners = new Set<(state: ApplicationLifecycleState) => void>()

  constructor(private state: ApplicationLifecycleState = 'active') {}

  getCurrentState = () => this.state

  subscribe = (listener: (state: ApplicationLifecycleState) => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  transitionTo(state: ApplicationLifecycleState) {
    this.state = state
    for (const listener of this.listeners) listener(state)
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}

function fakeAuthentication(
  availability: CredentialAvailability | Promise<CredentialAvailability>,
  results: Array<AuthenticationResult | Promise<AuthenticationResult>>,
): AuthenticationPort {
  return {
    getCredentialAvailability: async () => availability,
    authenticate: async () => results.shift() ?? 'failed',
  }
}

function fakeProtectedArea(options: {
  initial?: ProtectedHomeState
  createResult?: CreateProfileResult
  homeAfterCreate?: ProtectedHomeState
  permission?: 'granted' | 'denied' | 'unavailable'
  memories?: MemoryEntryV1[]
  bootstrapFailures?: number
  timelineFailures?: number
  captureResult?: ValidateCapturedAudioResult
  captureSequence?: ValidateCapturedAudioResult[]
  saveVoiceResult?: 'saved' | 'not-saved' | 'indeterminate' | 'conflict'
  transcription?: TranscriptionOutcome | 'deferred'
  initialUnsaved?: { audio: ValidatedAudio; reviewedText: string }
  unavailable?: UnavailableMemory[]
  playOutcome?: 'played' | 'unavailable'
  wipeMarker?: boolean
  deleteAllFails?: boolean
} = {}): ProtectedAreaServices & {
  creates: CreateProfileInput[]
  bootstrapCalls: number
  savedManual: Array<{ transcript: string; recordingWasAvailable: boolean }>
  savedVoice: Array<{ reviewedTranscript: string; validatedMediaUri: string }>
  played: string[]
  hardDeletes: string[]
  deleteAllCalls: number
  resolveTranscription: ((outcome: TranscriptionOutcome) => void) | null
} {
  const state = {
    creates: [] as CreateProfileInput[],
    bootstrapCalls: 0,
    recording: false,
    savedManual: [] as Array<{ transcript: string; recordingWasAvailable: boolean }>,
    savedVoice: [] as Array<{ reviewedTranscript: string; validatedMediaUri: string }>,
    played: [] as string[],
    hardDeletes: [] as string[],
    deleteAllCalls: 0,
    wiped: options.wipeMarker === true,
    deleteAllFailed: false,
    memories: [...(options.memories ?? [])],
    timelineLoads: 0,
    transcribeResolvers: [] as Array<(outcome: TranscriptionOutcome) => void>,
    unsaved: (options.initialUnsaved ?? null) as { audio: ValidatedAudio; reviewedText: string; operation?: import('@before-they-grow/application').SaveOperationIdentity; saveNow?: Date } | null,
  }
  const api: ProtectedAreaServices & {
    creates: CreateProfileInput[]
    bootstrapCalls: number
    savedManual: Array<{ transcript: string; recordingWasAvailable: boolean }>
    savedVoice: Array<{ reviewedTranscript: string; validatedMediaUri: string }>
    played: string[]
    hardDeletes: string[]
    deleteAllCalls: number
    resolveTranscription: ((outcome: TranscriptionOutcome) => void) | null
  } = {
    creates: state.creates,
    savedManual: state.savedManual,
    savedVoice: state.savedVoice,
    played: state.played,
    get hardDeletes() {
      return state.hardDeletes
    },
    get deleteAllCalls() {
      return state.deleteAllCalls
    },
    get bootstrapCalls() {
      return state.bootstrapCalls
    },
    get resolveTranscription() {
      return (outcome: TranscriptionOutcome) => {
        const resolve = state.transcribeResolvers.shift()
        if (resolve) resolve(outcome)
      }
    },
    async bootstrap() {
      state.bootstrapCalls += 1
      if (state.bootstrapCalls <= (options.bootstrapFailures ?? 0)) {
        throw new Error('unexpected bootstrap failure')
      }
      if (state.deleteAllFailed) {
        return { kind: 'storage-blocked', reason: 'deletion-incomplete' }
      }
      if (state.wiped) {
        return { kind: 'needs-onboarding' }
      }
      if (state.creates.length > 0 && options.homeAfterCreate) {
        return { ...options.homeAfterCreate, unavailable: options.unavailable ?? [] }
      }
      return {
        ...(options.initial ?? { kind: 'needs-onboarding' }),
        unavailable: options.unavailable ?? [],
      }
    },
    async createProfile(input) {
      state.creates.push(input)
      const trimmed = input.childNickname.trim()
      if (trimmed.length === 0 || trimmed.length > 40) {
        return { kind: 'invalid-nickname' }
      }
      return options.createResult ?? { kind: 'created', profile: {
        id: 'profile-1',
        childNickname: trimmed,
        ageBand: input.ageBand,
        consentedAt: '2026-08-11T22:05:00.000Z',
        createdAt: '2026-08-11T22:05:00.000Z',
      } }
    },
    async requestRecordingPermission() {
      return options.permission ?? 'unavailable'
    },
    async saveManualMemory(input) {
      state.savedManual.push({
        transcript: input.reviewedTranscript,
        recordingWasAvailable: input.recordingWasAvailable,
      })
      const trimmed = input.reviewedTranscript.trim()
      if (trimmed.length === 0) return { kind: 'invalid-transcript' }
      const memory: MemoryEntryV1 = {
        id: `memory-${state.savedManual.length}`,
        kind: 'text-only',
        promptSnapshot: input.promptSnapshot,
        reviewedTranscript: trimmed,
        capturedAt: input.now.toISOString(),
        savedAt: input.now.toISOString(),
        localDate: '2026-08-11',
        timeZone: 'UTC',
        media: null,
      }
      state.memories = [memory, ...state.memories]
      return { kind: 'saved', memory }
    },
    async hardDeleteMemory(id) {
      state.hardDeletes.push(id)
      const before = state.memories.length
      state.memories = state.memories.filter((entry) => entry.id !== id)
      return state.memories.length === before ? 'missing' : 'deleted'
    },
    async deleteAllFamilyContent() {
      state.deleteAllCalls += 1
      if (options.deleteAllFails) {
        state.deleteAllFailed = true
        throw new StorageGateError('deletion-incomplete')
      }
      state.wiped = true
      state.memories = []
      return 'deleted'
    },
    async loadMemoryTimeline() {
      if ((options.timelineFailures ?? 0) > state.timelineLoads) {
        state.timelineLoads += 1
        throw new Error('timeline read failed')
      }
      state.timelineLoads += 1
      return [...state.memories]
    },
    async startRecording() {
      state.recording = true
    },
    async stopRecording() {
      state.recording = false
      return { uri: 'file:///cache/rec.m4a', durationMs: 12000 }
    },
    async cancelRecording() {
      state.recording = false
    },
    recordingStatus() {
      return { recording: state.recording, durationMs: state.recording ? 4000 : 0 }
    },
    subscribeRecording() {
      return () => undefined
    },
    async validateCapturedAudio() {
      const next = options.captureSequence?.shift()
      return (
        next
        ?? options.captureResult
        ?? {
          kind: 'valid',
          media: { uri: 'file:///cache/rec.m4a', durationMs: 12000, byteCount: 1000, sha256: 'abc' },
        }
      )
    },
    async startTranscription() {
      if (options.transcription === 'deferred') {
        return new Promise<TranscriptionOutcome>((resolve) => {
          state.transcribeResolvers.push(resolve)
        })
      }
      return options.transcription ?? { kind: 'unavailable' }
    },
    async cancelTranscription() {
      state.transcribeResolvers = []
    },
    invalidateTranscription() {},
    async saveVoiceMemory(input) {
      state.savedVoice.push({
        reviewedTranscript: input.reviewedTranscript,
        validatedMediaUri: input.validatedMedia.uri,
      })
      if (options.saveVoiceResult === 'not-saved') {
        return {
          kind: 'not-saved',
          reason: 'database-commit-failed',
          retry: { operationId: 'fake-operation', memoryId: 'fake-memory', mediaSha256: input.validatedMedia.sha256 },
        }
      }
      if (options.saveVoiceResult === 'indeterminate') {
        return { kind: 'indeterminate', reason: 'database-commit-uncertain', operation: { operationId: 'fake-operation', memoryId: 'fake-memory', mediaSha256: input.validatedMedia.sha256 } }
      }
      if (options.saveVoiceResult === 'conflict') {
        return {
          kind: 'not-saved',
          reason: 'conflict',
          retry: { operationId: 'fake-operation', memoryId: 'fake-memory', mediaSha256: input.validatedMedia.sha256 },
          conflict: { existing: memoryEntry('existing', '2026-08-10', 'Existing answer') },
        }
      }
      const memory: MemoryEntryV1 = {
        id: `voice-${state.savedVoice.length}`,
        kind: 'voice',
        promptSnapshot: input.promptSnapshot,
        reviewedTranscript: input.reviewedTranscript,
        capturedAt: input.now.toISOString(),
        savedAt: input.now.toISOString(),
        localDate: '2026-08-11',
        timeZone: 'UTC',
        media: { relativePath: `media/voice-${state.savedVoice.length}.m4a`, byteCount: 1000, sha256: 'abc' },
      }
      state.memories = [memory, ...state.memories]
      return { kind: 'saved', memory }
    },
    async playMemory(relativePath) {
      if (options.playOutcome === 'unavailable') return 'unavailable'
      state.played.push(relativePath)
      return 'played'
    },
    async playUri(uri) {
      state.played.push(uri)
    },
    async pausePlayback() {},
    async stopPlayback() {},
    isPlaying() {
      return false
    },
    onPlaybackEnded() {
      return () => undefined
    },
    subscribeLifecycle() {
      return () => undefined
    },
    getUnsavedRecording() {
      return state.unsaved
    },
    putUnsavedRecording(recording) {
      state.unsaved = recording
    },
    clearUnsavedRecording() {
      state.unsaved = null
    },
    consumeInterruptionNotice() {
      return false
    },
    consumeSaveReconciliationNotice() {
      return []
    },
  }
  return api
}

const homeWithProfile: ProtectedHomeState = {
  kind: 'home',
  profile: {
    id: 'profile-1',
    childNickname: 'Mila',
    ageBand: '6-8',
    consentedAt: '2026-08-11T22:05:00.000Z',
    createdAt: '2026-08-11T22:05:00.000Z',
  },
  prompt: {
    id: '6-8-memory-proud',
    ageBand: '6-8',
    category: 'memory',
    question: 'What happened today that made you feel proud?',
    followUp: 'What did you do to make it happen?',
  },
}

async function renderShell(
  authentication: AuthenticationPort,
  protectedArea: ProtectedAreaServices,
  lifecycle = new FakeLifecycle(),
) {
  await render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}
    >
      <LockedNativeShell
        authentication={authentication}
        lifecycle={lifecycle}
        protectedArea={protectedArea}
        openDeviceSettings={async () => undefined}
      />
    </SafeAreaProvider>,
  )
  return lifecycle
}

describe('locked native shell', () => {
  it('does not mount protected family content before authentication succeeds', async () => {
    const result = deferred<AuthenticationResult>()
    await renderShell(fakeAuthentication('available', [result.promise]), fakeProtectedArea())

    expect(screen.queryByText('Set up your family space')).toBeNull()
    expect(await screen.findByText('Unlock Before They Grow')).toBeOnTheScreen()

    await act(async () => result.resolve('authenticated'))

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
  })

  it('keeps protected content absent after cancellation and offers a safe retry', async () => {
    const cancellation = deferred<AuthenticationResult>()
    const retryResult = deferred<AuthenticationResult>()
    await renderShell(
      fakeAuthentication('available', [cancellation.promise, retryResult.promise]),
      fakeProtectedArea(),
    )
    await act(async () => cancellation.resolve('cancelled'))

    expect(await screen.findByText('Your family space is still locked')).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
    const retry = screen.getByRole('button', { name: 'Try again' })
    await act(async () => {
      await fireEvent.press(retry)
      retryResult.resolve('authenticated')
    })

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
  })

  it('shows device-security setup guidance without entering the protected area', async () => {
    await renderShell(fakeAuthentication('unavailable', []), fakeProtectedArea())

    expect(await screen.findByText('Protect this phone first')).toBeOnTheScreen()
    expect(screen.getByText(/Set up a device passcode, PIN, or pattern/)).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Open device settings' })).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
  })

  it.each(['inactive', 'background'] as const)(
    'removes protected content immediately when the application becomes %s',
    async (nextState) => {
      const firstAuthentication = deferred<AuthenticationResult>()
      const nextAuthentication = deferred<AuthenticationResult>()
      const lifecycle = await renderShell(
        fakeAuthentication('available', [firstAuthentication.promise, nextAuthentication.promise]),
        fakeProtectedArea(),
      )
      await act(async () => firstAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo(nextState))

      expect(screen.queryByText('Set up your family space')).toBeNull()
      expect(screen.getByText('Your family space is locked')).toBeOnTheScreen()

      await act(async () => lifecycle.transitionTo('active'))
      await waitFor(() => {
        expect(screen.queryByText('Set up your family space')).toBeNull()
      })
      await act(async () => nextAuthentication.resolve('authenticated'))
      expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
    },
  )
})

describe('protected area', () => {
  it('shows onboarding when no profile exists and creates exactly one via consent', async () => {
    const area = fakeProtectedArea({ homeAfterCreate: homeWithProfile })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()

    const nickname = screen.getByLabelText('Child first name or nickname')
    await act(async () => {
      await fireEvent.changeText(nickname, '  Mila  ')
    })
    await fireEvent.press(screen.getByRole('radio', { name: '6 to 8 years' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    await fireEvent.press(screen.getByRole('button', { name: "Start tonight's question" }))

    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(screen.getByText('What did you do to make it happen?')).toBeOnTheScreen()
    expect(screen.getByText(/A calm minute with Mila/)).toBeOnTheScreen()
    expect(area.creates).toHaveLength(1)
    expect(area.creates[0]).toMatchObject({
      childNickname: '  Mila  ',
      ageBand: '6-8',
      adultConfirmation: true,
      recordingPermissionConfirmed: true,
    })
  })

  it('keeps the submit disabled until nickname, age band, and both consents are set', async () => {
    const area = fakeProtectedArea()
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('Set up your family space')

    const submit = () => screen.getByRole('button', { name: "Start tonight's question" })
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.changeText(screen.getByLabelText('Child first name or nickname'), 'Mila')
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('radio', { name: '6 to 8 years' }))
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    expect(submit().props.accessibilityState.disabled).toBe(true)

    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    expect(submit().props.accessibilityState.disabled).toBe(false)
    expect(area.creates).toHaveLength(0)
  })

  it('rejects an over-long nickname without creating a profile', async () => {
    const area = fakeProtectedArea()
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('Set up your family space')

    await fireEvent.changeText(
      screen.getByLabelText('Child first name or nickname'),
      'n'.repeat(41),
    )
    await fireEvent.press(screen.getByRole('radio', { name: '3 to 5 years' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    await fireEvent.press(screen.getByRole('button', { name: "Start tonight's question" }))

    expect(
      await screen.findByText('Keep the nickname between 1 and 40 characters.'),
    ).toBeOnTheScreen()
    expect(area.creates).toHaveLength(1) // attempted but rejected by the use case
    expect(screen.getByText('Set up your family space')).toBeOnTheScreen()
  })

  it('shows tonight’s question after relaunch without repeating onboarding', async () => {
    await renderShell(
      fakeAuthentication('available', ['authenticated']),
      fakeProtectedArea({ initial: homeWithProfile }),
    )

    expect(await screen.findByText("Tonight's question")).toBeOnTheScreen()
    expect(screen.getByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
  })

  it('blocks family storage instead of presenting onboarding when storage is unsafe', async () => {
    const area = fakeProtectedArea({
      initial: { kind: 'storage-blocked', reason: 'version-unsafe' },
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()
    expect(
      screen.getByText(/storage version we cannot open safely/),
    ).toBeOnTheScreen()
    expect(screen.queryByText('Set up your family space')).toBeNull()
    expect(area.bootstrapCalls).toBe(1)

    await fireEvent.press(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()
  })

  it('requests permission only after the parent chooses to record, then saves a manual transcript', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'unavailable' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    // No manual entry is shown until the parent chooses to record.
    expect(screen.queryByText('No voice was captured')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    expect(screen.getByText('A quick check first')).toBeOnTheScreen()
    expect(screen.getByText(/asks for the microphone only when you choose to record/)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('No voice was captured')).toBeOnTheScreen()

    const input = screen.getByLabelText('Their answer in writing')
    await fireEvent.changeText(input, '  I made my bed all by myself.  ')
    await fireEvent.press(screen.getByRole('button', { name: 'Save transcript' }))

    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedManual).toHaveLength(1)
    expect(area.savedManual[0]).toEqual({
      transcript: '  I made my bed all by myself.  ',
      recordingWasAvailable: false,
    })
    // A completed save cannot be submitted twice from the same review state.
    expect(screen.queryByRole('button', { name: 'Save transcript' })).toBeNull()
  })

  it('does not expose a text-only bypass when microphone capture is ready', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    expect(screen.queryByText('No voice was captured')).toBeNull()
    expect(screen.queryByLabelText('Their answer in writing')).toBeNull()
    expect(area.savedManual).toHaveLength(0)
  })

  it('shows saved memories newest first in the timeline', async () => {
    const older = memoryEntry('older', '2026-08-10', 'I saw a rainbow.')
    const newer = memoryEntry('newer', '2026-08-11', 'I made my bed by myself.')
    const area = fakeProtectedArea({ initial: homeWithProfile, memories: [older, newer] })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View 2 memories' }))

    expect(await screen.findByText('Mila\'s memories')).toBeOnTheScreen()
    expect(screen.getByText('August 11, 2026')).toBeOnTheScreen()
    expect(screen.getByText('“I made my bed by myself.”')).toBeOnTheScreen()
    expect(screen.getByText('“I saw a rainbow.”')).toBeOnTheScreen()
  })

  it('shows an empty timeline state that returns to tonight', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View memories' }))
    expect(await screen.findByText('No memories yet')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: "Answer tonight's question" }))
    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
  })

  it('shows a timeline read failure as an explicit error with retry, never an empty state', async () => {
    const newer = memoryEntry('newer', '2026-08-11', 'I made my bed by myself.')
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [newer],
      timelineFailures: 1,
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View memories' }))
    expect(await screen.findByText("Couldn't load your memories")).toBeOnTheScreen()
    expect(screen.queryByText('No memories yet')).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('“I made my bed by myself.”')).toBeOnTheScreen()
  })
  it('records, validates, reviews, and saves a voice memory (audio-only)', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))

    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))

    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Save voice' }))
    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedVoice).toHaveLength(1)
    expect(area.savedVoice[0]).toEqual({
      reviewedTranscript: '',
      validatedMediaUri: 'file:///cache/rec.m4a',
    })
  })

  it('saves audio-plus-text when words are entered in review', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()

    await fireEvent.changeText(screen.getByLabelText('Their words (optional)'), '  Made my bed!  ')
    expect(screen.getByRole('button', { name: 'Save voice and words' })).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Save voice and words' }))

    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedVoice[0].reviewedTranscript).toBe('  Made my bed!  ')
  })

  it('rejects an invalid recording and offers to record again', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      permission: 'granted',
      captureResult: { kind: 'not-decodable' },
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))

    expect(await screen.findByText("This recording can't be saved")).toBeOnTheScreen()
    expect(area.savedVoice).toHaveLength(0)
  })

  it('plays and pauses a voice memory in the timeline', async () => {
    const voice = {
      ...memoryEntry('v1', '2026-08-11', 'Voice memory'),
      kind: 'voice' as const,
      reviewedTranscript: '',
      media: { relativePath: 'media/v1.m4a', byteCount: 1000, sha256: 'abc' },
    }
    const area = fakeProtectedArea({ initial: homeWithProfile, memories: [voice] })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View 1 memory' }))
    expect(await screen.findByText('Voice memory')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Play this memory' }))
    expect(area.played).toEqual(['media/v1.m4a'])
    expect(screen.getByRole('button', { name: 'Pause this memory' })).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Pause this memory' }))
    expect(screen.getByRole('button', { name: 'Play this memory' })).toBeOnTheScreen()
  })

  it('does not show a confirmation when a voice save could not complete', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      permission: 'granted',
      saveVoiceResult: 'not-saved',
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Save voice' }))

    expect(screen.queryByText('Saved')).toBeNull()
    expect(await screen.findByText("This answer wasn't saved. Please try again.")).toBeOnTheScreen()
  })

  it('plays a just-saved voice memory from the protected timeline', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Save voice' }))
    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))

    await fireEvent.press(screen.getByRole('button', { name: 'View 1 memory' }))
    expect(await screen.findByText('Voice memory')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Play this memory' }))
    expect(area.played).toContain('media/voice-1.m4a')
  })

  it('pre-fills the editable draft and saves only the parent-reviewed value', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      permission: 'granted',
      transcription: { kind: 'draft', text: 'I saw a rain bow' },
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))

    await screen.findByText('Review the answer')
    await waitFor(() => {
      expect(screen.getByLabelText('Their words (optional)').props.value).toBe('I saw a rain bow')
    })

    const input = screen.getByLabelText('Their words (optional)')
    await fireEvent.changeText(input, 'I saw a rainbow')
    await fireEvent.press(screen.getByRole('button', { name: 'Save voice and words' }))

    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedVoice[0].reviewedTranscript).toBe('I saw a rainbow')
  })

  it('keeps audio-only save available when transcription is unavailable', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted', transcription: { kind: 'unavailable' } })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    await screen.findByText('Review the answer')

    const input = screen.getByLabelText('Their words (optional)')
    expect(input.props.value).toBe('')
    await fireEvent.press(screen.getByRole('button', { name: 'Save voice' }))
    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(area.savedVoice[0].reviewedTranscript).toBe('')
  })

  it('does not clobber text the parent typed before a late draft arrives', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      permission: 'granted',
      transcription: 'deferred',
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    await screen.findByText('Review the answer')

    const input = screen.getByLabelText('Their words (optional)')
    await fireEvent.changeText(input, 'I typed this myself')
    await act(async () => {
      if (area.resolveTranscription) area.resolveTranscription({ kind: 'draft', text: 'late draft' })
    })

    expect(input.props.value).toBe('I typed this myself')
  })

  it('restores an in-process Unsaved recording for review after the App-lock transition', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      initialUnsaved: {
        audio: { uri: 'file:///cache/interrupted.m4a', durationMs: 9000, byteCount: 800, sha256: 'xyz' },
        reviewedText: '',
      },
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()
    expect(screen.getByRole('button', { name: 'Play' })).toBeOnTheScreen()
  })

  it('keeps the prior reviewed answer when a replacement recording fails to validate', async () => {
    const valid = {
      kind: 'valid' as const,
      media: { uri: 'file:///cache/rec.m4a', durationMs: 12000, byteCount: 1000, sha256: 'abc' },
    }
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      permission: 'granted',
      captureSequence: [valid, { kind: 'not-decodable' }],
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    // First capture is valid (fake default) -> review.
    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()

    // Replacement: this time validation fails (captureResult is fixed to
    // not-decodable), so the prior answer must remain intact.
    await fireEvent.press(screen.getByRole('button', { name: 'Record again' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))

    expect(screen.getByText('Review the answer')).toBeOnTheScreen()
    expect(
      await screen.findByText("The new recording couldn't be saved. Your previous answer is still here."),
    ).toBeOnTheScreen()
    expect(area.savedVoice).toHaveLength(0)
  })

  it('discard really discards the reviewed candidate and returns to a ready state', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, permission: 'granted' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Recording')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Finish recording' }))
    expect(await screen.findByText('Review the answer')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Discard' }))

    expect(await screen.findByText('Capture the answer')).toBeOnTheScreen()
    expect(screen.queryByText('Review the answer')).toBeNull()
    expect(area.savedVoice).toHaveLength(0)
  })

  it('shows a missing referenced voice file as an Unavailable memory with a hard-delete choice', async () => {
    const damaged = {
      ...memoryEntry('v-missing', '2026-08-11', 'I made my bed.'),
      kind: 'voice' as const,
      media: { relativePath: 'media/v-missing.m4a', byteCount: 1000, sha256: 'abc' },
    }
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [damaged],
      unavailable: [{ memoryId: 'v-missing', reason: 'missing-file' }],
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View 1 memory' }))
    expect(await screen.findByText(/This memory is unavailable/)).toBeOnTheScreen()
    expect(screen.getByText('August 11, 2026')).toBeOnTheScreen()
    expect(screen.getByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Play this memory' })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Remove this memory' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Delete permanently' }))

    expect(await screen.findByText('No memories yet')).toBeOnTheScreen()
    expect(area.hardDeletes).toEqual(['v-missing'])
  })

  it('turns checksum damage discovered at playback into an Unavailable memory without hiding it', async () => {
    const voice = {
      ...memoryEntry('v1', '2026-08-11', ''),
      kind: 'voice' as const,
      reviewedTranscript: '',
      media: { relativePath: 'media/v1.m4a', byteCount: 1000, sha256: 'abc' },
    }
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [voice],
      playOutcome: 'unavailable',
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    await fireEvent.press(screen.getByRole('button', { name: 'View 1 memory' }))
    expect(await screen.findByText('Voice memory')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Play this memory' }))

    expect(await screen.findByText(/This memory is unavailable/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: 'Play this memory' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove this memory' })).toBeOnTheScreen()
    expect(area.played).toEqual([])
  })

  it('requires confirmation that names the memory and explains Hard local deletion before removing it', async () => {
    const saved = memoryEntry('keep-me', '2026-08-11', 'I made my bed.')
    const area = fakeProtectedArea({ initial: homeWithProfile, memories: [saved] })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await fireEvent.press(await screen.findByRole('button', { name: 'View 1 memory' }))

    await fireEvent.press(screen.getByRole('button', { name: 'Remove this memory' }))
    expect(area.hardDeletes).toEqual([])
    expect(
      screen.getByText(/Hard local deletion of “I made my bed.” from August 11, 2026/),
    ).toBeOnTheScreen()
    expect(screen.getByText(/This permanently removes it from this phone/)).toBeOnTheScreen()
    expect(screen.getByText(/not forensic erasure of the device storage/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Delete permanently' }))
    expect(area.hardDeletes).toEqual(['keep-me'])
    expect(await screen.findByText('No memories yet')).toBeOnTheScreen()
  })

  it('requires two confirmations naming profile, transcripts, and recordings before delete everything', async () => {
    const saved = memoryEntry('keep-me', '2026-08-11', 'I made my bed.')
    const area = fakeProtectedArea({ initial: homeWithProfile, memories: [saved] })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await fireEvent.press(await screen.findByRole('button', { name: 'View 1 memory' }))

    await fireEvent.press(screen.getByRole('button', { name: 'Delete everything' }))
    expect(area.deleteAllCalls).toBe(0)
    expect(screen.getByText(/Mila's profile, every transcript, and every recording/)).toBeOnTheScreen()
    expect(screen.getByText(/not in the cloud and cannot be recovered/)).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'I understand — continue' }))
    expect(area.deleteAllCalls).toBe(0)
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, delete everything' }))

    expect(area.deleteAllCalls).toBe(1)
    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
    expect(screen.queryByText('I made my bed.')).toBeNull()
  })

  it('finishes a wipe-marker relaunch as an empty store without exposing memories', async () => {
    const leftover = memoryEntry('partial', '2026-08-11', 'should not appear')
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [leftover],
      wipeMarker: true,
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
    expect(screen.queryByText('should not appear')).toBeNull()
    expect(screen.queryByText("Mila's memories")).toBeNull()
  })

  it('blocks the family area when delete everything cannot finish', async () => {
    const saved = memoryEntry('keep-me', '2026-08-11', 'I made my bed.')
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [saved],
      deleteAllFails: true,
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await fireEvent.press(await screen.findByRole('button', { name: 'View 1 memory' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Delete everything' }))
    await fireEvent.press(screen.getByRole('button', { name: 'I understand — continue' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Yes, delete everything' }))

    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()
    expect(screen.getByText(/Hard local deletion did not finish/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /restore/i })).toBeNull()
  })

  it('shows an unexpected bootstrap failure as a blocked state and recovers on retry', async () => {
    const area = fakeProtectedArea({ initial: homeWithProfile, bootstrapFailures: 1 })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Family storage is unavailable')).toBeOnTheScreen()

    await fireEvent.press(screen.getByRole('button', { name: 'Check again' }))
    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    expect(area.bootstrapCalls).toBe(2)
  })

  it('discloses local-only storage and no-recovery limits on onboarding, capture, settings, and deletion', async () => {
    const area = fakeProtectedArea({
      initial: homeWithProfile,
      memories: [memoryEntry('keep-me', '2026-08-11', 'I made my bed.')],
    })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)
    await screen.findByText('What happened today that made you feel proud?')

    expect(screen.getByText(/Memories stay on this phone, no cloud backup, no recovery/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /sign in|export|share|subscribe|create account/i })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    expect(screen.getAllByText(/Memories stay on this phone, no cloud backup, no recovery/).length).toBeGreaterThan(0)
    await fireEvent.press(screen.getByRole('button', { name: 'Not now' }))

    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByText('Settings')).toBeOnTheScreen()
    expect(screen.getByText(/Memories stay on this phone, no cloud backup, no recovery/)).toBeOnTheScreen()
    expect(screen.getByText(/no account, sharing, cloud sync, ads, billing, or analytics/i)).toBeOnTheScreen()
    expect(screen.getByText(/You must be a parent or guardian with permission to record/)).toBeOnTheScreen()
    expect(screen.queryByRole('button', { name: /export|share|sign in|subscribe/i })).toBeNull()

    await fireEvent.press(screen.getByRole('button', { name: "Back to tonight's question" }))
    await fireEvent.press(await screen.findByRole('button', { name: 'View 1 memory' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Remove this memory' }))
    expect(screen.getAllByText(/Memories stay on this phone, no cloud backup, no recovery/).length).toBeGreaterThan(0)
    expect(area.hardDeletes).toEqual([])
  })

  it('gives core actions a 44pt target, visible label, role, state, and hint', async () => {
    const voice = {
      ...memoryEntry('v1', '2026-08-11', ''),
      kind: 'voice' as const,
      reviewedTranscript: '',
      media: { relativePath: 'media/v1.m4a', byteCount: 1000, sha256: 'abc' },
    }
    await renderShell(
      fakeAuthentication('available', ['authenticated']),
      fakeProtectedArea({ initial: homeWithProfile, memories: [voice] }),
    )
    await screen.findByText('What happened today that made you feel proud?')

    const record = screen.getByRole('button', { name: 'Record their voice' })
    expect(record.props.accessibilityRole).toBe('button')
    expect(record.props.accessibilityHint).toMatch(/microphone/i)
    expect(minTapHeight(record)).toBeGreaterThanOrEqual(44)

    await fireEvent.press(screen.getByRole('button', { name: 'View 1 memory' }))
    const play = screen.getByRole('button', { name: 'Play this memory' })
    expect(play.props.accessibilityHint).toMatch(/play/i)
    expect(minTapHeight(play)).toBeGreaterThanOrEqual(44)
    expect(screen.getByText('Play')).toBeOnTheScreen()

    const back = screen.getByRole('button', { name: "Back to tonight's question" })
    expect(minTapHeight(back)).toBeGreaterThanOrEqual(44)
  })

  it('walks unlock, onboarding, manual save, timeline, and settings without forbidden affordances', async () => {
    const area = fakeProtectedArea({ homeAfterCreate: homeWithProfile, permission: 'unavailable' })
    await renderShell(fakeAuthentication('available', ['authenticated']), area)

    expect(await screen.findByText('Set up your family space')).toBeOnTheScreen()
    expect(screen.getByText(/Memories stay on this phone, no cloud backup, no recovery/)).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Child first name or nickname'), 'Mila')
    await fireEvent.press(screen.getByRole('radio', { name: '6 to 8 years' }))
    expect(screen.getByRole('radio', { name: '6 to 8 years' }).props.accessibilityState.checked).toBe(true)
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I am an adult' }))
    await fireEvent.press(screen.getByRole('checkbox', { name: 'I have permission to record' }))
    await fireEvent.press(screen.getByRole('button', { name: "Start tonight's question" }))

    expect(await screen.findByText('What happened today that made you feel proud?')).toBeOnTheScreen()
    await fireEvent.press(screen.getByRole('button', { name: 'Record their voice' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('No voice was captured')).toBeOnTheScreen()
    await fireEvent.changeText(screen.getByLabelText('Their answer in writing'), 'I made my bed.')
    await fireEvent.press(screen.getByRole('button', { name: 'Save transcript' }))
    expect(await screen.findByText('Saved')).toBeOnTheScreen()
    expect(screen.getAllByText(/Memories stay on this phone, no cloud backup, no recovery/).length).toBeGreaterThan(0)

    await fireEvent.press(screen.getByRole('button', { name: 'Done' }))
    await fireEvent.press(screen.getByRole('button', { name: 'Settings' }))
    expect(await screen.findByText('Privacy')).toBeOnTheScreen()
    expect(screen.getByText('Terms')).toBeOnTheScreen()
    expect(screen.queryByText(/Create account|Share with family|Subscribe/i)).toBeNull()
    expect(area.savedManual).toHaveLength(1)
  })
})

function minTapHeight(element: { props: { style?: unknown } }): number {
  const flat = StyleSheet.flatten(element.props.style) as { minHeight?: number } | undefined
  return typeof flat?.minHeight === 'number' ? flat.minHeight : 0
}

function memoryEntry(id: string, localDate: string, transcript: string): MemoryEntryV1 {
  return {
    id,
    kind: 'text-only',
    promptSnapshot: {
      promptId: '6-8-memory-proud',
      question: 'What happened today that made you feel proud?',
      followUp: 'What did you do to make it happen?',
      ageBand: '6-8',
    },
    reviewedTranscript: transcript,
    capturedAt: '2026-08-11T20:00:00.000Z',
    savedAt: '2026-08-11T20:00:00.000Z',
    localDate,
    timeZone: 'UTC',
    media: null,
  }
}