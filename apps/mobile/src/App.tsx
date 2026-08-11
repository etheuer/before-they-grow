import { useEffect, useMemo, useSyncExternalStore } from 'react'
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import {
  SafeAreaProvider,
  SafeAreaView,
} from 'react-native-safe-area-context'
import {
  AppLockCoordinator,
  type AppLockStatus,
  type ApplicationLifecyclePort,
  type AuthenticationPort,
} from '@before-they-grow/application'
import { createExpoAuthenticationPort } from './adapters/expoAuthentication'
import { createExpoLifecyclePort } from './adapters/expoLifecycle'

type Theme = {
  background: string
  surface: string
  text: string
  muted: string
  border: string
  primary: string
  primaryPressed: string
  onPrimary: string
  quietAccent: string
}

const lightTheme: Theme = {
  background: '#F7F3EB',
  surface: '#FFFDF9',
  text: '#211F1B',
  muted: '#655F57',
  border: '#D8D0C4',
  primary: '#B63A32',
  primaryPressed: '#8F2B26',
  onPrimary: '#FFFFFF',
  quietAccent: '#E9DDD2',
}

const darkTheme: Theme = {
  background: '#161512',
  surface: '#24211D',
  text: '#F8F2E8',
  muted: '#C6BCAF',
  border: '#4A443D',
  primary: '#FF8A7A',
  primaryPressed: '#FFAD9F',
  onPrimary: '#161512',
  quietAccent: '#382C27',
}

type LockedNativeShellProps = {
  authentication: AuthenticationPort
  lifecycle: ApplicationLifecyclePort
  openDeviceSettings?: () => Promise<void>
}

export function LockedNativeShell({
  authentication,
  lifecycle,
  openDeviceSettings = Linking.openSettings,
}: LockedNativeShellProps) {
  const coordinator = useMemo(
    () => new AppLockCoordinator(authentication, lifecycle),
    [authentication, lifecycle],
  )
  const status = useSyncExternalStore(
    coordinator.subscribe,
    coordinator.getSnapshot,
    coordinator.getSnapshot,
  )

  useEffect(() => {
    coordinator.start()
    return coordinator.stop
  }, [coordinator])

  if (status === 'unlocked') return <ProtectedHome />

  return (
    <LockScreen
      status={status}
      onOpenDeviceSettings={openDeviceSettings}
      onRetry={coordinator.retry}
    />
  )
}

function useTheme() {
  return useColorScheme() === 'dark' ? darkTheme : lightTheme
}

function Brand({ theme }: { theme: Theme }) {
  return (
    <View accessibilityLabel="Before They Grow" style={styles.brand}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.brandMark, { backgroundColor: theme.primary }]}
      >
        <View style={[styles.miniLockShackle, { borderColor: theme.onPrimary }]} />
        <View style={[styles.miniLockBody, { backgroundColor: theme.onPrimary }]} />
      </View>
      <Text style={[styles.brandName, { color: theme.text }]}>Before They Grow</Text>
    </View>
  )
}

function LockMark({ theme }: { theme: Theme }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.lockMark, { backgroundColor: theme.quietAccent }]}
    >
      <View style={styles.lockDrawing}>
        <View style={[styles.lockShackle, { borderColor: theme.primary }]} />
        <View style={[styles.lockBody, { backgroundColor: theme.primary }]}>
          <View style={[styles.keyhole, { backgroundColor: theme.onPrimary }]} />
        </View>
      </View>
    </View>
  )
}

type LockScreenProps = {
  status: Exclude<AppLockStatus, 'unlocked'>
  onRetry: () => void
  onOpenDeviceSettings: () => Promise<void>
}

function LockScreen({
  status,
  onRetry,
  onOpenDeviceSettings,
}: LockScreenProps) {
  const theme = useTheme()
  const content = lockContent[status]
  const checking = status === 'authenticating'
  const setupRequired = status === 'setup-required'

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <ScrollView
        alwaysBounceVertical={false}
        contentContainerStyle={styles.lockScroll}
      >
        <View style={styles.screenWidth}>
          <Brand theme={theme} />

          <View
            accessibilityLiveRegion="polite"
            style={styles.lockContent}
          >
            <LockMark theme={theme} />
            <Text accessibilityRole="header" style={[styles.lockTitle, { color: theme.text }]}>
              {content.title}
            </Text>
            <Text style={[styles.lockMessage, { color: theme.muted }]}>
              {content.message}
            </Text>

            {checking ? (
              <View
                accessibilityLabel="Checking your phone's security"
                accessibilityRole="progressbar"
                style={styles.progress}
              >
                <ActivityIndicator color={theme.primary} size="small" />
                <Text style={[styles.progressText, { color: theme.muted }]}>Checking your phone’s security…</Text>
              </View>
            ) : setupRequired ? (
              <View style={styles.actions}>
                <ActionButton
                  label="Open device settings"
                  onPress={() => {
                    void onOpenDeviceSettings().catch(() => undefined)
                  }}
                  theme={theme}
                />
                <ActionButton
                  label="Check again"
                  onPress={onRetry}
                  theme={theme}
                  variant="secondary"
                />
              </View>
            ) : status === 'locked' ? (
              <View style={styles.actions}>
                <ActionButton label="Try again" onPress={onRetry} theme={theme} />
              </View>
            ) : null}
          </View>

          <View style={[styles.privacyNote, { borderTopColor: theme.border }]}>
            <View style={[styles.privacyDot, { backgroundColor: theme.primary }]} />
            <Text style={[styles.privacyText, { color: theme.muted }]}>
              App lock uses your phone’s security. Before They Grow never stores your passcode or biometric data.
            </Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

function ActionButton({
  label,
  onPress,
  theme,
  variant = 'primary',
}: {
  label: string
  onPress: () => void
  theme: Theme
  variant?: 'primary' | 'secondary'
}) {
  const secondary = variant === 'secondary'
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        secondary
          ? { backgroundColor: theme.surface, borderColor: theme.border }
          : {
              backgroundColor: pressed ? theme.primaryPressed : theme.primary,
              borderColor: pressed ? theme.primaryPressed : theme.primary,
            },
        pressed && secondary ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          { color: secondary ? theme.text : theme.onPrimary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  )
}

function ProtectedHome() {
  const theme = useTheme()
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <StatusBar style={theme === darkTheme ? 'light' : 'dark'} />
      <View style={[styles.protectedScreen, styles.screenWidth]}>
        <Brand theme={theme} />
        <View style={styles.protectedContent}>
          <View style={[styles.unlockedMark, { backgroundColor: theme.primary }]}>
            <View style={[styles.unlockedStem, { backgroundColor: theme.onPrimary }]} />
            <View style={[styles.unlockedTick, { backgroundColor: theme.onPrimary }]} />
          </View>
          <Text accessibilityRole="header" style={[styles.protectedTitle, { color: theme.text }]}>
            Your family space is unlocked
          </Text>
          <Text style={[styles.protectedMessage, { color: theme.muted }]}>
            A quiet place for tonight’s question and the memories you keep on this phone.
          </Text>
        </View>
        <View style={[styles.readyLine, { borderTopColor: theme.border }]}>
          <Text style={[styles.readyText, { color: theme.muted }]}>Protected whenever you leave</Text>
        </View>
      </View>
    </SafeAreaView>
  )
}

const lockContent: Record<Exclude<AppLockStatus, 'unlocked'>, {
  title: string
  message: string
}> = {
  obscured: {
    title: 'Your family space is locked',
    message: 'Private content stays hidden whenever you leave Before They Grow.',
  },
  authenticating: {
    title: 'Unlock Before They Grow',
    message: 'Use your biometric or device passcode to open your private family space.',
  },
  locked: {
    title: 'Your family space is still locked',
    message: 'Nothing private is visible. Try again when you’re ready.',
  },
  'setup-required': {
    title: 'Protect this phone first',
    message: Platform.select({
      ios: 'Set up a device passcode, PIN, or pattern in Settings, then come back to unlock your family space.',
      android: 'Set up a device passcode, PIN, or pattern in Settings, then come back to unlock your family space.',
      default: 'Set up a device passcode, PIN, or pattern in Settings, then come back to unlock your family space.',
    }),
  },
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  screenWidth: {
    alignSelf: 'center',
    flex: 1,
    maxWidth: 560,
    width: '100%',
  },
  lockScroll: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  brand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 48,
  },
  brandMark: {
    alignItems: 'center',
    borderRadius: 10,
    height: 32,
    justifyContent: 'center',
    width: 32,
  },
  brandName: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  miniLockShackle: {
    borderBottomWidth: 0,
    borderRadius: 5,
    borderWidth: 2,
    height: 9,
    position: 'absolute',
    top: 7,
    width: 10,
  },
  miniLockBody: {
    borderRadius: 3,
    bottom: 7,
    height: 10,
    position: 'absolute',
    width: 13,
  },
  lockContent: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 40,
    paddingTop: 52,
  },
  lockMark: {
    alignItems: 'center',
    borderRadius: 44,
    height: 88,
    justifyContent: 'center',
    marginBottom: 30,
    width: 88,
  },
  lockDrawing: {
    height: 46,
    width: 40,
  },
  lockShackle: {
    alignSelf: 'center',
    borderBottomWidth: 0,
    borderRadius: 14,
    borderWidth: 4,
    height: 24,
    width: 27,
  },
  lockBody: {
    alignItems: 'center',
    borderRadius: 9,
    bottom: 0,
    height: 29,
    justifyContent: 'center',
    position: 'absolute',
    width: 40,
  },
  keyhole: {
    borderRadius: 3,
    height: 9,
    width: 5,
  },
  lockTitle: {
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: -1,
    lineHeight: 40,
    maxWidth: 370,
    textAlign: 'center',
  },
  lockMessage: {
    fontSize: 17,
    lineHeight: 25,
    marginTop: 14,
    maxWidth: 370,
    textAlign: 'center',
  },
  progress: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    marginTop: 30,
  },
  progressText: {
    fontSize: 15,
    fontWeight: '600',
  },
  actions: {
    gap: 12,
    marginTop: 32,
    maxWidth: 360,
    width: '100%',
  },
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
  },
  privacyNote: {
    alignItems: 'flex-start',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 10,
    paddingBottom: 10,
    paddingTop: 18,
  },
  privacyDot: {
    borderRadius: 4,
    height: 8,
    marginTop: 6,
    width: 8,
  },
  privacyText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 19,
  },
  protectedScreen: {
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  protectedContent: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 48,
  },
  unlockedMark: {
    borderRadius: 16,
    height: 56,
    marginBottom: 28,
    position: 'relative',
    width: 56,
  },
  unlockedStem: {
    borderRadius: 3,
    height: 6,
    left: 15,
    position: 'absolute',
    top: 29,
    transform: [{ rotate: '45deg' }],
    width: 14,
  },
  unlockedTick: {
    borderRadius: 3,
    height: 6,
    left: 23,
    position: 'absolute',
    top: 25,
    transform: [{ rotate: '-45deg' }],
    width: 22,
  },
  protectedTitle: {
    fontSize: 42,
    fontWeight: '700',
    letterSpacing: -1.4,
    lineHeight: 48,
    maxWidth: 430,
  },
  protectedMessage: {
    fontSize: 19,
    lineHeight: 28,
    marginTop: 16,
    maxWidth: 430,
  },
  readyLine: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingBottom: 10,
    paddingTop: 18,
  },
  readyText: {
    fontSize: 13,
    fontWeight: '600',
  },
})

export default function App() {
  const authentication = useMemo(createExpoAuthenticationPort, [])
  const lifecycle = useMemo(createExpoLifecyclePort, [])

  return (
    <SafeAreaProvider>
      <LockedNativeShell
        authentication={authentication}
        lifecycle={lifecycle}
      />
    </SafeAreaProvider>
  )
}
