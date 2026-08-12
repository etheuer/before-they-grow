import { useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import type { UnavailableReason } from '@before-they-grow/application'
import type { MemoryEntryV1 } from '@before-they-grow/contracts'
import { ActionButton } from './components/ActionButton'
import { formatDisplayDate } from './format'
import type { Theme } from './theme'

function memoryLabel(memory: MemoryEntryV1): string {
  const spoken = memory.reviewedTranscript.trim()
  return spoken.length > 0 ? spoken : memory.promptSnapshot.question
}

function MemoryRow({
  memory,
  playing,
  unavailableReason,
  onTogglePlay,
  onHardDelete,
  theme,
}: {
  memory: MemoryEntryV1
  playing: boolean
  unavailableReason?: UnavailableReason
  onTogglePlay: () => void
  onHardDelete: () => void
  theme: Theme
}) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const unavailable = unavailableReason !== undefined
  return (
    <View
      accessibilityLabel={
        unavailable
          ? `${formatDisplayDate(memory.localDate)}, ${memory.promptSnapshot.question}: unavailable memory`
          : memory.media
            ? `${formatDisplayDate(memory.localDate)}, ${memory.promptSnapshot.question}: a voice memory${
                memory.reviewedTranscript ? `: ${memory.reviewedTranscript}` : ''
              }`
            : `${formatDisplayDate(memory.localDate)}, ${memory.promptSnapshot.question}: ${memory.reviewedTranscript}`
      }
      style={[styles.memoryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <View style={styles.memoryTop}>
        <Text style={[styles.memoryDate, { color: theme.primary }]}>
          {formatDisplayDate(memory.localDate)}
        </Text>
        {memory.media && !unavailable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause this memory' : 'Play this memory'}
            onPress={onTogglePlay}
            style={({ pressed }) => [
              styles.playButton,
              { backgroundColor: theme.quietAccent },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.playLabel, { color: theme.text }]}>{playing ? '❚❚' : '▶'}</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={[styles.memoryQuestion, { color: theme.muted }]}>
        {memory.promptSnapshot.question}
      </Text>
      {unavailable ? (
        <Text style={[styles.memoryText, { color: theme.text }]}>
          This memory is unavailable. The voice recording is missing or damaged.
        </Text>
      ) : memory.media && memory.reviewedTranscript.length === 0 ? (
        <Text style={[styles.memoryText, { color: theme.text }]}>Voice memory</Text>
      ) : (
        <Text style={[styles.memoryText, { color: theme.text }]}>
          “{memory.reviewedTranscript}”
        </Text>
      )}
      <View style={styles.deleteAction}>
        {confirmingDelete ? (
          <>
            <Text style={[styles.confirmCopy, { color: theme.text }]}>
              Hard local deletion of “{memoryLabel(memory)}” from{' '}
              {formatDisplayDate(memory.localDate)}. This permanently removes it from this
              phone. It cannot be undone or recovered. This is not forensic erasure of the
              device storage.
            </Text>
            <ActionButton
              label="Delete permanently"
              onPress={onHardDelete}
              theme={theme}
            />
            <View style={styles.confirmSpacer}>
              <ActionButton
                label="Keep this memory"
                variant="secondary"
                onPress={() => setConfirmingDelete(false)}
                theme={theme}
              />
            </View>
          </>
        ) : (
          <ActionButton
            label="Remove this memory"
            variant="secondary"
            onPress={() => setConfirmingDelete(true)}
            theme={theme}
          />
        )}
      </View>
    </View>
  )
}

export function TimelineScreen({
  memories,
  childNickname,
  playingId,
  unavailable,
  onTogglePlay,
  onHardDelete,
  onDeleteAll,
  onBack,
  onAnswerTonight,
  onRetry,
  loadFailed,
  theme,
}: {
  memories: MemoryEntryV1[]
  childNickname: string
  playingId: string | null
  unavailable: Record<string, UnavailableReason>
  onTogglePlay: (memory: MemoryEntryV1) => void
  onHardDelete: (memory: MemoryEntryV1) => void
  onDeleteAll: () => void
  onBack: () => void
  onAnswerTonight: () => void
  onRetry: () => void
  loadFailed: boolean
  theme: Theme
}) {
  const [deleteAllStep, setDeleteAllStep] = useState<0 | 1 | 2>(0)
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.scroll}
      >
        <View style={styles.screenWidth}>
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back to tonight's question"
              onPress={onBack}
              style={({ pressed }) => [
                styles.backButton,
                { backgroundColor: theme.surface, borderColor: theme.border },
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={[styles.backLabel, { color: theme.text }]}>‹ Tonight</Text>
            </Pressable>
          </View>

          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            {childNickname}'s memories
          </Text>
          <Text style={[styles.subtitle, { color: theme.muted }]}>
            Saved newest first, kept only on this phone.
          </Text>

          {loadFailed ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text accessibilityRole="header" style={[styles.emptyTitle, { color: theme.text }]}>
                Couldn't load your memories
              </Text>
              <Text style={[styles.emptyBody, { color: theme.muted }]}>
                Reading saved memories failed this time. Nothing was changed on this phone.
              </Text>
              <View style={styles.emptyAction}>
                <ActionButton label="Try again" onPress={onRetry} theme={theme} />
              </View>
            </View>
          ) : memories.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Text accessibilityRole="header" style={[styles.emptyTitle, { color: theme.text }]}>
                No memories yet
              </Text>
              <Text style={[styles.emptyBody, { color: theme.muted }]}>
                Tonight's question is waiting. When a memory is saved it appears here.
              </Text>
              <View style={styles.emptyAction}>
                <ActionButton label="Answer tonight's question" onPress={onAnswerTonight} theme={theme} />
              </View>
            </View>
          ) : (
            <View style={styles.list}>
              {memories.map((memory) => (
                <MemoryRow
                  key={memory.id}
                  memory={memory}
                  playing={playingId === memory.id}
                  unavailableReason={unavailable[memory.id]}
                  onTogglePlay={() => onTogglePlay(memory)}
                  onHardDelete={() => onHardDelete(memory)}
                  theme={theme}
                />
              ))}
            </View>
          )}

          <View style={[styles.dangerCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.emptyTitle, { color: theme.text }]}>
              Hard local deletion
            </Text>
            {deleteAllStep === 0 ? (
              <>
                <Text style={[styles.emptyBody, { color: theme.muted }]}>
                  Permanently remove {childNickname}'s profile, every transcript, and every
                  recording from this phone. This cannot be undone or recovered.
                </Text>
                <View style={styles.emptyAction}>
                  <ActionButton
                    label="Delete everything"
                    variant="secondary"
                    onPress={() => setDeleteAllStep(1)}
                    theme={theme}
                  />
                </View>
              </>
            ) : deleteAllStep === 1 ? (
              <>
                <Text style={[styles.emptyBody, { color: theme.text }]}>
                  This Hard local deletion permanently removes {childNickname}'s profile, every
                  transcript, and every recording from this phone. They are not in the cloud and
                  cannot be recovered. This is not forensic erasure of the device storage.
                </Text>
                <View style={styles.emptyAction}>
                  <ActionButton
                    label="I understand — continue"
                    onPress={() => setDeleteAllStep(2)}
                    theme={theme}
                  />
                </View>
                <View style={styles.confirmSpacer}>
                  <ActionButton
                    label="Keep family content"
                    variant="secondary"
                    onPress={() => setDeleteAllStep(0)}
                    theme={theme}
                  />
                </View>
              </>
            ) : (
              <>
                <Text style={[styles.emptyBody, { color: theme.text }]}>
                  Last chance. {childNickname}'s profile, transcripts, and recordings will be
                  permanently removed from this phone only.
                </Text>
                <View style={styles.emptyAction}>
                  <ActionButton
                    label="Yes, delete everything"
                    onPress={onDeleteAll}
                    theme={theme}
                  />
                </View>
                <View style={styles.confirmSpacer}>
                  <ActionButton
                    label="Keep family content"
                    variant="secondary"
                    onPress={() => setDeleteAllStep(0)}
                    theme={theme}
                  />
                </View>
              </>
            )}
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingVertical: 20 },
  screenWidth: { alignSelf: 'center', maxWidth: 560, width: '100%' },
  headerRow: { alignItems: 'flex-start' },
  backButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    minHeight: 40,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  backLabel: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -1, lineHeight: 38, marginTop: 18 },
  subtitle: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  list: { gap: 14, marginTop: 22 },
  memoryTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  playButton: {
    alignItems: 'center',
    borderRadius: 999,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  playLabel: { fontSize: 14, fontWeight: '800' },
  memoryCard: { borderRadius: 16, borderWidth: 1, padding: 16 },
  memoryDate: { fontSize: 13, fontWeight: '800', textTransform: 'uppercase' },
  memoryQuestion: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  memoryText: { fontSize: 19, lineHeight: 27, marginTop: 10 },
  emptyCard: { borderRadius: 16, borderWidth: 1, marginTop: 24, padding: 20 },
  emptyTitle: { fontSize: 20, fontWeight: '700' },
  emptyBody: { fontSize: 15, lineHeight: 22, marginTop: 8 },
  emptyAction: { marginTop: 20 },
  deleteAction: { marginTop: 16 },
  confirmCopy: { fontSize: 15, lineHeight: 22, marginBottom: 14 },
  confirmSpacer: { marginTop: 10 },
  dangerCard: { borderRadius: 16, borderWidth: 1, marginTop: 28, padding: 20 },
})