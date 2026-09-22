import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, sync: vi.fn(), authorize: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useEffect: () => {},
  useMemo: (fn: () => unknown) => fn(),
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
vi.mock('@/lib/health', () => ({ getNativeHealthProvider: () => 'apple_health', requestNativeHealthAccess: harness.authorize }));
vi.mock('@/lib/healthSync', async original => ({ ...await original<typeof import('@/lib/healthSync')>(), syncNativeHealth: harness.sync }));
import HealthConnectionCard from '@/components/HealthConnectionCard';
type Node = { type?: unknown; props?: { children?: unknown; onClick?: () => void } };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== 'object') return [];
  const node = value as Node;
  return [node, ...nodes(node.props?.children)];
}
function render() { harness.cursor = 0; return HealthConnectionCard(); }
const buttons = () => nodes(render()).filter(node => node.type === 'button');
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
beforeEach(() => {
  harness.states = ['disconnected', '', null];
  harness.authorize.mockReset().mockResolvedValue({ authorized: true });
  harness.sync.mockReset().mockResolvedValue({ status: 'synced', syncedAt: '2026-09-21T12:00:00Z', dailyMetrics: 14, workouts: 2, cardioSegments: 1, warnings: [] });
});
describe('manual health controls', () => {
  it('Connect authorizes then invokes the shared 14-day sync and displays canonical counts', async () => {
    buttons()[0].props?.onClick?.(); await flush();
    expect(harness.authorize).toHaveBeenCalledOnce();
    expect(harness.sync).toHaveBeenCalledExactlyOnceWith(14);
    expect(harness.authorize.mock.invocationCallOrder[0]).toBeLessThan(harness.sync.mock.invocationCallOrder[0]);
    expect(JSON.stringify(render())).toContain('14 daily records, 2 workouts, and 1 cardio segments');
  });
  it('Sync uses the same authority without another authorization request', async () => {
    buttons()[1].props?.onClick?.(); await flush();
    expect(harness.sync).toHaveBeenCalledExactlyOnceWith(14); expect(harness.authorize).not.toHaveBeenCalled();
  });
  it('gives permission recovery without claiming import when authorization fails', async () => {
    harness.authorize.mockResolvedValue({ authorized: false });
    buttons()[0].props?.onClick?.(); await flush();
    expect(harness.sync).not.toHaveBeenCalled(); expect(JSON.stringify(render())).toContain('Allow PHATBOT to read workouts');
  });
  it('displays empty results as a diagnostic', async () => {
    harness.sync.mockResolvedValue({status:'empty',syncedAt:null});
    buttons()[1].props?.onClick?.(); await flush();
    expect(JSON.stringify(render())).toContain('No readable health records');
    expect(JSON.stringify(render())).not.toContain('Last recorded sync');
  });
  it('does not expose backend details or a successful timestamp on failure', async () => {
    harness.sync.mockRejectedValue(new Error('private Supabase details'));
    buttons()[1].props?.onClick?.(); await flush();
    const text=JSON.stringify(render()); expect(text).toContain('could not finish'); expect(text).not.toContain('private'); expect(text).not.toContain('Last recorded sync');
  });
  it('blocks duplicate clicks before React rerenders', async () => {
    const controls=buttons(); controls[1].props?.onClick?.(); controls[0].props?.onClick?.(); await flush();
    expect(harness.sync).toHaveBeenCalledOnce(); expect(harness.authorize).not.toHaveBeenCalled();
  });
});
describe('health ingestion integration boundaries', () => {
  it.each(['HealthConnectionCard','HealthConnectionPanel','RebuildDashboardStatus'])('%s delegates ingestion without local mapping', name => {
    const source=readFileSync(`src/components/${name}.tsx`,'utf8');
    expect(source).toContain('await syncNativeHealth(14)');
    expect(source).not.toMatch(/getNativeHealthSnapshot|registerPlugin|\.upsert\(|persistHealthSnapshot/);
  });
  it('retains native walk/cycling permissions and activity names', () => {
    const source=readFileSync('ios/App/App/HealthKitManager.swift','utf8');
    for(const type of ['workoutType','stepCount','distanceWalkingRunning','distanceCycling']) expect(source).toContain(type);
    expect(source).toMatch(/case \.cycling: return "Bike Ride"/);
    expect(source).toMatch(/case \.walking: return "Walk"/);
  });
});
