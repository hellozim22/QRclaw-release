import Foundation
import Security

enum DesktopKeychain {
    private static let service = "ai.qrclaw.desktop"

    enum Key: String {
        case supabaseAccessToken = "supabase_access_token"
        case supabaseRefreshToken = "supabase_refresh_token"
        case supabaseExpiresAt = "supabase_expires_at"
        case desktopRuntimeToken = "desktop_runtime_token"
        case hostToken = "host_token"
        case localWsTicketSecret = "local_ws_ticket_secret"
        case hostTokenPepper = "host_token_pepper"
        case cloudGatewayUrl = "cloud_gateway_url"
        case ownerId = "owner_id"
    }

    static func save(_ value: String, for key: Key) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
        var add = query
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        let status = SecItemAdd(add as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw KeychainError.unhandled(status)
        }
    }

    static func load(_ key: Key) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: Key) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key.rawValue,
        ]
        SecItemDelete(query as CFDictionary)
    }

    static func clearAll() {
        for key in [Key.supabaseAccessToken, .supabaseRefreshToken, .supabaseExpiresAt,
                    .desktopRuntimeToken, .hostToken, .localWsTicketSecret, .hostTokenPepper,
                    .cloudGatewayUrl, .ownerId] {
            delete(key)
        }
    }

    static var hasSession: Bool {
        load(.desktopRuntimeToken) != nil && load(.supabaseAccessToken) != nil
    }

    enum KeychainError: Error {
        case unhandled(OSStatus)
    }
}
