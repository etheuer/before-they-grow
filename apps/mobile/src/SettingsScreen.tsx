import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { LOCAL_LOSS_DETAIL, LOCAL_LOSS_SUMMARY, PRIVACY_BODY, TERMS_BODY } from './copy'
import type { Theme } from './theme'

export function SettingsScreen({
  childNickname,
  onBack,
  theme,
}: {
  childNickname: string
  onBack: () => void
  theme: Theme
}) {
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <ScrollView alwaysBounceVertical={false} contentContainerStyle={styles.scroll}>
        <View style={styles.screenWidth}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to tonight's question"
            accessibilityHint="Returns to tonight's question"
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              { backgroundColor: theme.surface, borderColor: theme.border },
              pressed ? styles.pressed : null,
            ]}
          >
            <Text style={[styles.backLabel, { color: theme.text }]}>‹ Tonight</Text>
          </Pressable>

          <Text accessibilityRole="header" style={[styles.title, { color: theme.text }]}>
            Settings
          </Text>
          <Text style={[styles.intro, { color: theme.muted }]}>
            How {childNickname}'s memories are kept on this phone.
          </Text>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>
              Local-only memory
            </Text>
            <Text style={[styles.body, { color: theme.text }]}>{LOCAL_LOSS_SUMMARY}</Text>
            <Text style={[styles.body, { color: theme.muted }]}>{LOCAL_LOSS_DETAIL}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>
              Privacy
            </Text>
            <Text style={[styles.body, { color: theme.muted }]}>{PRIVACY_BODY}</Text>
          </View>

          <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text accessibilityRole="header" style={[styles.cardTitle, { color: theme.text }]}>
              Terms
            </Text>
            <Text style={[styles.body, { color: theme.muted }]}>{TERMS_BODY}</Text>
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
  backButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    minWidth: 44,
    paddingHorizontal: 14,
  },
  backLabel: { fontSize: 15, fontWeight: '700' },
  pressed: { opacity: 0.7 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -1, lineHeight: 38, marginTop: 18 },
  intro: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  card: { borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 18 },
  cardTitle: { fontSize: 20, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22, marginTop: 8 },
})
