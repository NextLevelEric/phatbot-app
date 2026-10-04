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
        let quantityIdentifiers: [HKQuantityTypeIdentifier] = [.restingHeartRate, .heartRateVariabilitySDNN, .activeEnergyBurned, .stepCount, .heartRate, .distanceWalkingRunning, .distanceCycling, .dietaryEnergyConsumed, .dietaryProtein, .dietaryCarbohydrates, .dietaryFatTotal]
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
        var payload: [String: Any] = ["startDate": iso(start), "endDate": iso(end)]
        var readWarnings = [String]()
        func assign(_ key: String, _ value: Any) { lock.lock(); payload[key] = value; lock.unlock() }
        func warn(_ key: String, _ error: Error) {
            lock.lock()
            readWarnings.append("\(key): \(error.localizedDescription)")
            lock.unlock()
        }
        group.enter(); fetchLatestQuantity(.restingHeartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: start, end: end) { if case .success(let v) = $0 { assign("restingHeartRate", v as Any) } else if case .failure(let e) = $0 { warn("resting heart rate", e) }; group.leave() }
        group.enter(); fetchLatestQuantity(.heartRateVariabilitySDNN, unit: .secondUnit(with: .milli), start: start, end: end) { if case .success(let v) = $0 { assign("hrvMs", v as Any) } else if case .failure(let e) = $0 { warn("heart rate variability", e) }; group.leave() }
        group.enter(); fetchCumulativeQuantity(.activeEnergyBurned, unit: .kilocalorie(), start: start, end: end) { if case .success(let v) = $0 { assign("activeEnergyKcal", v) } else if case .failure(let e) = $0 { warn("active energy", e) }; group.leave() }
        group.enter(); fetchCumulativeQuantity(.stepCount, unit: .count(), start: start, end: end) { if case .success(let v) = $0 { assign("steps", v) } else if case .failure(let e) = $0 { warn("steps", e) }; group.leave() }
        group.enter(); fetchDailyMetrics(start: start, end: end) { if case .success(let v) = $0 { assign("dailyMetrics", v) } else if case .failure(let e) = $0 { warn("daily activity", e) }; group.leave() }
        group.enter(); fetchWorkouts(start: start, end: end) { if case .success(let v) = $0 { assign("workouts", v) } else if case .failure(let e) = $0 { warn("workouts", e) }; group.leave() }
        group.enter(); fetchSleep(start: start, end: end) { if case .success(let v) = $0 { assign("sleep", v) } else if case .failure(let e) = $0 { warn("sleep", e) }; group.leave() }
        group.enter(); fetchNutritionDaily(start: start, end: end) { if case .success(let v) = $0 { assign("nutritionDaily", v) } else if case .failure(let e) = $0 { warn("nutrition", e) }; group.leave() }
        group.notify(queue: .main) {
            if !readWarnings.isEmpty { payload["readWarnings"] = readWarnings }
            completion(.success(payload))
        }
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
        let group = DispatchGroup(); let lock = NSLock(); var distanceMeters: Double?; var averageHeartRate: Double?
        let distanceIdentifier: HKQuantityTypeIdentifier? = { switch workout.workoutActivityType { case .running, .walking, .hiking: return .distanceWalkingRunning; case .cycling: return .distanceCycling; default: return nil } }()
        if let distanceIdentifier { group.enter(); fetchCumulativeQuantity(distanceIdentifier, unit: .meter(), start: workout.startDate, end: workout.endDate) { lock.lock(); if case .success(let v) = $0 { distanceMeters = v }; lock.unlock(); group.leave() } }
        group.enter(); fetchAverageQuantity(.heartRate, unit: HKUnit.count().unitDivided(by: .minute()), start: workout.startDate, end: workout.endDate) { lock.lock(); if case .success(let v) = $0 { averageHeartRate = v }; lock.unlock(); group.leave() }
        group.notify(queue: .global()) {
            // Distance and heart-rate enrichment are optional. A query failure
            // must not discard an otherwise readable HealthKit workout.
            var row: [String: Any] = ["sourceWorkoutId": workout.uuid.uuidString, "activityType": workout.workoutActivityType.rawValue, "activityName": self.activityName(workout.workoutActivityType), "startDate": self.iso(workout.startDate), "endDate": self.iso(workout.endDate), "durationSeconds": workout.duration]
            if let energy = workout.totalEnergyBurned?.doubleValue(for: .kilocalorie()) { row["activeEnergyKcal"] = energy }; if let distanceMeters { row["distanceMeters"] = distanceMeters }; if let averageHeartRate { row["averageHeartRateBpm"] = averageHeartRate }; completion(.success(row))
        }
    }

    private struct NutritionSeries { let values: [String: Double]; let originsByDay: [String: Set<String>] }

    private func fetchNutritionSeries(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, start: Date, end: Date, completion: @escaping (Result<NutritionSeries, Error>) -> Void) {
        guard let type = HKObjectType.quantityType(forIdentifier: identifier) else { completion(.success(NutritionSeries(values: [:], originsByDay: [:]))); return }
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        store.execute(HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error { completion(.failure(error)); return }
            var values = [String: Double](); var originsByDay = [String: Set<String>]()
            for sample in samples as? [HKQuantitySample] ?? [] {
                let day = self.dayString(sample.startDate)
                values[day, default: 0] += sample.quantity.doubleValue(for: unit)
                originsByDay[day, default: []].insert(sample.sourceRevision.source.bundleIdentifier)
            }
            completion(.success(NutritionSeries(values: values, originsByDay: originsByDay)))
        })
    }

    private func fetchNutritionDaily(start: Date, end: Date, completion: @escaping (Result<[[String: Any]], Error>) -> Void) {
        let group = DispatchGroup(); let lock = NSLock(); var capturedError: Error?
        var energy = NutritionSeries(values: [:], originsByDay: [:]), protein = NutritionSeries(values: [:], originsByDay: [:]), carbs = NutritionSeries(values: [:], originsByDay: [:]), fat = NutritionSeries(values: [:], originsByDay: [:])
        func read(_ identifier: HKQuantityTypeIdentifier, unit: HKUnit, assign: @escaping (NutritionSeries) -> Void) {
            group.enter(); fetchNutritionSeries(identifier, unit: unit, start: start, end: end) { result in
                lock.lock(); switch result { case .success(let series): assign(series); case .failure(let error): if capturedError == nil { capturedError = error } }; lock.unlock(); group.leave()
            }
        }
        read(.dietaryEnergyConsumed, unit: .kilocalorie()) { energy = $0 }
        read(.dietaryProtein, unit: .gram()) { protein = $0 }
        read(.dietaryCarbohydrates, unit: .gram()) { carbs = $0 }
        read(.dietaryFatTotal, unit: .gram()) { fat = $0 }
        group.notify(queue: .global()) {
            if let capturedError { completion(.failure(capturedError)); return }
            let days = Set(energy.values.keys).union(protein.values.keys).union(carbs.values.keys).union(fat.values.keys)
            let rows = days.sorted().map { day -> [String: Any] in
                let origins = Array((energy.originsByDay[day] ?? []).union(protein.originsByDay[day] ?? []).union(carbs.originsByDay[day] ?? []).union(fat.originsByDay[day] ?? [])).sorted()
                var row: [String: Any] = ["date": day, "sourceOrigins": origins]
                if let value = energy.values[day] { row["energyKcal"] = value }
                if let value = protein.values[day] { row["proteinG"] = value }
                if let value = carbs.values[day] { row["carbohydrateG"] = value }
                if let value = fat.values[day] { row["fatG"] = value }
                return row
            }
            completion(.success(rows))
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
