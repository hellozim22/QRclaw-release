import Foundation
import WebKit

final class DesktopBridgeScriptHandler: NSObject, WKScriptMessageHandler {
    weak var webView: WKWebView?

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == WebViewBridge.messageHandlerName,
              let body = message.body as? [String: Any],
              let id = body["id"] as? String,
              let action = body["action"] as? String else {
            return
        }

        Task { @MainActor in
            handle(id: id, action: action)
        }
    }

    @MainActor
    private func handle(id: String, action: String) {
        let payload: [String: Any]
        switch action {
        case "getAppVersion":
            payload = UpdateService.shared.appVersionPayload()
        case "checkForUpdates":
            payload = UpdateService.shared.checkForUpdates()
        default:
            payload = [
                "status": "error",
                "message": "Unknown desktop bridge action: \(action)",
            ]
        }
        resolve(id: id, payload: payload)
    }

    @MainActor
    private func resolve(id: String, payload: [String: Any]) {
        var body = payload
        body["id"] = id

        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body),
              let json = String(data: data, encoding: .utf8) else {
            return
        }
        webView?.evaluateJavaScript("window.qrclawDesktop && window.qrclawDesktop.__resolve(\(json));")
    }
}

enum WebViewBridge {
    static let messageHandlerName = "qrclawDesktopBridge"
    static let userAgentSuffix = "QRClawDesktop"

    static func desktopBootstrapScript() -> WKUserScript {
        let source = """
        (function() {
          if (window.qrclawDesktop) return;
          var pending = {};
          var nextId = 1;
          function callNative(action) {
            return new Promise(function(resolve) {
              if (!window.webkit || !window.webkit.messageHandlers || !window.webkit.messageHandlers.\(messageHandlerName)) {
                resolve({ status: 'unavailable', message: 'Desktop bridge is unavailable.' });
                return;
              }
              var id = String(nextId++);
              var timeout = window.setTimeout(function() {
                if (!pending[id]) return;
                delete pending[id];
                resolve({ status: 'error', message: '桌面更新检测超时，请稍后重试。' });
              }, 10000);
              pending[id] = function(payload) {
                window.clearTimeout(timeout);
                resolve(payload);
              };
              window.webkit.messageHandlers.\(messageHandlerName).postMessage({ id: id, action: action });
            });
          }
          window.qrclawDesktop = {
            platform: 'desktop',
            ready: function() { return true; },
            getAppVersion: function() { return callNative('getAppVersion'); },
            checkForUpdates: function() { return callNative('checkForUpdates'); },
            __resolve: function(payload) {
              var resolve = pending[payload.id];
              if (!resolve) return;
              delete pending[payload.id];
              resolve(payload);
            }
          };
          window.bibishengDesktop = window.qrclawDesktop;
        })();
        """
        return WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
    }

    static func makeConfiguration(messageHandler: DesktopBridgeScriptHandler) -> WKWebViewConfiguration {
        let config = WKWebViewConfiguration()
        config.defaultWebpagePreferences.allowsContentJavaScript = true
        config.userContentController.addUserScript(desktopBootstrapScript())
        config.userContentController.add(messageHandler, name: messageHandlerName)
        return config
    }
}
