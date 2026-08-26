"""Runtime resource budget. Measure, then decide.

This runs on a daily-use laptop. Every entry point calls apply() first, so a
runaway job dies instead of pushing the desktop into swap.
"""

import os
import resource

DESKTOP_RESERVE_MB = 3000   # always leave this much for the desktop
FLOOR_MB = 1500             # below this, refuse to run
MAX_WORKERS = 4             # ceiling regardless of what the machine offers


def available_mb() -> int:
    with open("/proc/meminfo") as f:
        for line in f:
            if line.startswith("MemAvailable:"):
                return int(line.split()[1]) // 1024
    raise RuntimeError("could not read MemAvailable from /proc/meminfo")


def budget() -> dict:
    """What this process may safely use, right now."""
    avail = available_mb()
    mem_mb = avail - DESKTOP_RESERVE_MB

    if mem_mb < FLOOR_MB:
        raise RuntimeError(
            f"only {avail} MB available. After reserving {DESKTOP_RESERVE_MB} MB "
            f"for the desktop, {mem_mb} MB is left, below the {FLOOR_MB} MB floor. "
            f"Close something or run a smaller job."
        )

    threads = os.cpu_count() or 4
    load = os.getloadavg()[0]
    free_threads = max(1, int(threads - load))
    workers = max(1, min(MAX_WORKERS, free_threads // 2))

    return {"available_mb": avail, "mem_mb": mem_mb,
            "workers": workers, "threads": threads, "load": round(load, 2)}


def apply(headroom: float = 0.9) -> dict:
    """Set a hard address-space cap so a runaway job dies instead of swapping."""
    b = budget()
    cap = int(b["mem_mb"] * headroom) * 1024 * 1024
    resource.setrlimit(resource.RLIMIT_AS, (cap, cap))
    return b


def announce(b: dict) -> None:
    """Print what the budget decided, so it shows up in the run log."""
    print(f"[resources] {b['available_mb']} MB free, "
          f"using up to {b['mem_mb']} MB, {b['workers']} workers "
          f"(load {b['load']})")
