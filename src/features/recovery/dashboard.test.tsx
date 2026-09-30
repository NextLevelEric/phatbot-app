import {describe,it,expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import SleepRecoveryDashboard from '@/components/SleepRecoveryDashboard';
import {aggregateSleep} from './sleep';
describe('sleep dashboard',()=>{
  it('shows missing data without zero sleep, a score or a fabricated insight',()=>{
    const html=renderToStaticMarkup(<SleepRecoveryDashboard nights={[]} training={[]} warnings={[]}/>);
    expect(html).toContain('Unknown');expect(html).toContain('Not enough matched');expect(html).toContain('No interval-verified sleep');
  });
  it('discloses in-bed-only records and omits invented stages',()=>{
    const nights=aggregateSleep([{value:0,startDate:'2026-09-27T02:00:00Z',endDate:'2026-09-27T10:00:00Z',durationSeconds:28800}],'healthkit','America/New_York','2026-09-20','2026-09-30');
    const html=renderToStaticMarkup(<SleepRecoveryDashboard nights={nights} training={[]} warnings={['History unavailable']} asOf={Date.parse('2026-09-28')}/>);
    expect(html).toContain('In bed 8.0 h');expect(html).toContain('Unknown');expect(html).not.toContain('REM');expect(html).toContain('History unavailable');
  });
});
