import { describe,expect,it } from 'vitest';
import { aggregateSleep,localDate,reliableNight,shiftDay,type SleepSample } from './sleep';
export const sample=(value:number,startDate:string,endDate:string):SleepSample=>({value,startDate,endDate,durationSeconds:999999});
const row=(value:number,start:string,end:string)=>sample(value,`2026-09-${start}`,`2026-09-${end}`);
const aggregate=(samples:SleepSample[],source='healthkit')=>aggregateSleep(samples,source,'America/New_York','2026-09-01T00:00:00Z','2026-10-01T00:00:00Z');
describe('interval-derived sleep',()=>{
  it('unions duplicate/overlapping sleep and separates in bed, stages and unspecified',()=>{
    const samples=[row(0,'20T22:00:00Z','21T07:00:00Z'),row(1,'20T23:00:00Z','21T07:00:00Z'),row(3,'20T23:00:00Z','21T03:00:00Z'),row(4,'21T03:00:00Z','21T04:00:00Z'),row(5,'21T04:00:00Z','21T06:00:00Z')];
    const night=aggregate([...samples,...samples])[0];
    expect(night.asleep_seconds).toBe(8*3600);expect(night.in_bed_seconds).toBe(9*3600);expect(night.awake_seconds).toBeNull();
    expect(night.stages).toEqual({core:14400,deep:3600,rem:7200,unspecified:3600});
    expect(night.wake_date).toBe('2026-09-21');expect(night.raw_samples).toHaveLength(5);expect(reliableNight(night)).toBe(true);
  });
  it('subtracts conflicting awake intervals rather than counting them as sleep',()=>{
    const night=aggregate([row(1,'20T23:00:00Z','21T07:00:00Z'),row(2,'21T04:00:00Z','21T04:30:00Z')])[0];
    expect(night.asleep_seconds).toBe(7.5*3600);expect(night.awake_seconds).toBe(1800);expect(night.quality_flags).toContain('conflicting_states');expect(reliableNight(night)).toBe(false);
    const fullyConflicted=aggregate([row(1,'20T23:00:00Z','21T07:00:00Z'),row(2,'20T23:00:00Z','21T07:00:00Z')])[0];
    expect(fullyConflicted.asleep_seconds).toBeNull();expect(fullyConflicted.wake_time).toBeNull();
  });
  it('does not count gaps between asleep intervals, and joins cross-midnight stages',()=>{
    const night=aggregate([row(3,'20T23:00:00Z','21T03:00:00Z'),row(2,'21T03:00:00Z','21T04:00:00Z'),row(5,'21T04:00:00Z','21T07:00:00Z')])[0];
    expect(night.asleep_seconds).toBe(7*3600);expect(night.wake_date).toBe('2026-09-21');expect(night.quality_flags).toEqual([]);
  });
  it('marks overlapping specific stages unspecified without fabricating a winner',()=>{
    const night=aggregate([row(3,'20T23:00:00Z','21T03:00:00Z'),row(4,'21T02:00:00Z','21T04:00:00Z')])[0];
    expect(night.asleep_seconds).toBe(5*3600);expect(night.stages).toEqual({core:10800,unspecified:3600,deep:3600});expect(night.quality_flags).toContain('conflicting_states');
  });
  it('keeps absent sleep and absent stages unknown, including Android session-only spans',()=>{
    expect(aggregate([row(0,'20T23:00:00Z','21T07:00:00Z')])[0]).toMatchObject({asleep_seconds:null,in_bed_seconds:28800,stages:{},sleep_start:null,wake_time:null});
    expect(aggregate([row(1,'20T23:00:00Z','21T07:00:00Z')],'health_connect')[0]).toMatchObject({asleep_seconds:null,in_bed_seconds:null,stages:{},quality_flags:['session_only']});
    expect(aggregate([row(1,'20T23:00:00Z','21T07:00:00Z')])[0].stages).toEqual({unspecified:28800});
  });
  it('retains additional episodes separately and does not add naps to the main night',()=>{
    const night=aggregate([row(1,'20T23:00:00Z','21T11:00:00Z'),row(1,'21T18:00:00Z','21T19:00:00Z')])[0];
    expect(night.asleep_seconds).toBe(12*3600);expect(night.additional_sleep_seconds).toBe(3600);expect(night.raw_samples).toHaveLength(2);expect(night.quality_flags).toContain('multiple_episodes');
  });
  it('uses elapsed time through DST and defensible local wake dates',()=>{
    const spring=aggregateSleep([sample(1,'2026-03-08T06:00:00Z','2026-03-08T08:00:00Z')],'healthkit','America/New_York','2026-03-01T00:00:00Z','2026-03-10T00:00:00Z')[0];
    const fall=aggregateSleep([sample(1,'2026-11-01T05:00:00Z','2026-11-01T07:00:00Z')],'healthkit','America/New_York','2026-10-25T00:00:00Z','2026-11-03T00:00:00Z')[0];
    expect(spring.asleep_seconds).toBe(7200);expect(fall.asleep_seconds).toBe(7200);expect(spring.wake_date).toBe('2026-03-08');
    expect(localDate('2026-10-01T05:00:00Z','America/Los_Angeles')).toBe('2026-09-30');expect(localDate('2026-10-01T05:00:00Z','America/New_York')).toBe('2026-10-01');expect(shiftDay('2026-03-08',-1)).toBe('2026-03-07');
  });
  it('flags snapshot boundary, unknown, invalid and malformed intervals',()=>{
    expect(aggregate([sample(1,'invalid','invalid')])).toEqual([]);
    expect(aggregate([row(99,'20T23:00:00Z','21T07:00:00Z')])[0].quality_flags).toContain('unknown_category');
    const night=aggregateSleep([row(1,'20T23:00:00Z','21T07:00:00Z')],'healthkit','UTC','2026-09-21T02:00:00Z','2026-09-22T00:00:00Z')[0];expect(night.quality_flags).toContain('window_boundary');
    expect(()=>aggregateSleep([],'healthkit','bad/zone','2026-09-01','2026-09-30')).toThrow();
  });
});
