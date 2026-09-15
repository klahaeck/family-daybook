import type { Settings } from "@family-daybook/contracts";

type Child = Settings["children"][number];
type RoutineTemplate = Settings["template"];

export function specialDayInitialDate(workspaceDate: string | undefined, deviceDate: string) {
  return workspaceDate ?? deviceDate;
}

export function specialDayCreationPlan({
  caregiverId,
  children,
  date,
  template,
}: {
  caregiverId: string;
  children: Child[];
  date: string;
  template: RoutineTemplate;
}) {
  const activeChildren = children.filter((child) => child.active);
  const activeChildIds = new Set(activeChildren.map((child) => child.id));
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();

  return {
    assignments: activeChildren.map((child) => ({
      childId: child.id,
      caregiverIds: [caregiverId],
    })),
    tasks: template.items
      .filter((item) => item.active && item.weekdays.includes(weekday))
      .flatMap((item) =>
        item.childIds
          .filter((childId) => activeChildIds.has(childId))
          .map((childId) => ({
            sourceRoutineItemId: item.id,
            taskKey: item.taskKey,
            childId,
            label: item.label,
            suggestedTime: item.suggestedTime,
          })),
      ),
  };
}
