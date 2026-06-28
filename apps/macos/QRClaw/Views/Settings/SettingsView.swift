import SwiftUI

struct SettingsView: View {
    @StateObject private var orchestrator = ServiceOrchestrator.shared

    var body: some View {
        Form {
            Section("Account") {
                LabeledContent("Status") {
                    Text(orchestrator.isLoggedIn ? "Signed in" : "Not signed in")
                }
            }

            Section("Runtime") {
                LabeledContent("Web") {
                    statusBadge(orchestrator.webHealth)
                }
                LabeledContent("Gateway") {
                    statusBadge(orchestrator.gatewayHealth)
                }
                LabeledContent("Agent Host") {
                    statusBadge(orchestrator.hostHealth)
                }

                Button("Restart Services") {
                    Task { await orchestrator.restart() }
                }
            }

            Section("Diagnostics") {
                Button("Open Logs Folder") {
                    orchestrator.openLogsFolder()
                }
            }

            Section("About") {
                LabeledContent("Version") {
                    Text(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0")
                }
                LabeledContent("Mode") {
                    Text(DesktopSecretsLoader.hasHostSecrets ? "Local (full)" : "Desktop-local")
                }
            }

            Section("Reset") {
                Button("Restart & Clear Session", role: .destructive) {
                    Task { await orchestrator.signOut() }
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 420, height: 360)
    }

    @ViewBuilder
    private func statusBadge(_ health: ServiceHealth) -> some View {
        Text(health.rawValue.capitalized)
            .foregroundStyle(health == .healthy ? .green : .secondary)
    }
}
