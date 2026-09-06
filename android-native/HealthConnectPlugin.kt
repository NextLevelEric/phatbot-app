package com.nextleveldigitalmedia.phatbot

import android.content.Intent
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(Dispatchers.IO)

    private val permissions: Set<String> by lazy {
        setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
            HealthPermission.getReadPermission(ExerciseSessionRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
            HealthPermission.getReadPermission(HeartRateRecord::class),
            HealthPermission.getReadPermission(RestingHeartRateRecord::class),
            HealthPermission.getReadPermission(HeartRateVariabilityRmssdRecord::class),
            HealthPermission.getReadPermission(SleepSessionRecord::class),
            HealthPermission.getReadPermission(WeightRecord::class)
        )
    }

    private fun sdkStatus(): Int = HealthConnectClient.getSdkStatus(context)
    private fun client(): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    @com.getcapacitor.PluginMethod
    fun isAvailable(call: PluginCall) {
        val status = sdkStatus()
        call.resolve(JSObject().put("available", status == HealthConnectClient.SDK_AVAILABLE).put("sdkStatus", status))
    }

    @com.getcapacitor.PluginMethod
    fun requestAuthorization(call: PluginCall) {
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) {
            call.resolve(JSObject().put("authorized", false).put("available", false))
            return
        }
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                if (granted.containsAll(permissions)) {
                    call.resolve(JSObject().put("authorized", true))
                    return@launch
                }
                val contract = PermissionController.createRequestPermissionResultContract()
                val intent: Intent = contract.createIntent(context, permissions)
                activity.runOnUiThread { activity.startActivity(intent) }
                call.resolve(JSObject().put("authorized", false).put("requested", true))
            } catch (error: Throwable) {
                call.reject(error.message ?: "Unable to request Health Connect access.")
            }
        }
    }

    @com.getcapacitor.PluginMethod
    fun getRecentSnapshot(call: PluginCall) {
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) {
            call.reject("Health Connect is not available on this device.")
            return
        }
        val days = maxOf(call.getInt("days") ?: 14, 1)
        scope.launch {
            try {
                val health = client()
                val granted = health.permissionController.getGrantedPermissions()
                if (!granted.containsAll(permissions)) {
                    call.reject("Health Connect permission has not been granted.")
                    return@launch
                }
                call.resolve(buildSnapshot(health, days))
            } catch (error: Throwable) {
                call.reject(error.message ?: "PHATBOT could not read Health Connect.")
            }
        }
    }

    private suspend fun buildSnapshot(health: HealthConnectClient, days: Int): JSObject {
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(days.toLong()))
        val range = TimeRangeFilter.between(start, end)
        val snapshot = JSObject().put("startDate", start.toString()).put("endDate", end.toString())

        val total = health.aggregate(AggregateRequest(setOf(
            StepsRecord.COUNT_TOTAL,
            ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
        ), range))
        snapshot.put("steps", (total[StepsRecord.COUNT_TOTAL] ?: 0L).toDouble())
        snapshot.put("activeEnergyKcal", total[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0)

        val resting = health.readRecords(ReadRecordsRequest(RestingHeartRateRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()
        snapshot.put("restingHeartRate", resting?.beatsPerMinute?.toDouble())
        val hrv = health.readRecords(ReadRecordsRequest(HeartRateVariabilityRmssdRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()
        snapshot.put("hrvMs", hrv?.heartRateVariabilityMillis)
        val weight = health.readRecords(ReadRecordsRequest(WeightRecord::class, range, ascendingOrder = false, pageSize = 1)).records.firstOrNull()
        snapshot.put("weightKg", weight?.weight?.inKilograms)

        snapshot.put("dailyMetrics", dailyMetrics(health, start, end))
        snapshot.put("workouts", workouts(health, start, end))
        snapshot.put("sleep", sleep(health, start, end))
        return snapshot
    }

    private suspend fun dailyMetrics(health: HealthConnectClient, start: Instant, end: Instant): JSArray {
        val zone = ZoneId.systemDefault()
        var day = start.atZone(zone).toLocalDate()
        val finalDay = end.atZone(zone).toLocalDate()
        val rows = JSArray()
        while (!day.isAfter(finalDay)) {
            val dayStart = day.atStartOfDay(zone).toInstant()
            val next = day.plusDays(1).atStartOfDay(zone).toInstant()
            val dayEnd = if (next.isAfter(end)) end else next
            if (dayEnd.isAfter(dayStart)) {
                val result = health.aggregate(AggregateRequest(setOf(
                    StepsRecord.COUNT_TOTAL,
                    ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
                ), TimeRangeFilter.between(dayStart, dayEnd)))
                rows.put(JSObject()
                    .put("date", day.format(DateTimeFormatter.ISO_LOCAL_DATE))
                    .put("steps", (result[StepsRecord.COUNT_TOTAL] ?: 0L).toDouble())
                    .put("activeEnergyKcal", result[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories ?: 0.0))
            }
            day = day.plusDays(1)
        }
        return rows
    }

    private suspend fun workouts(health: HealthConnectClient, start: Instant, end: Instant): JSArray {
        val rows = JSArray()
        val sessions = health.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(start, end), ascendingOrder = false)).records
        for (session in sessions) {
            val range = TimeRangeFilter.between(session.startTime, session.endTime)
            val aggregate = health.aggregate(AggregateRequest(setOf(
                DistanceRecord.DISTANCE_TOTAL,
                ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL,
                HeartRateRecord.BPM_AVG
            ), range))
            rows.put(JSObject()
                .put("sourceWorkoutId", session.metadata.id)
                .put("activityType", session.exerciseType)
                .put("activityName", activityName(session.exerciseType))
                .put("startDate", session.startTime.toString())
                .put("endDate", session.endTime.toString())
                .put("durationSeconds", Duration.between(session.startTime, session.endTime).seconds.toDouble())
                .put("distanceMeters", aggregate[DistanceRecord.DISTANCE_TOTAL]?.inMeters)
                .put("activeEnergyKcal", aggregate[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories)
                .put("averageHeartRateBpm", aggregate[HeartRateRecord.BPM_AVG]))
        }
        return rows
    }

    private suspend fun sleep(health: HealthConnectClient, start: Instant, end: Instant): JSArray {
        val rows = JSArray()
        val sessions = health.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, end), ascendingOrder = false)).records
        sessions.forEach { session ->
            rows.put(JSObject()
                .put("value", 1)
                .put("startDate", session.startTime.toString())
                .put("endDate", session.endTime.toString())
                .put("durationSeconds", Duration.between(session.startTime, session.endTime).seconds.toDouble()))
        }
        return rows
    }

    private fun activityName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING, ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "Run"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "Walk"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING, ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "Bike Ride"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING, ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "Rowing"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER, ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "Swim"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "Elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING, ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING_MACHINE -> "Stair Climbing"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "Strength Training"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "Yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "Pilates"
        else -> "Workout"
    }
}
