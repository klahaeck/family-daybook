import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { FormSheet } from "@/components/form-sheet";
import { ActionButton, Body, IconButton } from "@/components/ui";
import { useThemedStyles } from "@/mobile-theme";
import type { ThemeColors } from "@/theme";

const monthStart = (date: string) => `${date.slice(0, 7)}-01`;
const isoDate = (date: Date) => date.toISOString().slice(0, 10);

export function LogDatePicker({ date, today, onSelect, onClose }: {
  date: string; today: string; onSelect: (date: string) => void; onClose: () => void;
}) {
  const [month, setMonth] = useState(monthStart(date));
  const styles = useThemedStyles(createStyles);
  const start = new Date(`${month}T12:00:00Z`);
  const year = start.getUTCFullYear();
  const monthIndex = start.getUTCMonth();
  const dayCount = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const moveMonth = (offset: number) => setMonth(isoDate(new Date(Date.UTC(year, monthIndex + offset, 1))));
  return (
    <FormSheet title="Choose log date" visible onClose={onClose}>
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Previous month" onPress={() => moveMonth(-1)} />
        <Body>{start.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</Body>
        <IconButton icon="chevron-forward" label="Next month" disabled={month >= monthStart(today)} onPress={() => moveMonth(1)} />
      </View>
      <View style={styles.grid}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <View key={day} style={styles.cell}><Body muted>{day}</Body></View>)}
        {Array.from({ length: start.getUTCDay() }, (_, index) => <View key={`blank-${index}`} style={styles.cell} />)}
        {Array.from({ length: dayCount }, (_, index) => {
          const value = `${month.slice(0, 7)}-${String(index + 1).padStart(2, "0")}`;
          return <View key={value} style={styles.cell}><Pressable accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === date, disabled: value > today }} disabled={value > today} onPress={() => onSelect(value)} style={({ pressed }) => [styles.day, value === date && styles.selected, (pressed || value > today) && styles.dim]}><Text style={[styles.dayText, value === date && styles.selectedText]}>{index + 1}</Text></Pressable></View>;
        })}
      </View>
      <View style={styles.returnAction}>
        <ActionButton compact label="Return to today" secondary onPress={() => onSelect(today)} />
      </View>
    </FormSheet>
  );
}

const createStyles = (colors: ThemeColors) => StyleSheet.create({
  day: { width: "100%", minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  selected: { backgroundColor: colors.primary },
  dayText: { color: colors.ink, fontSize: 16 },
  selectedText: { color: colors.primaryForeground },
  dim: { opacity: 0.4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  returnAction: { alignItems: "center", width: "100%" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "14.285714%", alignItems: "center", justifyContent: "center", minHeight: 48 },
});
