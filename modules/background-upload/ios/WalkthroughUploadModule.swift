import ExpoModulesCore
import UIKit
import ImageIO

// Stable session identity reconnects native transfers after iOS suspends/relaunches JS.
final class UploadManager: NSObject, URLSessionDataDelegate, URLSessionTaskDelegate {
  static let shared = UploadManager()
  static let identifier = (Bundle.main.bundleIdentifier ?? "walkthroughai") + ".inventory-uploads-v1"
  private let lock = NSRecursiveLock()
  private var responses: [Int: Data] = [:]
  var completion: (() -> Void)?
  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
    config.isDiscretionary = false
    config.sessionSendsLaunchEvents = true
    config.waitsForConnectivity = true
    config.allowsCellularAccess = true
    config.httpMaximumConnectionsPerHost = 3
    config.timeoutIntervalForResource = 86400
    config.timeoutIntervalForRequest = 180
    let queue = OperationQueue()
    queue.maxConcurrentOperationCount = 1
    return URLSession(configuration: config, delegate: self, delegateQueue: queue)
  }()
  private var root: URL {
    FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("WalkthroughUploads", isDirectory: true)
  }
  private func folder(_ id: String) -> URL { root.appendingPathComponent(id, isDirectory: true) }
  private func state(_ id: String) -> [String: Any] {
    guard let bytes = try? Data(contentsOf: folder(id).appendingPathComponent("state.json")),
          let value = try? JSONSerialization.jsonObject(with: bytes) as? [String: Any] else { return [:] }
    return value
  }
  private func save(_ id: String, _ value: [String: Any]) throws {
    try JSONSerialization.data(withJSONObject: value).write(to: folder(id).appendingPathComponent("state.json"), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }
  func clear(_ id: String, promise: Promise) {
    guard id.range(of: "^[a-f0-9]{48}$", options: .regularExpression) != nil else { promise.resolve(nil); return }
    session.getAllTasks { tasks in
      for task in tasks where task.taskDescription?.hasPrefix(id + ":") == true { task.cancel() }
      self.lock.lock(); defer { self.lock.unlock() }
      try? FileManager.default.removeItem(at:self.folder(id))
      promise.resolve(nil)
    }
  }
  func reconnect() { _ = session }
  func status(_ id: String) -> [String: Any] {
    lock.lock(); defer { lock.unlock() }
    return state(id)
  }
  private func fail(_ id: String, _ message: String) {
    lock.lock(); defer { lock.unlock() }
    var value = state(id); value["error"] = message
    try? save(id, value)
  }
  func enqueue(id: String, files: [String], metadata: String, authorization: String, promise: Promise) {
    guard id.range(of: "^[a-f0-9]{48}$", options: .regularExpression) != nil, !files.isEmpty, files.count <= 100 else {
      promise.reject("INVALID_BATCH", "Invalid photo batch"); return
    }
    // Native staging continues during the finite iOS transition window. Network transfer
    // itself is owned by URLSession, not by this background assertion or JS timers.
    var assertion = UIBackgroundTaskIdentifier.invalid
    assertion = UIApplication.shared.beginBackgroundTask(withName: "Stage inventory uploads") {
      self.fail(id, "Photo preparation was interrupted. Reopen the app and tap Resume; staged photos are retained.")
      if assertion != .invalid { UIApplication.shared.endBackgroundTask(assertion); assertion = .invalid }
    }
    session.getAllTasks { tasks in
      DispatchQueue.global(qos: .userInitiated).async {
        defer { DispatchQueue.main.async { if assertion != .invalid { UIApplication.shared.endBackgroundTask(assertion); assertion = .invalid } } }
        do {
          try FileManager.default.createDirectory(at: self.folder(id), withIntermediateDirectories: true)
          var resource = self.folder(id)
          var flags = URLResourceValues(); flags.isExcludedFromBackup = true; try resource.setResourceValues(flags)
          self.lock.lock()
          var saved = self.state(id)
          if saved.isEmpty { saved = ["count": files.count, "uploaded": [], "queued": 0] }
          saved.removeValue(forKey: "error")
          do { try self.save(id, saved) } catch { self.lock.unlock(); throw error }
          self.lock.unlock()
          let completed = Set(saved["uploaded"] as? [String] ?? [])
          let active = Set(tasks.compactMap { $0.taskDescription }.filter { $0.hasPrefix(id + ":") })
          let metaURL = self.folder(id).appendingPathComponent("metadata.json")
          try Data(metadata.utf8).write(to: metaURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
          var queued = 0
          for index in -1..<files.count {
            let slot = index < 0 ? "metadata" : String(index)
            if completed.contains(slot) || active.contains(id + ":" + slot) { continue }
            let bodyURL: URL
            if index < 0 { bodyURL = metaURL }
            else {
              bodyURL = self.folder(id).appendingPathComponent("\(index).jpg")
              if !FileManager.default.fileExists(atPath: bodyURL.path) {
                try autoreleasepool {
                  guard let sourceURL = URL(string: files[index]), sourceURL.isFileURL,
                        let source = CGImageSourceCreateWithURL(sourceURL as CFURL, nil) else {
                    throw NSError(domain:"WalkthroughUpload", code:1, userInfo:[NSLocalizedDescriptionKey:"Photo could not be read."])
                  }
                  if CGImageSourceGetType(source) as String? == "public.jpeg" {
                    try FileManager.default.copyItem(at:sourceURL, to:bodyURL)
                    try FileManager.default.setAttributes([.protectionKey:FileProtectionType.completeUntilFirstUserAuthentication], ofItemAtPath:bodyURL.path)
                    return
                  }
                  guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways:true, kCGImageSourceCreateThumbnailWithTransform:true, kCGImageSourceThumbnailMaxPixelSize:2560] as CFDictionary),
                        let jpeg = UIImage(cgImage:image).jpegData(compressionQuality:0.88) else {
                    throw NSError(domain:"WalkthroughUpload", code:1, userInfo:[NSLocalizedDescriptionKey:"Photo \(index + 1) could not be prepared. Select it again."])
                  }
                  try jpeg.write(to: bodyURL, options:[.atomic, .completeFileProtectionUntilFirstUserAuthentication])
                }
              }
            }
            var request = URLRequest(url: URL(string:"https://walkthroughai-api.onrender.com/api/native-batches/\(id)/\(slot)")!)
            request.httpMethod = "PUT"
            request.setValue(authorization, forHTTPHeaderField:"Authorization")
            request.setValue(String(files.count), forHTTPHeaderField:"X-Photo-Count")
            request.setValue(index < 0 ? "application/json" : "image/jpeg", forHTTPHeaderField:"Content-Type")
            let task = self.session.uploadTask(with:request, fromFile:bodyURL)
            task.taskDescription = id + ":" + slot
            task.resume()
            queued += 1
          }
          self.lock.lock()
          var current = self.state(id); current["queued"] = files.count + 1
          do { try self.save(id,current) } catch { self.lock.unlock(); throw error }
          self.lock.unlock()
          promise.resolve(["batchId":id,"queued":queued])
        } catch {
          // NSRecursiveLock can be acquired recursively by fail; balance paths before throwing.
          self.fail(id,error.localizedDescription)
          promise.reject("UPLOAD_PREPARATION", error.localizedDescription)
        }
      }
    }
  }
  func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
    lock.lock(); defer { lock.unlock() }
    var body = responses[dataTask.taskIdentifier] ?? Data()
    if body.count < 65536 { body.append(data) }
    responses[dataTask.taskIdentifier] = body
  }
  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let descriptor = task.taskDescription else { return }
    let parts = descriptor.split(separator:":").map(String.init)
    guard parts.count == 2 else { return }
    let id = parts[0], slot = parts[1]
    lock.lock(); defer { lock.unlock() }
    let body = responses.removeValue(forKey:task.taskIdentifier) ?? Data()
    let code = (task.response as? HTTPURLResponse)?.statusCode ?? 0
    var value = state(id)
    guard !value.isEmpty else { return }
    let payload = (try? JSONSerialization.jsonObject(with:body)) as? [String:Any]
    if error == nil && (200..<300).contains(code) && payload?["success"] as? Bool == true {
      var completed = Set(value["uploaded"] as? [String] ?? []); completed.insert(slot)
      value["uploaded"] = Array(completed).sorted()
      if let result = payload?["result"] as? [String:Any], let job = result["job_id"] as? String { value["jobId"] = job }
      try? save(id,value)
    } else {
      var attempts = value["attempts"] as? [String:Int] ?? [:]
      let attempt = attempts[slot,default:0]
      if (error != nil || code == 408 || code == 429 || code >= 500) && attempt < 3, let request = task.originalRequest {
        attempts[slot] = attempt + 1; value["attempts"] = attempts; try? save(id,value)
        let file = folder(id).appendingPathComponent(slot == "metadata" ? "metadata.json" : slot + ".jpg")
        let retry = session.uploadTask(with:request, fromFile:file)
        retry.taskDescription = descriptor
        retry.earliestBeginDate = Date(timeIntervalSinceNow:Double(15 * (attempt + 1)))
        retry.resume()
      } else {
        value["error"] = code == 401 ? "Sign in again, then resume this upload. Your photos are retained." : "Upload needs attention (HTTP \(code)). Reopen the app to resume."
        try? save(id,value)
      }
    }
  }
  // Never forward the bearer credential through redirects.
  func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async { let done = self.completion; self.completion = nil; done?() }
  }
}

public class WalkthroughUploadModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WalkthroughUpload")
    OnCreate { UploadManager.shared.reconnect() }
    AsyncFunction("enqueue") { (id: String, files: [String], metadata: String, authorization: String, promise: Promise) in
      UploadManager.shared.enqueue(id:id,files:files,metadata:metadata,authorization:authorization,promise:promise)
    }.runOnQueue(.main)
    AsyncFunction("clear") { (id: String, promise: Promise) in UploadManager.shared.clear(id, promise:promise) }
    AsyncFunction("status") { (id: String) in UploadManager.shared.status(id) }
  }
}
public final class WalkthroughUploadDelegate: ExpoAppDelegateSubscriber {
  public func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
    if identifier == UploadManager.identifier {
      UploadManager.shared.completion = completionHandler
      UploadManager.shared.reconnect()
    }
  }
}
