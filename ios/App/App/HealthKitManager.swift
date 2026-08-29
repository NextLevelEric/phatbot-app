import Foundation
import HealthKit

final class HealthKitManager {
    static let shared = HealthKitManager()
    private let store = HKHealthStore()
    private init() {}

    var isAvailable: Bool { HKHealthStore.isHealthDataAvailable() }

    func requestReadAuthorization(completion: @escaping (Result<Void, Error>) -> Void) {
        guard isAvailable else { completion(.failure(HealthKitError.notAvailable)); return }
        var readTypes = Set<HKObjectType>()
        let quantityIdentifiers: [HKQuantityTypeIdentifier] = [
            .restingHeartRate, .heartRateVariabilitySDNN, .activeEnergyBurned,
            .stepCount, .heartRate, .distanceWalkingRunning, .distanceCycling
        ]
        for identifier in quantityIdentifiers {
            if let type = HKObjectType.quantityType(forIdentifier: identifier) { readTypes.insert(type) }
        }
        readTypes.insert(HKObjectType.workoutType())
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { readTypes.insert(sleepType) }
        store.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error { completion(.failure(error)) }
            else if success { completion(.success(())) }
            else { completion(.failure(HealthKitError.authorizationFailed)) }
        }
    }

    func fetchRecentSnapshot(days: Int = 14, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard isAvailable else { completion(.failure(HealthKitError.notAvailable)); return }
        let end = Date()
        let start = Calendar.current.date(byAdding: .day, value: -max(days, 1), to: end) ?? end
        let group = DispatchGroup()
        let lock = NSLock()
        var payload: [String: Any] = ["startDate": ISO8601DateFormatter().string(from: start), "endDate": ISO8601DateFormatter().string(from: end)]
        var capturedError: Error?
        func assign(_ key: String, _ value: Any) { lock.lock(); payload[key] = value; lock.unlock() }
        func capture(_ error: Error) { lock.lock(); if capturedError == nil { capturedError = error }; lock.unlock() }

        group.enter(); fetchLatestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { result in
            if case .success(let value) = result { assign("restingHeartRate", value as Any) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.enter(); fetchLatestQuantity(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), start: start, end: end) { result in
            if case .success(let value) = result { assign("hrvMs", value as Any) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.enter(); fetchCumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end) { result in
            if case .success(let value) = result { assign("activeEnergyKcal", value) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.enter(); fetchCumulativeQuantity(.stepCount, unit: .count(), start: start, end: end) { result in
            if case .success(let value) = result { assign("steps", value) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.enter(); fetchWorkouts(start: start, end: end) { result in
            if case .success(let workouts) = result { assign("workouts", workouts) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.enter(); fetchSleep(start: start, end: end) { result in
            if case .success(let sleep) = result { assign("sleep", sleep) } else if case .failure(let error) = result { capture(error) }; group.leave()
        }
        group.notify(queue: .main) { capturedError.map { completion(.failure($0)) } ?? completion(.success(payload)) }
    }

    private func fetchLatestQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double?, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(nil)); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, error in
            if let error { completion(.failure(error)); return }
            completion(.success((samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit)))
        })
    }

    private func fetchCumulativeQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(0)); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in
            if let error { completion(.failure(error)); return }
            completion(.success(statistics?.sumQuantity()?.doubleValue(for: unit) ?? 0))
        })
    }

    private func fetchWorkouts(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self else { completion(.success([])); return }
            if let error { completion(.failure(error)); return }
            let workouts = samples as? [HKWorkout] ?? []
            let group = DispatchGroup(); let lock = NSLock(); var rows = [[String: Any]](); var capturedError: Error?
            for workout in workouts {
                group.enter()
                self.enrichWorkout(workout) { result in
                    lock.lock()
                    switch result { case .success(let row): rows.append(row); case .failure(let error): if capturedError == nil { capturedError = error } }
                    lock.unlock(); group.leave()
                }
            }
            group.notify(queue: .global()) {
                if let capturedError { completion(.failure(capturedError)) }
                else { completion(.success(rows.sorted { ($0["startDate"] as? String ?? "") > ($1["startDate"] as? String ?? "") })) }
            }
        })
    }

    private func enrichWorkout(_ workout: HKWorkout, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let group = DispatchGroup(); let lock = NSLock()
        var distanceMeters: Double?; var averageHeartRate: Double?; var capturedError: Error?
        let distanceIdentifier: HKQuantityTypeIdentifier? = {
            switch workout.workoutActivityType { case .running, .walking, .hiking: return .distanceWalkingRunning; case .cycling: return .distanceCycling; default: return nil }
        }()
        if let distanceIdentifier {
            group.enter(); fetchCumulativeQuantity(distanceIdentifier, unit: .meter(), start: workout.startDate, end: workout.endDate) { result in
                lock.lock(); if case .success(let value) = result { distanceMeters = value } else if case .failure(let error) = result { capturedError = error }; lock.unlock(); group.leave()
            }
        }
        group.enter(); fetchAverageQuantity(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: workout.startDate, end: workout.endDate) { result in
            lock.lock(); if case .success(let value) = result { averageHeartRate = value } else if case .failure(let error) = result { capturedError = error }; lock.unlock(); group.leave()
        }
        group.notify(queue: .global()) {
            if let capturedError { completion(.failure(capturedError)); return }
            var row: [String: Any] = [
                "sourceWorkoutId": workout.uuid.uuidString,
                "activityType": workout.workoutActivityType.rawValue,
                "activityName": self.activityName(workout.workoutActivityType),
                "startDate": ISO8601DateFormatter().string(from: workout.startDate),
                "endDate": ISO8601DateFormatter().string(from: workout.endDate),
                "durationSeconds": workout.duration
            ]
            if let energy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) { row["activeEnergyKcal"] = energy }
            if let distanceMeters { row["distanceMeters"] = distanceMeters }
            if let averageHeartRate { row["averageHeartRateBpm"] = averageHeartRate }
            completion(.success(row))
        }
    }

    private func fetchAverageQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double?, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(nil)); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, error in
            if let error { completion(.failure(error)); return }
            completion(.success(statistics?.averageQuantity()?.doubleValue(for: unit)))
        })
    }

    private func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type { case .running: return "Run"; case .walking: return "Walk"; case .cycling: return "Bike Ride"; case .hiking: return "Hike"; case .rowing: return "Rowing"; case .swimming: return "Swim"; case .elliptical: return "Elliptical"; case .stairClimbing: return "Stair Climbing"; default: return "Cardio Workout" }
    }

    private func fetchSleep(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { completion(.success([])); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in
            if let error { completion(.failure(error)); return }
            completion(.success((samples as? [HKCategorySample] ?? []).map { ["value": $0.value, "startDate": ISO8601DateFormatter().string(from: $0.startDate), "endDate": ISO8601DateFormatter().string(from: $0.endDate), "durationSeconds": $0.endDate.timeIntervalSince($0.startDate)] }))
        })
    }

    enum HealthKitError: LocalizedError {
        case notAvailable, authorizationFailed
        var errorDescription: String? { self == .notAvailable ? "Health data is not available on this device." : "Health access was not granted." }
    }
}
