import Foundation
import HealthKit

final class HealthKitManager {
    static let shared = HealthKitManager()

    private let store = HKHealthStore()

    private init() {}

    var isAvailable: Bool {
        HKHealthStore.isHealthDataAvailable()
    }

    func requestReadAuthorization(completion: @escaping (Result<Void, Error>) -> Void) {
        guard isAvailable else {
            completion(.failure(HealthKitError.notAvailable))
            return
        }

        var readTypes = Set<HKObjectType>()

        let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
            .restingHeartRate,
            .heartRateVariabilitySDNN,
            .activeEnergyBurned,
            .stepCount,
            .heartRate
        ]

        for identifier in quantityIdentifiers {
            if let type = HKObjectType.quantityType(forIdentifier: identifier) {
                readTypes.insert(type)
            }
        }

        readTypes.insert(HKObjectType.workoutType())

        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            readTypes.insert(sleepType)
        }

        store.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error {
                completion(.failure(error))
            } else if success {
                completion(.success(()))
            } else {
                completion(.failure(HealthKitError.authorizationFailed))
            }
        }
    }

    func fetchRecentSnapshot(days: Int = 14, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard isAvailable else {
            completion(.failure(HealthKitError.notAvailable))
            return
        }

        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -max(days, 1), to: end) ?? end
        let group = DispatchGroup()
        let lock = NSLock()
        var payload: [String: Any] = [
            "startDate": ISO8601DateFormatter().string(from: start),
            "endDate": ISO8601DateFormatter().string(from: end)
        ]
        var capturedError: Error?

        func assign(_ key: String, _ value: Any) {
            lock.lock()
            payload[key] = value
            lock.unlock()
        }

        func capture(_ error: Error) {
            lock.lock()
            if capturedError == nil { capturedError = error }
            lock.unlock()
        }

        group.enter()
        fetchLatestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { result in
            switch result {
            case .success(let value): assign("restingHeartRate", value as Any)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.enter()
        fetchLatestQuantity(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), start: start, end: end) { result in
            switch result {
            case .success(let value): assign("hrvMs", value as Any)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.enter()
        fetchCumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end) { result in
            switch result {
            case .success(let value): assign("activeEnergyKcal", value)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.enter()
        fetchCumulativeQuantity(.stepCount, unit: .count(), start: start, end: end) { result in
            switch result {
            case .success(let value): assign("steps", value)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.enter()
        fetchWorkouts(start: start, end: end) { result in
            switch result {
            case .success(let workouts): assign("workouts", workouts)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.enter()
        fetchSleep(start: start, end: end) { result in
            switch result {
            case .success(let sleep): assign("sleep", sleep)
            case .failure(let error): capture(error)
            }
            group.leave()
        }

        group.notify(queue: .main) {
            if let capturedError {
                completion(.failure(capturedError))
            } else {
                completion(.success(payload))
            }
        }
    }

    private func fetchLatestQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double?, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            completion(.success(nil))
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }
            let value = (samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)
            completion(.success(value))
        }
        store.execute(query)
    }

    private func fetchCumulativeQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else {
            completion(.success(0))
            return
        }

        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
            if let error {
                completion(.failure(error))
                return
            }
            let value = statistics?.sumQuantity()?.doubleValue(for: unit) ?? 0
            completion(.success(value))
        }
        store.execute(query)
    }

    private func fetchWorkouts(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }
            let workouts = (samples as? [HKWorkout] ?? []).map { workout in
                [
                    "activityType": workout.workoutActivityType.rawValue,
                    "startDate": ISO8601DateFormatter().string(from: workout.startDate),
                    "endDate": ISO8601DateFormatter().string(from: workout.endDate),
                    "durationSeconds": workout.duration,
                    "activeEnergyKcal": workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) as Any
                ]
            }
            completion(.success(workouts))
        }
        store.execute(query)
    }

    private func fetchSleep(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else {
            completion(.success([]))
            return
        }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error {
                completion(.failure(error))
                return
            }
            let sleep = (samples as? [HKCategorySample] ?? []).map { sample in
                [
                    "value": sample.value,
                    "startDate": ISO8601DateFormatter().string(from: sample.startDate),
                    "endDate": ISO8601DateFormatter().string(from: sample.endDate),
                    "durationSeconds": sample.endDate.timeIntervalSince(sample.startDate)
                ]
            }
            completion(.success(sleep))
        }
        store.execute(query)
    }

    enum HealthKitError: LocalizedError {
        case notAvailable
        case authorizationFailed

        var errorDescription: String? {
            switch self {
            case .notAvailable: return "Health data is not available on this device."
            case .authorizationFailed: return "Health access was not granted."
            }
        }
    }
}
