import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import type { PromptSnapshotV1 } from '@before-they-grow/contracts'
import {
  SaveCapacityError,
  StorageGateError,
  MAX_CAPTURE_DURATION_MS,
  type SaveOperationIdentity,
  type ValidatedAudio,
} from '@before-they-grow/application'
import { ActionButton } from './components/ActionButton'
import type { ProtectedAreaServices } from './services'
import type { Theme } from './theme'

type CaptureStep =
  | 'idle'
  | 'explain'
  | 'requesting'
  | 'manual'
  | 'recording'
  | 'finalizing'
  | 'review'
  | 'invalid'
  | 'saving'
  | 'indeterminate'
  | 'saved'

/** The reviewed candidate: a validated capture plus optional parent text. */
type Candidate = {
  uri: string
  validated: ValidatedAudio
  reviewText: string
  operation?: SaveOperationIdentity
  saveNow: Date
}

export type CaptureFlowProps = {
  promptSnapshot: PromptSnapshotV1
  theme: Theme
  services: ProtectedAreaServices
  onSaved: () => void
  onStorageBlocked: () => void
}

function formatClock(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The voice capture flow, hardened for interruptions and replacement attempts.
 * A review candidate is only ever replaced by a fully validated new capture;
 * an unvalidated retry, denial, or interruption leaves the prior reviewed
 * answer intact. An interrupted-but-valid capture is retained as an in-process
 * Unsaved recording in the transient store (survives the App-lock transition,
 * never a persistence promise). Recording itself stops covert capture on any
 * privacy-sensitive lifecycle transition.
 */
export function CaptureFlow({
  promptSnapshot,
  theme,
  services,
  onSaved,
  onStorageBlocked,
}: CaptureFlowProps) {
  const [step, setStep] = useState<CaptureStep>('idle')
  const [transcript, setTranscript] = useState('') // manual-text fallback
  const [error, setError] = useState<string | null>(null)
  const [retryNote, setRetryNote] = useState<string | null>(null)
  const [candidate, setCandidate] = useState<Candidate | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [interruptionNotice, setInterruptionNotice] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const finalizeLock = useRef(false)
  const manualOperation = useRef<SaveOperationIdentity | undefined>(undefined)
  const manualSaveNow = useRef<Date | undefined>(undefined)

  // Restore an in-process Unsaved recording after the App-lock transition,
  // and surface a one-time notice when an interrupted capture was not kept.
  useEffect(() => {
    const unsaved = services.getUnsavedRecording()
    if (unsaved && !candidate && step === 'idle') {
      setCandidate({
        uri: unsaved.audio.uri,
        validated: unsaved.audio,
        reviewText: unsaved.reviewedText,
        operation: unsaved.operation,
        saveNow: unsaved.saveNow ? new Date(unsaved.saveNow) : new Date(),
      })
      setStep('review')
    }
    if (services.consumeInterruptionNotice()) {
      setInterruptionNotice(true)
    }
    if (services.consumeSaveReconciliationNotice().some((result) => result.kind === 'not-saved')) {
      setInterruptionNotice(true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  // Stop any in-flight work when the flow unmounts so a late draft or capture
  // cannot arrive for a review the parent left.
  useEffect(() => {
    return () => {
      void services.cancelRecording()
      void services.cancelTranscription()
    }
  }, [services])

  const attemptTranscription = (uri: string) => {
    setTranscribing(true)
    void services.startTranscription(uri).then((outcome) => {
      if (outcome.kind === 'draft' && outcome.text) {
        setCandidate((current) => (current && current.reviewText.length === 0 ? { ...current, reviewText: outcome.text! } : current))
      }
      setTranscribing(false)
    })
  }

  const cancel = () => {
    finalizeLock.current = false
    void services.cancelRecording()
    void services.cancelTranscription()
    setPlaying(false)
    setTranscribing(false)
    setError(null)
    setRetryNote(null)
    // With a prior reviewed candidate (or an interrupted Unsaved recording),
    // cancellation returns to that truthful prior-answer state.
    if (candidate) {
      setStep('review')
    } else {
      manualOperation.current = undefined
      manualSaveNow.current = undefined
      setStep('idle')
    }
  }

  // Discard is a real, irreversible discard of the current candidate: it
  // clears the store and the component and returns to a truthful ready state.
  const discard = () => {
    finalizeLock.current = false
    void services.cancelRecording()
    void services.cancelTranscription()
    services.clearUnsavedRecording()
    setCandidate(null)
    manualOperation.current = undefined
    manualSaveNow.current = undefined
    setPlaying(false)
    setTranscribing(false)
    setError(null)
    setRetryNote(null)
    setStep('idle')
  }

  const begin = () => {
    setError(null)
    setRetryNote(null)
    setStep('explain')
  }

  const requestPermission = async () => {
    setStep('requesting')
    setError(null)
    const state = await services.requestRecordingPermission()
    if (state === 'granted') {
      await startRecording()
    } else {
      // A denied permission during a replacement leaves the prior answer
      // intact (candidate unchanged; return to review as the prior-answer
      // state).
      setStep(candidate ? 'review' : 'manual')
      if (candidate) setRetryNote("The microphone wasn't available. Your previous answer is still here.")
    }
  }

  const startRecording = async () => {
    setError(null)
    setRetryNote(null)
    setElapsedMs(0)
    setStep('recording')
    try {
      await services.startRecording()
    } catch (cause) {
      setStep(candidate ? 'review' : 'manual')
      if (cause instanceof SaveCapacityError) {
        if (candidate) setRetryNote("There isn't enough free space. Your previous answer is still here.")
        else setError("There isn't enough free space to start recording. Save their answer in writing instead.")
      } else if (candidate) {
        setRetryNote('The microphone could not start. Your previous answer is still here.')
      } else {
        setError('The microphone could not start. Save their answer in writing instead.')
      }
    }
  }

  // Poll the recorder for the elapsed timer, the automatic five-minute stop,
  // and an interruption stop (lifecycle) — all finalize through the same path.
  useEffect(() => {
    if (step !== 'recording') return
    const unsubscribe = services.subscribeRecording(() => {
      const status = services.recordingStatus()
      setElapsedMs(status.durationMs)
      if (!status.recording && status.durationMs > 0) void finalize()
    })
    const timer = setInterval(() => {
      const status = services.recordingStatus()
      setElapsedMs(status.durationMs)
      if (!status.recording && status.durationMs > 0) void finalize()
    }, 500)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const finalize = async () => {
    if (finalizeLock.current) return
    finalizeLock.current = true
    setStep('finalizing')
    try {
      const captured = await services.stopRecording()
      const result = await services.validateCapturedAudio(captured)
      if (result.kind === 'valid') {
        const next: Candidate = {
          uri: captured.uri,
          validated: result.media,
          reviewText: '',
          saveNow: new Date(),
        }
        setCandidate(next)
        services.putUnsavedRecording({ audio: result.media, reviewedText: '', saveNow: next.saveNow })
        setStep('review')
        attemptTranscription(captured.uri)
      } else if (candidate) {
        // A new capture that did not validate during a replacement leaves the
        // prior reviewed answer intact.
        setStep('review')
        setRetryNote("The new recording couldn't be saved. Your previous answer is still here.")
      } else {
        setStep('invalid')
      }
    } catch (cause) {
      if (candidate) {
        setStep('review')
        setRetryNote(
          cause instanceof SaveCapacityError
            ? "There isn't enough free space. Your previous answer is still here."
            : "The new recording couldn't be saved. Your previous answer is still here.",
        )
      } else {
        setStep('invalid')
        if (cause instanceof SaveCapacityError) setError("There isn't enough free space to save this recording.")
      }
    } finally {
      finalizeLock.current = false
    }
  }

  const recordAgain = async () => {
    void services.stopPlayback()
    void services.cancelTranscription()
    setPlaying(false)
    setTranscribing(false)
    setElapsedMs(0)
    // An invalid first attempt has no candidate to preserve; remove its cache
    // before starting another one. Replacement candidates remain untouched.
    if (!candidate) services.clearUnsavedRecording()
    await startRecording()
  }

  const togglePlayback = async () => {
    if (!candidate) return
    if (playing) {
      await services.pausePlayback()
      setPlaying(false)
    } else {
      await services.playUri(candidate.uri)
      setPlaying(true)
    }
  }

  const saveVoice = async (withText: boolean) => {
    if (!candidate) return
    setStep('saving')
    setError(null)
    try {
      const result = await services.saveVoiceMemory({
        promptSnapshot,
        reviewedTranscript: withText ? candidate.reviewText : '',
        now: candidate.saveNow,
        validatedMedia: candidate.validated,
        operation: candidate.operation,
      })
      if (result.kind === 'saved') {
        services.clearUnsavedRecording()
        setCandidate(null)
        setStep('saved')
        void services.stopPlayback()
        return
      }
      if (result.kind === 'indeterminate') {
        setError("The save status is uncertain. We won't retry it as a new memory.")
        setStep('indeterminate')
        onStorageBlocked()
        return
      }
      if (result.kind === 'not-saved') {
        if (result.conflict) {
          setError('This save identity belongs to different content. Nothing was overwritten.')
          setStep('review')
          return
        }
        setCandidate((current) => (current ? { ...current, operation: result.retry } : current))
        services.putUnsavedRecording({
          audio: candidate.validated,
          reviewedText: candidate.reviewText,
          operation: result.retry,
          saveNow: candidate.saveNow,
        })
        setError(
          result.reason === 'low-storage'
            ? "There isn't enough free space. Your answer is still here to retry or discard."
            : "This answer wasn't saved. Please try again.",
        )
        setStep('review')
      }
    } catch (cause) {
      if (cause instanceof StorageGateError) {
        onStorageBlocked()
        return
      }
      setError('Something went wrong saving. Please try again.')
      setStep('review')
    }
  }

  const saveManual = async () => {
    setError(null)
    setStep('saving')
    try {
      const result = await services.saveManualMemory({
        promptSnapshot,
        reviewedTranscript: transcript,
        now: manualSaveNow.current ?? (manualSaveNow.current = new Date()),
        recordingWasAvailable: false,
        operation: manualOperation.current,
      })
      if (result.kind === 'saved') {
        manualOperation.current = undefined
        manualSaveNow.current = undefined
        setStep('saved')
        return
      }
      if (result.kind === 'invalid-transcript') {
        setError('Write something before saving.')
        setStep('manual')
        return
      }
      if (result.kind === 'recording-was-available') {
        setError('This answer needs voice capture to be unavailable first.')
        setStep('manual')
        return
      }
      if (result.kind === 'indeterminate') {
        setError("The save status is uncertain. We won't retry it as a new memory.")
        setStep('indeterminate')
        onStorageBlocked()
        return
      }
      if (result.kind === 'not-saved') {
        if (result.conflict) {
          setError('This save identity belongs to different content. Nothing was overwritten.')
          setStep('manual')
          return
        }
        manualOperation.current = result.retry
        setError(
          result.reason === 'low-storage'
            ? "There isn't enough free space. Please try again when space is available."
            : "This answer wasn't saved. Please try again.",
        )
        setStep('manual')
        return
      }
      setError("This answer wasn't saved. Please try again.")
      setStep('manual')
    } catch (cause) {
      if (cause instanceof StorageGateError) {
        onStorageBlocked()
        return
      }
      setError('Something went wrong saving. Please try again.')
      setStep('manual')
    }
  }

  const finish = () => {
    finalizeLock.current = false
    void services.cancelTranscription()
    setTranscript('')
    manualOperation.current = undefined
    manualSaveNow.current = undefined
    setCandidate(null)
    setPlaying(false)
    setTranscribing(false)
    setError(null)
    setRetryNote(null)
    setStep('idle')
    onSaved()
  }

  if (step === 'idle') {
    return (
      <View style={styles.section}>
        <Text style={[styles.stepTitle, { color: theme.text }]}>Capture the answer</Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          Record their voice, or save their words in writing when recording is
          unavailable on this phone.
        </Text>
        {interruptionNotice ? (
          <Text accessibilityLiveRegion="polite" style={[styles.retryNote, { color: theme.text }]}>
            The recording was interrupted and wasn't saved. You can try again.
          </Text>
        ) : null}
        <View style={styles.action}>
          <ActionButton label="Record their voice" onPress={begin} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'explain' || step === 'requesting') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          A quick check first
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          Before They Grow asks for the microphone only when you choose to
          record, and your answer stays on this phone. Nothing is uploaded.
        </Text>
        {step === 'requesting' ? (
          <View accessibilityLabel="Requesting microphone access" accessibilityRole="progressbar" style={styles.requestingRow}>
            <ActivityIndicator color={theme.primary} size="small" />
            <Text style={[styles.requestingText, { color: theme.muted }]}>
              Asking for microphone access…
            </Text>
          </View>
        ) : (
          <View style={styles.action}>
            <ActionButton label="Continue" onPress={() => void requestPermission()} theme={theme} />
            <ActionButton label="Not now" variant="secondary" onPress={cancel} theme={theme} />
          </View>
        )}
      </View>
    )
  }

  if (step === 'recording') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          Recording
        </Text>
        <Text style={[styles.clock, { color: theme.primary }]} accessibilityLiveRegion="polite">
          {formatClock(elapsedMs)}
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          Recorded {formatClock(elapsedMs)} · {formatClock(MAX_CAPTURE_DURATION_MS - elapsedMs)} remaining
        </Text>
        <View style={styles.action}>
          <ActionButton label="Finish recording" onPress={() => void finalize()} theme={theme} />
          <ActionButton label="Cancel" variant="secondary" onPress={cancel} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'finalizing' || step === 'saving') {
    return (
      <View style={styles.section}>
        <View accessibilityLabel={step === 'finalizing' ? 'Checking the recording' : 'Saving'} accessibilityRole="progressbar" style={styles.requestingRow}>
          <ActivityIndicator color={theme.primary} size="small" />
          <Text style={[styles.requestingText, { color: theme.muted }]}>
            {step === 'finalizing' ? 'Checking the recording…' : 'Saving…'}
          </Text>
        </View>
      </View>
    )
  }

  if (step === 'indeterminate') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>Save status is uncertain</Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          The phone may have committed this memory. We will not retry it as a new memory. Check the family space again after storage reconciliation.
        </Text>
        <View style={styles.action}>
          <ActionButton label="Check save status" onPress={onStorageBlocked} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'invalid') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          This recording can't be saved
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          The audio was empty, too long, too large, or couldn't be read, so it
          was not saved. Nothing on this phone was changed.
        </Text>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>{error}</Text>
        ) : null}
        <View style={styles.action}>
          <ActionButton label="Record again" onPress={() => void recordAgain()} theme={theme} />
          <ActionButton label="Discard" variant="secondary" onPress={discard} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'review' && candidate) {
    const canSaveWithWords = candidate.reviewText.trim().length > 0
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          Review the answer
        </Text>
        <View style={styles.playRow}>
          <ActionButton label={playing ? 'Pause' : 'Play'} variant="secondary" onPress={() => void togglePlayback()} theme={theme} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Their words (optional)</Text>
            {transcribing ? (
              <Text style={[styles.transcribingHint, { color: theme.muted }]}>Transcribing on this device…</Text>
            ) : null}
            <TextInput
              accessibilityLabel="Their words (optional)"
              multiline
              maxLength={2000}
              onChangeText={(reviewText) => setCandidate((current) => (current ? { ...current, reviewText } : current))}
              placeholder="Correct or add the words…"
              placeholderTextColor={theme.muted}
              style={[styles.transcriptInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
              value={candidate.reviewText}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        {retryNote ? (
          <Text accessibilityLiveRegion="polite" style={[styles.retryNote, { color: theme.text }]}>{retryNote}</Text>
        ) : null}
        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>{error}</Text>
        ) : null}

        <View style={styles.action}>
          <ActionButton
            label={canSaveWithWords ? 'Save voice and words' : 'Save voice'}
            onPress={() => void saveVoice(canSaveWithWords)}
            theme={theme}
          />
          <ActionButton label="Record again" variant="secondary" onPress={() => void recordAgain()} theme={theme} />
          <ActionButton label="Discard" variant="secondary" onPress={discard} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'saved') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={[styles.stepTitle, { color: theme.text }]}>
          Saved
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          The answer is kept on this phone and now appears in the memories list.
        </Text>
        <View style={styles.action}>
          <ActionButton label="Done" onPress={finish} theme={theme} />
        </View>
      </View>
    )
  }

  const canSaveManual = transcript.trim().length > 0

  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
        No voice was captured
      </Text>
      <Text style={[styles.stepBody, { color: theme.muted }]}>
        The microphone wasn't available, so nothing was recorded. You can save
        their answer as written words instead.
      </Text>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.textScroll}>
          <Text style={[styles.fieldLabel, { color: theme.text }]}>Their answer in writing</Text>
          <TextInput
            accessibilityLabel="Their answer in writing"
            multiline
            maxLength={2000}
            onChangeText={setTranscript}
            placeholder="Type what they said…"
            placeholderTextColor={theme.muted}
            style={[styles.transcriptInput, { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text }]}
            value={transcript}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>{error}</Text>
      ) : null}

      <View style={styles.action}>
        <ActionButton label="Save transcript" disabled={!canSaveManual} onPress={() => void saveManual()} theme={theme} />
        <ActionButton label="Not now" variant="secondary" onPress={cancel} theme={theme} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { marginTop: 28 },
  stepTitle: { fontSize: 22, fontWeight: '700', letterSpacing: -0.5 },
  stepBody: { fontSize: 16, lineHeight: 24, marginTop: 8 },
  clock: { fontSize: 44, fontWeight: '800', letterSpacing: -1, marginTop: 18 },
  action: { gap: 12, marginTop: 20 },
  playRow: { marginTop: 18 },
  requestingRow: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 22 },
  requestingText: { fontSize: 15 },
  fieldLabel: { fontSize: 15, fontWeight: '700', marginBottom: 10, marginTop: 22 },
  textScroll: { maxHeight: 220 },
  transcriptInput: {
    borderColor: '#D8D0C4',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 17,
    lineHeight: 24,
    minHeight: 140,
    paddingHorizontal: 14,
    paddingVertical: 12,
    textAlignVertical: 'top',
  },
  errorText: { fontSize: 15, fontWeight: '600', marginTop: 14 },
  retryNote: { fontSize: 15, lineHeight: 22, marginTop: 14, fontWeight: '600' },
  transcribingHint: { fontSize: 13, marginBottom: 8 },
})
