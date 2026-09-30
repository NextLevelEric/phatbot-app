import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import CardioActivityReport from '@/components/CardioActivityReport';
import CardioTrendPanel from '@/components/CardioTrendPanel';
import { buildComparableEffortGroups } from './comparableEfforts';
import { RecentCardioActivities } from '@/components/CardioDashboard';
import { activityMilestones, averageMotion, dashboardSummary, DAY_MS, reportSegments, wholeActivitySummary } from './activityReport';
import { longRun, previousRun, fiveK, previousFiveK } from './activityReport.fixture';

const data = {activity:longRun,history:[previousRun],segments:[fiveK],previousSegments:[previousFiveK],previousActivities:[previousRun],comparisonsAvailable:true};
describe('completed activity evidence', () => {
  it('explains the entire September 27 run independently of its slower 5K', () => {
    expect(wholeActivitySummary(longRun)).toBe('You covered 9.19 mi in 1:56:05 at 12:38/mi with an average heart rate of 131 bpm.');
    expect(activityMilestones(longRun,[previousRun])).toEqual(['Longest recorded run distance in the preceding 30 days.','Longest recorded run duration in the preceding 30 days.']);
    const report = reportSegments(longRun,[fiveK],[previousFiveK],[previousRun])[0];
    expect(report.change).toBe('1:29 slower than the previous effort.');
    expect(report.context).toContain('inside a 9.2 mi run');
    const html = renderToStaticMarkup(<CardioActivityReport data={data} />);
    for (const value of ['9.19 mi','1:56:05','12:38/mi','131 bpm','35:54','1:29 slower','PHATBOT Activity Report','Longest recorded run distance']) expect(html).toContain(value);
    expect(html.indexOf('PHATBOT Activity Report')).toBeLessThan(html.indexOf('Standardized segments'));
    expect(html).toContain(`/progress/activity/${previousRun.id}`);
    expect(html).toContain('/progress/activity/benchmark/37/run-5k');
    const group=buildComparableEffortGroups([fiveK,previousFiveK],{[longRun.id]:longRun,[previousRun.id]:previousRun})[0];
    const trend=renderToStaticMarkup(<CardioTrendPanel group={group} />);
    expect(trend).toContain(`/progress/activity/${longRun.id}`);
    expect(trend).toContain(`/progress/activity/${previousRun.id}`);
  });
  it('does not invent missing metrics or unsupported cycling pace', () => {
    const activity={...longRun,distance_meters:null,average_heart_rate_bpm:null,active_energy_kcal:null};
    const html=renderToStaticMarkup(<CardioActivityReport data={{...data,activity,segments:[],previousSegments:[],previousActivities:[]}} />);
    expect(html).not.toContain('Average pace'); expect(html).not.toContain('Average heart rate'); expect(html).not.toContain('Active energy');
    expect(html).toContain('No standardized segments');
    expect(averageMotion({...longRun,activity_name:'Bike Ride'})).toEqual({label:'Average speed',value:'4.8 mph'});
    expect(averageMotion({...longRun,activity_name:'Swim'})).toBeNull();
    expect(averageMotion({...longRun,duration_seconds:0})).toBeNull();
  });
  it('does not claim records with no prior data, ties, another activity, or future workouts', () => {
    expect(activityMilestones(longRun,[])).toEqual([]);
    const same={...longRun,id:'tie',started_at:previousRun.started_at};
    expect(activityMilestones(longRun,[same])).toEqual([]);
    expect(activityMilestones(longRun,[{...previousRun,activity_type:52,activity_name:'Walk'}])).toEqual([]);
    expect(activityMilestones(longRun,[{...previousRun,started_at:'2026-09-28T00:00:00Z'}])).toEqual([]);
    const future={...longRun,id:'future',started_at:'2026-09-28T00:00:00Z',distance_meters:99999};
    expect(activityMilestones(longRun,[previousRun,future])).toHaveLength(2);
  });
  it('anchors milestone bounds to the activity and excludes older data', () => {
    const start=Date.parse(longRun.started_at)-30*DAY_MS;
    expect(activityMilestones(longRun,[{...previousRun,started_at:new Date(start).toISOString()}])).toHaveLength(2);
    expect(activityMilestones(longRun,[{...previousRun,started_at:new Date(start-1).toISOString()}])).toEqual([]);
  });
  it('reuses comparable identity without future or different-type contamination', () => {
    const future={...previousRun,id:'future',started_at:'2026-09-28T00:00:00Z'};
    const walk={...previousRun,id:'walk',activity_type:52,activity_name:'Walk'};
    const comparisons=reportSegments(longRun,[fiveK],[previousFiveK,{...previousFiveK,id:'s2',cardio_activity_id:future.id},{...previousFiveK,id:'s3',cardio_activity_id:walk.id}],[previousRun,future,walk]);
    expect(comparisons[0].previous?.activity.id).toBe(previousRun.id);
    expect(reportSegments(longRun,[fiveK],[],[])[0].change).toBe('No earlier comparable effort recorded.');
  });
  it('shows failed history separately from genuinely absent history', () => {
    const html=renderToStaticMarkup(<CardioActivityReport data={{...data,history:null,comparisonsAvailable:false}} />);
    expect(html).toContain('Historical comparisons could not load'); expect(html).not.toContain('Longest recorded');
    expect(html).toContain('comparison is temporarily unavailable'); expect(html).not.toContain('1:29 slower');
    const failedSegments=renderToStaticMarkup(<CardioActivityReport data={{...data,segments:null}} />);
    expect(failedSegments).toContain('Segments could not load'); expect(failedSegments).toContain('9.19 mi');
  });
  it('rounds pace without producing a sixty-second remainder', () => {
    expect(averageMotion({...longRun,distance_meters:1609.344,duration_seconds:779.9})?.value).toBe('13:00/mi');
  });
});
describe('cardio dashboard', () => {
  it('separates modalities and excludes strength/future workouts from totals', () => {
    const ride={...previousRun,id:'ride',activity_type:13,activity_name:'Bike Ride'};
    const strength={...previousRun,id:'strength',activity_name:'Strength Training'};
    const future={...previousRun,id:'future',started_at:'2026-10-02T00:00:00Z'};
    const now=Date.parse('2026-09-30T12:00:00Z');
    const result=dashboardSummary([longRun,previousRun,ride,strength,future],now);
    expect(result.count).toBe(3); expect(result.groups.map(group=>group.label)).toEqual(['Run','Ride']);
    expect(result.longest?.id).toBe(longRun.id);
    const html=renderToStaticMarkup(<RecentCardioActivities activities={[longRun,previousRun,ride]} asOf={now} />);
    expect(html).toContain(`/progress/activity/${longRun.id}`); expect(html).toContain('12:38/mi'); expect(html).toContain('mph');
  });
  it('uses nonoverlapping 30-day windows and reports incomplete distance coverage', () => {
    const now=Date.parse(longRun.started_at);
    const boundary={...previousRun,started_at:new Date(now-30*DAY_MS).toISOString()};
    const result=dashboardSummary([{...longRun,distance_meters:null},boundary],now);
    expect(result.count).toBe(1); expect(result.distanceCount).toBe(0); expect(result.groups[0].previousCount).toBe(1);
  });
});
