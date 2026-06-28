import AppKit
import SwiftUI

@main
struct QRClawApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            RootSplitView()
        }
        .defaultSize(width: 1280, height: 800)
        .defaultPosition(.center)
        .commands {
            SidebarCommands()
        }

        Settings {
            SettingsView()
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        Task { @MainActor in
            UpdateService.shared.startAutomaticChecksIfConfigured()
        }
        QRClawLogger.app.info("QRClaw launched")
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    func applicationWillTerminate(_ notification: Notification) {
        QRClawLogger.app.info("QRClaw terminating — tearing down services")
        let orchestrator = ServiceOrchestrator.shared
        orchestrator.stopAgentHostDaemon()
        orchestrator.stopForVerify()
    }
}
