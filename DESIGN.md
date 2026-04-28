# QRSPI Design System

This document defines the product design rules for QRSPI user interfaces. QRSPI surfaces are workflow tools for reviewers and implementers, not marketing pages.

## Product Posture

QRSPI UI must feel like an evidence desk: calm, dense, readable, and decision-oriented. The user is usually trying to decide whether an AI-generated workflow artifact is safe to approve, reject, or continue.

Primary design goals:

- Make the next human action obvious within 5 seconds.
- Preserve trust by exposing source paths, validation state, review history, and command handoff clearly.
- Keep the CLI as the authority. UI may explain and prepare commands, but must not imply it owns workflow state.
- Prefer utility copy over brand copy.

## Layout

Use task-first App UI layouts.

Recommended structure for workbench screens:

```text
QRSPI Workbench
├─ Utility bar
│  ├─ Project/source selector
│  ├─ Refresh
│  └─ Import / demo controls
├─ Primary work area
│  ├─ Reviewer action queue
│  └─ Selected item decision summary
└─ Supporting evidence
   ├─ Artifact reader
   ├─ Structured facts
   ├─ Gate history
   ├─ Run logs
   ├─ Command handoff
   └─ Stage / slice context
```

Rules:

- No hero-first workbench screens.
- No marketing headline as the first visual priority.
- Place pending actions before explanation.
- Keep detail panes tied to the selected queue item.
- Use cards only for repeated items, metrics, framed readers, and command rows.
- Avoid nested cards.

## Typography

Use restrained typography for scanning.

- Display/headline: a real serif or humanist face is allowed for brand moments, but not for panel-heavy work surfaces.
- App body: use a readable sans face. Avoid `system-ui`, Inter, Roboto, Arial, or default stacks as the primary design decision.
- Monospace: command and path text must use a monospace face.
- Body text minimum: 16px.
- Compact metadata minimum: 12px, uppercase only when short and high-contrast.
- No viewport-based font scaling.
- Letter spacing: 0 for normal text. Uppercase metadata may use modest positive spacing.

## Color

Colors communicate status first and decoration second.

Baseline tokens:

```css
:root {
  --ink: #17201c;
  --muted: #495852;
  --soft: #6d7772;
  --canvas: #f4f1ea;
  --surface: #fffaf4;
  --line: rgba(23, 32, 28, 0.16);
  --accent: #0f6a62;
  --accent-strong: #124c46;
  --warning: #9a6700;
  --danger: #a23e2f;
  --success: #246548;
  --info: #2c5ea8;
}
```

Rules:

- Body text contrast must be at least 4.5:1.
- Never rely on color alone for status. Pair color with text labels.
- Avoid purple/blue gradient SaaS defaults.
- Avoid low-contrast pastel text on pale backgrounds.
- Use one primary accent and separate semantic colors for status.

## Components

### Reviewer Action Queue

Each row must show:

- Feature id
- Current gate or blocked state
- Age
- Validation status
- Required reviewer action
- Missing-data warning, if any

Queue rows are buttons or links. They must look clickable without hover.

### Decision Summary

The top of the selected detail view must show:

- Stage
- Engine status
- Validation result
- Latest artifact path
- Required action
- Next command or review skill entry point

### Artifact Reader

Artifact readers must preserve markdown structure, path context, and stage context. Long content should scroll inside a stable pane.

### Structured Facts

Structured facts summarize parsed artifact data. If parsing fails or fields are missing, show that explicitly. Do not invent missing facts.

### Command Handoff

Commands must be copyable, readable, and tied to the selected feature. Approve and reject commands must emphasize `--note-file` and `--feedback-file` when review persistence is required.

### Status Pills

Status pills must include text labels. Recommended labels:

- Ready
- Running
- Waiting Approval
- Failed
- Blocked
- Needs Context
- Completed

## Interaction States

Every feature must define loading, empty, error, success, and partial states. Empty states should explain what happened and provide a next action.

Do not use:

- Blank panels
- Generic "No data" messages
- Silent parse failures
- Disabled buttons without a reason

## Accessibility

- Keyboard navigation must reach every queue row, tab, command, and action.
- Focus states must be visible and high contrast.
- Minimum touch target: 44px by 44px.
- Use landmarks: header, main, navigation/aside, section.
- Buttons must be buttons; navigation must be links.
- Labels must remain visible when fields have values.
- Screen reader labels must distinguish approve, reject, run, context, and rewind actions.
- Do not expose command text only through color or icons.

## Copy

Use operational language.

Prefer:

- Pending gates
- Needs review
- Validation failed
- Approve with note
- Reject with feedback
- Structured facts unavailable
- Gate review persisted

Avoid:

- Cockpit
- Unlock
- All-in-one
- Beautiful workflow
- Track every feature
- Welcome to

## Responsive Behavior

Desktop:

- Queue and selected detail can sit side by side.
- Evidence panels may use two columns when content remains readable.

Tablet:

- Queue remains above or beside detail depending on width.
- Command handoff should stay near decision summary.

Mobile:

- Queue comes first.
- Selected detail opens below the selected row or in a full-width detail section.
- Stage track becomes compact timeline or segmented list.
- Command rows remain copyable with visible labels.

## Anti-Patterns

Reject these patterns in QRSPI UI:

- Hero-first app screens
- Generic SaaS card grids
- Decorative icon circles
- Low-contrast poster-like dashboards
- Centered everything
- Cards inside cards
- Status expressed only by color
- Placeholder-only labels
- Hidden critical commands
- UI paths that bypass CLI persistence
