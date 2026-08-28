import Foundation
import Capacitor

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecentSnapshot", returnType: CAPPluginReturnPromise)
    ]

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": HealthKitManager.shared.isAvailable])
    }

    @objc func requestAuthorization(_ call: CAPPluginCall) {
        HealthKitManager.shared.requestReadAuthorization { result in
            DispatchQueue.main.async {
                switch result {
                case .success:
                    call.resolve(["authorized": true])
                case .failure(let error):
                    call.reject(error.localizedDescription)
                }
            }
        }
    }

    @objc func getRecentSnapshot(_ call: CAPPluginCall) {
        let days = max(call.getInt("days") ?? 14, 1)
        HealthKitManager.shared.fetchRecentSnapshot(days: days) { result in
            DispatchQueue.main.async {
                switch result {
                case .success(let payload):
                    call.resolve(payload)
                case .failure(let error):
                    call.reject(error.localizedDescription)
                }
            }
        }
    }
}
