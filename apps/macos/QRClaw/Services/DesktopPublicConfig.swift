import Foundation

/// Public runtime config baked into the bundle at build time (no secrets).
/// Enables Chat bootstrap without ~/.config/qrclaw/secrets.env on the web tier.
struct DesktopPublicConfig: Sendable {
    let supabaseUrl: String?
    let supabaseAnonKey: String?
    let localDevEmail: String
    let localDevPassword: String
    let cloudGatewayUrl: String

    static let defaultLocalDevEmail = "local-dev@localhost"
    static let defaultLocalDevPassword = "CHANGE_ME_LOCAL_DEV_PASSWORD"
    static let defaultCloudGateway = "https://gateway-test.qrclaw.ai"

    var hasSupabasePublic: Bool {
        guard let supabaseUrl, let supabaseAnonKey else { return false }
        return !supabaseUrl.isEmpty && !supabaseAnonKey.isEmpty
    }

    static func load(from root: URL) -> DesktopPublicConfig {
        let candidates = [
            root.appendingPathComponent("desktop-public.env.json"),
            root.appendingPathComponent("web/desktop-public.env.json"),
        ]
        for url in candidates {
            guard FileManager.default.fileExists(atPath: url.path),
                  let data = try? Data(contentsOf: url),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { continue }
            return DesktopPublicConfig(
                supabaseUrl: obj["supabaseUrl"] as? String,
                supabaseAnonKey: obj["supabaseAnonKey"] as? String,
                localDevEmail: (obj["localDevEmail"] as? String) ?? defaultLocalDevEmail,
                localDevPassword: (obj["localDevPassword"] as? String) ?? defaultLocalDevPassword,
                cloudGatewayUrl: (obj["cloudGatewayUrl"] as? String) ?? defaultCloudGateway
            )
        }
        return DesktopPublicConfig(
            supabaseUrl: nil,
            supabaseAnonKey: nil,
            localDevEmail: defaultLocalDevEmail,
            localDevPassword: defaultLocalDevPassword,
            cloudGatewayUrl: defaultCloudGateway
        )
    }

    func apply(to env: inout [String: String]) {
        if let supabaseUrl, !supabaseUrl.isEmpty {
            env["NEXT_PUBLIC_SUPABASE_URL"] = supabaseUrl
            env["SUPABASE_URL"] = supabaseUrl
        }
        if let supabaseAnonKey, !supabaseAnonKey.isEmpty {
            env["NEXT_PUBLIC_SUPABASE_ANON_KEY"] = supabaseAnonKey
            env["SUPABASE_ANON_KEY"] = supabaseAnonKey
        }
        env["LOCAL_DEV_EMAIL"] = localDevEmail
        env["LOCAL_DEV_PASSWORD"] = localDevPassword
        env["NEXT_PUBLIC_LOCAL_DEV_EMAIL"] = localDevEmail
        env["NEXT_PUBLIC_LOCAL_DEV_PASSWORD"] = localDevPassword
    }
}
