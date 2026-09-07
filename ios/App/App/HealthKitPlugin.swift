import Foundation
import Capacitor
import UIKit
import Photos
import HealthKit

@objc(HealthKitPlugin)
public class HealthKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthKitPlugin"
    public let jsName = "HealthKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getRecentSnapshot", returnType: CAPPluginReturnPromise)
    ]

    private let healthStore = HKHealthStore()

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

    private func distanceType(for activityName: String?) -> HKQuantityType? {
        let value = (activityName ?? "").lowercased()
        if value.contains("run") || value.contains("walk") || value.contains("hike") {
            return HKObjectType.quantityType(forIdentifier: .distanceWalkingRunning)
        }
        if value.contains("bike") || value.contains("cycl") {
            return HKObjectType.quantityType(forIdentifier: .distanceCycling)
        }
        return nil
    }

    private func fetchDistanceSamples(for workoutId: UUID, activityName: String?, completion: @escaping ([[String: Any]]) -> Void) {
        guard let quantityType = distanceType(for: activityName) else { completion([]); return }
        let workoutPredicate = HKQuery.predicateForObject(with: workoutId)
        healthStore.execute(HKSampleQuery(sampleType: .workoutType(), predicate: workoutPredicate, limit: 1, sortDescriptors: nil) { [weak self] _, samples, _ in
            guard let self, let workout = (samples as? [HKWorkout])?.first else { completion([]); return }
            let datePredicate = HKQuery.predicateForSamples(withStart: workout.startDate, end: workout.endDate, options: [.strictStartDate, .strictEndDate])
            let sourcePredicate = HKQuery.predicateForObjects(from: workout.sourceRevision.source)
            let predicate = NSCompoundPredicate(andPredicateWithSubpredicates: [datePredicate, sourcePredicate])
            let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
            self.healthStore.execute(HKSampleQuery(sampleType: quantityType, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, quantitySamples, _ in
                let rows = (quantitySamples as? [HKQuantitySample] ?? []).compactMap { sample -> [String: Any]? in
                    let meters = sample.quantity.doubleValue(for: .meter())
                    if meters <= 0 { return nil }
                    return [
                        "startOffsetSeconds": max(0, sample.startDate.timeIntervalSince(workout.startDate)),
                        "endOffsetSeconds": max(0, sample.endDate.timeIntervalSince(workout.startDate)),
                        "distanceMeters": meters
                    ]
                }
                completion(rows)
            })
        })
    }

    private func enrichCardioDistanceSamples(_ payload: [String: Any], completion: @escaping ([String: Any]) -> Void) {
        guard let workouts = payload["workouts"] as? [[String: Any]], !workouts.isEmpty else { completion(payload); return }
        let group = DispatchGroup()
        let lock = NSLock()
        var enriched = workouts
        for index in workouts.indices {
            guard let rawId = workouts[index]["sourceWorkoutId"] as? String,
                  let workoutId = UUID(uuidString: rawId) else { continue }
            let activityName = workouts[index]["activityName"] as? String
            group.enter()
            fetchDistanceSamples(for: workoutId, activityName: activityName) { samples in
                lock.lock()
                if !samples.isEmpty { enriched[index]["distanceSamples"] = samples }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .global()) {
            var result = payload
            result["workouts"] = enriched
            completion(result)
        }
    }

    @objc func getRecentSnapshot(_ call: CAPPluginCall) {
        let days = max(call.getInt("days") ?? 14, 1)
        HealthKitManager.shared.fetchRecentSnapshot(days: days) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let payload):
                self.enrichCardioDistanceSamples(payload) { enriched in
                    DispatchQueue.main.async { call.resolve(enriched) }
                }
            case .failure(let error):
                DispatchQueue.main.async { call.reject(error.localizedDescription) }
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
