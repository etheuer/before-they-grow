import { useEffect, useRef, useState } from 'react'
import { CheckCircle, Microphone, StopCircle } from '@phosphor-icons/react'

type AudioRecorderProps = {
  onRecorded: (audio: Blob) => void
}

type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'ready' | 'error'

export function AudioRecorder({ onRecorded }: AudioRecorderProps) {
  const [status, setStatus] = useState<RecorderStatus>('idle')
  const [error, setError] = useState('')
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      const recorder = recorderRef.current
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onstop = null
        if (recorder.state === 'recording') recorder.stop()
      }
      streamRef.current?.getTracks().forEach((track) => track.stop())
      recorderRef.current = null
      streamRef.current = null
      chunksRef.current = []
    }
  }, [])

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      setError('Voice recording is not supported here. You can still type the answer.')
      setStatus('error')
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
      streamRef.current = stream
      chunksRef.current = []

      const preferredMimeType = 'audio/webm;codecs=opus'
      const recorder = MediaRecorder.isTypeSupported(preferredMimeType)
        ? new MediaRecorder(stream, { mimeType: preferredMimeType })
        : new MediaRecorder(stream)

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.onstop = () => {
        const audio = new Blob(chunksRef.current, {
          type: recorder.mimeType || 'audio/webm',
        })
        stream.getTracks().forEach((track) => track.stop())
        streamRef.current = null
        recorderRef.current = null
        if (!mountedRef.current) return
        onRecorded(audio)
        setStatus('ready')
      }

      recorderRef.current = recorder
      recorder.start()
      setStatus('recording')
    } catch {
      streamRef.current?.getTracks().forEach((track) => track.stop())
      streamRef.current = null
      if (!mountedRef.current) return
      setError('Microphone access was not available. You can still type the answer.')
      setStatus('error')
    }
  }

  function stopRecording() {
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.stop()
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
