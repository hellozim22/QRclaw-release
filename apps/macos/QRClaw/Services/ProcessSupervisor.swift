import Foundation

final class ProcessSupervisor: @unchecked Sendable {
    private let lock = NSLock()
    private var processes: [String: Process] = [:]

    func start(
        id: String,
        executable: URL,
        arguments: [String] = [],
        environment: [String: String] = [:],
        logFile: URL? = nil
    ) throws {
        lock.lock()
        defer { lock.unlock() }

        stopUnlocked(id: id)

        let process = Process()
        process.executableURL = executable
        process.arguments = arguments

        var env = Self.augmentedEnvironment(base: ProcessInfo.processInfo.environment)
        for (key, value) in environment {
            env[key] = value
        }
        process.environment = env

        if let logFile {
            FileManager.default.createFile(atPath: logFile.path, contents: nil)
            let handle = try FileHandle(forWritingTo: logFile)
            try handle.seekToEnd()
            process.standardOutput = handle
            process.standardError = handle
        }

        try process.run()
        processes[id] = process
    }

    func stop(id: String) {
        lock.lock()
        defer { lock.unlock() }
        stopUnlocked(id: id)
    }

    private func stopUnlocked(id: String) {
        guard let process = processes.removeValue(forKey: id), process.isRunning else { return }
        let pid = process.processIdentifier
        let pgid = getpgid(pid)
        if pgid > 0 {
            kill(-pgid, SIGTERM)
        } else {
            process.terminate()
        }
        process.waitUntilExit()
    }

    func stopAll() {
        lock.lock()
        let ids = Array(processes.keys)
        lock.unlock()
        for id in ids {
            stop(id: id)
        }
    }

    func isRunning(id: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return processes[id]?.isRunning ?? false
    }

    /// GUI apps inherit a stripped PATH — Homebrew CLIs (pi, claude, codex…) live under /opt/homebrew/bin.
    static func augmentedEnvironment(base: [String: String]) -> [String: String] {
        var env = base
        let home = NSHomeDirectory()
        let extraPaths = [
            "/opt/homebrew/bin",
            "/usr/local/bin",
            "\(home)/.local/bin",
            "\(home)/bin",
        ].filter { FileManager.default.fileExists(atPath: $0) }
        let current = env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        let prefix = extraPaths.joined(separator: ":")
        env["PATH"] = prefix.isEmpty ? current : "\(prefix):\(current)"
        return env
    }
}
