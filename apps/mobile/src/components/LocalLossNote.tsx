import { StyleSheet, Text, View } from 'react-native'
import { LOCAL_LOSS_DETAIL, LOCAL_LOSS_SUMMARY } from '../copy'
import type { Theme } from '../theme'

export function LocalLossNote({ theme, compact = false }: { theme: Theme; compact?: boolean }) {
  return (
    <View
      accessibilityRole="text"
      style={[styles.note, { borderTopColor: theme.border }]}
    >
      <Text style={[styles.summary, { color: theme.text }]}>{LOCAL_LOSS_SUMMARY}</Text>
      {compact ? null : (
        <Text style={[styles.detail, { color: theme.muted }]}>{LOCAL_LOSS_DETAIL}</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  note: { borderTopWidth: StyleSheet.hairlineWidth, marginTop: 20, paddingTop: 14 },
  summary: { fontSize: 14, fontWeight: '700', lineHeight: 20 },
  detail: { fontSize: 13, lineHeight: 19, marginTop: 6 },
})
