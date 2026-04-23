import { describe, it, expect } from "vitest";
import { parseStageOutput } from "../../src/parsers/artifact-parser.js";

describe("parseStageOutput", () => {
  it("parses Q stage with questions, assumptions and risks", () => {
    const content = `### Q1: How to authenticate?
## Assumptions
- Use JWT
- Single sign-on
## Risks
- Key leakage`;
    const result = parseStageOutput("Q", content);
    expect(result.stage).toBe("Q");
    expect(result.summary).toContain("1 technical questions");
    expect(result.structured_data.questions).toHaveLength(1);
    expect(result.structured_data.assumptions).toEqual(["Use JWT", "Single sign-on"]);
    expect(result.structured_data.risks).toEqual(["Key leakage"]);
  });

  it("parses R stage with findings and unresolved", () => {
    const content = `## Q1: Auth approach
Use OAuth2.
## Unresolved
- Refresh strategy`;
    const result = parseStageOutput("R", content);
    expect(result.stage).toBe("R");
    expect(result.summary).toContain("1 questions");
    expect(result.structured_data.findings).toHaveLength(1);
    expect(result.structured_data.unresolved).toEqual(["Refresh strategy"]);
  });

  it("parses D stage with decisions", () => {
    const content = `### Decision 1: Use OAuth2
Needs confirmation: Mobile support?`;
    const result = parseStageOutput("D", content);
    expect(result.stage).toBe("D");
    expect(result.summary).toContain("1 decisions");
    expect(result.structured_data.decisions).toEqual(["Use OAuth2"]);
    expect(result.structured_data.pending_confirmations).toEqual(["Mobile support?"]);
  });

  it("parses S stage with slices", () => {
    const content = `### Slice 1: Core Auth
**Goal**: Implement login
**Test**: Unit tests pass
### Slice 2: Permissions
**Checkpoint**: Integration tests`;
    const result = parseStageOutput("S", content);
    expect(result.stage).toBe("S");
    expect(result.summary).toContain("2 vertical slices");
    expect(result.structured_data.slices).toHaveLength(2);
    expect((result.structured_data.slices as Array<Record<string, unknown>>)[0].name).toBe("Core Auth");
  });

  it("parses P stage with rollback items", () => {
    const content = `## Rollback
- Backup database
- Keep old API`;
    const result = parseStageOutput("P", content);
    expect(result.stage).toBe("P");
    expect(result.summary).toContain("2 rollback");
    expect(result.structured_data.rollback_items).toEqual(["Backup database", "Keep old API"]);
  });

  it("parses W stage from JSON", () => {
    const content = JSON.stringify({
      slices: [
        {
          name: "auth",
          description: "login",
          order: 1,
          tasks: [{ id: "t1", description: "impl" }],
        },
      ],
    });
    const result = parseStageOutput("W", content);
    expect(result.stage).toBe("W");
    expect(result.summary).toContain("1 slices");
    expect(result.structured_data.slices).toHaveLength(1);
  });

  it("parses I stage with modifications and tests", () => {
    const content = `## Changes
- Add login page
## Test Results
- 5 passed`;
    const result = parseStageOutput("I", content);
    expect(result.stage).toBe("I");
    expect(result.summary).toContain("1 changes");
    expect(result.structured_data.modified_items).toEqual(["Add login page"]);
    expect(result.structured_data.tests).toEqual(["5 passed"]);
  });

  it("parses PR stage with tests", () => {
    const content = `## Tests
- Login test`;
    const result = parseStageOutput("PR", content);
    expect(result.stage).toBe("PR");
    expect(result.summary).toContain("1 test");
    expect(result.structured_data.tests).toEqual(["Login test"]);
  });

  it("falls back to generic for unknown stage", () => {
    const content = "some content";
    // @ts-expect-force — testing internal fallback path
    const result = parseStageOutput("UNKNOWN" as "Q", content);
    expect(result.summary).toBe("some content");
  });
});
