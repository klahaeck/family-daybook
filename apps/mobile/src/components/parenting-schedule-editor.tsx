import type { ParentingSchedule } from "@family-daybook/contracts";
import { View } from "react-native";
import { ActionButton, Body, Card, ChoiceRow, Field, Heading } from "./ui";

export function ParentingScheduleEditor({ value, onChange, childOptions, today }: {
  value?: ParentingSchedule;
  onChange: (value: ParentingSchedule) => void;
  childOptions: Array<{ id: string; displayName: string }>;
  today: string;
}) {
  const draft: ParentingSchedule = value ?? { effectiveFrom: today, anchorDate: today, enabled: false, children: childOptions.map((child) => ({ childId: child.id, days: Array(14).fill("mine") })) };
  const change = (patch: Partial<ParentingSchedule>) => onChange({ ...draft, ...patch });
  return <Card>
    <Heading>Parenting schedule</Heading>
    <Body muted>Plan whole days. On your days, record either parent&apos;s help. Off-day items track your contributions only and do not affect completion.</Body>
    <ChoiceRow label="Enable parenting schedule" selected={draft.enabled} onPress={() => change({ enabled: !draft.enabled })} />
    {draft.enabled ? <>
      <Field label="Apply changes from (YYYY-MM-DD)" value={draft.effectiveFrom} onChangeText={(effectiveFrom) => change({ effectiveFrom })} />
      <Field label="First day of cycle (YYYY-MM-DD)" value={draft.anchorDate} onChangeText={(anchorDate) => change({ anchorDate })} />
      {childOptions.map((child) => {
        const days = draft.children.find((item) => item.childId === child.id)?.days ?? Array<"mine" | "other">(14).fill("mine");
        const update = (next: Array<"mine" | "other">) => change({ children: childOptions.map((item) => ({ childId: item.id, days: item.id === child.id ? next : draft.children.find((entry) => entry.childId === item.id)?.days ?? Array<"mine" | "other">(14).fill("mine") })) });
        return <View key={child.id} style={{ gap: 8 }}>
          <Heading>{child.displayName}</Heading>
          <Body muted>Cycle length</Body>
          {[1, 2, 3, 4].map((weeks) => <ChoiceRow key={weeks} label={`${weeks} ${weeks === 1 ? "week" : "weeks"}`} selected={days.length === weeks * 7} onPress={() => update(Array.from({ length: weeks * 7 }, (_, i) => days[i % days.length]))} />)}
          <ActionButton label="Alternating weeks" secondary onPress={() => update(Array.from({ length: 14 }, (_, i) => i < 7 ? "mine" : "other"))} />
          <ActionButton label="2-2-3" secondary onPress={() => update(["mine", "mine", "other", "other", "mine", "mine", "mine", "other", "other", "mine", "mine", "other", "other", "other"])} />
          {childOptions.length > 1 ? <ActionButton label="Apply to all children" secondary onPress={() => change({ children: childOptions.map((item) => ({ childId: item.id, days: [...days] })) })} /> : null}
          {days.map((day, index) => <ChoiceRow key={index} label={`Week ${Math.floor(index / 7) + 1}, day ${index % 7 + 1}: ${day === "mine" ? "My day" : "Other parent"}`} selected={day === "mine"} onPress={() => update(days.map((item, i) => i === index ? item === "mine" ? "other" : "mine" : item))} />)}
        </View>;
      })}
    </> : null}
  </Card>;
}
