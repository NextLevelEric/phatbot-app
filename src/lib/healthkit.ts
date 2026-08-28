import { Capacitor, registerPlugin } from '@capacitor/core';

type HealthKitAvailability = { available: boolean };
type HealthKitAuthorization = { authorized: boolean };

export type HealthKitSnapshot = {
  startDate: string;
  endDate: string;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  activeEnergyKcal?: number;
  steps?: number;
  workouts?: Array<{
    activityType: number;
    startDate: string;
    endDate: string;
    durationSeconds: number;
    activeEnergyKcal?: number | null;
  }>;
  sleep?: Array<{
    value: number;
    startDate: string;
    endDate: string;
    durationSeconds: number;
  }>;
};

type HealthKitPlugin = {
  isAvailable(): Promise<HealthKitAvailability>;
  requestAuthorization(): Promise<HealthKitAuthorization>;
  getRecentSnapshot(options?: { days?: number }): Promise<HealthKitSnapshot>;
};

const HealthKit = registerPlugin<HealthKitPlugin>('HealthKit');

export function canUseNativeHealthKit() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
}

export async function requestHealthKitAccess() {
  if (!canUseNativeHealthKit()) return { authorized: false };
  return HealthKit.requestAuthorization();
}

export async function getHealthKitSnapshot(days = 14) {
  if (!canUseNativeHealthKit()) return null;
  const availability = await HealthKit.isAvailable();
  if (!availability.available) return null;
  return HealthKit.getRecentSnapshot({ days });
}
