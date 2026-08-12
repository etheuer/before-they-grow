import { useState } from 'react'
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
  StorageGateError,
  type SaveManualMemoryResult,
} from '@before-they-grow/application'
import { ActionButton } from './components/ActionButton'
import type { Theme } from './theme'

type CaptureStep =
  | 'idle'
  | 'explain'
  | 'requesting'
  | 'ready'
  | 'manual'
  | 'saving'
  | 'saved'

export type CaptureFlowProps = {
  promptSnapshot: PromptSnapshotV1
  theme: Theme
  requestRecordingPermission: () => Promise<'granted' | 'denied' | 'unavailable'>
  saveManualMemory: (input: {
    promptSnapshot: PromptSnapshotV1
    reviewedTranscript: string
    now: Date
    recordingWasAvailable: boolean
  }) => Promise<SaveManualMemoryResult>
  onSaved: () => void
  /** Called when the save hit a storage gate; the parent surfaces the blocked state. */
  onStorageBlocked: () => void
}

/**
 * The record decision point. Microphone permission is requested only after
 * the parent chooses to record and the purpose is explained at that decision
 * point. When capture is unavailable or denied, Manual transcript entry
 * appears with an honest "no voice was captured" statement and a text-only
 * save that is enabled only for nonblank text; ordinary capture readiness
 * never exposes the text-only bypass.
 */
export function CaptureFlow({
  promptSnapshot,
  theme,
  requestRecordingPermission,
  saveManualMemory,
  onSaved,
  onStorageBlocked,
}: CaptureFlowProps) {
  const [step, setStep] = useState<CaptureStep>('idle')
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const cancel = () => {
    setStep('idle')
    setTranscript('')
    setError(null)
  }

  const begin = () => setStep('explain')

  const requestPermission = async () => {
    setStep('requesting')
    setError(null)
    const state = await requestRecordingPermission()
    if (state === 'granted') {
      setStep('ready')
    } else {
      setStep('manual')
    }
  }

  const save = async () => {
    setError(null)
    setStep('saving')
    try {
      const result = await saveManualMemory({
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
      // A storage-gate failure is surfaced by the parent as the blocked state.
      if (cause instanceof StorageGateError) {
        onStorageBlocked()
        return
      }
      setError('Something went wrong saving. Please try again.')
      setStep('manual')
    }
  }

  const finish = () => {
    setTranscript('')
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
            <ActionButton
              label="Not now"
              variant="secondary"
              onPress={cancel}
              theme={theme}
            />
          </View>
        )}
      </View>
    )
  }

  if (step === 'ready') {
    return (
      <View style={styles.section}>
        <Text accessibilityRole="header" style={[styles.stepTitle, { color: theme.text }]}>
          Microphone is ready
        </Text>
        <Text style={[styles.stepBody, { color: theme.muted }]}>
          Voice capture is being prepared for this update and arrives next.
          You can go back to tonight's question.
        </Text>
        <View style={styles.action}>
          <ActionButton label="Back to tonight's question" variant="secondary" onPress={cancel} theme={theme} />
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

  const canSave = transcript.trim().length > 0 && step !== 'saving'

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
          disabled={!canSave}
          onPress={() => void save()}
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
  action: { gap: 12, marginTop: 20 },
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