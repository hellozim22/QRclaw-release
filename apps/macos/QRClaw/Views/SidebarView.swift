import SwiftUI

struct SidebarView: View {
    @Binding var selection: SidebarSection?

    var body: some View {
        VStack(spacing: 0) {
            QRClawLogoView(size: 36)
                .padding(.top, 16)
                .padding(.bottom, 12)

            List(SidebarSection.allCases, selection: $selection) { section in
                Label(section.title, systemImage: section.systemImage)
                    .tag(section)
            }
            .listStyle(.sidebar)
        }
        .navigationTitle("QRClaw")
        .onChange(of: selection) { _, newValue in
            if let section = newValue {
                QRClawLogger.sidebar.info("Selected sidebar item: \(section.rawValue, privacy: .public)")
            }
        }
    }
}
