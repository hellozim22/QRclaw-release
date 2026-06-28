import OSLog

enum QRClawLogger {
    static let subsystem = "ai.qrclaw.desktop"

    static let app = Logger(subsystem: subsystem, category: "App")
    static let window = Logger(subsystem: subsystem, category: "Windowing")
    static let sidebar = Logger(subsystem: subsystem, category: "Sidebar")
    static let commands = Logger(subsystem: subsystem, category: "Commands")
    static let orchestrator = Logger(subsystem: subsystem, category: "Orchestrator")
    static let webView = Logger(subsystem: subsystem, category: "WebView")
    static let bootstrap = Logger(subsystem: subsystem, category: "Bootstrap")
}
