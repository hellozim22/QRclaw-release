import Foundation

enum ServiceHealth: String, Sendable {
    case idle
    case starting
    case healthy
    case degraded
    case failed
}
