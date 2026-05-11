# OpenCode Token Usage Tracker

This directory contains the `token-usage-tracker.ts` OpenCode plugin, which is responsible for monitoring and reporting AI agent token usage in real-time.

## How it works

1. **Event Listening**: The plugin hooks into OpenCode's SDK events (`message.updated` and `session.idle`).
2. **Token Accumulation**: It calculates both the per-turn token usage and the cumulative total token usage across the entire session.
3. **Local Logging**: It saves detailed structured JSONL logs locally to `~/.opencode/token_usage.log`.
4. **API Reporting**: When an interaction completes (`session.idle`), it automatically extracts the cumulative session total and sends it via an HTTP POST request to an external dashboard/API.

## API Payload Format

When the log is updated, the plugin fires a `POST` request to the configured API endpoint with the following exact JSON payload:

```json
{
  "usage": 12345
}
```
*(The `usage` value represents the cumulative `session.totalTokens` used so far).*

## Configuration

By default, the plugin sends its POST requests to:
`http://localhost:3000/api/usage`

You can override this destination by setting the following environment variable before starting OpenCode:
```bash
export TOKEN_USAGE_API_URL="https://your-custom-backend.com/api/usage"
```

## Dashboard Integration Requirements

**Important:** This plugin strictly handles data collection and outgoing requests. It **does not** create the receiving backend API. 

For a dashboard UI (like Next.js) to display this usage data:
1. The dashboard server must implement the receiving POST endpoint (e.g., `/api/usage`).
2. The endpoint must parse the `{"usage": <number>}` payload and store it.
3. The dashboard frontend can then fetch that stored value to refresh the UI.

If the receiving backend API is missing, the plugin will silently fail to report the data (logging a warning internally), but it will not crash OpenCode.
