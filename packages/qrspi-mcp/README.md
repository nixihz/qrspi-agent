# QRSPI MCP

Thin MCP wrapper around the `qrspi` CLI. This package does not implement a second workflow engine and does not write `.qrspi` state files directly.

## Build

```bash
npm run build --workspace=@qrspi/mcp
```

## Tools

- `qrspi_list`
- `qrspi_status`
- `qrspi_init`
- `qrspi_run`
- `qrspi_approve_or_reject`

Each tool calls the CLI in JSON mode and returns the command, exit code, stdout, stderr, and parsed `payload` from the CLI JSON contract. It must not parse human-readable CLI output.
