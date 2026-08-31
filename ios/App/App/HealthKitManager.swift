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
        let quantityIdentifiers: [HKQuantityTypeIdentifier] = [.restingHeartRate, .heartRateVariabilitySDNN, .activeEnergyBurned, .stepCount, .heartRate, .distanceWalkingRunning, .distanceCycling]
        for identifier in quantityIdentifiers { if let type = HKObjectType.quantityType(forIdentifier: identifier) { readTypes.insert(type) } }
        readTypes.insert(HKObjectType.workoutType())
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { readTypes.insert(sleepType) }
        store.requestAuthorization(toShare: [], read: readTypes) { success, error in
            if let error { completion(.failure(error)) } else if success { completion(.success(())) } else { completion(.failure(HealthKitError.authorizationFailed)) }
        }
    }

    func fetchRecentSnapshot(days: Int = 14, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        guard isAvailable else { completion(.failure(HealthKitError.notAvailable)); return }
        let end = Date(); let start = Calendar.current.date(byAdding: .day, value: -max(days, 1), to: end) ?? end
        let group = DispatchGroup(); let lock = NSLock()
        var payload: [String: Any] = ["startDate": iso(start), "endDate": iso(end)]; var capturedError: Error?
        func assign(_ key: String, _ value: Any) { lock.lock(); payload[key] = value; lock.unlock() }
        func capture(_ error: Error) { lock.lock(); if capturedError == nil { capturedError = error }; lock.unlock() }
        group.enter(); fetchLatestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { if case .success(let v) = $0 { assign("restingHeartRate", v as Any) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchLatestQuantity(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), start: start, end: end) { if case .success(let v) = $0 { assign("hrvMs", v as Any) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchCumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end) { if case .success(let v) = $0 { assign("activeEnergyKcal", v) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchCumulativeQuantity(.stepCount, unit: .count(), start: start, end: end) { if case .success(let v) = $0 { assign("steps", v) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchDailyMetrics(start: start, end: end) { if case .success(let v) = $0 { assign("dailyMetrics", v) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchWorkouts(start: start, end: end) { if case .success(let v) = $0 { assign("workouts", v) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.enter(); fetchSleep(start: start, end: end) { if case .success(let v) = $0 { assign("sleep", v) } else if case .failure(let e) = $0 { capture(e) }; group.leave() }
        group.notify(queue: .main) { capturedError.map { completion(.failure($0)) } ?? completion(.success(payload)) }
    }

    private func fetchDailyMetrics(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let calendar = Calendar.current; let firstDay = calendar.startOfDay(for: start); let finalDay = calendar.startOfDay(for: end)
        var days = [Date](); var cursor = firstDay
        while cursor <= finalDay { days.append(cursor); guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else { break }; cursor = next }
        let group = DispatchGroup(); let lock = NSLock(); var rows = [[String: Any]](); var capturedError: Error?
        for day in days {
            guard let dayEnd = calendar.date(byAdding: .day, value: 1, to: day) else { continue }
            group.enter(); fetchCumulativeQuantity(.stepCount, unit: .count(), start: day, end: min(dayEnd, end)) { stepsResult in
                switch stepsResult {
                case .failure(let error): lock.lock(); if capturedError == nil { capturedError = error }; lock.unlock(); group.leave()
                case .success(let steps):
                    self.fetchCumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: day, end: min(dayEnd, end)) { energyResult in
                        lock.lock()
                        switch energyResult {
                        case .failure(let error): if capturedError == nil { capturedError = error }
                        case .success(let energy): rows.append(["date": self.dayString(day), "steps": Int(steps.rounded()), "activeEnergyKcal": energy])
                        }
                        lock.unlock(); group.leave()
                    }
                }
            }
        }
        group.notify(queue: .global()) { if let capturedError { completion(.failure(capturedError)) } else { completion(.success(rows.sorted { ($0["date"] as? String ?? "") < ($1["date"] as? String ?? "") })) } }
    }

    private func fetchLatestQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double?, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(nil)); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end); let sort = NSSortDescriptor(key: HKSampleSortIdentifierEndDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: 1, sortDescriptors: [sort]) { _, samples, error in if let error { completion(.failure(error)); return }; completion(.success((samples?.first as? HKQuantitySample)?.quantity.doubleValue(for: unit))) })
    }

    private func fetchCumulativeQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double, Error>) -> Void) {
        guard end > start, let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(0)); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .cumulativeSum) { _, statistics, error in if let error { completion(.failure(error)); return }; completion(.success(statistics?.sumQuantity()?.doubleValue(for: unit) ?? 0)) })
    }

    private func fetchWorkouts(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end); let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: .workoutType(), predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { [weak self] _, samples, error in
            guard let self else { completion(.success([])); return }; if let error { completion(.failure(error)); return }
            let workouts = samples as? [HKWorkout] ?? []; let group = DispatchGroup(); let lock = NSLock(); var rows = [[String: Any]](); var capturedError: Error?
            for workout in workouts { group.enter(); self.enrichWorkout(workout) { result in lock.lock(); switch result { case .success(let row): rows.append(row); case .failure(let error): if capturedError == nil { capturedError = error } }; lock.unlock(); group.leave() } }
            group.notify(queue: .global()) { if let capturedError { completion(.failure(capturedError)) } else { completion(.success(rows.sorted { ($0["startDate"] as? String ?? "") > ($1["startDate"] as? String ?? "") })) } }
        })
    }

    private func enrichWorkout(_ workout: HKWorkout, completion: @escaping (Result<[String: Any], Error>) -> Void) {
        let group = DispatchGroup(); let lock = NSLock(); var distanceMeters: Double?; var averageHeartRate: Double?; var capturedError: Error?
        let distanceIdentifier: HKQuantityTypeIdentifier? = { switch workout.workoutActivityType { case .running, .walking, .hiking: return .distanceWalkingRunning; case .cycling: return .distanceCycling; default: return nil } }()
        if let distanceIdentifier { group.enter(); fetchCumulativeQuantity(distanceIdentifier, unit: .meter(), start: workout.startDate, end: workout.endDate) { lock.lock(); if case .success(let v) = $0 { distanceMeters = v } else if case .failure(let e) = $0 { capturedError = e }; lock.unlock(); group.leave() } }
        group.enter(); fetchAverageQuantity(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: workout.startDate, end: workout.endDate) { lock.lock(); if case .success(let v) = $0 { averageHeartRate = v } else if case .failure(let e) = $0 { capturedError = e }; lock.unlock(); group.leave() }
        group.notify(queue: .global()) {
            if let capturedError { completion(.failure(capturedError)); return }
            var row: [String: Any] = ["sourceWorkoutId": workout.uuid.uuidString, "activityType": workout.workoutActivityType.rawValue, "activityName": self.activityName(workout.workoutActivityType), "startDate": self.iso(workout.startDate), "endDate": self.iso(workout.endDate), "durationSeconds": workout.duration]
            if let energy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) { row["activeEnergyKcal"] = energy }; if let distanceMeters { row["distanceMeters"] = distanceMeters }; if let averageHeartRate { row["averageHeartRateBpm"] = averageHeartRate }; completion(.success(row))
        }
    }

    private func fetchAverageQuantity(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<Double?, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(nil)); return }; let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        store.execute(HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: .discreteAverage) { _, statistics, error in if let error { completion(.failure(error)); return }; completion(.success(statistics?.averageQuantity()?.doubleValue(for: unit))) })
    }

    private func activityName(_ type: HKWorkoutActivityType) -> String {
        switch type {
        case .running: return "Run"
        case .walking: return "Walk"
        case .cycling: return "Bike Ride"
        case .hiking: return "Hike"
        case .rowing: return "Rowing"
        case .swimming: return "Swim"
        case .elliptical: return "Elliptical"
        case .stairClimbing: return "Stair Climbing"
        case .traditionalStrengthTraining: return "Strength Training"
        case .functionalStrengthTraining: return "Functional Strength Training"
        case .coreTraining: return "Core Training"
        case .crossTraining: return "Cross Training"
        case .highIntensityIntervalTraining: return "HIIT"
        case .flexibility: return "Flexibility"
        case .yoga: return "Yoga"
        case .pilates: return "Pilates"
        case .mixedCardio: return "Mixed Cardio"
        default: return "Workout"
        }
    }
    private func fetchSleep(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        guard let type = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) else { completion(.success([])); return }; let predicate = HKQuery.predicateForSamples(withStart: start, end: end); let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: [sort]) { _, samples, error in if let error { completion(.failure(error)); return }; completion(.success((samples as? [HKCategorySample] ?? []).map { ["value": $0.value, "startDate": self.iso($0.startDate), "endDate": self.iso($0.endDate), "durationSeconds": $0.endDate.timeIntervalSince($0.startDate)] })) })
    }
    private func iso(_ date: Date) -> String { ISO8601DateFormatter().string(from: date) }
    private func dayString(_ date: Date) -> String { let f = DateFormatter(); f.calendar = Calendar(identifier: .gregorian); f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"; return f.string(from: date) }
    enum HealthKitError: LocalizedError { case notAvailable, authorizationFailed; var errorDescription: String? { self == .notAvailable ? "Health data is not available on this device." : "Health access was not granted." } }
}
