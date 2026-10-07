package com.nextleveldigitalmedia.phatbot

import kotlinx.coroutines.CancellationException

/** A missing or revoked read is unknown, not zero; unrelated granted categories can still sync. */
internal class HealthConnectReadAccess(private val granted: Set<String>) {
    val warnings = mutableSetOf<String>()

    suspend fun <T> read(permission: String, block: suspend () -> T): T? {
        if (permission !in granted) return null
        return try { block() }
        catch (error: CancellationException) { throw error }
        catch (error: Exception) {
            warnings.add("Some approved Health Connect data could not be read. Check access and try syncing again.")
            null
        }
    }
}
