enum SidebarSection: String, CaseIterable, Identifiable {
    case chat
    case progress
    case agents

    var id: String { rawValue }

    var title: String {
        switch self {
        case .chat: "Chat"
        case .progress: "Progress"
        case .agents: "Agents"
        }
    }

    var systemImage: String {
        switch self {
        case .chat: "bubble.left.and.bubble.right"
        case .progress: "square.grid.2x2"
        case .agents: "person.2"
        }
    }

    var path: String {
        switch self {
        case .chat: "chat"
        case .progress: "progress"
        case .agents: "agents"
        }
    }
}
