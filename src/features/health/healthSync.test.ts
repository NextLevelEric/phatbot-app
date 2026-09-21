import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhatbotHealthSnapshot } from '@/lib/health';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), client: undefined as unknown }));
vi.mock('@/lib/health', () => ({ getNativeHealthSnapshot: mocks.snapshot }));
vi.mock('@/lib/supabase', () => ({ createSupabaseBrowserClient: () => mocks.client }));
import { syncNativeHealth, healthSyncSummary, healthSyncErrorMessage } from '@/lib/healthSync';

type Row = Record<string, unknown>;
let tables: Record<string, Row[]>;
let calls: Array<{ table: string; operation: string; conflict: string }>;
let fail: string, emptyReturn: string;
let auth: ReturnType<typeof vi.fn>, rpc: ReturnType<typeof vi.fn>;
const fixture = (): PhatbotHealthSnapshot => ({
  provider: 'apple_health', startDate: '2026-09-07T12:00:00Z', endDate: '2026-09-21T12:00:00Z',
  steps: 140000, dailyMetrics: [{ date: '2026-09-20', steps: 12000, activeEnergyKcal: 650 }],
  workouts: [
    { sourceWorkoutId: 'walk', activityType: 52, activityName: 'Walk', startDate: '2026-09-20T12:00:00Z', endDate: '2026-09-20T12:20:00Z', durationSeconds: 1200, distanceMeters: 3218.688, activeEnergyKcal: 180, averageHeartRateBpm: 110, distanceSamples: [{ startOffsetSeconds: 0, endOffsetSeconds: 600, distanceMeters: 1609.344 }, { startOffsetSeconds: 600, endOffsetSeconds: 1200, distanceMeters: 1609.344 }] },
    { sourceWorkoutId: 'bike', activityType: 13, activityName: 'Bike Ride', startDate: '2026-09-20T14:00:00Z', endDate: '2026-09-20T14:30:00Z', durationSeconds: 1800, distanceMeters: 8000, activeEnergyKcal: 300, averageHeartRateBpm: 125 },
  ],
});

beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-21T12:00:00Z'));
  tables = {}; calls = []; fail = ''; emptyReturn = '';
  mocks.snapshot.mockReset().mockResolvedValue(fixture());
  auth = vi.fn().mockResolvedValue({ data: { user: { id: 'athlete' } }, error: null });
  rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  mocks.client = { auth: { getUser: auth }, rpc, from: (table: string) => {
    let operation = 'read', values: Row[] = [], conflict = '';
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select: () => query,
      eq: (field: string, value: unknown) => { filters.push(row => row[field] === value); return query; },
      in: (field: string, value: unknown[]) => { filters.push(row => value.includes(row[field])); return query; },
      upsert: (rows: Row | Row[], options: { onConflict: string }) => { operation = 'upsert'; values = Array.isArray(rows) ? rows : [rows]; conflict = options.onConflict; return query; },
      then: (resolve: (result: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve().then(() => {
        calls.push({ table, operation, conflict });
        if (fail === `${table}:${operation}`) return { data: null, error: { message: 'private database diagnostic' } };
        const store = tables[table] ??= [];
        if (operation === 'read') return { data: store.filter(row => filters.every(filter => filter(row))), error: null };
        const keys = conflict.split(',');
        const saved = values.map(row => {
          let current = store.find(item => keys.every(key => item[key] === row[key]));
          if (current) Object.assign(current, row);
          else { current = { id: `${table}-${store.length}`, ...row }; store.push(current); }
          return current;
        });
        return { data: emptyReturn === table ? [] : saved, error: null };
      }).then(resolve, reject),
    };
    return query;
  } };
});
afterEach(() => vi.useRealTimers());

describe('shared native health authority', () => {
  it('persists walks, cycling, raw workout fields, steps and real standardized walk segments', async () => {
    const result = await syncNativeHealth();
    expect(mocks.snapshot).toHaveBeenCalledWith(14);
    expect(result).toMatchObject({ dailyMetrics: 1, workouts: 2, cardioSegments: 1, status: 'synced' });
    expect(tables.cardio_activities[1]).toMatchObject({ source_workout_id: 'bike', activity_type: 13, activity_name: 'Bike Ride', duration_seconds: 1800, distance_meters: 8000, active_energy_kcal: 300, average_heart_rate_bpm: 125, source: 'healthkit', started_at: '2026-09-20T14:00:00Z', ended_at: '2026-09-20T14:30:00Z' });
    expect(tables.health_daily_metrics[0]).toMatchObject({ steps: 12000, metric_date: '2026-09-20', source: 'healthkit' });
    expect(tables.cardio_activity_segments[0]).toMatchObject({ segment_key: 'walk-1mi', duration_seconds: 600, cardio_activity_id: tables.cardio_activities[0].id });
    expect(calls.filter(call => call.operation === 'upsert').map(call => call.table)).toEqual(['health_daily_metrics','cardio_activities','cardio_activity_segments','athlete_health_connections']);
  });
  it('repeated sync keeps existing workout IDs and segment IDs without duplicates', async () => {
    await syncNativeHealth(); const first = structuredClone(tables);
    await syncNativeHealth(); expect(tables).toEqual(first);
    expect(tables.cardio_activities).toHaveLength(2); expect(tables.cardio_activity_segments).toHaveLength(1);
  });
  it('deduplicates native source IDs before bulk upsert', async () => {
    const snapshot=fixture(); snapshot.workouts!.push(snapshot.workouts![0]); mocks.snapshot.mockResolvedValue(snapshot);
    expect(await syncNativeHealth()).toMatchObject({workouts:2,cardioSegments:1});
  });
  it('coalesces concurrent entry points for the same athlete', async () => {
    const results=await Promise.all([syncNativeHealth(),syncNativeHealth(),syncNativeHealth()]);
    expect(mocks.snapshot).toHaveBeenCalledOnce(); expect(results[0]).toBe(results[1]);
    expect(calls.filter(call=>call.table==='cardio_activities'&&call.operation==='upsert')).toHaveLength(1);
  });
  it('uses the same pipeline and health_connect source on Android without invented segments', async () => {
    const snapshot=fixture(); snapshot.provider='health_connect'; snapshot.workouts!.forEach(row=>{delete row.distanceSamples;}); mocks.snapshot.mockResolvedValue(snapshot);
    expect(await syncNativeHealth()).toMatchObject({provider:'health_connect',workouts:2,cardioSegments:0});
    expect(tables.cardio_activities.every(row=>row.source==='health_connect')).toBe(true);
    expect(tables.athlete_health_connections[0].provider).toBe('health_connect');
  });
  it('does not copy a 14-day steps total into today', async () => {
    await syncNativeHealth(); expect(tables.health_daily_metrics).toHaveLength(1);
    expect(tables.health_daily_metrics.some(row=>row.steps===140000||row.metric_date==='2026-09-21')).toBe(false);
  });
  it.each([{ dailyMetrics: [] }, { dailyMetrics: [{ date:'2026-09-20',steps:0,activeEnergyKcal:0 }] }])('treats an empty or all-zero native read as diagnostic, without erasing history', async ({ dailyMetrics }) => {
    mocks.snapshot.mockResolvedValue({...fixture(),workouts:[],dailyMetrics,steps:0});
    const result=await syncNativeHealth(); expect(result).toMatchObject({status:'empty',dailyMetrics:0,workouts:0,cardioSegments:0,syncedAt:null});
    expect(calls).toHaveLength(0); expect(rpc).not.toHaveBeenCalled();
    expect(healthSyncSummary(result!)).toContain('No readable health records');
  });
  it('guides permission failures without exposing native/database details', async () => {
    mocks.snapshot.mockRejectedValue(new Error('permission denied sensitive details'));
    await expect(syncNativeHealth()).rejects.toMatchObject({stage:'read',message:expect.stringContaining('permissions')});
    expect(calls).toHaveLength(0); expect(healthSyncErrorMessage(new Error('private database diagnostic'))).not.toContain('private');
  });
  it('returns unavailable without saving a successful connection', async () => {
    mocks.snapshot.mockResolvedValue(null); expect(await syncNativeHealth()).toBeNull(); expect(calls).toHaveLength(0);
  });
  it.each([
    ['health_daily_metrics','daily records',0,0],
    ['cardio_activities','workouts',1,0],
    ['cardio_activity_segments','cardio segments',1,2],
    ['athlete_health_connections','sync status',1,2],
  ])('reports partial failure at %s rather than full success', async (table,stage,days,workouts) => {
    fail=`${table}:upsert`;
    await expect(syncNativeHealth()).rejects.toMatchObject({stage,saved:{dailyMetrics:days,workouts},message:expect.not.stringContaining('private database diagnostic')});
    expect(tables.athlete_health_connections).toBeUndefined(); expect(rpc).not.toHaveBeenCalled();
    fail=''; expect(await syncNativeHealth()).toMatchObject({status:'synced',workouts:2});
    expect(tables.cardio_activities).toHaveLength(2);
  });
  it('fails if native workouts receive no authoritative saved row IDs', async () => {
    emptyReturn='cardio_activities';
    await expect(syncNativeHealth()).rejects.toMatchObject({stage:'workouts',saved:{dailyMetrics:1,workouts:0}});
    expect(tables.athlete_health_connections).toBeUndefined();
  });
  it('does not claim competition refresh when its existing lifecycle RPC fails', async () => {
    rpc.mockResolvedValue({error:{message:'private error'}}); const result=await syncNativeHealth();
    expect(result!.warnings).toHaveLength(1); expect(healthSyncSummary(result!)).toContain('standings could not refresh');
  });
  it('preserves existing positive daily quantities and missing workout details on partial read access', async () => {
    await syncNativeHealth(); const snapshot=fixture(); snapshot.dailyMetrics![0].steps=0; snapshot.dailyMetrics![0].activeEnergyKcal=0;
    snapshot.workouts![0].averageHeartRateBpm=null; snapshot.workouts![0].distanceMeters=null;
    mocks.snapshot.mockResolvedValue(snapshot); await syncNativeHealth();
    expect(tables.health_daily_metrics[0].steps).toBe(12000); expect(tables.cardio_activities[0].distance_meters).toBe(3218.688); expect(tables.cardio_activities[0].average_heart_rate_bpm).toBe(110);
  });
  it('rejects invalid workout identity before performing partial writes', async () => {
    const snapshot=fixture(); snapshot.workouts![0].sourceWorkoutId=''; mocks.snapshot.mockResolvedValue(snapshot);
    await expect(syncNativeHealth()).rejects.toMatchObject({stage:'validate'}); expect(calls).toHaveLength(0);
  });
  it('prevents writing a captured snapshot after the signed-in account changes', async () => {
    auth.mockResolvedValueOnce({data:{user:{id:'athlete'}},error:null}).mockResolvedValue({data:{user:{id:'other'}},error:null});
    await expect(syncNativeHealth()).rejects.toMatchObject({stage:'auth'}); expect(calls).toHaveLength(0);
  });
  it('requires authentication before accessing health data', async () => {
    auth.mockResolvedValue({data:{user:null},error:null}); await expect(syncNativeHealth()).rejects.toMatchObject({stage:'auth'}); expect(mocks.snapshot).not.toHaveBeenCalled();
  });
});
