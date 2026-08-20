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

export function parseWorkoutDate(label: string, defaultYear = new Date().getFullYear()): string | null {
  const raw = label.trim();
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2,"0")}-${iso[3].padStart(2,"0")}`;
  const match = raw.toLowerCase().match(/^(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s*(\d{4}))?$/);
  if (!match) return null;
  const year = Number(match[3] ?? defaultYear); const month = monthIndex[match[1]] + 1; const day = Number(match[2]);
  if (day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
}

/** Parse one spreadsheet performance cell into one or more load/rep sets.
 * Supports 245*2+1, 160*5+120*5+80*7, and parenthesized assisted loads.
 * Malformed/incomplete fragments are ignored and surfaced by the caller as warnings.
 */
export function parsePerformanceCell(value: unknown): HistoricalSet[] {
  const source = text(value);
  if (!source || source === "-" || /^\d{1,2}:\d{2}:\d{2}$/.test(source)) return [];
  const cleaned = source.replace(/\s+/g, "").replace(/[()]/g, "");
  const matches = [...cleaned.matchAll(/(-?\d+(?:\.\d+)?)\*(\d+)(?:\+(\d+))?/g)];
  return matches.map((m) => ({ weight: Number(m[1]), reps: Number(m[2]), partialReps: Number(m[3] ?? 0), source }));
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
