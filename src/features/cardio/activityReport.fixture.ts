import type { Activity } from './activityReport';
import type { CardioSegmentRow } from './comparableEfforts';

// Reviewed September 27 measurements; synthetic identifiers, no athlete identity.
export const longRun: Activity = {
  id: '10000000-0000-4000-8000-000000000001', activity_type: 37, activity_name: 'Run',
  started_at: '2026-09-27T09:29:08Z', distance_meters: 14793.35, duration_seconds: 6965.22,
  average_heart_rate_bpm: 130.90, active_energy_kcal: 1172.61, source: 'healthkit',
};
export const previousRun: Activity = {
  ...longRun, id: '10000000-0000-4000-8000-000000000002', started_at: '2026-09-20T10:51:28Z',
  distance_meters: 5306.99, duration_seconds: 2190.11, average_heart_rate_bpm: 137.35,
};
export const fiveK: CardioSegmentRow = {
  id: 'segment-current', cardio_activity_id: longRun.id, segment_key: 'run-5k', segment_label: '5K',
  distance_meters: 5000, duration_seconds: 2153.9341329398408,
  start_offset_seconds: 4.501549243927002, end_offset_seconds: 2158.4356821837678,
};
export const previousFiveK: CardioSegmentRow = {
  ...fiveK, id: 'segment-previous', cardio_activity_id: previousRun.id, duration_seconds: 2064.5689058694497,
  start_offset_seconds: 122.48655092716217, end_offset_seconds: 2187.055456796612,
};
