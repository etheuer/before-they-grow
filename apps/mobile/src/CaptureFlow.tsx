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
import { StorageGateError, type ValidatedAudio } from '@before-they-grow/application'
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
  | 'saved'

export type CaptureFlowProps = {
  promptSnapshot: PromptSnapshotV1
  theme: Theme
  services: ProtectedAreaServices
  onSaved: () => void
  /** Called when a storage gate is hit; the parent surfaces the blocked state. */
  onStorageBlocked: () => void
}

function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/**
 * The production-shaped voice capture flow. Microphone permission is
 * requested only after the parent chooses to record and sees the purpose
 * explained at that decision point. When capture is unavailable the Manual
 * transcript path is exposed with an honest "no voice was captured" statement;
 * otherwise the flow records, finalizes, validates, reviews (playback +
 * optional parent text), and saves audio-only or audio-plus-text.
 */
export function CaptureFlow({
  promptSnapshot,
  theme,
  services,
  onSaved,
  onStorageBlocked,
}: CaptureFlowProps) {
  const [step, setStep] = useState<CaptureStep>('idle')
  const [transcript, setTranscript] = useState('')
  const [reviewText, setReviewText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [validated, setValidated] = useState<ValidatedAudio | null>(null)
  const [capturedUri, setCapturedUri] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const finalizeLock = useRef(false)

  const cancel = () => {
    finalizeLock.current = false
    setStep('idle')
    setTranscript('')
    setReviewText('')
    setError(null)
    setElapsedMs(0)
    setValidated(null)
    setCapturedUri(null)
    setPlaying(false)
    void services.stopPlayback()
  }

  const begin = () => setStep('explain')

  const requestPermission = async () => {
    setStep('requesting')
    setError(null)
    const state = await services.requestRecordingPermission()
    if (state === 'granted') {
      await startRecording()
    } else {
      setStep('manual')
    }
  }

  const startRecording = async () => {
    setError(null)
    setStep('recording')
    setElapsedMs(0)
    try {
      await services.startRecording()
    } catch {
      setStep('manual')
      setError('The microphone could not start. Save their answer in writing instead.')
    }
  }

  // Poll the recorder for the elapsed timer and to detect the automatic
  // five-minute stop.
  useEffect(() => {
    if (step !== 'recording') return
    const unsubscribe = services.subscribeRecording(() => {
      const status = services.recordingStatus()
      setElapsedMs(status.durationMs)
      if (!status.recording && status.durationMs > 0) {
        void finalize()
      }
    })
    const timer = setInterval(() => {
      const status = services.recordingStatus()
      setElapsedMs(status.durationMs)
      if (!status.recording && status.durationMs > 0) {
        void finalize()
      }
    }, 500)
    return () => {
      unsubscribe()
      clearInterval(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  const finalize = async () => {
    // The automatic five-minute stop and the Finish button can race; a lock
    // keeps finalization single-run so the recording is never finalized twice.
    if (finalizeLock.current) return
    finalizeLock.current = true
    setStep('finalizing')
    try {
      const captured = await services.stopRecording()
      const result = await services.validateCapturedAudio(captured)
      if (result.kind === 'valid') {
        setCapturedUri(captured.uri)
        setValidated(result.media)
        setReviewText('')
        setStep('review')
      } else {
        setCapturedUri(null)
        setValidated(null)
        setStep('invalid')
      }
    } catch {
      setStep('invalid')
    } finally {
      finalizeLock.current = false
    }
  }

  const recordAgain = async () => {
    void services.stopPlayback()
    setPlaying(false)
    setReviewText('')
    setValidated(null)
    setCapturedUri(null)
    await startRecording()
  }

  const togglePlayback = async () => {
    if (!capturedUri) return
    if (playing) {
      await services.pausePlayback()
      setPlaying(false)
    } else {
      await services.playUri(capturedUri)
      setPlaying(true)
    }
  }

  const saveVoice = async (withText: boolean) => {
    if (!validated) return
    setStep('saving')
    setError(null)
    try {
      const result = await services.saveVoiceMemory({
        promptSnapshot,
        reviewedTranscript: withText ? reviewText : '',
        now: new Date(),
        validatedMedia: validated,
      })
      if (result.kind === 'saved' || result.kind === 'duplicate') {
        setStep('saved')
        void services.stopPlayback()
        return
      }
      if (result.kind === 'invalid-audio') {
        setValidated(null)
        setStep('invalid')
        return
      }
      setError('Something went wrong saving. Please try again.')
      setStep('review')
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
        now: new Date(),
        recordingWasAvailable: false,
      })
      if (result.kind === 'saved' || result.kind === 'duplicate') {
        setStep('saved')
        return
      }
      if (result.kind === 'invalid-transcript') {
        setError('Write something before saving.')
        setStep('manual')
        return
      }
      setError('This answer needs voice capture to be unavailable first.')
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
    setTranscript('')
    setReviewText('')
    setValidated(null)
    setCapturedUri(null)
    setPlaying(false)
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
          <View
            accessibilityLabel="Requesting microphone access"
            accessibilityRole="progressbar"
            style={styles.requestingRow}
          >
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
          Recording stops automatically at five minutes.
        </Text>
        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>
            {error}
          </Text>
        ) : null}
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
        <View
          accessibilityLabel={step === 'finalizing' ? 'Checking the recording' : 'Saving'}
          accessibilityRole="progressbar"
          style={styles.requestingRow}
        >
          <ActivityIndicator color={theme.primary} size="small" />
          <Text style={[styles.requestingText, { color: theme.muted }]}>
            {step === 'finalizing' ? 'Checking the recording…' : 'Saving…'}
          </Text>
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
        <View style={styles.action}>
          <ActionButton label="Record again" onPress={() => void recordAgain()} theme={theme} />
          <ActionButton label="Discard" variant="secondary" onPress={cancel} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'review') {
    const canSaveWithWords = reviewText.trim().length > 0
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          Review the answer
        </Text>
        <View style={styles.playRow}>
          <ActionButton
            label={playing ? 'Pause' : 'Play'}
            variant="secondary"
            onPress={() => void togglePlayback()}
            theme={theme}
          />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={[styles.fieldLabel, { color: theme.text }]}>Their words (optional)</Text>
            <TextInput
              accessibilityLabel="Their words (optional)"
              multiline
              maxLength={2000}
              onChangeText={setReviewText}
              placeholder="Correct or add the words…"
              placeholderTextColor={theme.muted}
              style={[
                styles.transcriptInput,
                { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
              ]}
              value={reviewText}
            />
          </ScrollView>
        </KeyboardAvoidingView>

        {error ? (
          <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>
            {error}
          </Text>
        ) : null}

        <View style={styles.action}>
          <ActionButton
            label={canSaveWithWords ? 'Save voice and words' : 'Save voice'}
            onPress={() => void saveVoice(canSaveWithWords)}
            theme={theme}
          />
          <ActionButton label="Record again" variant="secondary" onPress={() => void recordAgain()} theme={theme} />
          <ActionButton label="Discard" variant="secondary" onPress={cancel} theme={theme} />
        </View>
      </View>
    )
  }

  if (step === 'saved') {
    return (
      <View style={styles.section}>
        <Text
          accessibilityRole="header"
          accessibilityLiveRegion="polite"
          style={[styles.stepTitle, { color: theme.text }]}
        >
          Saved
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          The answer is kept on this phone and now appears in the memories
          list.
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
            style={[
              styles.transcriptInput,
              { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
            ]}
            value={transcript}
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.errorText, { color: theme.primary }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.action}>
        <ActionButton
          label="Save transcript"
          disabled={!canSaveManual}
          onPress={() => void saveManual()}
          theme={theme}
        />
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
})