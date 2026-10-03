import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type HealthConnectStatus = {
  available: boolean;
  sdkStatus: number;
  androidApi: number;
  recovery: 'settings' | 'install' | 'none';
  grantedCount: number;
  requestedCount: number;
  authorized: boolean;
  allGranted: boolean;
  consented: boolean;
};

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
    distanceSamples?: Array<{
      startOffsetSeconds: number;
      endOffsetSeconds: number;
      distanceMeters: number;
    }>;
  }>;
  sleep?: Array<{
    value: number;
    startDate: string;
    endDate: string;
    durationSeconds: number;
  }>;
  readWarnings?: string[];
};

type HealthConnectPlugin = {
  isAvailable(): Promise<{ available: boolean; sdkStatus?: number }>;
  requestAuthorization(): Promise<{ authorized: boolean; requested?: boolean }>;
  getRecentSnapshot(options?: { days?: number }): Promise<HealthConnectSnapshot>;
  getStatus(): Promise<HealthConnectStatus>;
  openSettings(): Promise<void>;
  addListener(event: 'healthConnectStatusChanged', listener: () => void): Promise<PluginListenerHandle>;
};

const HealthConnect = registerPlugin<HealthConnectPlugin>('HealthConnect');

export async function getHealthConnectStatus() {
  if (!canUseNativeHealthConnect()) return null;
  return HealthConnect.getStatus();
}

export async function openHealthConnectSettings() {
  if (canUseNativeHealthConnect()) await HealthConnect.openSettings();
}

export async function onHealthConnectResume(listener: () => void) {
  if (!canUseNativeHealthConnect()) return null;
  return HealthConnect.addListener('healthConnectStatusChanged', listener);
}

export function healthConnectStatusMessage(status: HealthConnectStatus) {
  if (status.androidApi < 28) return 'Health Connect requires Android 9 or later. You can keep using PHATBOT without it.';
  if (status.recovery === 'install') return 'Install or update Health Connect, then return here to connect.';
  if (!status.available) return 'Health Connect is unavailable on this device or profile. You can keep using PHATBOT without it.';
  if (!status.consented) return 'Review how PHATBOT uses your data before connecting.';
  if (!status.authorized) return 'No health categories are approved. Choose access or manage permissions in Health Connect settings.';
  if (!status.allGranted) return `${status.grantedCount} of ${status.requestedCount} categories approved. Sync reads only those categories; missing data stays missing.`;
  return 'All requested read categories are approved.';
}

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
