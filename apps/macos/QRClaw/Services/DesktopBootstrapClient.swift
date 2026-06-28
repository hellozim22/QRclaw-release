import Foundation

struct BootstrapExchangeResponse: Codable, Sendable {
    let ownerId: String
    let supabaseSession: SupabaseSession
    let desktopRuntimeToken: String
    let hostToken: String
    let cloudGatewayUrl: String

    struct SupabaseSession: Codable, Sendable {
        let accessToken: String
        let refreshToken: String
        let expiresAt: Int

        enum CodingKeys: String, CodingKey {
            case accessToken = "access_token"
            case refreshToken = "refresh_token"
            case expiresAt = "expires_at"
        }
    }

    enum CodingKeys: String, CodingKey {
        case ownerId
        case supabaseSession
        case desktopRuntimeToken
        case hostToken
        case cloudGatewayUrl
    }
}

struct BootstrapErrorResponse: Codable {
    let code: String
    let message: String?
}

actor DesktopBootstrapClient {
    static let shared = DesktopBootstrapClient()

    private let cloudBaseURL: URL

    init(cloudBaseURL: URL = URL(string: ProcessInfo.processInfo.environment["QRCLAW_CLOUD_GATEWAY_URL"]
        ?? "https://gateway-test.qrclaw.ai")!) {
        self.cloudBaseURL = cloudBaseURL
    }

    func exchangeWithEmail(_ email: String, deviceName: String, appVersion: String) async throws -> BootstrapExchangeResponse {
        try await exchangeBody([
            "email": email,
            "deviceName": deviceName,
            "appVersion": appVersion,
        ], logLabel: "email bootstrap")
    }

    func exchange(inviteCode: String, deviceName: String, appVersion: String) async throws -> BootstrapExchangeResponse {
        try await exchangeBody([
            "inviteCode": inviteCode,
            "deviceName": deviceName,
            "appVersion": appVersion,
        ], logLabel: "invite bootstrap")
    }

    private func exchangeBody(_ body: [String: String], logLabel: String) async throws -> BootstrapExchangeResponse {
        var request = URLRequest(url: cloudBaseURL.appendingPathComponent("/api/desktop/bootstrap/exchange"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(body)
        request.timeoutInterval = 30

        QRClawLogger.bootstrap.info("Cloud \(logLabel, privacy: .public)")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse else {
            throw BootstrapError.network
        }

        if http.statusCode >= 400 {
            if let root = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let errObj = root["error"] as? [String: Any],
               let code = errObj["code"] as? String {
                let message = errObj["message"] as? String
                throw BootstrapError.server(code: code, message: message)
            }
            throw BootstrapError.httpStatus(http.statusCode)
        }

        return try JSONDecoder().decode(BootstrapExchangeResponse.self, from: data)
    }

    func persistToKeychain(_ response: BootstrapExchangeResponse) throws {
        try DesktopKeychain.save(response.desktopRuntimeToken, for: .desktopRuntimeToken)
        try DesktopKeychain.save(response.supabaseSession.accessToken, for: .supabaseAccessToken)
        try DesktopKeychain.save(response.supabaseSession.refreshToken, for: .supabaseRefreshToken)
        try DesktopKeychain.save(String(response.supabaseSession.expiresAt), for: .supabaseExpiresAt)
        try DesktopKeychain.save(response.hostToken, for: .hostToken)
        try DesktopKeychain.save(response.cloudGatewayUrl, for: .cloudGatewayUrl)
        try DesktopKeychain.save(response.ownerId, for: .ownerId)
    }

    enum BootstrapError: LocalizedError {
        case network
        case httpStatus(Int)
        case server(code: String, message: String?)

        var errorDescription: String? {
            switch self {
            case .network:
                "Could not reach the QRClaw cloud gateway."
            case .httpStatus(let code):
                "Bootstrap failed with HTTP \(code)."
            case .server(let code, let message):
                message ?? "Bootstrap failed: \(code)"
            }
        }
    }
}
