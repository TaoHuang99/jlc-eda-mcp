# Example Codex Request

Paste this into Codex after enabling the `jlc-eda` MCP server and connecting the EDA extension:

```text
Use the jlc-eda MCP server to create a 2x8 through-hole header breakout PCB in JLCEDA.

Requirements:
- Board size: 30mm x 20mm
- Pitch: 2.54mm
- Pad diameter: 1.6mm
- Drill diameter: 0.8mm
- Trace width: 0.3mm
- Add a rectangular board outline
- Add short fanout traces from each pad
```

Codex should call `jlceda_create_header_breakout` with:

```json
{
  "boardName": "2x8 Header Breakout",
  "width": 30,
  "height": 20,
  "rows": 2,
  "pinsPerRow": 8,
  "pitch": 2.54,
  "padDiameter": 1.6,
  "drillDiameter": 0.8,
  "traceWidth": 0.3,
  "includeOutline": true,
  "fanoutLength": 3
}
```
