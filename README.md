# @ai-native-solutions/fallforce-mcp

Stdio MCP server for [FallForce](https://sjgant80-hub.github.io/fallforce/) — the
sovereign single-file CRM. Wraps
[`@ai-native-solutions/fallforce-sdk`](https://github.com/sjgant80-hub/fallforce-sdk).

## Install & wire

```bash
npm install -g @ai-native-solutions/fallforce-mcp

claude mcp add fallforce -- npx -y @ai-native-solutions/fallforce-mcp
```

Or add to `.mcp.json`:

```json
{
  "mcpServers": {
    "fallforce": {
      "command": "npx",
      "args": ["-y", "@ai-native-solutions/fallforce-mcp"]
    }
  }
}
```

Restart Claude Code. Verify with `/mcp`.

## Tools (6)

| Tool | Purpose |
|---|---|
| `ff_forecast`          | Weighted forecast + won revenue + win rate + avg deal + health |
| `ff_pipeline_by_stage` | Group deals by stage with count / value / weighted |
| `ff_detect_risks`      | Rank deals by risk score with reason codes |
| `ff_build_context`     | Compact grounded CRM snapshot for LLM system prompts |
| `ff_role_spec`         | Spec for one of the 9 swarm roles |
| `ff_autopilot_plan`    | Build the sequenced role plan (caller runs the LLM per step) |

## Resources (3)

| URI | Content |
|---|---|
| `fallforce://swarm/roles`     | The 9 public swarm role specs |
| `fallforce://pipeline/stages` | Default stages: Lead, Qualified, Proposal, Negotiation, Closed Won, Closed Lost |
| `fallforce://demo/db`         | Seeded demo dataset |

## Example

```
> Use ff_forecast on the deals in fallforce://demo/db
Claude: forecast £13,900 · won £5,000 · winRate 100% · health 65
```

## Companions

- [`fallforce-sdk`](https://github.com/sjgant80-hub/fallforce-sdk) — the engine
- [`fallforce-api`](https://github.com/sjgant80-hub/fallforce-api) — HTTP wrapper

## License

MIT.
