# GPU Monitor

NVIDIA GPU monitor for the TrueNAS dashboard: VRAM, clock, power, temperature and a
selectable fan, each with a live ~30-minute history graph on a fixed scale. Supports
multiple GPUs and fans (chosen via the ⚙ settings, stored per-instance).

**Requires** the Hub container to have GPU access (nvidia runtime) and `/sys/class/hwmon`
visibility for fan RPM (`permissions: ["nvidia", "hwmon"]`). The producer samples
`nvidia-smi` and the `nct6798` hwmon every 5 s.
