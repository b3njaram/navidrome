#!/usr/bin/env python3
"""Summarize real emulator UI frame timings; never equate emulation to device FPS.

Android's gfxinfo framestats column 1 is IntendedVsync and column 13 is
FrameCompleted. Their difference is the end-to-end frame latency including
the emulator's scheduler. No fabricated result is emitted if the system
doesn't export data; recorded values are diagnostics, not pass/fail gates.
"""
import json
import pathlib
import re
import statistics
import sys

source = pathlib.Path(sys.argv[1])
destination = pathlib.Path(sys.argv[2])
raw = source.read_text(errors="replace") if source.exists() else ""
frames = []
capturing = False
for line in raw.splitlines():
    line = line.strip()
    if line == "---PROFILEDATA---":
        capturing = not capturing
        continue
    if not capturing or not re.match(r"^\d+,", line):
        continue
    try:
        columns = [int(x) for x in line.split(",")]
        if len(columns) < 14:
            continue
        intended_vsync, completed = columns[1], columns[13]
        if intended_vsync <= 0 or completed <= intended_vsync:
            continue
        latency_ms = (completed - intended_vsync) / 1_000_000.0
        if latency_ms < 3000.0:
            frames.append(latency_ms)
    except ValueError:
        continue

def percentile(items, pct):
    if not items:
        return None
    ordered = sorted(items)
    pos = (len(ordered) - 1) * pct / 100
    lo, hi = int(pos), min(int(pos) + 1, len(ordered) - 1)
    return round(ordered[lo] + (ordered[hi] - ordered[lo]) * (pos - lo), 2)

output = {
    "measurement": "Android emulator SurfaceFlinger/egl gfxinfo app-frame latency",
    "device": "GitHub Actions Android emulator, not an actual phone or vehicle",
    "animations_enabled": True,
    "refresh_budget_ms_assumed": 16.67,
    "interpretation": "These are emulator-only diagnostics and do not establish iPhone-equivalent animation fluidity.",
    "status": "sampled" if frames else "unavailable",
    "frames": len(frames),
}
if frames:
    output.update({
        "median_latency_ms": round(statistics.median(frames), 2),
        "p90_latency_ms": percentile(frames, 90),
        "p95_latency_ms": percentile(frames, 95),
        "p99_latency_ms": percentile(frames, 99),
        "frames_over_16_67_ms": sum(t > 16.67 for t in frames),
        "frames_over_33_33_ms": sum(t > 33.33 for t in frames),
        "percent_over_16_67_ms": round(
            100 * sum(t > 16.67 for t in frames) / len(frames), 1
        ),
    })
else:
    output["reason"] = "gfxinfo did not provide completed frame timing rows"
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(output, indent=2) + "\n")
print("Animation frame diagnostics:", json.dumps(output, sort_keys=True))
