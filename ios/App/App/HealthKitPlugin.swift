import Foundation
import Capacitor
import UIKit
import Photos

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

@objc(PHATBOTMediaPlugin)
public class PHATBOTMediaPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "PHATBOTMediaPlugin"
    public let jsName = "PHATBOTMedia"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "shareImage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise)
    ]

    private func image(from call: CAPPluginCall) -> UIImage? {
        guard let base64 = call.getString("base64") else { return nil }
        let payload = base64.components(separatedBy: ",").last ?? base64
        guard let data = Data(base64Encoded: payload) else { return nil }
        return UIImage(data: data)
    }

    @objc func shareImage(_ call: CAPPluginCall) {
        guard let image = image(from: call) else {
            call.reject("PHATBOT could not create the image.")
            return
        }
        DispatchQueue.main.async {
            let controller = UIActivityViewController(activityItems: [image], applicationActivities: nil)
            if let popover = controller.popoverPresentationController {
                popover.sourceView = self.bridge?.viewController?.view
                popover.sourceRect = self.bridge?.viewController?.view.bounds ?? .zero
            }
            controller.completionWithItemsHandler = { _, completed, _, error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["completed": completed])
                }
            }
            self.bridge?.viewController?.present(controller, animated: true)
        }
    }

    @objc func saveImage(_ call: CAPPluginCall) {
        guard let image = image(from: call) else {
            call.reject("PHATBOT could not create the image.")
            return
        }
        let save = {
            PHPhotoLibrary.shared().performChanges({
                PHAssetChangeRequest.creationRequestForAsset(from: image)
            }) { success, error in
                DispatchQueue.main.async {
                    if let error = error {
                        call.reject(error.localizedDescription)
                    } else {
                        call.resolve(["saved": success])
                    }
                }
            }
        }
        if #available(iOS 14, *) {
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
                if status == .authorized || status == .limited { save() }
                else { call.reject("Photo access was not granted.") }
            }
        } else {
            PHPhotoLibrary.requestAuthorization { status in
                if status == .authorized { save() }
                else { call.reject("Photo access was not granted.") }
            }
        }
    }
}
