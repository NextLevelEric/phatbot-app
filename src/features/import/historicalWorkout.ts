export type HistoricalSet = { weight: number; reps: number; partialReps: number; source: string };
export type HistoricalExercise = { name: string; sets: HistoricalSet[]; notes: string | null; sourceRows: number[] };
export type HistoricalWorkout = { sheetName: string; workoutName: string; dateLabel: string; date: string | null; exercises: HistoricalExercise[]; warnings: string[] };

function text(value: unknown) { return value == null ? "" : String(value).trim(); }
function normalized(value: unknown) { return text(value).toLowerCase().replace(/\s+/g, " "); }
function isExerciseHeader(value: unknown) { const v = normalized(value); return v === "exercise" || v === "excercise"; }
function isTargetHeader(value: unknown) { return normalized(value).includes("target reps"); }
function isNotesHeader(value: unknown) { return normalized(value) === "notes"; }
function isCurrentWeekHeader(value: unknown) { const v = normalized(value); return v.includes("this week") && v.includes("weight"); }

const monthIndex: Record<string, number> = { january:0,february:1,march:2,april:3,may:4,june:5,july:6,august:7,september:8,october:9,november:10,december:11 };
function validDate(year:number,month:number,day:number){const d=new Date(Date.UTC(year,month-1,day));return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;}
function isoDate(year:number,month:number,day:number){return validDate(year,month,day)?`${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`:null;}

export function parseWorkoutDate(label: string, defaultYear = new Date().getFullYear()): string | null {
  const raw = label.trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return isoDate(Number(iso[1]),Number(iso[2]),Number(iso[3]));

  // Common Excel display formats: 8/18/2025, 8/18/25, 8/18.
  const numeric = raw.match(/^(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2}|\d{4}))?$/);
  if(numeric){let year=Number(numeric[3]??defaultYear);if(year<100)year+=year>=70?1900:2000;return isoDate(year,Number(numeric[1]),Number(numeric[2]));}

  const match = raw.toLowerCase().match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/);
  if (!match) return null;
  const year = Number(match[3] ?? defaultYear); const month = monthIndex[match[1]] + 1; const day = Number(match[2]);
  return isoDate(year,month,day);
}

/** Parse one spreadsheet performance cell into one or more load/rep sets.
 * Supports weighted entries such as 245*2+1, chained drop/backoff work such as
 * 160*5+120*5+80*7, assisted loads, and historical bodyweight shorthand such
 * as 12 or 12+2 (stored as weight 0). Live workouts still require an explicit
 * weight value in the app.
 */
export function parsePerformanceCell(value: unknown): HistoricalSet[] {
  const source = text(value);
  if (!source || source === "-" || /^\d{1,2}:\d{2}:\d{2}$/.test(source)) return [];
  const cleaned = source.replace(/\s+/g, "").replace(/[()]/g, "");

  const bodyweight = cleaned.match(/^(\d+)(?:\+(\d+))?$/);
  if (bodyweight) return [{ weight: 0, reps: Number(bodyweight[1]), partialReps: Number(bodyweight[2] ?? 0), source }];

  const matches = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\*(\d+)/g)];
  return matches.map((match, index) => {
    const end = (match.index ?? 0) + match[0].length;
    const nextStart = index + 1 < matches.length ? (matches[index + 1].index ?? cleaned.length) : cleaned.length;
    const between = cleaned.slice(end, nextStart);
    const partial = between.match(/^\+(\d+)$/);
    return { weight: Number(match[1]), reps: Number(match[2]), partialReps: Number(partial?.[1] ?? 0), source };
  });
}

function workoutNameFromSheet(sheetName: string) { return sheetName.trim(); }

export function parseHistoricalSheet(sheetName: string, rows: unknown[][], defaultYear = new Date().getFullYear()): HistoricalWorkout[] {
  const headerIndex = rows.findIndex((row) => row.some(isExerciseHeader) && row.some(isTargetHeader));
  if (headerIndex < 0) return [];
  const header = rows[headerIndex] ?? [];
  const exerciseCol = header.findIndex(isExerciseHeader);
  const notesCol = header.findIndex(isNotesHeader);
  const targetCol = header.findIndex(isTargetHeader);
  const currentWeekCol = header.findIndex(isCurrentWeekHeader);
  const dateColumns: { col: number; label: string; date: string | null }[] = [];
  for (let col = exerciseCol + 1; col < header.length; col++) {
    if (col === notesCol || col === targetCol || col === currentWeekCol) continue;
    const label = text(header[col]); if (!label) continue;
    const date = parseWorkoutDate(label, defaultYear);
    if (date) dateColumns.push({ col, label, date });
  }
  const workouts: HistoricalWorkout[] = [];
  for (const dateColumn of dateColumns) {
    const exerciseMap = new Map<string, HistoricalExercise>();
    const warnings: string[] = [];
    for (let i = headerIndex + 1; i < rows.length; i++) {
      const row = rows[i] ?? []; const exerciseName = text(row[exerciseCol]); if (!exerciseName) continue;
      const raw = text(row[dateColumn.col]); if (!raw || raw === "-") continue;
      const sets = parsePerformanceCell(raw);
      if (!sets.length) {
        if (/\d/.test(raw)) warnings.push(`${exerciseName}, row ${i + 1}: could not safely parse “${raw}”.`);
        continue;
      }
      const key = normalized(exerciseName); const notes = notesCol >= 0 ? text(row[notesCol]) : "";
      const existing = exerciseMap.get(key);
      if (existing) { existing.sets.push(...sets); existing.sourceRows.push(i + 1); if (!existing.notes && notes) existing.notes = notes; }
      else exerciseMap.set(key, { name: exerciseName.trim(), sets: [...sets], notes: notes || null, sourceRows: [i + 1] });
    }
    if (exerciseMap.size) workouts.push({ sheetName, workoutName: workoutNameFromSheet(sheetName), dateLabel: dateColumn.label, date: dateColumn.date, exercises: [...exerciseMap.values()], warnings });
  }
  return workouts;
}

export function parseHistoricalWorkbook(sheets: { name: string; rows: unknown[][] }[], defaultYear = new Date().getFullYear()) {
  return sheets.flatMap((sheet) => parseHistoricalSheet(sheet.name, sheet.rows, defaultYear)).sort((a,b)=>(a.date??"").localeCompare(b.date??"") || a.sheetName.localeCompare(b.sheetName));
}
