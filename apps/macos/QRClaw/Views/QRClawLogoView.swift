import SwiftUI
import AppKit

/// QRClaw brand mark from bundled Resources (same asset as web sidebar).
struct QRClawLogoView: View {
    var size: CGFloat = 32

    var body: some View {
        Group {
            if let image = Self.loadImage() {
                Image(nsImage: image)
                    .resizable()
                    .interpolation(.high)
                    .aspectRatio(contentMode: .fit)
            } else {
                Image(systemName: "qrcode")
                    .font(.system(size: size * 0.65))
                    .foregroundStyle(.primary)
            }
        }
        .frame(width: size, height: size)
        .accessibilityLabel("QRClaw")
    }

    private static func loadImage() -> NSImage? {
        guard let url = Bundle.main.url(forResource: "qrclaw-logo-icon", withExtension: "png") else {
            return nil
        }
        return NSImage(contentsOf: url)
    }
}
