"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, LockKeyhole, MailPlus, Palette, Plus, ShieldCheck, Trash2, UserRoundX } from "lucide-react";

import { inviteReviewerAction, revokeReviewerAction, updateSettingsAction } from "@/app/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ThemePicker } from "@/components/theme-switcher";
import {
  CAREGIVER_RELATIONSHIPS,
  EVERY_DAY,
  ROUTINE_WEEKDAYS,
  WEEKDAYS_ONLY,
  WEEKENDS_ONLY,
} from "@/lib/domain/constants";
import { ageOnDate, localDateInTimezone } from "@/lib/domain/dates";
import { sortRoutineItemsByTime } from "@/lib/domain/routines";
import type { SettingsData } from "@/lib/domain/types";

type EditableCaregiver = {
  clientKey: string;
  id?: string;
  displayName: string;
  relationship: string;
};

type ReviewerDraft = {
  clientKey: string;
  displayName: string;
  email: string;
};

type EditableChild = {
  id: string;
  displayName: string;
  birthdate: string;
};

type EditableRoutineItem = {
  clientKey: string;
  id?: string;
  label: string;
  suggestedTime: string;
  childIds: string[];
  weekdays: number[];
  active: boolean;
};

function editableCaregivers(items: SettingsData["caregivers"]): EditableCaregiver[] {
  return items.map((caregiver) => ({
    clientKey: caregiver.id,
    id: caregiver.id,
    displayName: caregiver.displayName,
    relationship: caregiver.relationship,
  }));
}

function caregiverRelationshipOptions(currentRelationship: string) {
  return currentRelationship && !CAREGIVER_RELATIONSHIPS.includes(
    currentRelationship as (typeof CAREGIVER_RELATIONSHIPS)[number],
  )
    ? [currentRelationship, ...CAREGIVER_RELATIONSHIPS]
    : CAREGIVER_RELATIONSHIPS;
}

function emptyReviewerDraft(clientKey: string): ReviewerDraft {
  return { clientKey, displayName: "", email: "" };
}

function editableChildren(items: SettingsData["children"]): EditableChild[] {
  return items.map((child) => ({
    id: child.id,
    displayName: child.displayName,
    birthdate: child.birthdate ?? "",
  }));
}

function editableRoutineItems(items: SettingsData["template"]["items"]): EditableRoutineItem[] {
  return sortRoutineItemsByTime(items).map((item) => ({
    clientKey: item.id,
    id: item.id,
    label: item.label,
    suggestedTime: item.suggestedTime,
    childIds: item.childIds,
    weekdays: item.weekdays ?? EVERY_DAY,
    active: item.active,
  }));
}

function hasSameDays(selectedDays: number[], expectedDays: number[]): boolean {
  return selectedDays.length === expectedDays.length
    && expectedDays.every((day) => selectedDays.includes(day));
}

export function SettingsView({ data, timezones }: { data: SettingsData; timezones: string[] }) {
  const today = localDateInTimezone(new Date(), data.workspace.timezone);
  const queryClient = useQueryClient();
  const [hardDeleteEnabled, setHardDeleteEnabled] = useState(data.workspace.hardDeleteEnabled);
  const [children, setChildren] = useState(() => editableChildren(data.children));
  const [caregivers, setCaregivers] = useState(() => editableCaregivers(data.caregivers));
  const [reviewerDrafts, setReviewerDrafts] = useState<ReviewerDraft[]>([]);
  const [routineItems, setRoutineItems] = useState(() => editableRoutineItems(data.template.items));
  const [templateVersion, setTemplateVersion] = useState(data.template.version);
  const [message, setMessage] = useState<string>();

  const save = useMutation({
    mutationFn: async (formData: FormData) => {
      const result = await updateSettingsAction({
        name: formData.get("workspaceName")?.toString(),
        timezone: formData.get("timezone")?.toString(),
        hardDeleteEnabled,
        children: children.map((child) => ({
          id: child.id,
          displayName: child.displayName,
          birthdate: child.birthdate,
        })),
        caregivers: caregivers.map((caregiver) => ({
          id: caregiver.id,
          displayName: caregiver.displayName,
          relationship: caregiver.relationship,
        })),
        routineItems: routineItems.map((item) => ({
          id: item.id,
          label: item.label,
          suggestedTime: item.suggestedTime,
          childIds: item.childIds,
          weekdays: item.weekdays,
          active: item.active,
        })),
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to save settings");
      if (!result.data) throw new Error("The saved settings could not be loaded");
      return result.data;
    },
    onSuccess: async (settings) => {
      setChildren(editableChildren(settings.children));
      setCaregivers(editableCaregivers(settings.caregivers));
      setRoutineItems(editableRoutineItems(settings.template.items));
      setTemplateVersion(settings.template.version);
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setMessage("Settings saved.");
    },
    onError: (cause) => setMessage(cause.message),
  });
  const addChild = () => {
    setChildren((current) => [
      ...current,
      { id: `child_${crypto.randomUUID()}`, displayName: "", birthdate: "" },
    ]);
  };
  const removeChild = (childId: string) => {
    if (children.length === 1) return;
    setChildren((current) => current.filter((child) => child.id !== childId));
    setRoutineItems((current) =>
      current.map((item) => {
        const childIds = item.childIds.filter((id) => id !== childId);
        return { ...item, childIds, active: childIds.length > 0 && item.active };
      }),
    );
  };
  const invite = useMutation({
    mutationFn: async (reviewer: ReviewerDraft) => {
      const result = await inviteReviewerAction({
        email: reviewer.email,
        displayName: reviewer.displayName,
      });
      if (!result.ok) throw new Error(result.error ?? "Unable to invite reviewer");
      return reviewer.clientKey;
    },
    onSuccess: (clientKey) => {
      setReviewerDrafts((current) => current.filter((reviewer) => reviewer.clientKey !== clientKey));
      setMessage("Reviewer invitation created.");
    },
    onError: (cause) => setMessage(cause.message),
  });
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Family workspace</CardTitle><CardDescription>These names appear throughout the private app and generated reports.</CardDescription></CardHeader>
        <CardContent>
          <form action={(formData) => save.mutate(formData)} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="workspaceName">Workspace name</Label><Input id="workspaceName" name="workspaceName" defaultValue={data.workspace.name} required /></div><div className="space-y-2"><Label htmlFor="timezone">IANA timezone</Label><Select id="timezone" name="timezone" defaultValue={data.workspace.timezone} required><SelectTrigger className="w-full"><SelectValue /></SelectTrigger><SelectContent>{timezones.map((timezone) => <SelectItem key={timezone} value={timezone}>{timezone}</SelectItem>)}</SelectContent></Select></div></div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Children</p>
                  <p className="mt-1 text-xs text-muted-foreground">Keep at least one child in the workspace.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={addChild}>
                  <Plus className="size-4" />Add child
                </Button>
              </div>
              <div className="space-y-3">
                {children.map((child, index) => (
                  <div key={child.id} className="relative grid gap-3 rounded-xl border p-3 pr-12 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start">
                    <div className="space-y-2">
                      <Label htmlFor={`child-name-${child.id}`}>Display name</Label>
                      <Input
                        id={`child-name-${child.id}`}
                        value={child.displayName}
                        onChange={(event) => setChildren((current) => current.map((value) => value.id === child.id ? { ...value, displayName: event.target.value } : value))}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`child-birthdate-${child.id}`}>Birthdate</Label>
                      <Input
                        id={`child-birthdate-${child.id}`}
                        type="date"
                        max={today}
                        value={child.birthdate}
                        onChange={(event) => setChildren((current) => current.map((value) => value.id === child.id ? { ...value, birthdate: event.target.value } : value))}
                        required
                      />
                      {ageOnDate(child.birthdate, today) !== null && (
                        <p className="text-xs text-muted-foreground">
                          {ageOnDate(child.birthdate, today)} {ageOnDate(child.birthdate, today) === 1 ? "year" : "years"} old
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="absolute right-3 top-3 text-destructive hover:text-destructive"
                      aria-label={`Remove child ${child.displayName || index + 1}`}
                      disabled={children.length === 1}
                      onClick={() => removeChild(child.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-center justify-between gap-3"><p className="text-sm font-medium">Caregivers</p><Button type="button" variant="outline" size="sm" onClick={() => setCaregivers((current) => [...current, { clientKey: crypto.randomUUID(), displayName: "", relationship: "" }])}><Plus className="size-4" />Add caregiver</Button></div>
              <div className="space-y-3">
                {caregivers.map((caregiver, index) => (
                  <div key={caregiver.clientKey} className="relative grid gap-3 rounded-xl border p-3 pr-12 sm:grid-cols-2 sm:items-start">
                    <div className="grid gap-2"><Label htmlFor={`caregiver-${caregiver.clientKey}`}>Name</Label><Input id={`caregiver-${caregiver.clientKey}`} name={`caregiver-${caregiver.clientKey}`} value={caregiver.displayName} onChange={(event) => setCaregivers((current) => current.map((value, caregiverIndex) => caregiverIndex === index ? { ...value, displayName: event.target.value } : value))} required /></div>
                    <div className="grid gap-2">
                      <Label htmlFor={`relationship-${caregiver.clientKey}`}>Relationship</Label>
                      <Select
                        id={`relationship-${caregiver.clientKey}`}
                        name={`relationship-${caregiver.clientKey}`}
                        value={caregiver.relationship}
                        onValueChange={(relationship) => setCaregivers((current) => current.map((value, caregiverIndex) => caregiverIndex === index ? { ...value, relationship: relationship ?? "" } : value))}
                        required
                      >
                        <SelectTrigger className="w-full"><SelectValue placeholder="Select relationship" /></SelectTrigger>
                        <SelectContent>
                          {caregiverRelationshipOptions(caregiver.relationship).map((relationship) => <SelectItem key={relationship} value={relationship}>{relationship}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    {!caregiver.id && <Button type="button" variant="ghost" size="icon" className="absolute right-3 top-3 text-destructive hover:text-destructive" aria-label={`Remove caregiver ${index + 1}`} onClick={() => setCaregivers((current) => current.filter((value) => value.clientKey !== caregiver.clientKey))}><Trash2 className="size-4" /></Button>}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-3 flex items-end justify-between"><div><p className="text-sm font-medium">Routine schedule</p><p className="mt-1 text-xs text-muted-foreground">Choose which days each item appears. Saving creates template version {templateVersion + 1}; past days keep their original version.</p></div><Badge variant="outline">v{templateVersion}</Badge></div>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border p-2">
                {routineItems.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No routine items yet.</p>}
                {routineItems.map((item, index) => (
                  <div key={item.clientKey} className="relative grid gap-3 rounded-lg bg-muted/40 p-3 pr-12 sm:grid-cols-[auto_minmax(0,1fr)_7rem] sm:items-center">
                    <Switch checked={item.active} onCheckedChange={(checked) => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, active: checked } : value))} aria-label={`Enable ${item.label}`} />
                    <Input required value={item.label} onChange={(event) => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, label: event.target.value } : value))} aria-label="Routine label" />
                    <Input required type="time" value={item.suggestedTime} onChange={(event) => setRoutineItems((current) => sortRoutineItemsByTime(current.map((value) => value.clientKey === item.clientKey ? { ...value, suggestedTime: event.target.value } : value)))} aria-label={`Suggested time for ${item.label || "new routine item"}`} />
                    <Button type="button" variant="ghost" size="icon-sm" className="absolute right-3 top-3 text-destructive hover:text-destructive" aria-label={`Remove ${item.label || "routine item"}`} onClick={() => setRoutineItems((current) => current.filter((value) => value.clientKey !== item.clientKey))}><Trash2 className="size-4" /></Button>
                    <fieldset className="rounded-lg border bg-background/70 px-3 pb-3 sm:col-start-2 sm:col-span-2">
                      <legend className="px-1 text-xs font-medium text-muted-foreground">Days</legend>
                      <div className="mb-2 mt-2 flex flex-wrap gap-1.5">
                        {[
                          { label: "Every day", days: EVERY_DAY },
                          { label: "Weekdays", days: WEEKDAYS_ONLY },
                          { label: "Weekends", days: WEEKENDS_ONLY },
                        ].map((preset) => (
                          <Button
                            key={preset.label}
                            type="button"
                            size="xs"
                            variant={hasSameDays(item.weekdays, preset.days) ? "secondary" : "outline"}
                            aria-pressed={hasSameDays(item.weekdays, preset.days)}
                            onClick={() => setRoutineItems((current) => current.map((value) => value.clientKey === item.clientKey ? { ...value, weekdays: [...preset.days] } : value))}
                          >
                            {preset.label}
                          </Button>
                        ))}
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {ROUTINE_WEEKDAYS.map((day) => {
                          const selected = item.weekdays.includes(day.value);
                          return (
                            <Button
                              key={day.value}
                              type="button"
                              size="xs"
                              variant={selected ? "secondary" : "outline"}
                              aria-label={`${day.label} for ${item.label || "new routine item"}`}
                              aria-pressed={selected}
                              disabled={selected && item.weekdays.length === 1}
                              onClick={() => setRoutineItems((current) => current.map((value) => {
                                if (value.clientKey !== item.clientKey) return value;
                                if (selected && value.weekdays.length === 1) return value;
                                const weekdays = selected
                                  ? value.weekdays.filter((weekday) => weekday !== day.value)
                                  : [...value.weekdays, day.value].sort((a, b) => a - b);
                                return { ...value, weekdays };
                              }))}
                            >
                              {day.shortLabel}
                            </Button>
                          );
                        })}
                      </div>
                    </fieldset>
                    <fieldset className="rounded-lg border bg-background/70 px-3 pb-3 sm:col-start-2 sm:col-span-2">
                      <legend className="px-1 text-xs font-medium text-muted-foreground">Children</legend>
                      <div className="mt-2 flex flex-wrap gap-2">{children.map((child) => { const selected = item.childIds.includes(child.id); return <Button key={child.id} type="button" size="xs" variant={selected ? "secondary" : "outline"} onClick={() => setRoutineItems((current) => current.map((value, itemIndex) => itemIndex === index ? { ...value, childIds: selected ? value.childIds.filter((id) => id !== child.id) : [...value.childIds, child.id] } : value))}>{child.displayName || "Unnamed child"}</Button>; })}</div>
                    </fieldset>
                  </div>
                ))}
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRoutineItems((current) => sortRoutineItemsByTime([...current, { clientKey: crypto.randomUUID(), label: "", suggestedTime: "08:00", childIds: children.map((child) => child.id), weekdays: EVERY_DAY, active: true }]))}><Plus className="size-4" />Add routine item</Button>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-xl border p-4"><div><p className="flex items-center gap-2 text-sm font-medium"><LockKeyhole className="size-4" />Allow permanent deletion</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Disabled by default. Purges require owner access, a reason, and typed confirmation.</p></div><Switch checked={hardDeleteEnabled} onCheckedChange={setHardDeleteEnabled} aria-label="Allow permanent deletion" /></div>
            {message && <p className="text-sm text-muted-foreground">{message}</p>}
            <Button type="submit" disabled={save.isPending}><Check className="size-4" />{save.isPending ? "Saving…" : "Save workspace"}</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="size-5 text-primary" />
              Appearance
            </CardTitle>
            <CardDescription>
              Use a light or dark palette, or follow this device. Your choice is saved in this browser.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ThemePicker />
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Reviewers</CardTitle><CardDescription>Reviewers can see finalized records and download reports but cannot change data or settings.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            {data.members.filter((member) => member.role === "reviewer").map((member) => <div key={member.id} className="flex items-center justify-between gap-3 rounded-xl border p-3"><div><p className="text-sm font-medium">{member.displayName}</p><p className="text-xs text-muted-foreground">{member.email}</p></div><div className="flex items-center gap-2"><Badge variant="secondary" className="capitalize">{member.status}</Badge>{member.status !== "revoked" && <Button variant="ghost" size="icon-sm" aria-label={`Revoke ${member.displayName}`} onClick={async () => { await revokeReviewerAction(member.id); location.reload(); }}><UserRoundX className="size-4" /></Button>}</div></div>)}
            <div className="space-y-3 rounded-xl bg-muted/50 p-4">
              <div className="space-y-3">
                {reviewerDrafts.map((reviewer, index) => {
                  const invitingThisReviewer = invite.isPending && invite.variables?.clientKey === reviewer.clientKey;
                  return (
                    <form key={reviewer.clientKey} action={() => invite.mutate(reviewer)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                      <div className="space-y-2"><Label htmlFor={`reviewer-name-${reviewer.clientKey}`}>Reviewer name</Label><Input id={`reviewer-name-${reviewer.clientKey}`} name={`reviewer-name-${reviewer.clientKey}`} value={reviewer.displayName} onChange={(event) => setReviewerDrafts((current) => current.map((value, reviewerIndex) => reviewerIndex === index ? { ...value, displayName: event.target.value } : value))} disabled={invite.isPending} required /></div>
                      <div className="space-y-2"><Label htmlFor={`reviewer-email-${reviewer.clientKey}`}>Email</Label><Input id={`reviewer-email-${reviewer.clientKey}`} name={`reviewer-email-${reviewer.clientKey}`} type="email" value={reviewer.email} onChange={(event) => setReviewerDrafts((current) => current.map((value, reviewerIndex) => reviewerIndex === index ? { ...value, email: event.target.value } : value))} disabled={invite.isPending} required /></div>
                      <Button type="submit" variant="outline" disabled={invite.isPending}><MailPlus className="size-4" />{invitingThisReviewer ? "Inviting…" : "Invite reviewer"}</Button>
                      <Button type="button" variant="ghost" size="icon" className="text-destructive hover:text-destructive" aria-label={`Delete reviewer ${index + 1}`} onClick={() => setReviewerDrafts((current) => current.filter((value) => value.clientKey !== reviewer.clientKey))} disabled={invite.isPending}><Trash2 className="size-4" /></Button>
                    </form>
                  );
                })}
              </div>
              <Button type="button" variant="outline" onClick={() => setReviewerDrafts((current) => [...current, emptyReviewerDraft(crypto.randomUUID())])} disabled={invite.isPending}><Plus className="size-4" />Add reviewer</Button>
            </div>
          </CardContent>
        </Card>
        <Card><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5 text-primary" />Security posture</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><p>Invitation-only access with owner and reviewer roles.</p><p>Server-side authorization on every read, mutation, file, and report route.</p><p>Original files stay private and are served with no-store browser caching.</p><p>Production infrastructure should require MFA and managed backups.</p></CardContent></Card>
      </div>
    </div>
  );
}
