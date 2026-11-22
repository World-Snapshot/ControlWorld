---
title: WSM ControlWorld
emoji: 🌐
colorFrom: blue
colorTo: indigo
sdk: docker
app_port: 7860
fullWidth: true
header: mini
pinned: false
suggested_hardware: l40sx1
startup_duration_timeout: 1h
models:
  - World-Snapshot/WSM_v1
---

# WSM ControlWorld

This Docker Space runs the complete ControlWorld interface on Hugging Face GPU
hardware. Model inference runs inside the Space; visitors need only a browser.

## Repository access

The release deployment assumes that ControlWorld, WSMs, WSG Reader, and the WSM
weights are public. No WSM credential is required. An optional read-only token
may be added as a Space **Secret** named `HF_TOKEN` to raise Hub download limits.
Never commit a token to the Space source.

## Runtime variables

| Variable | Default | Purpose |
|---|---|---|
| `WSM_SPACE_MODEL_REPO` | `World-Snapshot/WSM_v1` | Repository containing `WSM_v1.wsm` |
| `WSM_SPACE_PROFILE` | `paper-demo` | TunnelingNets materialized before the UI starts |
| `WSM_SPACE_HEADS` | empty | Optional comma-separated qualified TunnelingNet IDs |
| `WSM_MODEL_CACHE` | `/data/wsm_model_cache` | Cache for selected single-file members |
| `WSM_WEBUI_TIMEOUT` | `1800` | Maximum seconds for one inference job |

`WSM_SPACE_PROFILE` accepts:

- `paper-demo`: recommended TunnelingNets used by the locked paper demonstrations;
- `selected`: only IDs listed in `WSM_SPACE_HEADS`, for example
  `dense:000001,dense:000270,dense:000578`;
- `all`: every released recommended Dense, Sparse, and Custom TunnelingNet.

The default profile keeps startup and disk use bounded while retaining the
existing UI and its paper examples. Change a Space variable and restart the
Space to expand or reduce the downloaded Head set.

## Hardware and cache

`l40sx1` is the conservative target for the current full-precision runtime.
Smaller 24 GB instances can be tested later, but should not be the public
default until every published route is verified without an out-of-memory error.

The selected `WSM_v1.wsm` byte ranges are materialized under
`/data/wsm_model_cache`. Without an attached volume the cache is ephemeral and
will be rebuilt after a cold restart. Persistent storage mounted under `/data`
shortens subsequent starts.

## Export the standalone Space repository

From the ControlWorld checkout:

```bash
python deploy/huggingface_space/export_space.py \
  --output /tmp/wsm-controlworld-space
```

The exporter copies only Git-tracked public source files from ControlWorld,
WSMs, and WSG Reader. Flattening the repositories makes the Space build
independent of Git submodule initialization. Local checkpoints, training logs,
caches, outputs, environments, debug files, and Git metadata are excluded.

Run a structural test without downloading weights:

```bash
cd /tmp/wsm-controlworld-space
WSM_SPACE_SKIP_DOWNLOAD=1 python start_space.py --prepare-only
```

The exported directory can later be initialized as a Git repository and pushed
to a Hugging Face Docker Space. Every push rebuilds and restarts it.
