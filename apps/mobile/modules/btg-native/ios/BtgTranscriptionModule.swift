import ExpoModulesCore
import Speech

/**
 * Best-effort English (en-US) on-device transcription for completed audio
 * files. `requiresOnDeviceRecognition` is always true: when the on-device
 * model is not supported the module reports unavailable and never starts a
 * network recognizer. Speech permission is requested only after availability
 * has been verified by the JS side. A defensive timeout and resume-once guard
 * guarantee the JS promise always settles, and the active recognition task
 * can be cancelled explicitly.
 */
public class BtgTranscriptionModule: Module {
  private var activeTask: SFSpeechRecognitionTask?

  public func definition() -> ModuleDefinition {
    Name("BtgTranscription")

    AsyncFunction("isOnDeviceAvailable") { () -> Bool in
      guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
        return false
      }
      return recognizer.supportsOnDeviceRecognition
    }

    AsyncFunction("requestPermission") { () -> Bool in
      await withCheckedContinuation { continuation in
        SFSpeechRecognizer.requestAuthorization { status in
          continuation.resume(returning: status == .authorized)
        }
      }
    }

    AsyncFunction("transcribeFile") { (uri: String) -> [String: String] in
      guard let url = URL(string: uri),
        let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")),
        recognizer.supportsOnDeviceRecognition
      else {
        // No verified on-device path: report unavailable, never a network
        // recognizer.
        return ["kind": "unavailable"]
      }
      recognizer.requiresOnDeviceRecognition = true

      let request = SFSpeechURLRecognitionRequest(url: url)
      request.shouldReportPartialResults = false
      request.taskHint = .dictation
      request.requiresOnDeviceRecognition = true

      return try await withCheckedThrowingContinuation { continuation in
        var resumed = false
        let resumeOnce: (Result<String, Error>) -> Void = { result in
          guard !resumed else { return }
          resumed = true
          switch result {
          case .success(let text):
            continuation.resume(returning: ["kind": "draft", "text": text])
          case .failure:
            continuation.resume(returning: ["kind": "failed"])
          }
        }

        let task = recognizer.recognitionTask(with: request) { result, error in
          if let result, result.isFinal {
            resumeOnce(.success(result.bestTranscription.formattedString))
          } else if let error {
            resumeOnce(.failure(error))
          }
          // A nil/nil update is an intermediate partial result; keep waiting
          // for a final state or the timeout.
        }
        self.activeTask = task

        // Defensive timeout: recognition of a bounded file should finish well
        // inside a minute; a hung task must never leave the JS promise
        // unresolved (and the UI stuck on "Transcribing…").
        DispatchQueue.main.asyncAfter(deadline: .now() + 60) { [weak self] in
          task.cancel()
          if self?.activeTask === task {
            self?.activeTask = nil
          }
          resumeOnce(.failure(NSError(domain: "BtgTranscription", code: 1)))
        }
      }
    }

    AsyncFunction("cancelTranscriptionFile") { () -> Void in
      self.activeTask?.cancel()
      self.activeTask = nil
    }
  }
}