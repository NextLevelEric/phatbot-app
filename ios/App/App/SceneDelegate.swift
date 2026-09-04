import UIKit
import Capacitor

final class PHATBOTBridgeViewController: CAPBridgeViewController {
    private let phatbotPreviewURL = URL(string: "https://phatbot-app-git-feature-athlete-mobile-shell-next-level11.vercel.app/")!

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HealthKitPlugin())

        // TestFlight beta must render the remote PHATBOT preview inside Capacitor's
        // WKWebView. Explicitly loading it here prevents iOS from treating the
        // configured remote server URL as an external Safari destination.
        if bridge?.webView?.url?.host != phatbotPreviewURL.host {
            bridge?.webView?.load(URLRequest(url: phatbotPreviewURL))
        }
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = PHATBOTBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
