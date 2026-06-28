import SwiftUI

struct LaunchView: View {
    let health: ServiceHealth

    var body: some View {
        VStack(spacing: 20) {
            QRClawLogoView(size: 72)

            Text("QRClaw")
                .font(.largeTitle)
                .fontWeight(.semibold)

            ProgressView()
                .controlSize(.regular)

            Text(statusText)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 360)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(.background)
    }

    private var statusText: String {
        switch health {
        case .idle, .starting:
            "Starting Chat, Progress, and Agents…"
        case .healthy:
            "Almost ready…"
        case .degraded:
            "Some services are still starting…"
        case .failed:
            "Startup failed — check logs in Settings"
        }
    }
}
