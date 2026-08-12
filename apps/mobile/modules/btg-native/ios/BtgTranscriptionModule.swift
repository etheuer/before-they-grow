import ExpoModulesCore
import Speech

/**
 * Best-effort English (en-US) on-device transcription for completed audio
 * files. `requiresOnDeviceRecognition` is always true: when the on-device
 * model is not supported the module reports unavailable and never starts a
 * network recognizer. Speech permission is requested only after availability
 * has been verified by the JS side.
 */
public class BtgTranscriptionModule: Module {
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

    AsyncFunction("transcribeFile") { (uri: String, sessionId: String) -> [String: String] in
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

      do {
        let result = try await withCheckedThrowingContinuation { continuation in
          recognizer.recognitionTask(with: request) { result, error in
            if let result, result.isFinal {
              continuation.resume(returning: result.bestTranscription.formattedString)
            } else if let error {
              continuation.resume(throwing: error)
            }
          }
        }
        // The session id is returned untouched so the JS coordinator can
        // discard results from superseded sessions.
        return ["kind": "draft", "text": result, "sessionId": sessionId]
      } catch {
        return ["kind": "failed"]
      }
    }
  }
}