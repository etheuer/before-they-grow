import ExpoModulesCore

public class BtgNativeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BtgNative")

    AsyncFunction("setExcludedFromBackup") { (path: String, excluded: Bool) -> Bool in
      let fileManager = FileManager.default
      guard fileManager.fileExists(atPath: path) else {
        // A transient sibling (for example a missing -wal file) has nothing
        // to exclude; the authoritative catalog file always exists here.
        return true
      }
      var url = URL(fileURLWithPath: path)
      var values = URLResourceValues()
      values.isExcludedFromBackup = excluded
      try url.setResourceValues(values)
      let applied = try url.resourceValues(forKeys: [.isExcludedFromBackupKey])
      return applied.isExcludedFromBackup == excluded
    }
  }
}