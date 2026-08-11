import * as LocalAuthentication from 'expo-local-authentication'
import type {
  AuthenticationPort,
  AuthenticationResult,
} from '@before-they-grow/application'

const cancellationErrors = new Set([
  'app_cancel',
  'system_cancel',
  'user_cancel',
  'user_fallback',
])

const unavailableCredentialErrors = new Set([
  'not_available',
  'not_enrolled',
  'passcode_not_set',
])

export function mapNativeAuthenticationResult(
  result: LocalAuthentication.LocalAuthenticationResult,
): AuthenticationResult {
  if (result.success) return 'authenticated'
  if (unavailableCredentialErrors.has(result.error)) {
    return 'credential-unavailable'
  }
  if (cancellationErrors.has(result.error)) return 'cancelled'
  return 'failed'
}

export function createExpoAuthenticationPort(): AuthenticationPort {
  return {
    async getCredentialAvailability() {
      const level = await LocalAuthentication.getEnrolledLevelAsync()
      return level === LocalAuthentication.SecurityLevel.NONE
        ? 'unavailable'
        : 'available'
    },

    async authenticate() {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Before They Grow',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use device passcode',
        disableDeviceFallback: false,
        requireConfirmation: true,
        biometricsSecurityLevel: 'strong',
      })
      return mapNativeAuthenticationResult(result)
    },
  }
}
