import { createAudioPlayer } from 'expo-audio'
import type { AudioPlayerPort } from '@before-they-grow/application'

/**
 * Single active player for the review and timeline surfaces. Playback pauses
 * on an explicit parent action; privacy-sensitive lifecycle handling is the
 * interruption slice (#36).
 */
export function createExpoAudioPlayerPort(): AudioPlayerPort {
  let player: ReturnType<typeof createAudioPlayer> | null = null

  return {
    async load(uri: string) {
      player?.remove()
      player = createAudioPlayer(uri)
    },

    async play() {
      player?.play()
    },

    async pause() {
      player?.pause()
    },

    async stop() {
      player?.pause()
      await player?.seekTo(0)
    },

    dispose() {
      player?.remove()
      player = null
    },

    isPlaying() {
      return player?.playing ?? false
    },

    durationMs() {
      return Math.round((player?.duration ?? 0) * 1000)
    },

    positionMs() {
      return Math.round((player?.currentTime ?? 0) * 1000)
    },

    onEnded(listener) {
      if (!player) return () => {}
      const subscription = player.addListener('playbackStatusUpdate', (status) => {
        if (status.didJustFinish) listener()
      })
      return () => subscription.remove()
    },
  }
}