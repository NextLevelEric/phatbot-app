package com.nextleveldigitalmedia.phatbot

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test

class HealthConnectReadAccessTest {
    @Test fun deniedCategoryIsNeverReadOrSubstitutedWithZero() = runBlocking {
        val access = HealthConnectReadAccess(setOf("steps"))
        var invoked = false
        assertNull(access.read("heart_rate") { invoked = true; 120 })
        assertFalse(invoked)
        assertEquals(42, access.read("steps") { 42 })
    }
    @Test fun revocationDuringReadDoesNotBlockOtherGrantedCategories() = runBlocking {
        val access = HealthConnectReadAccess(setOf("steps", "exercise"))
        assertNull(access.read<Int>("steps") { throw SecurityException("private native diagnostic") })
        assertEquals("workout", access.read("exercise") { "workout" })
        assertEquals(1, access.warnings.size)
        assertFalse(access.warnings.single().contains("private"))
    }
    @Test fun zeroAndMissingRemainDistinct() = runBlocking {
        val access = HealthConnectReadAccess(setOf("steps"))
        assertEquals(0, access.read("steps") { 0 })
        assertNull(access.read<Int?>("steps") { null })
        assertTrue(access.warnings.isEmpty())
    }
    @Test fun cancellationPropagatesInsteadOfSavingPartialResults() = runBlocking {
        val access = HealthConnectReadAccess(setOf("steps"))
        try {
            access.read<Int>("steps") { throw CancellationException("stopped") }
            fail("Cancellation must propagate")
        } catch (expected: CancellationException) { assertTrue(access.warnings.isEmpty()) }
    }
}
