import { beforeEach, describe, expect, it, vi } from 'vitest';
const native = vi.hoisted(() => ({ platform: 'android', native: true, isAvailable: vi.fn(), getStatus: vi.fn(), requestAuthorization: vi.fn(), getRecentSnapshot: vi.fn(), openSettings: vi.fn(), addListener: vi.fn() }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => native.native, getPlatform: () => native.platform }, registerPlugin: () => native }));
import { getHealthConnectStatus, getHealthConnectSnapshot, healthConnectStatusMessage, requestHealthConnectAccess, openHealthConnectSettings, onHealthConnectResume, type HealthConnectStatus } from '@/lib/healthconnect';
const full: HealthConnectStatus = { available: true, sdkStatus: 3, androidApi: 34, recovery: 'settings', grantedCount: 6, requestedCount: 6, authorized: true, allGranted: true, consented: true };
beforeEach(() => {
  vi.clearAllMocks(); native.native = true; native.platform = 'android';
  native.isAvailable.mockResolvedValue({ available: true }); native.getStatus.mockResolvedValue(full);
});
describe('Android bridge boundaries', () => {
  it.each(['ios', 'web'])('never calls the Android bridge on %s', async platform => {
    native.platform = platform;
    expect(await getHealthConnectStatus()).toBeNull();
    expect(await getHealthConnectSnapshot()).toBeNull();
    expect(await requestHealthConnectAccess()).toEqual({ authorized: false });
    await openHealthConnectSettings(); await onHealthConnectResume(() => {});
    for (const name of ['getStatus','getRecentSnapshot','requestAuthorization','openSettings','addListener'] as const) expect(native[name]).not.toHaveBeenCalled();
  });
  it('does not read when Health Connect is unavailable', async () => {
    native.isAvailable.mockResolvedValue({ available: false });
    expect(await getHealthConnectSnapshot()).toBeNull(); expect(native.getRecentSnapshot).not.toHaveBeenCalled();
  });
  it('waits for the native permission outcome rather than returning an optimistic result', async () => {
    let finish!: (value: unknown) => void;
    native.requestAuthorization.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    let settled = false;
    const pending = requestHealthConnectAccess().then(value => { settled = true; return value; });
    await Promise.resolve(); expect(settled).toBe(false);
    finish({ authorized: true, allGranted: false });
    expect(await pending).toEqual({ authorized: true, allGranted: false });
    expect(native.getRecentSnapshot).not.toHaveBeenCalled();
  });
  it('refreshes actual status and registers the native resume event without prompting', async () => {
    native.getStatus.mockResolvedValueOnce(full).mockResolvedValueOnce({ ...full, authorized: false, grantedCount: 0, allGranted: false });
    expect((await getHealthConnectStatus())?.authorized).toBe(true);
    expect((await getHealthConnectStatus())?.authorized).toBe(false);
    const listener = () => {};
    await onHealthConnectResume(listener);
    expect(native.addListener).toHaveBeenCalledWith('healthConnectStatusChanged', listener);
    expect(native.requestAuthorization).not.toHaveBeenCalled();
  });
  it('keeps bridge-version errors visible so old APKs cannot claim current access', async () => {
    native.getStatus.mockRejectedValueOnce(new Error('not implemented'));
    await expect(getHealthConnectStatus()).rejects.toThrow('not implemented');
  });
});
describe('permission and availability explanations', () => {
  it.each([
    [{ androidApi: 26, available: false }, 'Android 9'],
    [{ androidApi: 33, available: false, recovery: 'install' }, 'Install or update'],
    [{ available: false, recovery: 'none' }, 'device or profile'],
    [{ consented: false }, 'Review how PHATBOT uses'],
    [{ authorized: false, allGranted: false, grantedCount: 0 }, 'No health categories'],
    [{ allGranted: false, grantedCount: 2 }, '2 of 6 categories'],
    [{}, 'All requested read categories'],
  ])('explains %j without requiring all permissions', (changes, expected) => {
    expect(healthConnectStatusMessage({ ...full, ...changes } as HealthConnectStatus)).toContain(expected);
  });
});
