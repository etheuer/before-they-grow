import * as Crypto from 'expo-crypto'
import { createAudioPlayer } from 'expo-audio'
import { File } from 'expo-file-system'
import type { MediaInspectorPort } from '@before-they-grow/application'

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let hex = ''
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, '0')
  }
  return hex
}

/**
 * Reads the recorded file twice for byte-count stability, hashes it with
 * SHA-256 (integrity only, not encryption), and confirms it is decodable by
 * loading it into an expo-audio player and reading its duration.
 */
export function createExpoMediaInspectorPort(): MediaInspectorPort {
  return {
    async inspect(uri: string) {
      const file = new File(uri)
      const firstRead = file.size ?? 0

      const bytes = await file.arrayBuffer()
      const secondRead = bytes.byteLength
      const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes)
      const sha256 = toHex(digest)

      let decodable = false
      let durationMs = 0
      try {
        const player = createAudioPlayer(uri)
        durationMs = Math.round(player.duration * 1000)
        if (durationMs > 0) {
          decodable = true
        } else {
          // Duration can populate asynchronously; wait for the first status
          // update that reports a positive duration.
          durationMs = await new Promise<number>((resolve) => {
            const timer = setTimeout(() => resolve(0), 3000)
            const subscription = player.addListener('playbackStatusUpdate', (status) => {
              if (status.duration > 0) {
                clearTimeout(timer)
                subscription.remove()
                resolve(Math.round(status.duration * 1000))
              }
            })
            void subscription
          })
          decodable = durationMs > 0
        }
        player.remove()
      } catch {
        decodable = false
        durationMs = 0
      }

      return {
        byteCount: firstRead,
        sha256,
        decodable,
        durationMs,
        stable: firstRead === secondRead,
      }
    },
  }
}