import { Capacitor } from '@capacitor/core';
import { canUseNativeHealthKit, getHealthKitSnapshot, requestHealthKitAccess, type HealthKitSnapshot } from '@/lib/healthkit';
import { canUseNativeHealthConnect, getHealthConnectSnapshot, requestHealthConnectAccess, type HealthConnectSnapshot } from '@/lib/healthconnect';

export type PhatbotHealthProvider = 'apple_health' | 'health_connect' | 'none';

type NativeSnapshot = HealthKitSnapshot | HealthConnectSnapshot;

export type PhatbotHealthSnapshot = NativeSnapshot & {
  provider: Exclude<PhatbotHealthProvider, 'none'>;
};

export function getNativeHealthProvider(): PhatbotHealthProvider {
  if (!Capacitor.isNativePlatform()) return 'none';
  const platform = Capacitor.getPlatform();
  if (platform === 'ios' && canUseNativeHealthKit()) return 'apple_health';
  if (platform === 'android' && canUseNativeHealthConnect()) return 'health_connect';
  return 'none';
}

export async function requestNativeHealthAccess() {
  const provider = getNativeHealthProvider();
  if (provider === 'apple_health') {
    const result = await requestHealthKitAccess();
    return { provider, ...result };
  }
  if (provider === 'health_connect') {
    const result = await requestHealthConnectAccess();
    return { provider, ...result };
  }
  return { provider: 'none' as const, authorized: false };
}

export async function getNativeHealthSnapshot(days = 14): Promise<PhatbotHealthSnapshot | null> {
  const provider = getNativeHealthProvider();
  if (provider === 'apple_health') {
    const snapshot = await getHealthKitSnapshot(days);
    return snapshot ? { provider, ...snapshot } : null;
  }
  if (provider === 'health_connect') {
    const snapshot = await getHealthConnectSnapshot(days);
    return snapshot ? { provider, ...snapshot } : null;
  }
  return null;
}
