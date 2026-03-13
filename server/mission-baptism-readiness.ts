export type ProgramItemLike = { type: string };
export type AssignmentLike = { type: string; assigneeUserId?: string | null; assigneeName?: string | null };

const REQUIRED_PROGRAM_TYPES = ["opening_prayer", "hymn", "talk", "ordinance_baptism", "closing_prayer"];
const REQUIRED_ASSIGNMENT_TYPES = ["cleaning", "refreshments", "baptism_clothing", "wet_clothes_pickup"];

export function computeMinimumReady(options: {
  programItems: ProgramItemLike[];
  assignments: AssignmentLike[];
  hasInterviewScheduledMilestone: boolean;
}) {
  const availableTypes = new Set(options.programItems.map((x) => x.type));
  const missingProgramTypes = REQUIRED_PROGRAM_TYPES.filter((t) => !availableTypes.has(t));

  const assignmentByType = new Map(options.assignments.map((a) => [a.type, a]));
  const missingCriticalAssignments = REQUIRED_ASSIGNMENT_TYPES.filter((type) => {
    const row = assignmentByType.get(type);
    if (!row) return true;
    return !(row.assigneeUserId || (row.assigneeName && row.assigneeName.trim()));
  });

  const ready =
    missingProgramTypes.length === 0 &&
    missingCriticalAssignments.length === 0 &&
    options.hasInterviewScheduledMilestone;

  return {
    ready,
    missingProgramTypes,
    missingCriticalAssignments,
    hasInterviewScheduledMilestone: options.hasInterviewScheduledMilestone,
  };
}

export function computeReminderRule(daysUntilService: number): "t14" | "t10" | "t7" | "t2" | "t1" | null {
  if (daysUntilService <= 1) return "t1";
  if (daysUntilService <= 2) return "t2";
  if (daysUntilService <= 7) return "t7";
  if (daysUntilService <= 10) return "t10";
  if (daysUntilService <= 14) return "t14";
  return null;
}
