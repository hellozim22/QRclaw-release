import SwiftUI
import WebKit

struct ContentWebView: NSViewRepresentable {
    let section: SidebarSection

    func makeCoordinator() -> Coordinator {
        Coordinator()
    }

    func makeNSView(context: Context) -> WKWebView {
        let config = WebViewBridge.makeConfiguration(messageHandler: context.coordinator.bridgeHandler)
        let webView = WKWebView(frame: .zero, configuration: config)
        context.coordinator.bridgeHandler.webView = webView
        webView.setValue(false, forKey: "drawsBackground")
        webView.configuration.applicationNameForUserAgent = WebViewBridge.userAgentSuffix
        webView.setContentHuggingPriority(.defaultLow, for: .horizontal)
        webView.setContentHuggingPriority(.defaultLow, for: .vertical)
        webView.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        webView.setContentCompressionResistancePriority(.defaultLow, for: .vertical)

        if let url = sectionURL(section) {
            webView.load(URLRequest(url: url))
            QRClawLogger.webView.info("Loading \(section.path, privacy: .public)")
        }
        return webView
    }

    func updateNSView(_ webView: WKWebView, context: Context) {
        guard let url = sectionURL(section) else { return }
        if webView.url?.absoluteString != url.absoluteString {
            webView.load(URLRequest(url: url))
            QRClawLogger.webView.info("Navigating to \(section.path, privacy: .public)")
        }
    }

    private func sectionURL(_ section: SidebarSection) -> URL? {
        URL(string: "http://127.0.0.1:3000/\(section.path)?desktop=1")
    }

    final class Coordinator {
        let bridgeHandler = DesktopBridgeScriptHandler()
    }
}
