import { Capacitor } from '@capacitor/core';
import { canUseNativeHealthKit, getHealthKitSnapshot, requestHealthKitAccess, type HealthKitSnapshot } from '@/lib/healthkit';

export type PhatbotHealthProvider = 'apple_health' | 'health_connect' | 'none';

export type PhatbotHealthSnapshot = {
  provider: Exclude<PhatbotHealthProvider, 'none'>;
  startDate: string;
  endDate: string;
  restingHeartRate?: number | null;
  hrvMs?: number | null;
  activeEnergyKcal?: number;
  steps?: number;
  workouts?: HealthKitSnapshot['workouts'];
  sleep?: HealthKitSnapshot['sleep'];
};

export function getNativeHealthProvider(): PhatbotHealthProvider {
  if (!Capacitor.isNativePlatform()) return 'none';
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' && canUseNativeHealthKit()) return 'apple_health';
  if (platform === 'android') return 'health_connect';
  return 'none';
}

export async function requestNativeHealthAccess() {
  const provider = getNativeHealthProvider();
  if (provider === 'apple_health') {
    const result = await requestHealthKitAccess();
    return { provider, authorized: result.authorized };
  }

  // Android Health Connect native bridge lands behind this adapter so the rest
  // of PHATBOT never needs platform-specific scoring or reporting logic.
  if (provider === 'health_connect') return { provider, authorized: false, pendingNativeBridge: true };

  return { provider: 'none' as const, authorized: false };
}

export async function getNativeHealthSnapshot(days = 14): Promise<PhatbotHealthSnapshot | null> {
  const provider = getNativeHealthProvider();
  if (provider === 'apple_health') {
    const snapshot = await getHealthKitSnapshot(days);
    return snapshot ? { provider, ...snapshot } : null;
  }

  // Health Connect will normalize into this exact shape.
  return null;
}
