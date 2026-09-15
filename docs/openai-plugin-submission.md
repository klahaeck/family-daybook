# Family Daybook OpenAI plugin submission

This is the reviewer-ready content for a **With MCP** remote MCP-only submission. Do not submit until the production verification checklist in `agent-distribution.md` is complete.

## Public listing

- **Plugin name:** Family Daybook
- **Publisher identity:** Family Daybook
- **Short description:** Keep authorized family records clear with private, permissioned MCP tools.
- **Long description:** Connect Family Daybook to a compatible assistant through OAuth. The assistant can read authorized daybook context and finalized history, update records while a day is open, and prepare corrections or finalization for explicit confirmation. Workspace, role, subscription, validation, version, and revision-history protections remain enforced.
- **Category:** Productivity
- **Website:** `https://www.myfamilydaybook.com/agent-access`
- **Support:** `https://www.myfamilydaybook.com/support`
- **Privacy:** `https://www.myfamilydaybook.com/privacy`
- **Terms:** `https://www.myfamilydaybook.com/terms`
- **MCP URL type:** Universal
- **MCP URL:** `https://www.myfamilydaybook.com/mcp`
- **Authentication:** OAuth

Use only a verified publisher identity whose displayed name is **Family Daybook**. If the portal cannot verify that identity, defer submission. Do not substitute an individual identity or add private identity details to the listing.

## Starter prompts

1. “Show today’s care entries and any routine tasks that are still incomplete.”
2. “Mark bedtime story done. Ask me for any required details you still need.”
3. “After checking the current daybook context, add a factual care entry for the details I provide.”
4. “Update today’s day notes with this summary after fetching the current day version.”
5. “Preview a correction to this finalized care entry, show me every changed field, and wait for my confirmation.”
6. “Preview finalizing today’s daybook and show the exact summary before asking me to confirm.”

## Positive tests

### 1. Read today and incomplete tasks

- **Prompt:** “Show today’s care entries and anything still incomplete.”
- **Expected behavior:** Call `get_daybook_context`, then `get_day` with the returned local date. Do not guess child, caregiver, record, or date values.
- **Expected result:** A factual summary of visible entries, completion status, and incomplete tasks.
- **Fixture:** Synthetic owner workspace with at least one completed and one incomplete routine task for the local date.

### 2. Record a named routine item

- **Prompt:** “Mark bedtime story done.”
- **Expected behavior:** Call `record_routine_item` with a new operation ID. Ask for the date, caregiver, and actual local time when omitted, using native form elicitation when supported or the returned continuation token otherwise. Do not create a record until the required answers are complete.
- **Expected result:** The created record identifier and version, or the existing record without a duplicate.
- **Fixture:** Synthetic owner workspace with one child, an active caregiver, and a bedtime story routine on an open day.

### 3. Create a factual care entry

- **Prompt:** “Record that Child A completed a custom reading activity with Caregiver A at 7:00 p.m.”
- **Expected behavior:** Read context and day first, resolve authorized identifiers, then call `create_care_entry` once with a new operation ID.
- **Expected result:** The created record identifier and a concise confirmation.
- **Fixture:** Synthetic owner workspace with the named active child and caregiver on an open day.

### 4. Update day notes safely

- **Prompt:** “Add ‘School form placed in the backpack’ to today’s day notes.”
- **Expected behavior:** Fetch the day, preserve relevant existing notes, and call `update_day_notes` with the fresh day version and a new operation ID.
- **Expected result:** The updated notes and date.
- **Fixture:** Synthetic owner workspace with an open current day.

### 5. Preview and confirm a finalized correction

- **Prompt:** “Change the time on the finalized reading entry to 7:15 p.m. because the original time was entered incorrectly.”
- **Expected behavior:** Fetch the record and current version, call `preview_care_entry_correction`, show the diff, and stop for explicit confirmation. Only after confirmation may `confirm_care_entry_correction` consume the returned handle.
- **Expected result:** First a non-mutating diff; after confirmation, an appended revision identifier.
- **Fixture:** Synthetic finalized care entry with a known current version.

### 6. Preview day finalization

- **Prompt:** “Prepare today for finalization and show me what will be locked.”
- **Expected behavior:** Fetch the current day, call `preview_day_finalization`, present the returned summary, and do not call `confirm_day_finalization` without a separate explicit confirmation.
- **Expected result:** A finalization preview and confirmation request, with no data changed.
- **Fixture:** Synthetic owner workspace with an open day containing at least one entry.

## Negative tests

### 1. Cross-workspace identifier

- **Scenario:** Ask for a record identifier that belongs to another workspace.
- **Expected behavior:** Return the bounded not-found or forbidden response without revealing whether that record exists elsewhere.
- **Why:** OAuth authorization never expands workspace membership.

### 2. Correction without preview confirmation

- **Scenario:** Ask the assistant to correct a finalized record immediately and skip confirmation.
- **Expected behavior:** Refuse to bypass the preview, call only the preview tool when valid, and wait for explicit confirmation.
- **Why:** The confirmation handle binds approval to the exact proposed revision.

### 3. Guessed or stale identifiers and versions

- **Scenario:** Supply an invented record ID or reuse a stale record/day version.
- **Expected behavior:** Fetch fresh authorized context where possible; otherwise return not found or version conflict and make no change.
- **Why:** Guessed identifiers and stale writes could target the wrong state.

## Review account and release notes

- Create a dedicated synthetic owner workspace with all three OAuth scopes and no real family records.
- Provide credentials only in the private submission portal. Do not place credentials in the repository, public website, release notes, analytics, or application logs.
- The account must work without MFA, SMS, email confirmation, or private-network access during review. Disable or rotate it after review.
- **Release note:** “Family Daybook MCP 1.1 adds named routine recording with native form elicitation and structured conversational fallback across eleven OAuth-protected tools.”
