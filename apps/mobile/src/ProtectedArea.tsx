import { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  StorageGateError,
  type ProtectedHomeState,
  type StorageBlockReason,
} from '@before-they-grow/application'
import { AGE_BANDS, type AgeBand } from '@before-they-grow/domain'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import type { ProtectedAreaServices } from './services'
import { ActionButton } from './components/ActionButton'
import { CaptureFlow } from './CaptureFlow'
import { TimelineScreen } from './TimelineScreen'
import { darkTheme, useTheme, type Theme } from './theme'

const AGE_BAND_CHOICES: ReadonlyArray<{ value: AgeBand; label: string }> = AGE_BANDS.map(
  (value) => ({
    value,
    label: value.split('-').join(' to '),
  }),
)

const AGE_BAND_LABELS: Record<AgeBand, string> = {
  '3-5': 'Ages 3–5',
  '6-8': 'Ages 6–8',
  '9-12': 'Ages 9–12',
}

const BLOCKED_COPY: Record<StorageBlockReason, string> = {
  'version-unsafe': 'This phone has a storage version we cannot open safely.',
  'integrity-failed': 'Your saved data could not be verified.',
  'root-unsafe': 'The private storage area could not be reached.',
  'backup-control-failed':
    'We could not confirm your memories stay out of cloud backup.',
}

type BootState =
  | { kind: 'loading' }
  | ProtectedHomeState
  | { kind: 'failed' }

type OnboardingError = 'invalid-nickname' | 'unexpected' | null

export function ProtectedArea({ services }: { services: ProtectedAreaServices }) {
  const [boot, setBoot] = useState<BootState>({ kind: 'loading' })
  const [reloading, setReloading] = useState(false)

  const reload = async () => {
    setReloading(true)
    setBoot({ kind: 'loading' })
    try {
      setBoot(await services.bootstrap())
    } catch {
      setBoot({ kind: 'failed' })
    } finally {
      setReloading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    void services
      .bootstrap()
      .then((state) => {
        if (!cancelled) setBoot(state)
      })
      .catch(() => {
        // A non-gate failure (for example a catalog that could not be
        // opened) must surface as a blocked state, never a stuck spinner.
        if (!cancelled) setBoot({ kind: 'failed' })
      })
    return () => {
      cancelled = true
    }
  }, [services])

  if (boot.kind === 'loading') return <LoadingScreen />
  if (boot.kind === 'failed') {
    return <BlockedScreen reason="integrity-failed" onRetry={() => void reload()} />
  }
  if (boot.kind === 'storage-blocked') {
    return (
      <BlockedScreen
        reason={boot.reason}
        onRetry={() => void reload()}
        retrying={reloading}
      />
    )
  }
  if (boot.kind === 'needs-onboarding') {
    return (
      <OnboardingScreen
        services={services}
        onCompleted={() => void reload()}
      />
    )
  }
  return (
    <HomeShell
      services={services}
      profile={boot.profile}
      prompt={boot.prompt}
      onStorageBlocked={() => void reload()}
    />
  )
}

function HomeShell({
  services,
  profile,
  prompt,
  onStorageBlocked,
}: {
  services: ProtectedAreaServices
  profile: { childNickname: string; ageBand: AgeBand }
  prompt: { id: string; question: string; followUp: string; ageBand: AgeBand }
  onStorageBlocked: () => void
}) {
  const theme = useTheme()
  const [screen, setScreen] = useState<'tonight' | 'memories'>('tonight')
  const [memories, setMemories] = useState<MemoryEntryV1[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [playingId, setPlayingId] = useState<string | null>(null)

  useEffect(() => {
    const unsubscribe = services.onPlaybackEnded(() => setPlayingId(null))
    return () => {
      unsubscribe()
      void services.stopPlayback()
    }
  }, [services])

  const togglePlay = async (memory: MemoryEntryV1) => {
    if (!memory.media) return
    if (playingId === memory.id) {
      await services.pausePlayback()
      setPlayingId(null)
      return
    }
    await services.playMemory(memory.media.relativePath)
    setPlayingId(memory.id)
  }

  const refreshTimeline = () => {
    void services
      .loadMemoryTimeline()
      .then((loaded) => {
        setMemories(loaded)
        setLoadFailed(false)
      })
      .catch(() => {
        // A read failure is surfaced honestly as an error state with retry,
        // never as a false empty timeline and never as an unbounded reload
        // loop back into bootstrap.
        setLoadFailed(true)
      })
  }

  useEffect(() => {
    refreshTimeline()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services])

  if (screen === 'memories') {
    return (
      <TimelineScreen
        memories={memories}
        childNickname={profile.childNickname}
        playingId={playingId}
        onTogglePlay={(memory) => void togglePlay(memory)}
        onBack={() => setScreen('tonight')}
        onAnswerTonight={() => setScreen('tonight')}
        onRetry={() => refreshTimeline()}
        loadFailed={loadFailed}
        theme={theme}
      />
    )
  }

  return (
    <TonightScreen
      childNickname={profile.childNickname}
      ageBand={profile.ageBand}
      prompt={prompt}
      memoriesCount={memories.length}
      theme={theme}
      services={services}
      onOpenTimeline={() => setScreen('memories')}
      onSaved={() => refreshTimeline()}
      onStorageBlocked={onStorageBlocked}
    />
  )
}

function LoadingScreen() {
  const theme = useTheme()
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <View
        accessibilityLabel="Opening your family space"
        accessibilityRole="progressbar"
        style={styles.center}
      >
        <ActivityIndicator color={theme.primary} size="small" />
      </View>
    </SafeAreaView>
  )
}

function BlockedScreen({
  reason,
  onRetry,
  retrying = false,
}: {
  reason: 'version-unsafe' | 'integrity-failed' | 'root-unsafe' | 'backup-control-failed'
  onRetry: () => void
  retrying?: boolean
}) {
  const theme = useTheme()
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.screenWidth}>
          <Text accessibilityRole="header" style={[styles.blockedTitle, { color: theme.text }]}>
            Family storage is unavailable
          </Text>
          <Text style={[styles.blockedMessage, { color: theme.muted }]}>
            {BLOCKED_COPY[reason]}{' '}
            Nothing new can be saved right now, and no existing memories have been changed.
          </Text>
          <View style={styles.actions}>
            <ActionButton label="Check again" onPress={onRetry} disabled={retrying} theme={theme} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

type OnboardingDraft = {
  nickname: string
  ageBand: AgeBand | ''
  adultConfirmed: boolean
  recordingConfirmed: boolean
}

function OnboardingScreen({
  services,
  onCompleted,
}: {
  services: ProtectedAreaServices
  onCompleted: () => void
}) {
  const theme = useTheme()
  const [draft, setDraft] = useState<OnboardingDraft>({
    nickname: '',
    ageBand: '',
    adultConfirmed: false,
    recordingConfirmed: false,
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<OnboardingError>(null)

  const nicknameValid = draft.nickname.trim().length > 0
  const canSubmit =
    !submitting
    && nicknameValid
    && draft.ageBand !== ''
    && draft.adultConfirmed
    && draft.recordingConfirmed

  const submit = async () => {
    setError(null)
    if (draft.ageBand === '') return
    setSubmitting(true)
    try {
      const result = await services.createProfile({
        childNickname: draft.nickname,
        ageBand: draft.ageBand,
        adultConfirmation: draft.adultConfirmed,
        recordingPermissionConfirmed: draft.recordingConfirmed,
      })
      if (result.kind === 'invalid-nickname') {
        setError('invalid-nickname')
        return
      }
      if (result.kind === 'created') {
        onCompleted()
        return
      }
      setError('unexpected')
    } catch (cause) {
      if (cause instanceof StorageGateError) {
        onCompleted() // a reload surfaces the storage-blocked state truthfully
        return
      }
      setError('unexpected')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          alwaysBounceVertical={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scroll}
        >
          <View style={styles.screenWidth}>
            <Text accessibilityRole="header" style={[styles.onboardingTitle, { color: theme.text }]}>
              Set up your family space
            </Text>
            <Text style={[styles.onboardingIntro, { color: theme.muted }]}>
              One child, one quiet question each day, kept only on this phone.
            </Text>

            <View style={styles.fieldGroup}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Child first name or nickname</Text>
              <TextInput
                accessibilityLabel="Child first name or nickname"
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={40}
                onChangeText={(nickname) => setDraft((draft) => ({ ...draft, nickname }))}
                placeholder="e.g. Mila"
                placeholderTextColor={theme.muted}
                style={[
                  styles.input,
                  { backgroundColor: theme.surface, borderColor: theme.border, color: theme.text },
                ]}
                value={draft.nickname}
              />
            </View>

            <View style={styles.fieldGroup} accessibilityRole="radiogroup" accessibilityLabel="Their age band">
              <Text style={[styles.fieldLabel, { color: theme.text }]}>Their age band</Text>
              {AGE_BAND_CHOICES.map((choice) => {
                const selected = draft.ageBand === choice.value
                return (
                  <Pressable
                    key={choice.value}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={`${choice.label} years`}
                    onPress={() => setDraft((draft) => ({ ...draft, ageBand: choice.value }))}
                    style={({ pressed }) => [
                      styles.choice,
                      { backgroundColor: theme.surface, borderColor: selected ? theme.primary : theme.border },
                      pressed ? styles.choicePressed : null,
                    ]}
                  >
                    <View
                      style={[
                        styles.radio,
                        { borderColor: selected ? theme.primary : theme.border },
                      ]}
                    >
                      {selected ? <View style={[styles.radioDot, { backgroundColor: theme.primary }]} /> : null}
                    </View>
                    <Text style={[styles.choiceLabel, { color: theme.text }]}>
                      {choice.label}
                    </Text>
                  </Pressable>
                )
              })}
            </View>

            <ConsentToggle
              label="I am an adult"
              hint="Confirm you are the parent or guardian setting up this space."
              checked={draft.adultConfirmed}
              onToggle={() => setDraft((draft) => ({ ...draft, adultConfirmed: !draft.adultConfirmed }))}
              theme={theme}
            />
            <ConsentToggle
              label="I have permission to record"
              hint="You will be asked before every recording."
              checked={draft.recordingConfirmed}
              onToggle={() => setDraft((draft) => ({ ...draft, recordingConfirmed: !draft.recordingConfirmed }))}
              theme={theme}
            />

            {error ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.errorText, { color: theme.primary }]}
              >
                {error === 'invalid-nickname'
                  ? 'Keep the nickname between 1 and 40 characters.'
                  : 'Something went wrong. Please try again.'}
              </Text>
            ) : null}

            <View style={styles.actions}>
              <ActionButton
                label="Start tonight's question"
                onPress={() => void submit()}
                disabled={!canSubmit}
                theme={theme}
              />
            </View>

            <View style={[styles.localOnlyNote, { borderTopColor: theme.border }]}>
              <Text style={[styles.localOnlyText, { color: theme.muted }]}>
                Memories are stored only on this phone and are not backed up by Apple, Google, or
                Before They Grow. There is no cloud account.
              </Text>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function ConsentToggle({
  label,
  hint,
  checked,
  onToggle,
  theme,
}: {
  label: string
  hint: string
  checked: boolean
  onToggle: () => void
  theme: Theme
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked }}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.consent,
        { backgroundColor: theme.surface, borderColor: checked ? theme.primary : theme.border },
        pressed ? styles.choicePressed : null,
      ]}
    >
      <View style={[styles.checkbox, { borderColor: checked ? theme.primary : theme.border }]}>
        {checked ? <View style={[styles.checkboxDot, { backgroundColor: theme.primary }]} /> : null}
      </View>
      <View style={styles.consentText}>
        <Text style={[styles.consentLabel, { color: theme.text }]}>{label}</Text>
        <Text style={[styles.consentHint, { color: theme.muted }]}>{hint}</Text>
      </View>
    </Pressable>
  )
}

function TonightScreen({
  childNickname,
  ageBand,
  prompt,
  memoriesCount,
  theme,
  services,
  onOpenTimeline,
  onSaved,
  onStorageBlocked,
}: {
  childNickname: string
  ageBand: AgeBand
  prompt: { id: string; question: string; followUp: string; ageBand: AgeBand }
  memoriesCount: number
  theme: Theme
  services: ProtectedAreaServices
  onOpenTimeline: () => void
  onSaved: () => void
  onStorageBlocked: () => void
}) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.screenWidth}>
          <View style={styles.eyebrowRow}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>
              Tonight's question
            </Text>
            <View style={[styles.ageChip, { backgroundColor: theme.quietAccent }]}>
              <Text style={[styles.ageChipText, { color: theme.text }]}>{AGE_BAND_LABELS[ageBand]}</Text>
            </View>
          </View>
          <Text accessibilityRole="header" style={[styles.question, { color: theme.text }]}>
            {prompt.question}
          </Text>
          <View style={[styles.followUpCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.followUpLabel, { color: theme.muted }]}>A little more</Text>
            <Text style={[styles.followUp, { color: theme.text }]}>{prompt.followUp}</Text>
          </View>
          <Text style={[styles.homeNote, { color: theme.muted }]}>
            A calm minute with {childNickname}. Everything you save stays on this phone.
          </Text>

          <CaptureFlow
            promptSnapshot={{
              promptId: prompt.id,
              question: prompt.question,
              followUp: prompt.followUp,
              ageBand,
            }}
            theme={theme}
            services={services}
            onSaved={onSaved}
            onStorageBlocked={onStorageBlocked}
          />

          <View style={styles.actions}>
            <ActionButton
              label={
                memoriesCount === 0
                  ? 'View memories'
                  : `View ${memoriesCount} ${memoriesCount === 1 ? 'memory' : 'memories'}`
              }
              variant="secondary"
              onPress={onOpenTimeline}
              theme={theme}
            />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20 },
  screenWidth: { alignSelf: 'center', maxWidth: 560, width: '100%' },
  onboardingTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -1, lineHeight: 40 },
  onboardingIntro: { fontSize: 17, lineHeight: 25, marginTop: 10 },
  fieldGroup: { marginTop: 26 },
  fieldLabel: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  input: {
    borderColor: '#D8D0C4',
    borderRadius: 12,
    borderWidth: 1,
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 16,
  },
  choice: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 52,
    paddingHorizontal: 14,
    marginBottom: 10,
  },
  choicePressed: { opacity: 0.72 },
  choiceLabel: { fontSize: 17, fontWeight: '600' },
  radio: {
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    justifyContent: 'center',
    width: 20,
  },
  radioDot: { borderRadius: 5, height: 10, width: 10 },
  consent: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    minHeight: 58,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  checkbox: {
    alignItems: 'center',
    borderRadius: 6,
    borderWidth: 2,
    height: 24,
    justifyContent: 'center',
    width: 24,
  },
  checkboxDot: { borderRadius: 3, height: 12, width: 12 },
  consentText: { flex: 1 },
  consentLabel: { fontSize: 16, fontWeight: '700' },
  consentHint: { fontSize: 13, lineHeight: 18, marginTop: 2 },
  errorText: { fontSize: 15, fontWeight: '600', marginTop: 16 },
  actions: { marginTop: 24 },
  localOnlyNote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 28,
    paddingTop: 18,
  },
  localOnlyText: { fontSize: 13, lineHeight: 19 },
  blockedTitle: { fontSize: 34, fontWeight: '700', letterSpacing: -1, lineHeight: 40, marginTop: 40 },
  blockedMessage: { fontSize: 17, lineHeight: 25, marginTop: 14 },
  eyebrowRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  eyebrow: { fontSize: 15, fontWeight: '800', letterSpacing: 0.4, textTransform: 'uppercase' },
  ageChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  ageChipText: { fontSize: 13, fontWeight: '700' },
  question: { fontSize: 36, fontWeight: '700', letterSpacing: -1.2, lineHeight: 43, marginTop: 18 },
  followUpCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 26,
    padding: 18,
  },
  followUpLabel: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase' },
  followUp: { fontSize: 19, lineHeight: 27, marginTop: 8 },
  homeNote: { fontSize: 14, lineHeight: 21, marginTop: 24 },
})