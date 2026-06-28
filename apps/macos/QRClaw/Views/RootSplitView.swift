import SwiftUI

struct RootSplitView: View {
    @State private var selection: SidebarSection? = .chat
    @StateObject private var orchestrator = ServiceOrchestrator.shared

    var body: some View {
        Group {
            switch orchestrator.phase {
            case .launching:
                LaunchView(health: orchestrator.health)
            case .error(let message):
                ErrorRecoveryView(message: message, onRetry: orchestrator.retry)
            case .ready:
                mainContent
            }
        }
        .task {
            await orchestrator.startIfNeeded()
        }
    }

    /// Full-width WKWebView — navigation matches the browser sidebar inside the web app.
    private var mainContent: some View {
        ContentWebView(section: selection ?? .chat)
            .frame(minWidth: 960, minHeight: 640)
            .focusedSceneValue(\.sidebarSelection, $selection)
    }
}

struct SidebarCommands: Commands {
    @FocusedValue(\.sidebarSelection) private var selection

    var body: some Commands {
        CommandGroup(replacing: .sidebar) {
            Button("Chat") {
                selection?.wrappedValue = .chat
            }
            .keyboardShortcut("1", modifiers: .command)

            Button("Progress") {
                selection?.wrappedValue = .progress
            }
            .keyboardShortcut("2", modifiers: .command)

            Button("Agents") {
                selection?.wrappedValue = .agents
            }
            .keyboardShortcut("3", modifiers: .command)
        }
    }
}

private struct SidebarSelectionKey: FocusedValueKey {
    typealias Value = Binding<SidebarSection?>
}

extension FocusedValues {
    var sidebarSelection: Binding<SidebarSection?>? {
        get { self[SidebarSelectionKey.self] }
        set { self[SidebarSelectionKey.self] = newValue }
    }
}
