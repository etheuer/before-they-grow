import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Microphone, StopCircle } from '@phosphor-icons/react'

export type TranscriptStatus = 'complete' | 'empty' | 'unavailable'

export type RecordedAnswer = {
  audio: Blob
  transcript: string
  transcriptStatus: TranscriptStatus
}

type AudioRecorderProps = {
  onRecorded: (answer: RecordedAnswer) => void
  onRecordingStarted?: () => void
  onUnavailable?: () => void
}

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'processing' | 'ready' | 'error'

type BrowserSpeechRecognitionResult = {
  readonly isFinal: boolean
  readonly 0: { transcript: string }
}

type BrowserSpeechRecognitionEvent = {
  readonly results: ArrayLike<BrowserSpeechRecognitionResult>
}

type BrowserSpeechRecognition = {
  continuous: boolean
  interimResults: boolean
  lang: string
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
  abort: () => void
}

type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition

type SpeechRecognitionGlobals = typeof globalThis & {
  SpeechRecognition?: BrowserSpeechRecognitionConstructor
  webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor
}

function getSpeechRecognitionConstructor() {
  const browser = globalThis as SpeechRecognitionGlobals
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition
}

function abortAndDetachRecognition(recognition: BrowserSpeechRecognition | null) {
  if (!recognition) return
  recognition.onresult = null
  recognition.onend = null
  recognition.onerror = null
  try {
    recognition.abort()
  } catch {
    // Recognition is already stopped or never started.
  }
}

export function AudioRecorder({
  onRecorded,
  onRecordingStarted,
  onUnavailable,
}: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const transcriptRef = useRef('')
  const transcriptStatusRef = useRef<TranscriptStatus>('unavailable')
  const recognitionSettledRef = useRef(true)
  const completedAudioRef = useRef<Blob | null>(null)
  const recognitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const captureGenerationRef = useRef(0)
  const mountedRef = useRef(true)

  function clearRecognitionTimeout() {
    if (recognitionTimeoutRef.current !== null) {
      clearTimeout(recognitionTimeoutRef.current)
      recognitionTimeoutRef.current = null
    }
  }

  function finishWhenReady(generation: number) {
    const audio = completedAudioRef.current
    if (
      !mountedRef.current
      || captureGenerationRef.current !== generation
      || !audio
      || !recognitionSettledRef.current
    ) return

    clearRecognitionTimeout()
    completedAudioRef.current = null
    const recognition = recognitionRef.current
    if (recognition) {
      recognition.onresult = null
      recognition.onend = null
      recognition.onerror = null
    }
    recognitionRef.current = null
    onRecorded({
      audio,
      transcript: transcriptRef.current.trim(),
      transcriptStatus: transcriptStatusRef.current,
    })
    setStatus('ready')
  }

  function failRecording(generation: number, message: string) {
    if (!mountedRef.current || captureGenerationRef.current !== generation) return

    clearRecognitionTimeout()
    abortAndDetachRecognition(recognitionRef.current)
    recognitionRef.current = null
    recognitionSettledRef.current = true
    transcriptStatusRef.current = 'unavailable'

    const recorder = recorderRef.current
    if (recorder) {
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.onerror = null
      if (recorder.state === 'recording') {
        try {
          recorder.stop()
        } catch {
          // The stream teardown below remains the source of truth.
        }
      }
    }

    streamRef.current?.getTracks().forEach((track) => track.stop())
    recorderRef.current = null
    streamRef.current = null
    chunksRef.current = []
    completedAudioRef.current = null
    setError(message)
    setStatus('error')
    onUnavailable?.()
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      captureGenerationRef.current += 1
      clearRecognitionTimeout()
      const recognition = recognitionRef.current
      abortAndDetachRecognition(recognition)
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state === 'recording') {
          try {
            recorder.stop()
          } catch {
            // Recorder is already stopped.
          }
        }
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      recognitionRef.current = null
      streamRef.current = null
      chunksRef.current = []
      completedAudioRef.current = null
    }
  }, [])

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError('Voice recording is not supported here. You can enter a recovery transcript instead.')
      setStatus('error')
      onUnavailable?.()
      return
    }

    try {
      setStatus('requesting')
      setError('')
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      const generation = captureGenerationRef.current + 1
      captureGenerationRef.current = generation
      streamRef.current = stream
      chunksRef.current = []
      transcriptRef.current = ''
      completedAudioRef.current = null
      transcriptStatusRef.current = 'unavailable'
      recognitionSettledRef.current = true

      const SpeechRecognition = getSpeechRecognitionConstructor()
      if (SpeechRecognition) {
        let recognition: BrowserSpeechRecognition | null = null
        try {
          recognition = new SpeechRecognition()
          recognition.continuous = true
          recognition.interimResults = true
          recognition.lang = navigator.language || 'en-US'
          recognitionSettledRef.current = false
          transcriptStatusRef.current = 'empty'
          recognition.onresult = (event) => {
            if (!mountedRef.current || captureGenerationRef.current !== generation) return
            const transcript = Array.from(event.results)
              .map((result) => result[0]?.transcript ?? '')
              .join(' ')
              .replace(/\s+/g, ' ')
              .trim()
            transcriptRef.current = transcript
            transcriptStatusRef.current = transcript ? 'complete' : 'empty'
          }
          recognition.onerror = () => {
            if (!mountedRef.current || captureGenerationRef.current !== generation) return
            abortAndDetachRecognition(recognition)
            if (recognitionRef.current === recognition) recognitionRef.current = null
            recognitionSettledRef.current = true
            transcriptStatusRef.current = transcriptRef.current ? 'complete' : 'unavailable'
            finishWhenReady(generation)
          }
          recognition.onend = () => {
            if (!mountedRef.current || captureGenerationRef.current !== generation) return
            recognitionSettledRef.current = true
            transcriptStatusRef.current = transcriptRef.current ? 'complete' : 'empty'
            finishWhenReady(generation)
          }
          recognitionRef.current = recognition
          recognition.start()
        } catch {
          abortAndDetachRecognition(recognition)
          if (recognitionRef.current === recognition) recognitionRef.current = null
          recognitionSettledRef.current = true
          transcriptStatusRef.current = 'unavailable'
        }
      }

      const preferredMimeType = 'audio/webm;codecs=opus'
      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (event) => {
        if (
          captureGenerationRef.current === generation
          && event.data.size > 0
        ) chunksRef.current.push(event.data)
      }
      recorder.onerror = () => {
        failRecording(
          generation,
          'The recording could not be completed. Try recording again or enter a recovery transcript.',
        )
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        if (!mountedRef.current || captureGenerationRef.current !== generation) return
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        if (streamRef.current === stream) streamRef.current = null
        if (recorderRef.current === recorder) recorderRef.current = null
        if (audio.size === 0) {
          failRecording(
            generation,
            'No voice was captured. Please record again or enter a recovery transcript.',
          )
          return
        }
        completedAudioRef.current = audio
        finishWhenReady(generation)
      }

      recorderRef.current = recorder
      recorder.start()
      onRecordingStarted?.()
      setStatus('recording')
    } catch {
      const hadStream = streamRef.current !== null
      abortAndDetachRecognition(recognitionRef.current)
      recognitionRef.current = null
      recognitionSettledRef.current = true
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        recorder.onerror = null
        if (recorder.state === 'recording') {
          try {
            recorder.stop()
          } catch {
            // Recorder did not reach a running state.
          }
        }
      }
      recorderRef.current = null
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (!mountedRef.current) return
      setError(hadStream
        ? 'Voice recording could not start. Please try again or enter a recovery transcript.'
        : 'Microphone access was not available. You can enter a recovery transcript instead.')
      setStatus('error')
      onUnavailable?.()
    }
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (recorder?.state !== 'recording') return

    const generation = captureGenerationRef.current
    setStatus('processing')
    const recognition = recognitionRef.current
    if (recognition && !recognitionSettledRef.current) {
      try {
        recognition.stop()
        recognitionTimeoutRef.current = setTimeout(() => {
          if (!mountedRef.current || captureGenerationRef.current !== generation) return
          recognitionSettledRef.current = true
          transcriptStatusRef.current = transcriptRef.current ? 'complete' : 'unavailable'
          abortAndDetachRecognition(recognition)
          if (recognitionRef.current === recognition) recognitionRef.current = null
          finishWhenReady(generation)
        }, 2000)
      } catch {
        abortAndDetachRecognition(recognition)
        recognitionSettledRef.current = true
        transcriptStatusRef.current = transcriptRef.current ? 'complete' : 'unavailable'
        if (recognitionRef.current === recognition) recognitionRef.current = null
      }
    }
    try {
      recorder.stop()
    } catch {
      failRecording(
        generation,
        'The recording could not be completed. Try recording again or enter a recovery transcript.',
      )
    }
  }

  if (status === 'recording') {
    return (
      <button className="record-button is-recording" onClick={stopRecording} type="button">
        <StopCircle weight="fill" aria-hidden="true" />
        Finish recording
      </button>
    )
  }

  if (status === 'processing') {
    return (
      <div className="recording-ready" role="status">
        <Microphone weight="fill" aria-hidden="true" />
        <span>Preparing voice and transcript…</span>
      </div>
    )
  }

  if (status === 'ready') {
    return (
      <div className="recording-ready" role="status">
        <CheckCircle weight="fill" aria-hidden="true" />
        <span>Voice answer ready</span>
        <button onClick={startRecording} type="button">Record again</button>
      </div>
    )
  }

  return (
    <div className="recorder-control">
      <button
        className="record-button"
        disabled={status === 'requesting'}
        onClick={startRecording}
        type="button"
      >
        <Microphone weight="fill" aria-hidden="true" />
        {status === 'requesting' ? 'Opening microphone…' : 'Record their voice'}
      </button>
      {error ? <p className="inline-error" role="alert">{error}</p> : null}
    </div>
  )
}
