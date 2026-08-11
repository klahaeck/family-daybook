# Plan 001: Make caregiver attribution status-aware

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the “STOP conditions” section occurs, stop and
> report; do not improvise. When done, update this plan’s row in
> `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 67a6f2f..HEAD -- README.md src/app/actions.ts src/components/app/today-dashboard.tsx src/components/app/timeline-view.tsx src/components/forms/care-entry-dialog.tsx src/lib/domain/constants.ts src/lib/domain/schemas.ts src/lib/domain/types.ts src/lib/repository/helpers.ts src/lib/repository/memory-repository.ts src/lib/repository/mongo-repository.ts src/lib/reporting/report-document.tsx src/lib/timeline-analytics.ts tests/unit/schemas.test.ts tests/unit/today-dashboard.test.tsx tests/unit/timeline-analytics.test.ts tests/integration/memory-repository.test.ts tests/integration/mongodb-repository.test.ts e2e/app.spec.ts`
>
> If an in-scope file changed since this plan was written, compare the “Current
> state” excerpts against the live code before proceeding. A semantic mismatch
> is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (roughly one focused day, including tests)
- **Risk**: MED — this changes a cross-layer record invariant and must preserve
  open-day edits, finalized corrections, hashes, reports, and legacy reads.
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `67a6f2f`, 2026-08-11

## Why this matters

Family Daybook currently requires and persists a caregiver even when a routine
item is `missed` or `not_applicable`. That creates a factual contradiction: the
record says no care occurred while also naming someone under “Who provided the
care?” The fix must make caregiver attribution conditional on status at every
write boundary, remove care-only details from non-occurrence records, and make
the dashboard, timeline, and PDF describe those records without implying that
care occurred.

The target contract is:

| Status | `caregiverIds` | Duration/activity | Time meaning |
|--------|----------------|-------------------|--------------|
| `completed` | one or more | allowed, optional | when care occurred |
| `partial` | one or more | allowed, optional | when care occurred |
| `missed` | exactly `[]` | absent | when the item was expected |
| `not_applicable` | exactly `[]` | absent | the routine time used to place the item on that day |

Keep `occurredAt` as the persisted field in this plan to avoid a database,
index, report-filter, and revision-payload migration. For non-occurrence
statuses, only its UI/report label changes; it must never be presented as proof
that care occurred. Keep `notes` and attachments optional for every status.

## Current state

- `src/lib/domain/schemas.ts:3-49` uses the same non-empty `idArray` for children
  and caregivers, so all three create/update/correction schemas require a
  caregiver regardless of status:

  ```ts
  const idArray = z.array(z.string().min(1)).min(1, "Choose at least one option");
  // ...
  childIds: idArray,
  caregiverIds: idArray,
  status: z.enum(["completed", "partial", "missed", "not_applicable"]),
  ```

- `src/components/forms/care-entry-dialog.tsx:48-78,141-178,202` initializes and
  always submits `selectedCaregivers`, shows “Who provided the care?” before the
  status currently labeled “Outcome,” always labels the timestamp “When did it
  occur?”, and disables saving when no caregiver is selected.
- `src/lib/repository/memory-repository.ts:500-535,559-625` and
  `src/lib/repository/mongo-repository.ts:610-640,667-704,757-807` copy
  `caregiverIds`, duration, and activity directly into the current record and
  revision payload. Neither adapter defends the status/caregiver invariant.
- `src/lib/reporting/report-document.tsx:128-142` always prints `Occurred` and
  `Caregiver`, even for Missed and Not applicable entries.
- `src/lib/repository/memory-repository.ts:255-271` and
  `src/lib/repository/mongo-repository.ts:303-318` count only Completed and Not
  applicable toward a progress card whose visible text says “items recorded.”
  A saved Missed or Partial record is therefore incorrectly treated as
  unrecorded.
- `src/lib/timeline-analytics.ts:4` already limits factual care analytics to
  Completed and Partial. Preserve this boundary.
- `README.md:61-65` defines the integrity model: open-day records are directly
  editable, finalized changes append corrections, reports retain included
  revision IDs, and plans are context rather than proof of care. Do not rewrite
  existing revisions or silently convert planned responsibility into actual
  care attribution.
- Existing test conventions:
  - schema refinements: `tests/unit/schemas.test.ts`
  - dialog/dashboard behavior: `tests/unit/today-dashboard.test.tsx:173-218`
  - open edits and finalized revisions: `tests/integration/memory-repository.test.ts:59-120`
  - Mongo parity: `tests/integration/mongodb-repository.test.ts:35-92`
  - browser flows and accessibility: `e2e/app.spec.ts`

Baseline verified while planning:

```text
npm test -- tests/unit/schemas.test.ts tests/unit/today-dashboard.test.tsx \
  tests/unit/timeline-analytics.test.ts tests/integration/memory-repository.test.ts
Test Files 4 passed (4); Tests 33 passed (33)
```

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Focused unit/integration | `npm test -- tests/unit/schemas.test.ts tests/unit/today-dashboard.test.tsx tests/unit/timeline-analytics.test.ts tests/integration/memory-repository.test.ts` | exit 0; all selected tests pass |
| Mongo parity | `npm test -- tests/integration/mongodb-repository.test.ts` | exit 0 when `TEST_MONGODB_URI` is configured; otherwise the file’s existing Mongo tests skip cleanly |
| Focused browser | `npm run test:e2e -- --project=chromium --grep "records missed and not-applicable items without caregivers"` | exit 0; the new flow passes |
| Typecheck | `npm run typecheck` | exit 0, no TypeScript errors |
| Lint | `npm run lint` | exit 0, no ESLint errors |
| Full unit/integration | `npm test` | exit 0; all configured tests pass or retain documented skips |
| Production build | `npm run build` | exit 0 |
| Patch hygiene | `git diff --check` | exit 0, no output |

## Suggested executor toolkit

- Before changing Next.js Client Components or Server Actions, read the
  repository-mandated current guides in
  `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md`
  and `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-server.md`.
- Reuse the existing Base UI/shadcn primitives (`Button`, `Badge`, `MultiCheck`,
  `FieldError`) and TanStack Query invalidation pattern. Do not introduce a new
  form library or client-side persistence mechanism.

## Scope

**In scope** (the only source/test files that should be modified; create a
small domain rule module only if it materially avoids duplicated status logic):

- `README.md`
- `src/app/actions.ts`
- `src/components/app/today-dashboard.tsx`
- `src/components/app/timeline-view.tsx`
- `src/components/forms/care-entry-dialog.tsx`
- `src/lib/domain/constants.ts`
- `src/lib/domain/schemas.ts`
- `src/lib/domain/types.ts`
- `src/lib/domain/care-entry-rules.ts` (optional new file)
- `src/lib/repository/helpers.ts`
- `src/lib/repository/memory-repository.ts`
- `src/lib/repository/mongo-repository.ts`
- `src/lib/reporting/report-document.tsx`
- `src/lib/timeline-analytics.ts` (tests may prove no production change is needed)
- `tests/unit/schemas.test.ts`
- `tests/unit/today-dashboard.test.tsx`
- `tests/unit/timeline-analytics.test.ts`
- `tests/integration/memory-repository.test.ts`
- `tests/integration/mongodb-repository.test.ts`
- `e2e/app.spec.ts`
- `plans/README.md` (status only)

**Out of scope** (do not touch):

- Special-arrangement `assignments[].caregiverIds`. Those represent planned
  responsibility and must remain intact; only the resulting routine record’s
  provider attribution becomes status-aware.
- Appointment `responsibleCaregiverIds`, including missed/cancelled appointment
  statuses. Appointment responsibility is a separate contract.
- Incident people/witness fields.
- Mongo indexes and a database migration. Empty arrays are valid in the current
  document shape.
- Bulk edits to existing records or revision payloads. Historical hashes and
  append-only finalized revisions must remain unchanged.
- Replacing `CareEntry` with a new collection/entity or renaming persisted
  `occurredAt` in this change.
- Changing reviewer visibility, finalization, late-entry policy, attachments,
  report snapshot selection, or hard purge.

## Git workflow

- Branch: `codex/status-aware-caregiver-attribution`
- Follow the repository’s short imperative commit style, for example:
  `Record missed items without caregivers`.
- Do not push or open a pull request unless the operator explicitly requests it.

## Steps

### Step 1: Centralize and test the status-dependent domain rules

1. Add one reusable predicate, named for the factual distinction (for example
   `careStatusRecordsProvidedCare(status)`), that returns true only for
   `completed` and `partial`. Put it in `src/lib/domain/care-entry-rules.ts` or,
   if kept tiny, beside `CARE_STATUS_LABELS` in `constants.ts`. Use the same
   predicate in schemas, UI, persistence guards, projections, and reports; do
   not scatter independent status arrays across new call sites.
2. In `src/lib/domain/schemas.ts`, separate the child-ID rule from the caregiver
   array shape. Children remain non-empty. Caregivers become an array that can
   be empty, followed by a shared `superRefine` applied independently to create,
   update, and correction schemas:
   - Completed/Partial + empty caregivers: reject at `caregiverIds` with a clear
     message such as “Choose who provided the care.”
   - Missed/Not applicable + any caregiver: reject at `caregiverIds` with a
     message explaining that no provider can be assigned.
   - Missed/Not applicable + `durationMinutes` or `activityType`: reject on the
     corresponding field. These describe care that occurred and must not survive
     a status change.
3. Do not build `careEntryUpdateSchema` by calling `.omit()` on a refined schema
   if that drops/refactors the refinement. Define a shared field shape and apply
   the same refinement explicitly to all three schemas.
4. Add table-driven tests to `tests/unit/schemas.test.ts` for all four statuses
   across create, update, and correction:
   - Completed and Partial require at least one caregiver.
   - Missed and Not applicable accept exactly `[]`.
   - Non-occurrence statuses reject assigned caregivers, durations, and activity
     types.
   - Existing valid notes, children, timestamps, and correction reasons remain
     accepted.

**Verify**:
`npm test -- tests/unit/schemas.test.ts && npm run typecheck` → both commands
exit 0 and all new schema cases pass.

### Step 2: Make the record dialog collect only truthful fields

Update `src/components/forms/care-entry-dialog.tsx`:

1. Rename the visible legend from “Outcome” to “Status” and place it before the
   caregiver picker. Keep the four existing persisted values and user-facing
   labels; use “Not applicable” in full where space permits instead of only
   “N/A.”
2. Derive `recordsProvidedCare` from the shared predicate.
3. When a user selects Missed or Not applicable:
   - clear `selectedCaregivers` immediately;
   - hide “Who provided the care?”;
   - show concise neutral helper text that no caregiver will be assigned because
     this status records that care did not occur;
   - hide duration and activity-type inputs;
   - submit `caregiverIds: []`, `durationMinutes: undefined`, and
     `activityType: undefined`, regardless of stale component/form state.
4. When Completed or Partial is selected, show the caregiver picker and require
   at least one selection before enabling Save. Preserve special-arrangement
   planned-caregiver prefill only for these care-provided statuses.
5. Make initialization legacy-safe: an existing Missed/Not applicable entry
   must initialize the component with no selected caregivers even if an older
   stored record contains IDs.
6. Keep `occurredAt` required for compatibility, but change its visible label
   and helper copy by status:
   - Completed/Partial: “When did it occur?”
   - Missed: “When was it expected?”
   - Not applicable: “Routine time,” with copy explaining that it places the
     item on the day and does not mean care occurred.
7. Keep factual notes and attachments available for all statuses. Adapt the note
   placeholder for Missed/Not applicable so users can record a concise factual
   reason without making the note mandatory.
8. Add/extend `tests/unit/today-dashboard.test.tsx` to assert both Missed and Not
   applicable flows: caregiver checkboxes are absent, Save is enabled with a
   child and no caregiver, the mocked action receives `caregiverIds: []`, and
   switching back to Completed makes caregiver selection required again. Also
   verify duration/activity are omitted after switching from Completed.

**Verify**:
`npm test -- tests/unit/today-dashboard.test.tsx && npm run typecheck` → exit 0;
the status-transition and submission-payload tests pass.

### Step 3: Enforce the invariant in actions and both repositories

1. Add a small assertion based on the shared predicate for repository callers.
   It must reject invalid status/caregiver combinations and care-only details
   before creating or updating a revision payload. Use a stable error code such
   as `INVALID_CAREGIVER_ATTRIBUTION`; map it in `src/app/actions.ts` to a neutral
   user-facing message. Do not silently accept a non-empty caregiver list for a
   Missed/Not applicable write.
2. Call the assertion in `createCareEntry`, `updateCareEntry`, and
   `correctCareEntry` in both repository adapters. For special-arrangement
   records, run it after the repository has resolved the authoritative task but
   before it creates/hashes the revision.
3. Ensure transition writes remove stale care-only data:
   - Memory adapter: delete duration/activity keys from the current revision
     payload and leave them absent/undefined on the current record.
   - Mongo adapter: include duration/activity in the existing `$unset` path and
     persist `caregiverIds: []` in `$set`.
4. Make `updateCareEntryNotesAction` compatible with legacy no-care records. If
   the loaded status is Missed/Not applicable, pass `caregiverIds: []` and omit
   duration/activity when it delegates to `updateCareEntry`; otherwise preserve
   the current provider details. Do not rewrite finalized history; finalized
   full-record changes continue through `correctCareEntryAction` and append a
   correction.
5. Add memory repository tests proving:
   - Missed and Not applicable records persist `caregiverIds: []` in both the
     current record and current revision payload.
   - Completed/Partial writes with no caregivers and non-occurrence writes with
     caregivers are rejected even when the repository is called directly.
   - Completed → Missed on an open day clears caregiver/duration/activity in the
     current record and same revision without appending a revision.
   - Completed → Not applicable after finalization appends a new revision with
     an empty caregiver array while preserving the previous revision and hash.
6. Mirror the create/update/correction assertions in
   `tests/integration/mongodb-repository.test.ts` under its existing conditional
   Mongo setup.

**Verify**:
`npm test -- tests/integration/memory-repository.test.ts tests/integration/mongodb-repository.test.ts`
→ exit 0; memory cases pass and Mongo cases pass when configured or retain their
existing documented skip behavior.

### Step 4: Correct dashboard, timeline, analytics, and report semantics

1. Replace the dashboard’s misleading Completed/Not-applicable counter with a
   recording-completeness counter: every task with an entry—Completed, Partial,
   Missed, or Not applicable—counts as recorded. Rename
   `DashboardData.completion.completed` to `recorded`, update both repositories,
   and change visible/ARIA copy from “completion” to “recording progress.” This
   is a completeness indicator, not a parenting score.
2. In `today-dashboard.tsx`, do not render every saved entry as the same green
   completed check. Show the status label with a distinct neutral/negative icon
   or badge for Partial, Missed, and Not applicable. For Missed and Not
   applicable, use the status-aware time wording rather than an unlabeled clock
   time that implies occurrence.
3. In `src/lib/repository/helpers.ts`, project
   `TimelineItem.caregiverIds: []` for Missed/Not applicable even when reading a
   legacy stored record. This prevents caregiver filters from attributing a
   non-occurrence to a provider without mutating historical storage.
4. In `timeline-view.tsx`, render `Occurred` only for Completed/Partial care
   records. Use `Expected` for Missed and `Routine time` for Not applicable.
   Appointment, incident, and special-day labels remain unchanged.
5. In `report-document.tsx`:
   - rename aggregate/section copy if needed so the total is clearly routine
     item records rather than a count of care that occurred;
   - print a caregiver line only for Completed/Partial;
   - use the same status-aware timestamp labels as the timeline;
   - retain child, status, entered-at, note, late-entry, and revision/report
     integrity information.
6. Preserve analytics’ Completed/Partial-only boundary. Add Not applicable with
   `caregiverIds: []` to `tests/unit/timeline-analytics.test.ts` and prove both
   no-care statuses remain absent from record-item options, caregiver counts,
   and included records.
7. Update `README.md:13` so it no longer promises caregiver attribution for
   every outcome. State that caregiver attribution applies when care occurred
   and that Missed/Not applicable dispositions carry no provider.

**Verify**:
`npm test -- tests/unit/today-dashboard.test.tsx tests/unit/timeline-analytics.test.ts tests/integration/memory-repository.test.ts`
→ exit 0; all dashboard count/projection/report-source assertions pass.

### Step 5: Add one end-to-end regression and run all gates

1. Add a single focused Chromium flow in `e2e/app.spec.ts` named
   `records missed and not-applicable items without caregivers`. Use an
   unrecorded routine item on an open, non-future day and verify:
   - selecting Missed hides the provider field and permits Save;
   - the saved task shows Missed, not a completed-care presentation;
   - the corresponding `/api/timeline` item has `caregiverIds: []`;
   - repeat or edit for Not applicable and verify the same empty attribution;
   - the timeline uses status-aware time wording;
   - a caregiver-filtered timeline does not include the no-care item;
   - the dialog has no critical/serious Axe violations after the conditional
     fields change.
2. Keep this flow isolated from the existing lifecycle test. Do not finalize or
   purge records it does not create.
3. Review the final diff specifically for independent status arrays, false
   “Occurred”/“provided care” copy, and accidental changes to planned caregiver
   assignments.
4. Run all verification gates below and record any environment-only skip or
   limitation separately from application failures.

**Verify**:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e -- --project=chromium --grep "records missed and not-applicable items without caregivers"
git diff --check
```

Expected: every command exits 0; Mongo tests may keep their existing conditional
skip when `TEST_MONGODB_URI` is absent. The focused browser test must pass, not
skip, in an environment with the repository’s configured Playwright Chromium.

## Test plan

- **Schema matrix** (`tests/unit/schemas.test.ts`): all statuses across create,
  update, and correction; positive and negative provider rules; non-occurrence
  care-only field rejection.
- **Component state/payload** (`tests/unit/today-dashboard.test.tsx`): status
  ordering, hidden provider field, cleared IDs, conditional Save state,
  status-aware time label, omitted duration/activity, planned-caregiver prefill
  retained only when care occurred.
- **Memory persistence** (`tests/integration/memory-repository.test.ts`): create,
  open-day transition, finalized correction, current revision payload, prior
  revision/hash preservation, progress counting, report source.
- **Mongo parity** (`tests/integration/mongodb-repository.test.ts`): empty-array
  persistence, `$unset` behavior, correction transaction and revision chain.
- **Analytics** (`tests/unit/timeline-analytics.test.ts`): Missed and Not
  applicable stay excluded and cannot be caregiver-attributed.
- **E2E** (`e2e/app.spec.ts`): truthful conditional form, API projection,
  timeline presentation/filtering, and accessibility.
- Model test structure after the existing tests named in “Current state”; do not
  introduce snapshot tests for this behavior.

## Done criteria

- [ ] Completed and Partial cannot be created, updated, or corrected without at
  least one caregiver.
- [ ] Missed and Not applicable cannot be created, updated, or corrected with a
  caregiver, duration, or activity type.
- [ ] UI submissions for Missed/Not applicable always send
  `caregiverIds: []` and omit care-only details.
- [ ] Planned special-arrangement caregivers remain plan context and are not
  copied into no-care records.
- [ ] Both repositories persist the same status-aware shape in the current
  record and revision payload.
- [ ] Open-day edits and finalized append-only corrections preserve their
  existing lifecycle semantics and hash chaining.
- [ ] No historical record or revision is bulk-rewritten.
- [ ] Dashboard progress counts every resolved/recorded routine item and no
  longer calls the metric completion.
- [ ] Timeline projections, filters, and PDF reports never attribute Missed/Not
  applicable items to a caregiver or say the care “Occurred.”
- [ ] Record analytics still include only Completed and Partial.
- [ ] `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, the
  focused Playwright command, and `git diff --check` all exit 0 subject only to
  documented environment-dependent Mongo skips.
- [ ] `git status --short` shows no modified source files outside the in-scope
  list.
- [ ] `plans/README.md` marks Plan 001 DONE.

## STOP conditions

Stop and report back instead of improvising if:

- Current code no longer matches the schema/UI/repository excerpts above.
- Implementing an empty caregiver array requires a Mongo schema migration or a
  rewrite of stored/finalized records.
- Any report or revision code depends on caregiver arrays being non-empty in a
  way that cannot be fixed within the listed files.
- The implementation would need to alter special-arrangement planned
  responsibility or appointment responsibility to satisfy the care-entry
  contract.
- Preserving `occurredAt` for status-aware display proves impossible without
  changing report date selection or late-entry behavior. Do not rename or split
  the persisted field in this plan.
- A verification command fails twice after a reasonable in-scope fix, or a test
  failure indicates shared-state contamination outside this feature.
- The fix requires touching a file listed as out of scope.

## Maintenance notes

- Reviewers should scrutinize transitions, not only creation. Completed →
  Missed/Not applicable must clear providers and care-only details; the inverse
  must require a newly selected provider.
- Any future status must be deliberately classified by the centralized
  predicate. A new status must not silently default to “care occurred.”
- `occurredAt` retains legacy naming for compatibility. If the product later
  separates routine dispositions from factual care occurrences, treat that as
  a dedicated migration plan with explicit legacy reads and report-versioning.
- Report snapshots and revision hashes are evidence boundaries. Never “clean”
  legacy provider IDs by mutating a finalized revision; use a visible correction
  or a versioned migration designed for audit preservation.
