import type {
  Appointment,
  DashboardData,
  IncidentsData,
  ReportSnapshot,
  SpecialArrangementsData,
  TimelineData,
} from "@/lib/domain/types";

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<T>;
}

export const fetchDashboard = (date: string) =>
  getJson<DashboardData>(`/api/dashboard?date=${encodeURIComponent(date)}`);
export const fetchTimeline = () => getJson<TimelineData>("/api/timeline");
export const fetchAppointments = () => getJson<Appointment[]>("/api/appointments");
export const fetchIncidents = () => getJson<IncidentsData>("/api/incidents");
export const fetchReports = () => getJson<ReportSnapshot[]>("/api/reports");
export const fetchSpecialArrangements = () =>
  getJson<SpecialArrangementsData>("/api/special-arrangements");
