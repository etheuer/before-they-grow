import { Pressable, StyleSheet, Text } from 'react-native'
import type { Theme } from '../theme'

type ActionButtonProps = {
  label: string
  onPress: () => void
  theme: Theme
  variant?: 'primary' | 'secondary'
  disabled?: boolean
  accessibilityHint?: string
}

/**
 * The product's single primary/secondary action control (52 pt target).
 * Shared by the lock screen and the protected-area surfaces so the visual
 * and behavioural language stays identical everywhere.
 */
export function ActionButton({
  label,
  onPress,
  theme,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
}: ActionButtonProps) {
  const secondary = variant === 'secondary'
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityHint={accessibilityHint}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border }
          : disabled
            ? { backgroundColor: theme.quietAccent, borderColor: theme.quietAccent }
            : {
                backgroundColor: pressed ? theme.primaryPressed : theme.primary,
                borderColor: pressed ? theme.primaryPressed : theme.primary,
              },
        pressed && secondary ? styles.buttonPressed : null,
        pressed && !disabled && !secondary ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: disabled ? theme.muted : secondary ? theme.text : theme.onPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  buttonPressed: {
    opacity: 0.72,
  },
  buttonLabel: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
})