package com.nextleveldigitalmedia.phatbot

import android.app.AlertDialog
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.concurrent.atomic.AtomicBoolean

@CapacitorPlugin(name = "HealthConnect")
class HealthConnectPlugin : Plugin() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val requesting = AtomicBoolean(false)
    private val permissions = setOf(
        HealthPermission.getReadPermission(StepsRecord::class),
        HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
        HealthPermission.getReadPermission(ExerciseSessionRecord::class),
        HealthPermission.getReadPermission(DistanceRecord::class),
        HealthPermission.getReadPermission(HeartRateRecord::class),
        HealthPermission.getReadPermission(SleepSessionRecord::class)
    )
    private fun sdkStatus(): Int = if (Build.VERSION.SDK_INT < 28) HealthConnectClient.SDK_UNAVAILABLE else HealthConnectClient.getSdkStatus(context)
    private fun client() = HealthConnectClient.getOrCreate(context)
    private fun consented() = context.getSharedPreferences("phatbot_health", 0).getBoolean("server_sync_disclosure_v1", false)
    private suspend fun status(): JSObject {
        val sdk = sdkStatus()
        val granted = if (sdk == HealthConnectClient.SDK_AVAILABLE) client().permissionController.getGrantedPermissions().intersect(permissions) else emptySet()
        val recovery = when {
            sdk == HealthConnectClient.SDK_AVAILABLE -> "settings"
            Build.VERSION.SDK_INT in 28..33 && sdk == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "install"
            else -> "none"
        }
        return JSObject().put("available", sdk == HealthConnectClient.SDK_AVAILABLE).put("sdkStatus", sdk)
            .put("androidApi", Build.VERSION.SDK_INT).put("recovery", recovery)
            .put("grantedCount", granted.size).put("requestedCount", permissions.size)
            .put("authorized", granted.isNotEmpty()).put("allGranted", granted.containsAll(permissions))
            .put("consented", consented())
    }

    @PluginMethod fun isAvailable(call: PluginCall) {
        val sdk = sdkStatus()
        call.resolve(JSObject().put("available", sdk == HealthConnectClient.SDK_AVAILABLE).put("sdkStatus", sdk))
    }
    @PluginMethod fun getStatus(call: PluginCall) {
        scope.launch {
            try { call.resolve(status()) }
            catch (error: Exception) { call.reject("Health Connect status could not be checked. Try again.") }
        }
    }
    @PluginMethod fun openSettings(call: PluginCall) {
        activity.runOnUiThread {
            try {
                val sdk = sdkStatus()
                val intent = when {
                    sdk == HealthConnectClient.SDK_AVAILABLE -> Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
                    Build.VERSION.SDK_INT in 28..33 && sdk == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED ->
                        Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata"))
                    else -> { call.reject("Health Connect is unavailable on this device."); return@runOnUiThread }
                }
                activity.startActivity(intent)
                call.resolve()
            } catch (error: Exception) { call.reject("Open Health Connect from Android Settings, or install/update it in Google Play on Android 9–13.") }
        }
    }
    @PluginMethod fun requestAuthorization(call: PluginCall) {
        activity.runOnUiThread {
            if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE) { call.resolve(JSObject().put("authorized", false)); return@runOnUiThread }
            if (!requesting.compareAndSet(false, true)) { call.reject("A Health Connect request is already open."); return@runOnUiThread }
            if (consented()) launchPermissions(call)
            else AlertDialog.Builder(activity).setTitle("Health Connect data in PHATBOT")
                .setMessage(HealthConnectPrivacyActivity.DISCLOSURE)
                .setPositiveButton("Continue") { _, _ ->
                    context.getSharedPreferences("phatbot_health", 0).edit().putBoolean("server_sync_disclosure_v1", true).apply()
                    launchPermissions(call)
                }
                .setNeutralButton("Privacy policy") { _, _ ->
                    cancelRequest(call)
                    activity.startActivity(Intent(activity, HealthConnectPrivacyActivity::class.java))
                }
                .setNegativeButton("Not now") { _, _ -> cancelRequest(call) }
                .setOnCancelListener { cancelRequest(call) }.show()
        }
    }
    private fun cancelRequest(call: PluginCall) {
        requesting.set(false)
        call.resolve(JSObject().put("authorized", false))
    }
    private fun launchPermissions(call: PluginCall) {
        scope.launch {
            try {
                val granted = client().permissionController.getGrantedPermissions()
                if (granted.containsAll(permissions)) {
                    requesting.set(false)
                    call.resolve(status())
                } else activity.runOnUiThread {
                    try {
                        startActivityForResult(call, PermissionController.createRequestPermissionResultContract().createIntent(context, permissions), "permissionsResult")
                    } catch (error: Exception) { requesting.set(false); call.reject("Open Health Connect settings to manage PHATBOT access.") }
                }
            } catch (error: Exception) { requesting.set(false); call.reject("Health Connect access could not be checked. Try again.") }
        }
    }
    @ActivityCallback private fun permissionsResult(call: PluginCall?, result: ActivityResult) {
        requesting.set(false)
        if (call == null) return
        // Re-read authoritative grants after the screen closes, including partial/denied results.
        scope.launch {
            try { call.resolve(status()) }
            catch (error: Exception) { call.reject("Check PHATBOT access in Health Connect settings.") }
        }
    }
    override fun handleOnResume() {
        super.handleOnResume()
        notifyListeners("healthConnectStatusChanged", JSObject())
    }
    override fun handleOnDestroy() { scope.cancel(); super.handleOnDestroy() }

    @PluginMethod fun getRecentSnapshot(call: PluginCall) {
        if (sdkStatus() != HealthConnectClient.SDK_AVAILABLE || !consented()) {
            call.reject("Review Health Connect data use and access from Me before syncing."); return
        }
        val days = (call.getInt("days") ?: 14).coerceIn(1, 14)
        scope.launch {
            try {
                val health = client()
                val granted = health.permissionController.getGrantedPermissions().intersect(permissions)
                if (granted.isEmpty()) { call.reject("Allow a category in Health Connect settings before syncing."); return@launch }
                call.resolve(buildSnapshot(health, days, granted))
            } catch (error: Exception) { call.reject("PHATBOT could not read Health Connect. Check access and try again.") }
        }
    }
    private suspend fun buildSnapshot(health: HealthConnectClient, days: Int, granted: Set<String>): JSObject {
        val end = Instant.now()
        val start = end.minus(Duration.ofDays(days.toLong()))
        val access = HealthConnectReadAccess(granted)
        val warnings = access.warnings
        if (!granted.containsAll(permissions)) warnings.add("Only approved Health Connect categories were read. Unapproved categories were skipped; saved history is unchanged.")
        val snapshot = JSObject().put("startDate", start.toString()).put("endDate", end.toString())
        val daily = JSArray()
        val zone = ZoneId.systemDefault()
        var day = start.atZone(zone).toLocalDate()
        while (!day.isAfter(end.atZone(zone).toLocalDate())) {
            val dayStart = day.atStartOfDay(zone).toInstant()
            val dayEnd = minOf(day.plusDays(1).atStartOfDay(zone).toInstant(), end)
            if (dayEnd.isAfter(dayStart)) {
                val range = TimeRangeFilter.between(dayStart, dayEnd)
                val row = JSObject().put("date", day.format(DateTimeFormatter.ISO_LOCAL_DATE))
                access.read(HealthPermission.getReadPermission(StepsRecord::class)) {
                    health.aggregate(AggregateRequest(setOf(StepsRecord.COUNT_TOTAL), range))[StepsRecord.COUNT_TOTAL]
                }?.let { row.put("steps", it.toDouble()) }
                access.read(HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)) {
                    health.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), range))[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories
                }?.let { row.put("activeEnergyKcal", it) }
                if (row.has("steps") || row.has("activeEnergyKcal")) daily.put(row)
            }
            day = day.plusDays(1)
        }
        snapshot.put("dailyMetrics", daily)
        access.read(HealthPermission.getReadPermission(ExerciseSessionRecord::class)) {
            val rows = JSArray()
            var token: String? = null
            do {
                val page = health.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, TimeRangeFilter.between(start, end), ascendingOrder = false, pageToken = token))
                for (session in page.records) {
                    val range = TimeRangeFilter.between(session.startTime, session.endTime)
                    val row = JSObject().put("sourceWorkoutId", session.metadata.id)
                        .put("activityType", session.exerciseType).put("activityName", activityName(session.exerciseType))
                        .put("startDate", session.startTime.toString()).put("endDate", session.endTime.toString())
                        .put("durationSeconds", Duration.between(session.startTime, session.endTime).seconds.toDouble())
                    access.read(HealthPermission.getReadPermission(DistanceRecord::class)) {
                        health.aggregate(AggregateRequest(setOf(DistanceRecord.DISTANCE_TOTAL), range))[DistanceRecord.DISTANCE_TOTAL]?.inMeters
                    }?.let { row.put("distanceMeters", it) }
                    access.read(HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class)) {
                        health.aggregate(AggregateRequest(setOf(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL), range))[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories
                    }?.let { row.put("activeEnergyKcal", it) }
                    access.read(HealthPermission.getReadPermission(HeartRateRecord::class)) {
                        health.aggregate(AggregateRequest(setOf(HeartRateRecord.BPM_AVG), range))[HeartRateRecord.BPM_AVG]
                    }?.let { row.put("averageHeartRateBpm", it) }
                    rows.put(row)
                }
                token = page.pageToken
            } while (token != null)
            rows
        }?.let { snapshot.put("workouts", it) }
        access.read(HealthPermission.getReadPermission(SleepSessionRecord::class)) {
            val rows = JSArray()
            var token: String? = null
            do {
                val page = health.readRecords(ReadRecordsRequest(SleepSessionRecord::class, TimeRangeFilter.between(start, end), ascendingOrder = false, pageToken = token))
                page.records.forEach { session -> rows.put(JSObject().put("value", 1)
                    .put("startDate", session.startTime.toString()).put("endDate", session.endTime.toString())
                    .put("durationSeconds", Duration.between(session.startTime, session.endTime).seconds.toDouble())) }
                token = page.pageToken
            } while (token != null)
            rows
        }?.let { snapshot.put("sleep", it) }
        snapshot.put("readWarnings", JSArray(warnings.toList()))
        return snapshot
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
