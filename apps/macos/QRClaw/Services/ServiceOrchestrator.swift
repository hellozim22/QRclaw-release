import Foundation
import AppKit
import Security

@MainActor
final class ServiceOrchestrator: ObservableObject {
    static let shared = ServiceOrchestrator()

    enum Phase: Equatable {
        case launching
        case ready
        case error(String)
    }

    @Published private(set) var phase: Phase = .launching
    @Published private(set) var health: ServiceHealth = .idle
    @Published private(set) var webHealth: ServiceHealth = .idle
    @Published private(set) var gatewayHealth: ServiceHealth = .idle
    @Published private(set) var hostHealth: ServiceHealth = .idle

    var isLoggedIn: Bool { true }

    private let supervisor = ProcessSupervisor()
    private let logDir = URL(fileURLWithPath: "/tmp/bibisheng-agent-chat-logs", isDirectory: true)
    /// True only when this app launched the agent-host daemon (dev-full mode); avoids killing a dev-up daemon on quit.
    private var startedHostDaemon = false

    private let webPort = 3000
    private let gatewayPort = 3100

    private static let localDevEmail = "local-dev@localhost"
    private static let localDevPassword = "LocalDev-Only-9x!"

    /// Loopback origins the bundled gateway must accept. The WebView loads
    /// 127.0.0.1, but some client/runtime requests use the `localhost` alias;
    /// the gateway's exact-match CORS rejected those, flooding 500s. Both are
    /// safe because the gateway only binds 127.0.0.1 (never network-exposed).
    private var corsOrigins: String {
        "http://127.0.0.1:\(webPort),http://localhost:\(webPort)"
    }

    /// Host-token pepper for the local full gateway + mint script.
    ///
    /// The mint script HMAC-hashes the host token with this pepper and stores
    /// the hash; the gateway re-hashes the presented token with the SAME pepper
    /// to authenticate. `~/.config/qrclaw/secrets.env` does not ship a pepper,
    /// so the desktop app self-provisions a stable one (Keychain-backed) and
    /// injects the identical value into both the gateway env and the mint env.
    /// Without this the host attach dies with "QRCLAW_HOST_TOKEN_PEPPER not set"
    /// and onboarding hangs forever on "正在准备 AI 助手…".
    private func localHostTokenPepper() -> String {
        if let existing = DesktopSecretsLoader.loadPersistedHostTokenPepper(), !existing.isEmpty {
            return existing
        }
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        let pepper = bytes.map { String(format: "%02x", $0) }.joined()
        DesktopSecretsLoader.persistHostTokenPepper(pepper)
        return pepper
    }

    private static let bundleMarker = "ai.qrclaw.desktop"

    private init() {}

    /// Desktop app owns :3000 / :3100 / :19515 — drop stale listeners (dev-up leftovers).
    private func claimExclusivePorts() {
        for port in [webPort, gatewayPort, 19515] {
            let process = Process()
            process.executableURL = URL(fileURLWithPath: "/bin/bash")
            process.arguments = [
                "-c",
                "lsof -nP -iTCP:\(port) -sTCP:LISTEN -t 2>/dev/null | xargs kill 2>/dev/null || true",
            ]
            try? process.run()
            process.waitUntilExit()
        }
        Thread.sleep(forTimeInterval: 0.4)
    }

    /// Swift-native host attach (no bash) — login + daemon start.
    private func attachHostDirect(hostBin: URL, token: String) async -> Bool {
        guard !token.isEmpty else { return false }

        let login = Process()
        login.executableURL = hostBin
        login.arguments = ["login", "--name", "default"]
        let loginIn = Pipe()
        login.standardInput = loginIn
        login.standardOutput = FileHandle.nullDevice
        login.standardError = FileHandle.nullDevice
        let loginEnv = processEnvironment([
            "QRCLAW_WS_URL": "ws://127.0.0.1:\(gatewayPort)/ws",
        ])
        login.environment = loginEnv
        do {
            try login.run()
            loginIn.fileHandleForWriting.write(Data((token + "\n").utf8))
            try loginIn.fileHandleForWriting.close()
            login.waitUntilExit()
            guard login.terminationStatus == 0 else {
                QRClawLogger.orchestrator.error("Host login exit \(login.terminationStatus)")
                return false
            }
        } catch {
            QRClawLogger.orchestrator.error("Host login failed: \(error.localizedDescription, privacy: .public)")
            return false
        }

        if await checkURL("http://127.0.0.1:19515/health") {
            return true
        }

        let daemon = Process()
        daemon.executableURL = hostBin
        daemon.arguments = ["daemon", "start"]
        let daemonEnv = processEnvironment([
            "QRCLAW_WS_URL": "ws://127.0.0.1:\(gatewayPort)/ws",
            "QRCLAW_LOG_DIR": logDir.path,
        ])
        daemon.environment = daemonEnv
        let logPath = logDir.appendingPathComponent("host-attach.log")
        FileManager.default.createFile(atPath: logPath.path, contents: nil)
        if let logHandle = try? FileHandle(forWritingTo: logPath) {
            daemon.standardOutput = logHandle
            daemon.standardError = logHandle
        }
        do {
            try daemon.run()
            daemon.waitUntilExit()
        } catch {
            QRClawLogger.orchestrator.error("Host daemon start failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
        return await waitForHealth(url: "http://127.0.0.1:19515/health", tries: 40)
    }

    /// User-triggered reconnect from Settings or after web reattach request.
    func reconnectHost() async {
        guard let root = resourcesRoot() else { return }
        let hostBin = root.appendingPathComponent("qrclaw-agent-host")
        let nodeBin = root.appendingPathComponent("node/bin/node")
        let hostSecrets = DesktopSecretsLoader.load()
        let mintScript = root.appendingPathComponent("scripts/mint-host-token-and-run.sh")
        let useFullGateway = FileManager.default.fileExists(atPath: mintScript.path)
            && DesktopSecretsLoader.hasHostSecrets
        hostHealth = .starting
        let attached = await ensureHostAttached(
            hostBin: hostBin,
            root: root,
            nodeBin: nodeBin,
            useFullGateway: useFullGateway,
            hostSecrets: hostSecrets,
            hostTokenPepper: localHostTokenPepper()
        )
        startedHostDaemon = attached
        hostHealth = attached ? .healthy : .degraded
    }

    private func tryCloudBootstrap(publicConfig: DesktopPublicConfig) async -> Bool {
        guard publicConfig.hasSupabasePublic else { return false }
        guard !DesktopKeychain.hasSession else { return true }
        let client = DesktopBootstrapClient(cloudBaseURL: URL(string: publicConfig.cloudGatewayUrl)!)
        do {
            let deviceName = Host.current().localizedName ?? "QRClaw Mac"
            let response = try await client.exchangeWithEmail(
                publicConfig.localDevEmail,
                deviceName: deviceName,
                appVersion: Self.appVersion
            )
            try await client.persistToKeychain(response)
            QRClawLogger.orchestrator.info("Cloud bootstrap succeeded for desktop session")
            return true
        } catch {
            QRClawLogger.orchestrator.error("Cloud bootstrap skipped: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    private static var appVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    /// 双击即用：无邀请码，直接启动 bundled runtime + 自动 local bootstrap。
    func startIfNeeded() async {
        guard phase == .launching else { return }
        QRClawLogger.orchestrator.info("Starting service orchestrator (auto-open)")
        try? FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
        await startServices()
    }

    func retry() {
        phase = .launching
        Task { await startIfNeeded() }
    }

    func restart() async {
        stopServices()
        phase = .launching
        await startServices()
    }

    func signOut() async {
        stopServices()
        DesktopKeychain.clearAll()
        phase = .launching
        await startServices()
    }

    func openLogsFolder() {
        NSWorkspace.shared.open(logDir)
    }

    // MARK: - Private

    private func resourcesRoot() -> URL? {
        if let bundled = Bundle.main.resourceURL?.appendingPathComponent("desktop-runtime", isDirectory: true),
           FileManager.default.fileExists(atPath: bundled.path) {
            return bundled
        }
        if let devRoot = ProcessInfo.processInfo.environment["QRCLAW_DESKTOP_DEV_ROOT"] {
            return URL(fileURLWithPath: devRoot, isDirectory: true)
        }
        return nil
    }

    private func startServices() async {
        phase = .launching
        health = .starting
        webHealth = .starting
        gatewayHealth = .starting
        hostHealth = .starting

        guard let root = resourcesRoot() else {
            phase = .error("Bundled runtime not found. Run scripts/build-desktop-resources.sh first.")
            health = .failed
            return
        }

        claimExclusivePorts()

        let nodeBin = root.appendingPathComponent("node/bin/node")
        let hostBin = root.appendingPathComponent("qrclaw-agent-host")
        let webServer = root.appendingPathComponent("web/server.js")
        let hostSecrets = DesktopSecretsLoader.load()
        let publicConfig = DesktopPublicConfig.load(from: root)

        // The dev-full bundle is the only one that ships the mint-host script + full gateway.
        // The clean (distributable) bundle ships only the slim desktop-local gateway.
        let mintScript = root.appendingPathComponent("scripts/mint-host-token-and-run.sh")
        let isDevFullBundle = FileManager.default.fileExists(atPath: mintScript.path)
        var useFullGateway = isDevFullBundle && DesktopSecretsLoader.hasHostSecrets

        if !useFullGateway, await tryCloudBootstrap(publicConfig: publicConfig) {
            useFullGateway = false
        }

        let gatewayScript: URL
        if useFullGateway {
            gatewayScript = root.appendingPathComponent("gateway/dist/gateway/src/server.js")
        } else {
            gatewayScript = root.appendingPathComponent("gateway/dist/gateway/src/server-desktop.js")
        }

        guard FileManager.default.fileExists(atPath: nodeBin.path),
              FileManager.default.fileExists(atPath: gatewayScript.path),
              FileManager.default.fileExists(atPath: webServer.path) else {
            phase = .error("Runtime binaries missing in bundle.")
            health = .failed
            return
        }

        let hostTokenPepper = localHostTokenPepper()
        DesktopSecretsLoader.persistHostTokenPepper(hostTokenPepper)

        do {
            var gatewayEnv: [String: String] = [
                "PORT": String(gatewayPort),
                "HOST": "127.0.0.1",
                "CORS_ORIGIN": corsOrigins,
                "QRCLAW_BUNDLE_MARKER": Self.bundleMarker,
            ]

            if useFullGateway {
                for (key, value) in hostSecrets {
                    gatewayEnv[key] = value
                }
                gatewayEnv["PORT"] = String(gatewayPort)
                gatewayEnv["HOST"] = "127.0.0.1"
                gatewayEnv["CORS_ORIGIN"] = corsOrigins
                // Same pepper the mint script uses so host-token auth matches.
                gatewayEnv["QRCLAW_HOST_TOKEN_PEPPER"] = hostTokenPepper
                gatewayEnv["REDIS_DISABLED_FOR_DESKTOP"] = "1"
                QRClawLogger.orchestrator.info("Using full local gateway with host secrets")
            } else {
                gatewayEnv["DESKTOP_LOCAL_MODE"] = "1"
                gatewayEnv["DESKTOP_CLOUD_GATEWAY_URL"] = DesktopKeychain.load(.cloudGatewayUrl)
                    ?? hostSecrets["GATEWAY_BASE_URL"]
                    ?? publicConfig.cloudGatewayUrl
                gatewayEnv["DESKTOP_RUNTIME_TOKEN"] = DesktopKeychain.load(.desktopRuntimeToken) ?? "desktop-local-dev"
                gatewayEnv["DESKTOP_LOCAL_TICKET_KEY"] = DesktopKeychain.load(.localWsTicketSecret) ?? UUID().uuidString
                gatewayEnv["REDIS_DISABLED_FOR_DESKTOP"] = "1"
                QRClawLogger.orchestrator.info("Using desktop-local gateway (no host secrets)")
            }

            if await isOurBundleGateway() {
                QRClawLogger.orchestrator.info("Reusing bundled gateway on :\(self.gatewayPort)")
                gatewayHealth = .healthy
            } else {
                try supervisor.start(
                    id: "gateway",
                    executable: nodeBin,
                    arguments: [gatewayScript.path],
                    environment: gatewayEnv,
                    logFile: logDir.appendingPathComponent("gateway.log")
                )
                gatewayHealth = await waitForHealth(url: "http://127.0.0.1:\(gatewayPort)/health") ? .healthy : .failed
            }

            // Start web before host attach — mint/login can take 30–90s and must not block the shell.

            var webEnv: [String: String] = [
                "PORT": String(webPort),
                "HOSTNAME": "127.0.0.1",
                "DESKTOP_AUTO_BOOTSTRAP": "1",
                "LOCAL_DEV_BOOTSTRAP": "1",
                "LOCAL_DEV_EMAIL": Self.localDevEmail,
                "LOCAL_DEV_PASSWORD": Self.localDevPassword,
                "QRCLAW_BUNDLE_MARKER": Self.bundleMarker,
            ]
            publicConfig.apply(to: &webEnv)
            for key in ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY",
                        "SUPABASE_URL", "SUPABASE_ANON_KEY"] {
                if let v = hostSecrets[key] ?? hostSecrets[key.replacingOccurrences(of: "NEXT_PUBLIC_", with: "")] {
                    webEnv[key] = v
                }
            }
            webEnv["NEXT_PUBLIC_GATEWAY_URL"] = "http://127.0.0.1:\(gatewayPort)"
            webEnv["NEXT_PUBLIC_GATEWAY_WS_URL"] = "ws://127.0.0.1:\(gatewayPort)/ws"
            webEnv["NEXT_PUBLIC_DESKTOP_SHELL"] = "1"
            webEnv["NEXT_PUBLIC_LOCAL_DEV"] = "1"
            webEnv["NEXT_PUBLIC_LOCAL_DEV_EMAIL"] = publicConfig.localDevEmail
            webEnv["NEXT_PUBLIC_LOCAL_DEV_PASSWORD"] = publicConfig.localDevPassword

            if await isOurBundleWeb() {
                QRClawLogger.orchestrator.info("Reusing bundled web on :\(self.webPort)")
                webHealth = .healthy
            } else {
                try supervisor.start(
                    id: "web",
                    executable: nodeBin,
                    arguments: [webServer.path],
                    environment: webEnv,
                    logFile: logDir.appendingPathComponent("web.log")
                )
                webHealth = await waitForHTTP(url: "http://127.0.0.1:\(webPort)/chat?desktop=1") ? .healthy : .failed
            }

            if gatewayHealth == .healthy && webHealth == .healthy {
                phase = .ready
                health = .healthy
                QRClawLogger.orchestrator.info("Gateway + web ready — opening Chat")
            } else {
                phase = .error("Failed to start local services. Check Settings → Open Logs Folder.")
                health = .failed
            }

            if gatewayHealth == .healthy && webHealth == .healthy {
                Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 400_000_000)
                    let attached = await ensureHostAttached(
                        hostBin: hostBin,
                        root: root,
                        nodeBin: nodeBin,
                        useFullGateway: useFullGateway,
                        hostSecrets: hostSecrets,
                        hostTokenPepper: hostTokenPepper
                    )
                    startedHostDaemon = attached
                    hostHealth = attached ? .healthy : .degraded
                }
            } else if gatewayHealth != .healthy {
                hostHealth = .idle
            }
        } catch {
            phase = .error(error.localizedDescription)
            health = .failed
        }
    }

    /// Up to 3 attach attempts with daemon stop between retries.
    private func ensureHostAttached(
        hostBin: URL,
        root: URL,
        nodeBin: URL,
        useFullGateway: Bool,
        hostSecrets: [String: String],
        hostTokenPepper: String
    ) async -> Bool {
        guard FileManager.default.fileExists(atPath: hostBin.path) else {
            QRClawLogger.orchestrator.error("Host binary missing in bundle")
            return false
        }

        // Never reuse a stale daemon: it may hold a host token for the wrong owner.
        if await hostDaemonHasAgents() {
            QRClawLogger.orchestrator.info("Reusing host daemon — agents already detected")
            return true
        }

        if await isHostDaemonHealthy() {
            QRClawLogger.orchestrator.info("Stopping existing host daemon before fresh attach")
            stopHostDaemonProcess(hostBin: hostBin)
            try? await Task.sleep(nanoseconds: 1_000_000_000)
        }

        for attempt in 1...3 {
            QRClawLogger.orchestrator.info("Host attach attempt \(attempt)/3")
            if attempt > 1 {
                stopHostDaemonProcess(hostBin: hostBin)
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }

            var launched = false
            if useFullGateway {
                var hostSecretsWithPepper = hostSecrets
                hostSecretsWithPepper["QRCLAW_HOST_TOKEN_PEPPER"] = hostTokenPepper
                let userId = await runLocalSeed(nodeBin: nodeBin, root: root, secrets: hostSecretsWithPepper)
                if userId.isEmpty {
                    QRClawLogger.orchestrator.error("Host attach skipped — no user_id from seed")
                } else {
                    launched = await attachAgentHost(
                        hostBin: hostBin,
                        root: root,
                        userId: userId,
                        secrets: hostSecretsWithPepper
                    )
                }
            } else if let hostToken = DesktopKeychain.load(.hostToken), !hostToken.isEmpty {
                launched = await attachHostDirect(hostBin: hostBin, token: hostToken)
            } else {
                QRClawLogger.orchestrator.error("No host token in Keychain for slim gateway attach")
            }

            if await waitForHealth(url: "http://127.0.0.1:19515/health", tries: 40) {
                QRClawLogger.orchestrator.info("Host daemon healthy after attempt \(attempt)")
                return true
            }

            if !launched {
                QRClawLogger.orchestrator.error("Host attach launch failed on attempt \(attempt)")
            }
        }

        QRClawLogger.orchestrator.error("Host attach failed after 3 attempts")
        return false
    }

    private func isHostDaemonHealthy() async -> Bool {
        guard await checkURL("http://127.0.0.1:19515/health") else { return false }
        return true
    }

    private func stopHostDaemonProcess(hostBin: URL) {
        let process = Process()
        process.executableURL = hostBin
        process.arguments = ["daemon", "stop"]
        try? process.run()
        process.waitUntilExit()
    }

    /// Seeds the local owner and returns its Supabase user_id (parsed from seed JSON stdout).
    private func runLocalSeed(nodeBin: URL, root: URL, secrets: [String: String]) async -> String {
        let seedScript = root.appendingPathComponent("scripts/seed-local-owner.mjs")
        guard FileManager.default.fileExists(atPath: seedScript.path) else { return "" }

        var env = processEnvironment()
        for (k, v) in secrets { env[k] = v }

        let process = Process()
        process.executableURL = nodeBin
        process.arguments = [seedScript.path]
        process.environment = env
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice

        do {
            try process.run()
            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            process.waitUntilExit()
            let output = String(data: data, encoding: .utf8) ?? ""
            QRClawLogger.orchestrator.info("Local owner seed completed")
            return parseUserId(from: output, secrets: secrets)
        } catch {
            QRClawLogger.orchestrator.error("Seed failed: \(error.localizedDescription, privacy: .public)")
            return secrets["QRCLAW_ATTACH_USER_ID"] ?? ""
        }
    }

    private func parseUserId(from output: String, secrets: [String: String]) -> String {
        for line in output.split(separator: "\n").reversed() {
            guard let data = line.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let uid = obj["user_id"] as? String, !uid.isEmpty else { continue }
            return uid
        }
        return secrets["QRCLAW_ATTACH_USER_ID"] ?? ""
    }

    /// Runs the bundled mint-host script: mints a host token, logs in, starts the daemon.
    private func attachAgentHost(
        hostBin: URL,
        root: URL,
        userId: String,
        secrets: [String: String]
    ) async -> Bool {
        let mintScript = root.appendingPathComponent("scripts/mint-host-token-and-run.sh")
        guard FileManager.default.fileExists(atPath: mintScript.path) else {
            QRClawLogger.orchestrator.error("mint-host script not bundled")
            return false
        }

        var env = processEnvironment()
        for (k, v) in secrets { env[k] = v }
        env["QRCLAW_HOST_BIN"] = hostBin.path
        env["QRCLAW_GATEWAY_PORT"] = String(gatewayPort)
        env["QRCLAW_WS_URL"] = "ws://127.0.0.1:\(gatewayPort)/ws"
        env["QRCLAW_WEB_URL"] = "http://127.0.0.1:\(webPort)"
        env["QRCLAW_LOG_DIR"] = logDir.path
        env["QRCLAW_USER_ID"] = userId
        env["QRCLAW_SECRETS"] = DesktopSecretsLoader.secretsPath.path

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [mintScript.path, userId]
        process.environment = env
        FileManager.default.createFile(atPath: logDir.appendingPathComponent("host-attach.log").path, contents: nil)
        if let handle = try? FileHandle(forWritingTo: logDir.appendingPathComponent("host-attach.log")) {
            process.standardOutput = handle
            process.standardError = handle
        }

        do {
            try process.run()
            process.waitUntilExit()
            let ok = process.terminationStatus == 0
            QRClawLogger.orchestrator.info(
                "Agent host attach finished (exit \(process.terminationStatus), ok=\(ok))"
            )
            return ok
        } catch {
            QRClawLogger.orchestrator.error("Host attach failed: \(error.localizedDescription, privacy: .public)")
            return false
        }
    }

    /// Stops the detached agent-host daemon on quit (daemon runs via Setsid, outside ProcessSupervisor).
    /// No-op unless this app started the daemon — never kills a dev-up-owned daemon.
    func stopAgentHostDaemon() {
        guard startedHostDaemon else { return }
        guard let root = resourcesRoot() else { return }
        let hostBin = root.appendingPathComponent("qrclaw-agent-host")
        guard FileManager.default.fileExists(atPath: hostBin.path) else { return }
        let process = Process()
        process.executableURL = hostBin
        process.arguments = ["daemon", "stop"]
        try? process.run()
        process.waitUntilExit()
    }

    private func stopServices() {
        supervisor.stopAll()
        webHealth = .idle
        gatewayHealth = .idle
        hostHealth = .idle
    }

    private func processEnvironment(_ overrides: [String: String] = [:]) -> [String: String] {
        var env = ProcessSupervisor.augmentedEnvironment(base: ProcessInfo.processInfo.environment)
        for (key, value) in overrides {
            env[key] = value
        }
        return env
    }

    /// True when :19515 is up and reports at least one detected provider CLI.
    private func hostDaemonHasAgents() async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:19515/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
            guard obj["status"] as? String == "running" else { return false }
            let agents = obj["agents"] as? [Any] ?? []
            return !agents.isEmpty
        } catch {
            return false
        }
    }

    private func waitForHealth(url: String, tries: Int = 30) async -> Bool {
        for _ in 0..<tries {
            if await checkURL(url) { return true }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        return false
    }

    private func waitForHTTP(url: String, tries: Int = 45) async -> Bool {
        for _ in 0..<tries {
            if await checkHTTPStatus(url) == 200 { return true }
            try? await Task.sleep(nanoseconds: 500_000_000)
        }
        return false
    }

    /// Only reuse listeners that belong to this desktop bundle (not next dev / dev-up).
    nonisolated private func isOurBundleGateway() async -> Bool {
        guard let url = URL(string: "http://127.0.0.1:3100/health") else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard (response as? HTTPURLResponse)?.statusCode == 200 else { return false }
            guard let obj = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return false }
            return obj["qrclawBundle"] as? Bool == true
        } catch {
            return false
        }
    }

    nonisolated private func isOurBundleWeb() async -> Bool {
        guard await isOurBundleGateway() else { return false }
        return await checkHTTPStatus("http://127.0.0.1:3000/chat?desktop=1") == 200
    }

    nonisolated private func checkURL(_ urlString: String) async -> Bool {
        guard let url = URL(string: urlString) else { return false }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode == 200
        } catch {
            return false
        }
    }

    nonisolated private func checkHTTPStatus(_ urlString: String) async -> Int {
        guard let url = URL(string: urlString) else { return 0 }
        var request = URLRequest(url: url)
        request.timeoutInterval = 2
        do {
            let (_, response) = try await URLSession.shared.data(for: request)
            return (response as? HTTPURLResponse)?.statusCode ?? 0
        } catch {
            return 0
        }
    }

    deinit {
        supervisor.stopAll()
    }
}

extension ServiceOrchestrator {
    func stopForVerify() {
        stopServices()
    }
}
