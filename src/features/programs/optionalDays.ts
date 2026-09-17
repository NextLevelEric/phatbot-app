export type ProgramDayOption = {
  assignment_id: string;
  program_day_id: string;
  day_number: number;
  is_optional: boolean;
  next_program_day_id: string;
  cursor_revision: number;
  following_day_number: number;
};

export function findDayOption(options: ProgramDayOption[], assignmentId: string, dayId: string) {
  return options.find((option) => option.assignment_id === assignmentId && option.program_day_id === dayId) ?? null;
}

export function canSkipOptionalDay(option: ProgramDayOption) {
  return option.is_optional && option.program_day_id === option.next_program_day_id;
}

export function optionalDaysLabel(options: ProgramDayOption[], assignmentId: string) {
  const numbers = options.filter((option) => option.assignment_id === assignmentId && option.is_optional)
    .map((option) => option.day_number).sort((a, b) => a - b);
  if (!numbers.length) return null;
  return `${numbers.length === 1 ? "Day" : "Days"} ${numbers.join(", ")} optional`;
}

export function optionalSkipParameters(option: ProgramDayOption) {
  return {
    p_assignment_id: option.assignment_id,
    p_program_day_id: option.program_day_id,
    p_cursor_revision: option.cursor_revision,
  };
}
