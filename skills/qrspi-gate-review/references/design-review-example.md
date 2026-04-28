# DESIGN Gate Review Example

Use this example only when validating or demonstrating the skill behavior.

Artifact facts:

- Recommended approach: CLI JSON output is the structured interface.
- Rejected alternative: MCP is out of scope for the MVP.
- Risk: JSON schema stability must be documented.

Ask one question at a time:

1. Should CLI JSON output be the primary path we carry into STRUCTURE?
2. Should MCP remain out of scope for this MVP?
3. Is documenting the JSON schema enough to cover the compatibility risk before STRUCTURE?

Example decision note:

```markdown
# DESIGN Gate Review

Decision: approved with notes

Confirmed:
- Use CLI JSON output as the primary structured interface.
- Keep MCP out of scope for this MVP.

Requested follow-up:
- Keep JSON schemas documented and stable.
```
