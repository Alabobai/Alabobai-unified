# Execute Task Command Mode (Reliability Hardening #5)

## What was added

A new explicit **Execute Task** command mode is now available in the Chat view.

- Click **Execute Task** in the chat header to open a lightweight command panel.
- Enter a task and run `/api/execute-task` directly (optional **Dry run** toggle).
- See clear run lifecycle state:
  - `Running`
  - `Complete`
  - `Failed`
- See structured output summary:
  - status
  - intent label
  - plan step count
  - execution step count
  - diagnostics/failures (when degraded)
- Execution steps are listed in-panel for quick verification.

## Existing behavior retained

- Standard chat flow is unchanged.
- Existing keyword-trigger path still works and continues to post capability-engine results into chat when matched.

## Usage

1. Open Chat view.
2. Click **Execute Task** in header.
3. Enter task text (or keep existing chat input and run directly).
4. (Optional) enable **Dry run**.
5. Click **Run Execute Task**.
6. Review in-panel status + results.

## Screenshot instructions

Capture these UI states for release notes / QA:

1. **Panel Closed**
   - Chat header showing the new **Execute Task** button.

2. **Panel Open (Idle)**
   - Command panel visible with task textarea + dry-run toggle.

3. **Running State**
   - Execute a task and capture while status shows **Running** with spinner.

4. **Success State + Results**
   - Capture summary cards + execution step list + diagnostics (if present).

5. **Error State**
   - Trigger network/API failure (or temporary invalid endpoint) and capture **Failed** state with error banner.

Suggested viewport coverage:
- Desktop: full chat pane including header + panel + first messages.
- Mobile: include header and top of panel to show responsive layout.
