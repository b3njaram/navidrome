#!/usr/bin/env python3
"""Summarize real emulator UI frame timings; never equate emulation to device FPS.

Android's older and newer gfxinfo formats place the IntendedVsync and
FrameCompleted columns at different indices. We resolve them from headers. Their difference is the end-to-end frame latency including
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
header = []
seen = set()
for line in raw.splitlines():
    line = line.strip()
    if line == "---PROFILEDATA---":
        capturing = not capturing
        header = []
        continue
    if not capturing:
        continue
    if line.startswith("Flags,"):
        header = line.rstrip(",").split(",")
        continue
    if not header or not re.match(r"^\d+,", line):
        continue
    try:
        columns = [int(x) for x in line.rstrip(",").split(",")]
        intended_vsync = columns[header.index("IntendedVsync")]
        completed = columns[header.index("FrameCompleted")]
        if intended_vsync <= 0 or completed <= intended_vsync:
            continue
        latency_ms = (completed - intended_vsync) / 1_000_000.0
        key = (intended_vsync, completed)
        if 0 < latency_ms < 3000.0 and key not in seen:
            seen.add(key)
            frames.append(latency_ms)
    except (ValueError, IndexError):
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
# SurfaceFlinger counters are diagnostics for this emulator only; they should
# never be represented as frame rates on a real Samsung or iPhone.
reported = re.search(
    r"Total frames rendered:\s*(\d+)[\s\S]{0,80}?Janky frames:\s*(\d+)\s*\(([^)]+)\)",
    raw,
)
if reported:
    output["gfxinfo_reported_total_frames"] = int(reported.group(1))
    output["gfxinfo_reported_janky_frames"] = int(reported.group(2))
    output["gfxinfo_reported_janky_percent"] = reported.group(3)

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
