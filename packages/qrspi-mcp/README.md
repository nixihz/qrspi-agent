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

Each tool returns JSON with the command, exit code, stdout, stderr, and light parsed fields where useful.
