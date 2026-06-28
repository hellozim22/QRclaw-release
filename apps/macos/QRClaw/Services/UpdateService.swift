import Foundation
import Sparkle

@MainActor
final class UpdateService: ObservableObject {
    static let shared = UpdateService()

    @Published private(set) var lastStatus: String = "idle"
    @Published private(set) var lastMessage: String = ""

    private lazy var updaterController = SPUStandardUpdaterController(
        startingUpdater: true,
        updaterDelegate: nil,
        userDriverDelegate: nil
    )

    private init() {}

    var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.1.0"
    }

    var currentBuild: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "1"
    }

    var feedURL: String? {
        Bundle.main.infoDictionary?["SUFeedURL"] as? String
    }

    var isConfigured: Bool {
        guard let feedURL, !feedURL.isEmpty else { return false }
        let publicKey = Bundle.main.infoDictionary?["SUPublicEDKey"] as? String
        return publicKey?.isEmpty == false
    }

    func startAutomaticChecksIfConfigured() {
        guard isConfigured else { return }
        _ = updaterController
    }

    func appVersionPayload() -> [String: Any] {
        [
            "status": "ok",
            "currentVersion": currentVersion,
            "currentBuild": currentBuild,
            "configured": isConfigured,
            "feedURL": feedURL ?? "",
        ]
    }

    func checkForUpdates() -> [String: Any] {
        guard isConfigured else {
            lastStatus = "not_configured"
            lastMessage = "更新源尚未配置。正式发布时需要设置 Sparkle appcast 与公钥。"
            return [
                "status": lastStatus,
                "message": lastMessage,
                "currentVersion": currentVersion,
                "currentBuild": currentBuild,
            ]
        }

        lastStatus = "checking_started"
        lastMessage = "已打开更新检测。如果有新版本，系统会提示你确认下载。"
        updaterController.checkForUpdates(nil)
        return [
            "status": lastStatus,
            "message": lastMessage,
            "currentVersion": currentVersion,
            "currentBuild": currentBuild,
            "feedURL": feedURL ?? "",
        ]
    }
}
