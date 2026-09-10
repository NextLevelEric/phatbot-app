import UIKit
import Capacitor

final class PHATBOTBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(HealthKitPlugin())
        bridge?.registerPluginInstance(PHATBOTMediaPlugin())
    }
}

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private func openTrainTogetherLink(_ url: URL) -> Bool {
        guard url.scheme == "https",
              ["app.phatbotfit.com", "phatbot-app.vercel.app"].contains(url.host?.lowercased() ?? ""),
              url.path.hasPrefix("/train-together/") else { return false }

        guard let bridgeVC = window?.rootViewController as? CAPBridgeViewController else { return false }
        bridgeVC.webView?.load(URLRequest(url: url))
        return true
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = PHATBOTBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        if let activity = connectionOptions.userActivities.first,
           activity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = activity.webpageURL {
            _ = openTrainTogetherLink(url)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb,
           let url = userActivity.webpageURL,
           openTrainTogetherLink(url) {
            return
        }
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
