import { beforeEach, describe, expect, it } from "vitest";

import type { Identity } from "@/lib/auth/identity";
import {
  MemoryParentingRepository,
  resetMemoryRepository,
} from "@/lib/repository/memory-repository";

const identity: Identity = {
  authUserId: "demo_owner",
  email: "owner@example.local",
  displayName: "Demo owner",
  mfaEnabled: true,
  demo: true,
};

describe("record reference validation", () => {
  beforeEach(() => resetMemoryRepository());

  it("rejects duplicate, dangling, and inactive appointment references", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const settings = await repository.getSettings(context);
    const child = settings.children[0];
    const caregiver = settings.caregivers[0];
    const input = {
      childIds: [child.id],
      title: "Annual checkup",
      scheduledAt: "2026-09-20T15:00:00.000Z",
      responsibleCaregiverIds: [caregiver.id],
      status: "scheduled" as const,
    };

    await expect(
      repository.createAppointment(context, {
        ...input,
        childIds: [child.id, child.id],
      }),
    ).rejects.toThrow("INVALID_CHILD_REFERENCE");
    await expect(
      repository.createAppointment(context, {
        ...input,
        responsibleCaregiverIds: ["caregiver_missing"],
      }),
    ).rejects.toThrow("INVALID_CAREGIVER_REFERENCE");

    caregiver.active = false;
    await expect(repository.createAppointment(context, input)).rejects.toThrow(
      "INVALID_CAREGIVER_REFERENCE",
    );

    caregiver.active = true;
    child.active = false;
    await expect(repository.createAppointment(context, input)).rejects.toThrow(
      "INVALID_CHILD_REFERENCE",
    );
  });

  it("rejects duplicate, dangling, and inactive incident child references", async () => {
    const repository = new MemoryParentingRepository();
    const context = await repository.resolveContext(identity);
    const child = (await repository.getSettings(context)).children[0];
    const input = {
      category: "other" as const,
      occurredAt: "2026-09-20T15:00:00.000Z",
      childIds: [child.id],
      peoplePresent: [],
      witnesses: [],
      observations: "The child slipped on a wet floor and stood back up.",
    };

    await expect(
      repository.createIncident(context, {
        ...input,
        childIds: [child.id, child.id],
      }),
    ).rejects.toThrow("INVALID_CHILD_REFERENCE");
    await expect(
      repository.createIncident(context, {
        ...input,
        childIds: ["child_missing"],
      }),
    ).rejects.toThrow("INVALID_CHILD_REFERENCE");

    child.active = false;
    await expect(repository.createIncident(context, input)).rejects.toThrow(
      "INVALID_CHILD_REFERENCE",
    );
  });
});
