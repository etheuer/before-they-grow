import * as LocalAuthentication from 'expo-local-authentication'
import type { LocalAuthenticationResult } from 'expo-local-authentication'
import {
  createExpoAuthenticationPort,
  mapNativeAuthenticationResult,
} from './expoAuthentication'

jest.mock('expo-local-authentication', () => ({
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC_WEAK: 2,
    BIOMETRIC_STRONG: 3,
  },
  getEnrolledLevelAsync: jest.fn(),
  authenticateAsync: jest.fn(),
}))

const getEnrolledLevelAsync = jest.mocked(LocalAuthentication.getEnrolledLevelAsync)
const authenticateAsync = jest.mocked(LocalAuthentication.authenticateAsync)

function nativeFailure(error: string): LocalAuthenticationResult {
  return { success: false, error, warning: '' } as LocalAuthenticationResult
}

describe('Expo authentication adapter', () => {
  beforeEach(() => {
    getEnrolledLevelAsync.mockReset()
    authenticateAsync.mockReset()
  })

  it('requires setup only when the platform reports no enrolled device credential', async () => {
    const port = createExpoAuthenticationPort()
    getEnrolledLevelAsync.mockResolvedValueOnce(LocalAuthentication.SecurityLevel.NONE)
    await expect(port.getCredentialAvailability()).resolves.toBe('unavailable')

    getEnrolledLevelAsync.mockResolvedValueOnce(LocalAuthentication.SecurityLevel.SECRET)
    await expect(port.getCredentialAvailability()).resolves.toBe('available')
  })

  it('requests device-owner authentication with passcode fallback enabled', async () => {
    authenticateAsync.mockResolvedValueOnce({ success: true })
    const port = createExpoAuthenticationPort()

    await expect(port.authenticate()).resolves.toBe('authenticated')
    expect(authenticateAsync).toHaveBeenCalledWith({
      promptMessage: 'Unlock Before They Grow',
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use device passcode',
      disableDeviceFallback: false,
      requireConfirmation: true,
      biometricsSecurityLevel: 'strong',
    })
  })

  it('accepts only an explicit platform authentication success', () => {
    expect(mapNativeAuthenticationResult({ success: true })).toBe('authenticated')
    expect(mapNativeAuthenticationResult(nativeFailure('authentication_failed'))).toBe('failed')
  })

  it.each(['app_cancel', 'system_cancel', 'user_cancel', 'user_fallback'])(
    'keeps cancellation %s recoverably locked',
    (error) => {
      expect(mapNativeAuthenticationResult(nativeFailure(error))).toBe('cancelled')
    },
  )

  it.each(['not_available', 'not_enrolled', 'passcode_not_set'])(
    'requires device setup for %s',
    (error) => {
      expect(mapNativeAuthenticationResult(nativeFailure(error))).toBe('credential-unavailable')
    },
  )
})
