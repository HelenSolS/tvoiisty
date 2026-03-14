# QA Task: Next Stage Validation

## Goal

Update existing tests and add new ones for the latest functionality:
- owner-based persistence (web + Telegram),
- offline pending queue and reconnect sync,
- history/photo limits and stable rendering,
- UI consistency across `My Photos`, `Gallery`, `History`.

The main objective is to detect regressions before release and confirm that critical user flows are stable.

---

## Test Scope

- Platforms:
  - Web desktop (Chrome)
  - Web mobile (emulation + at least one real device)
  - Telegram Mini App (preferably iOS + Android)

- Environments:
  - preview/dev
  - main/prod (smoke only)

---

## 1) Update Existing Test Cases

Please review and update current test cases to reflect the new behavior:

- Owner context:
  - requests include owner headers (`X-Client-Id`, compatibility `X-User-Id`)
  - history is owner-based (not only auth-based)

- Limits:
  - `My Photos` max 10
  - `History` max 50

- UI:
  - card actions are overlay/interactive in both `grid` and `list` modes
  - consistent rounded corners and card style in all target sections

- Remove or mark obsolete expectations:
  - old static result action buttons from legacy quick flow
  - old assumptions about auth-only history

Deliverable for this section:
- list of outdated tests (updated/removed),
- list of updated test IDs with what changed.

---

## 2) New Test Cases (Mandatory)

### A. Owner and Data Isolation

1. **Web guest owner**
   - first visit creates/stabilizes client owner id
   - after reload/reopen, same device sees same data

2. **Telegram owner**
   - Telegram Mini App user sees own data after reopen

3. **Isolation**
   - different clients/owners do not see each other's photos/history

### B. Limits and Trimming

4. **My Photos limit = 10**
   - upload more than 10 photos, verify only last 10 remain

5. **History limit = 50**
   - generate more than 50 try-ons, verify trim to 50

6. **Single video pointer per history item**
   - re-animate overwrites existing `videoUrl` on same item

### C. Offline Queue and Reconnect

7. **Offline like/delete/re-animate**
   - perform actions offline, reconnect, verify successful sync

8. **Queue survives reload**
   - with pending actions, reload app, ensure sync resumes

9. **No data loss on reconnect**
   - final UI state matches successful server sync

### D. New/Viewed History Markers

10. **New marker appears**
    - newly created history items are marked as new

11. **Viewed behavior**
    - marker clears after viewing

12. **No immediate reorder jump**
    - when marker clears, list should not jump immediately in current session

### E. UI/UX Regression Pack

13. **Issue #77 regression**
    - slider/list behavior works correctly
    - single card does not stretch full width
    - card sizes remain stable and uniform
    - rounded corners and style consistency preserved

14. **Card action controls**
    - buttons appear/behave as expected in both `grid` and `list`

15. **Core flow regression**
    - quick flow and main flow both produce try-on and save to history

### F. API/CORS Smoke

16. `/api/health` returns 200
17. `/api/looks` returns actual active looks
18. preflight and requests with owner headers are not blocked by CORS

---

## 3) Reporting Format

Please provide results in this structure:

- `Test ID | Scenario | Environment | Result | Evidence`

For each failed test:
- clear reproduction steps,
- expected vs actual,
- screenshot/video,
- network/log snippet,
- severity: `blocker`, `major`, `minor`.

Also include:
- summary of updated legacy test cases,
- list of newly added test case IDs.

---

## 4) Priority Order

1. **P0**
   - owner/data isolation
   - offline queue sync
   - API/CORS smoke
   - core try-on flows

2. **P1**
   - UI/Issue #77 regression set
   - grid/list consistency in all key sections

3. **P2**
   - extended edge cases
   - longer soak/reliability checks

