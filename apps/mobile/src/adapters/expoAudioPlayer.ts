import { AppState } from 'react-native'
import { createAudioPlayer } from 'expo-audio'
import type { AudioPlayerPort } from '@before-they-grow/application'

/**
 * Single active player for the review and timeline surfaces. The ended
 * subscription is attached to every player at load time, so completion always
 * notifies the registered listeners; playback pauses on an explicit parent
 * action AND on any privacy-sensitive lifecycle transition (background /
 * inactive), resuming only after an explicit parent action. Privacy-sensitive
 * lifecycle handling for capture is the interruption slice (#36).
 */
export function createExpoAudioPlayerPort(): AudioPlayerPort {
  let player: ReturnType<typeof createAudioPlayer> | null = null
  const endedListeners = new Set<() => void>()
  let endedSubscription: { remove: () => void } | null = null

  const attachEnded = (target: ReturnType<typeof createAudioPlayer>) => {
    endedSubscription?.remove()
    endedSubscription = target.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        for (const listener of endedListeners) listener()
      }
    })
  }

  const pauseForPrivacy = () => {
    player?.pause()
  }

  // Pause playback on any privacy-sensitive lifecycle transition; it resumes
  // only when the parent presses play again.
  const appStateSubscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') pauseForPrivacy()
  })

  return {
    async load(uri: string) {
      player?.remove()
      player = createAudioPlayer(uri)
      attachEnded(player)
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
      appStateSubscription.remove()
      endedSubscription?.remove()
      endedSubscription = null
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
      endedListeners.add(listener)
      return () => endedListeners.delete(listener)
    },
  }
}