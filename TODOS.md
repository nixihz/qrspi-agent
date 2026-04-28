# TODOs

## Redesign QRSPI dashboard around reviewer action queue

- **Status:** Done in this implementation pass.
- **What:** Rework `apps/qrspi-dashboard` so the first viewport is the reviewer action queue, not a hero-first dashboard.
- **Why:** The 1A workbench exists to help reviewers find pending gates, inspect risk, and perform approve/reject handoff safely.
- **Pros:** Aligns implementation with `DESIGN.md` and `docs/codex-plugin-roadmap.zh.md`; makes pending gates, validation state, and required reviewer action visible immediately.
- **Cons:** Requires layout, copy, contrast, and screenshot updates; current `assets/screenshot-dashboard.png` becomes a before-reference, not final product evidence.
- **Context:** The design review found the current dashboard reads as a demo poster with low contrast and a marketing-style hero. The plan now requires task-first App UI.
- **Depends on / blocked by:** Use `DESIGN.md` and the roadmap's `1A UI 信息架构`, `1A Visual Direction and AI Slop Guardrails`, and `1A Responsive and Accessibility Requirements` sections as acceptance criteria.

## Verify dashboard responsive and accessibility behavior

- **Status:** Done for the 1A release evidence. Desktop/tablet/mobile screenshots and fixed mobile capture are recorded under `~/.gstack/projects/iamx-qrspi-agent/qa-evidence/responsive-dashboard-2026-04-28/`; desktop Chrome accessibility-tree checks are recorded at `~/.gstack/projects/iamx-qrspi-agent/dashboard-qa-20260428-182111.md`. A follow-up can add deeper keyboard-path automation if needed.
- **What:** After the dashboard redesign, verify desktop, tablet, and mobile layouts plus keyboard-only reviewer flow, focus states, touch targets, and contrast.
- **Why:** The workbench is a gate review tool; reviewers must be able to inspect evidence and copy approve/reject handoff commands without mouse, wide-screen, or perfect-vision assumptions.
- **Pros:** Converts the roadmap's responsive/a11y requirements into testable evidence; catches layout and focus regressions before the UI is treated as ready.
- **Cons:** Requires screenshot capture and manual or automated keyboard-path checks after implementation.
- **Context:** The design review made 44px touch targets, visible focus, semantic landmarks, non-color-only status, and 4.5:1 body contrast acceptance criteria.
- **Depends on / blocked by:** Depends on the dashboard redesign being implemented first.

## Generate formal workbench mockups or HTML preview

- **Status:** Superseded for 1A by the implemented static HTML workbench. Optional for future visual iteration.
- **What:** When the design tooling is available, generate approved mockups or a production-quality HTML preview for the task-first QRSPI Workbench redesign.
- **Why:** The design review could not generate mockups because the gstack designer binary was unavailable. A visual reference reduces interpretation drift before implementation.
- **Pros:** Gives implementers a concrete reference for queue-first layout, density, contrast, and command handoff hierarchy.
- **Cons:** Adds a design artifact step before or during dashboard implementation; may overlap with the redesign work if the same person handles both.
- **Context:** The roadmap and `DESIGN.md` now define the design rules, but no approved mockup exists for the updated direction.
- **Depends on / blocked by:** Requires working design tooling, or a manual `/design-html` style HTML preview based on `DESIGN.md` and the roadmap.
