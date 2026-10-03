import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/link', () => ({ default: 'a' }));
const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, status: vi.fn(), sync: vi.fn(), authorize: vi.fn(), settings: vi.fn(), auth: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useState: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.states)) harness.states[i] = initial;
    return [harness.states[i], (value: unknown) => { harness.states[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = harness.cursor++;
    if (!(i in harness.states)) harness.states[i] = { current: initial };
    return harness.states[i];
  },
}));
vi.mock('@/lib/healthconnect', async original => ({ ...await original<typeof import('@/lib/healthconnect')>(), getHealthConnectStatus: harness.status, requestHealthConnectAccess: harness.authorize, openHealthConnectSettings: harness.settings }));
vi.mock('@/lib/healthSync', async original => ({ ...await original<typeof import('@/lib/healthSync')>(), syncNativeHealth: harness.sync }));
vi.mock('@/lib/supabase', () => ({ createSupabaseBrowserClient: () => ({ auth: { getUser: harness.auth } }) }));
import AndroidHealthConnectionCard from '@/components/AndroidHealthConnectionCard';
type Node = { type?: unknown; props?: { children?: unknown; disabled?: boolean; onClick?: () => void } };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as Node; return [node, ...nodes(node.props?.children)];
}
function render() { harness.cursor = 0; return AndroidHealthConnectionCard(); }
function click(label: string) {
  const button = nodes(render()).find(node => node.type === 'button' && node.props?.children === label);
  expect(button).toBeDefined(); expect(button!.props?.disabled).toBe(false); button!.props?.onClick?.();
}
async function flush() { for (let i = 0; i < 20; i++) await Promise.resolve(); }
const partial = { available: true, sdkStatus: 3, androidApi: 34, recovery: 'settings', grantedCount: 2, requestedCount: 6, authorized: true, allGranted: false, consented: true };
beforeEach(() => {
  harness.states = [{ ...partial }, false, false, '', null, null];
  harness.status.mockReset().mockResolvedValue({ ...partial });
  harness.authorize.mockReset().mockResolvedValue({ authorized: true });
  harness.settings.mockReset().mockResolvedValue(undefined);
  harness.auth.mockReset().mockResolvedValue({ data: { user: { id: 'athlete' } } });
  harness.sync.mockReset().mockResolvedValue({ status: 'synced', syncedAt: '2026-10-03T12:00:00Z', dailyMetrics: 1, workouts: 1, cardioSegments: 0, warnings: [], latestWorkoutId: 'workout' });
});
describe('Android health controls', () => {
  it('syncs approved categories without requesting the denied ones again', async () => {
    click('Sync Health Data'); await flush();
    expect(harness.sync).toHaveBeenCalledExactlyOnceWith(14); expect(harness.authorize).not.toHaveBeenCalled();
    expect(JSON.stringify(render())).toContain('View Latest Cardio Report');
  });
  it('rechecks revoked access before sync despite stale connected UI', async () => {
    harness.status.mockResolvedValue({ ...partial, authorized: false, grantedCount: 0 });
    click('Sync Health Data'); await flush();
    expect(harness.sync).not.toHaveBeenCalled(); expect(harness.authorize).not.toHaveBeenCalled();
    expect(JSON.stringify(render())).toContain('No health categories are approved');
  });
  it('denial does not import or loop permission prompts', async () => {
    harness.authorize.mockResolvedValue({ authorized: false });
    click('Choose read access'); await flush();
    expect(harness.authorize).toHaveBeenCalledOnce(); expect(harness.sync).not.toHaveBeenCalled();
    expect(JSON.stringify(render())).toContain('No new sync was started');
  });
  it('authenticates before showing native consent', async () => {
    harness.auth.mockResolvedValue({ data: { user: null } });
    click('Choose read access'); await flush();
    expect(harness.authorize).not.toHaveBeenCalled(); expect(harness.sync).not.toHaveBeenCalled();
  });
  it('never reads data before server-sync disclosure acceptance', async () => {
    harness.status.mockResolvedValue({ ...partial, consented: false });
    click('Sync Health Data'); await flush(); expect(harness.sync).not.toHaveBeenCalled();
    expect(JSON.stringify(render())).toContain('Review & connect');
  });
  it('offers provider installation only when native availability supports it', async () => {
    harness.states[0] = { ...partial, available: false, recovery: 'install', androidApi: 33 };
    click('Install / update Health Connect'); await flush();
    expect(harness.settings).toHaveBeenCalledOnce(); expect(harness.sync).not.toHaveBeenCalled();
  });
  it('refreshing access never launches consent or sync', async () => {
    click('Check access again'); await flush();
    expect(harness.status).toHaveBeenCalled(); expect(harness.authorize).not.toHaveBeenCalled(); expect(harness.sync).not.toHaveBeenCalled();
  });
  it('blocks double taps before rerender', async () => {
    const buttons = nodes(render()).filter(node => node.type === 'button');
    buttons.find(node => node.props?.children === 'Sync Health Data')!.props?.onClick?.();
    buttons.find(node => node.props?.children === 'Choose read access')!.props?.onClick?.();
    await flush(); expect(harness.sync).toHaveBeenCalledOnce(); expect(harness.authorize).not.toHaveBeenCalled();
  });
});
