import Foundation

/// Loads host secrets from ~/.config/qrclaw/secrets.env at runtime (never bundled in .app).
enum DesktopSecretsLoader {
    static let secretsPath = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".config/qrclaw/secrets.env")

    static func load() -> [String: String] {
        guard FileManager.default.fileExists(atPath: secretsPath.path) else {
            return [:]
        }
        guard let text = try? String(contentsOf: secretsPath, encoding: .utf8) else {
            return [:]
        }
        var env: [String: String] = [:]
        for line in text.split(separator: "\n") {
            var trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty || trimmed.hasPrefix("#") { continue }
            // ~/.config/qrclaw/secrets.env is sourced by the shell, so every entry
            // is written as `export KEY=value`. Strip the leading `export ` token,
            // otherwise the parsed key becomes "export KEY" and lookups like
            // hasHostSecrets (SUPABASE_SERVICE_ROLE_KEY / QRCLAW_KEK_V1) all miss —
            // which silently downgrades the app to the slim gateway with no agent
            // host, leaving onboarding stuck on "正在准备 AI 助手…".
            if trimmed.hasPrefix("export ") {
                trimmed = String(trimmed.dropFirst("export ".count))
                    .trimmingCharacters(in: .whitespaces)
            }
            guard let eq = trimmed.firstIndex(of: "=") else { continue }
            let key = String(trimmed[..<eq]).trimmingCharacters(in: .whitespaces)
            var value = String(trimmed[trimmed.index(after: eq)...])
                .trimmingCharacters(in: .whitespaces)
            if (value.hasPrefix("\"") && value.hasSuffix("\"")) ||
                (value.hasPrefix("'") && value.hasSuffix("'")) {
                value = String(value.dropFirst().dropLast())
            }
            if !key.isEmpty { env[key] = value }
        }
        return env
    }

    /// Desktop web reattach reads this so mint-host uses the same pepper as the bundled gateway.
    static func persistHostTokenPepper(_ pepper: String) {
        guard !pepper.isEmpty else { return }
        let dir = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/qrclaw")
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let file = dir.appendingPathComponent("host-token-pepper.env")
        let content = "QRCLAW_HOST_TOKEN_PEPPER=\(pepper)\n"
        try? content.write(to: file, atomically: true, encoding: .utf8)
        try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.path)
    }

    static func loadPersistedHostTokenPepper() -> String? {
        let file = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(".config/qrclaw/host-token-pepper.env")
        guard let text = try? String(contentsOf: file, encoding: .utf8) else { return nil }
        for line in text.split(separator: "\n") {
            var trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.hasPrefix("export ") {
                trimmed = String(trimmed.dropFirst("export ".count))
                    .trimmingCharacters(in: .whitespaces)
            }
            guard let eq = trimmed.firstIndex(of: "=") else { continue }
            let key = String(trimmed[..<eq]).trimmingCharacters(in: .whitespaces)
            let value = String(trimmed[trimmed.index(after: eq)...])
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if key == "QRCLAW_HOST_TOKEN_PEPPER", !value.isEmpty {
                return value
            }
        }
        return nil
    }

    static var hasHostSecrets: Bool {
        let env = load()
        return env["SUPABASE_SERVICE_ROLE_KEY"] != nil && env["QRCLAW_KEK_V1"] != nil
    }
}
