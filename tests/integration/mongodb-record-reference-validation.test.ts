import { afterAll, beforeAll, describe, expect, it } from "vitest";

const configured = Boolean(process.env.TEST_MONGODB_URI);

describe.skipIf(!configured)("MongoDB record reference validation", () => {
  beforeAll(() => {
    process.env.MONGODB_URI = process.env.TEST_MONGODB_URI;
    process.env.MONGODB_DB = `parenting_log_reference_test_${Date.now()}`;
  });

  afterAll(async () => {
    const { getDatabase } = await import("@/lib/db/mongodb");
    await (await getDatabase()).dropDatabase();
  });

  it("rejects duplicate, dangling, and inactive references transactionally", async () => {
    const [{ MongoParentingRepository }, { getDatabase }] = await Promise.all([
      import("@/lib/repository/mongo-repository"),
      import("@/lib/db/mongodb"),
    ]);
    const repository = new MongoParentingRepository();
    const context = await repository.resolveContext({
      authUserId: "mongo-reference-owner",
      email: "mongo-reference-owner@example.test",
      displayName: "Mongo Reference Owner",
      mfaEnabled: true,
      demo: false,
    });
    const settings = await repository.getSettings(context);
    const child = settings.children[0];
    const caregiver = settings.caregivers[0];
    const appointment = {
      childIds: [child.id],
      title: "Annual checkup",
      scheduledAt: "2026-09-20T15:00:00.000Z",
      responsibleCaregiverIds: [caregiver.id],
      status: "scheduled" as const,
    };

    await expect(
      repository.createAppointment(context, {
        ...appointment,
        childIds: [child.id, child.id],
      }),
    ).rejects.toThrow("INVALID_CHILD_REFERENCE");
    await expect(
      repository.createAppointment(context, {
        ...appointment,
        responsibleCaregiverIds: ["caregiver_missing"],
      }),
    ).rejects.toThrow("INVALID_CAREGIVER_REFERENCE");

    const database = await getDatabase();
    await database.collection("caregivers").updateOne(
      { workspaceId: context.workspace.id, id: caregiver.id },
      { $set: { active: false } },
    );
    await expect(
      repository.createAppointment(context, appointment),
    ).rejects.toThrow("INVALID_CAREGIVER_REFERENCE");

    const incident = {
      category: "other" as const,
      occurredAt: "2026-09-20T15:00:00.000Z",
      childIds: [child.id],
      peoplePresent: [],
      witnesses: [],
      observations: "The child slipped on a wet floor and stood back up.",
    };
    await expect(
      repository.createIncident(context, {
        ...incident,
        childIds: ["child_missing"],
      }),
    ).rejects.toThrow("INVALID_CHILD_REFERENCE");

    await database.collection("children").updateOne(
      { workspaceId: context.workspace.id, id: child.id },
      { $set: { active: false } },
    );
    await expect(repository.createIncident(context, incident)).rejects.toThrow(
      "INVALID_CHILD_REFERENCE",
    );
  });
});
