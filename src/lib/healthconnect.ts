import { Capacitor, registerPlugin } from '@capacitor/core';

export type HealthConnectSnapshot = {
  startDate: string;
  endDate: string;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  activeEnergyKcal?: number;
  steps?: number;
  weightKg?: number | null;
  dailyMetrics?: Array<{
    date: string;
    steps?: number;
    activeEnergyKcal?: number;
  }>;
  workouts?: Array<{
    sourceWorkoutId: string;
    activityType: number;
    activityName?: string;
    startDate: string;
    endDate: string;
    durationSeconds: number;
    distanceMeters?: number | null;
    activeEnergyKcal?: number | null;
    averageHeartRateBpm?: number | null;
  }>;
  sleep?: Array<{
    value: number;
    startDate: string;
    endDate: string;
    durationSeconds: number;
  }>;
};

type HealthConnectPlugin = {
  isAvailable(): Promise<{ available: boolean; sdkStatus?: number }>;
  requestAuthorization(): Promise<{ authorized: boolean; requested?: boolean }>;
  getRecentSnapshot(options?: { days?: number }): Promise<HealthConnectSnapshot>;
};

const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect');

export function canUseNativeHealthConnect() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

export async function requestHealthConnectAccess() {
  if (!canUseNativeHealthConnect()) return { authorized: false };
  return HealthConnect.requestAuthorization();
}

export async function getHealthConnectSnapshot(days = 14) {
  if (!canUseNativeHealthConnect()) return null;
  const availability = await HealthConnect.isAvailable();
  if (!availability.available) return null;
  return HealthConnect.getRecentSnapshot({ days });
}
