import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = CAPBridgeViewController()
        self.window = window
        window.makeKeyAndVisible()

        for context in connectionOptions.urlContexts {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: context.url,
                options: openURLOptions(from: context)
            )
        }
        for activity in connectionOptions.userActivities {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                continue: activity,
                restorationHandler: { _ in }
            )
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            _ = ApplicationDelegateProxy.shared.application(
                UIApplication.shared,
                open: context.url,
                options: openURLOptions(from: context)
            )
        }
    }

    private func openURLOptions(from context: UIOpenURLContext) -> [UIApplication.OpenURLOptionsKey: Any] {
        var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
        if let source = context.options.sourceApplication {
            options[.sourceApplication] = source
        }
        if let annotation = context.options.annotation {
            options[.annotation] = annotation
        }
        return options
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(
            UIApplication.shared,
            continue: userActivity,
            restorationHandler: { _ in }
        )
    }
}
