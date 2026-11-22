#!/usr/bin/env python3
"""Download the selected public WSM release and start ControlWorld."""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from typing import Iterable

SPACE_ROOT = Path(__file__).resolve().parent
WSM_PLUGIN_ROOT = SPACE_ROOT / "plugins" / "WSMs"
WSM_ROOT = WSM_PLUGIN_ROOT / "WSM_v1"
if str(WSM_PLUGIN_ROOT / "src") not in sys.path:
    sys.path.insert(0, str(WSM_PLUGIN_ROOT / "src"))
DEMO_MANIFEST = WSM_ROOT / "webui" / "demo_assets" / "manifest.json"
MODEL_REPO = os.getenv("WSM_SPACE_MODEL_REPO", "World-Snapshot/WSM_v1")
FAMILY_ROOTS = {
    "dense": "train_log",
    "sparse": "train_log_sparse",
    "custom": "train_log_custom",
}
HEAD_RE = re.compile(r"^(dense|sparse|custom):(?:Channel_Head_)?(\d{1,6})$")


def _truthy(name: str, default: bool = False) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() not in {"", "0", "false", "no", "off"}


def _qualified_head(value: str) -> str:
    match = HEAD_RE.fullmatch(value.strip())
    if match is None:
        raise ValueError(
            f"Invalid Head ID {value!r}; use a qualified ID such as dense:000270"
        )
    return f"{match.group(1)}:{int(match.group(2)):06d}"


def _configured_tasks() -> dict[str, str]:
    tasks: dict[str, str] = {}
    dense_path = WSM_ROOT / "configs" / "wsm_v1_recommended_dense_channel_heads.json"
    dense = json.loads(dense_path.read_text(encoding="utf-8"))
    for entry in dense.get("entries", []):
        candidate = dict((entry.get("recommended") or {}).get("candidate") or {})
        checkpoint = str(candidate.get("checkpoint") or "").strip()
        if checkpoint:
            tasks[f"dense:{int(entry['head_index']):06d}"] = checkpoint

    for family, filename in (
        ("sparse", "wsg_v1_modalities_sparse.json"),
        ("custom", "wsg_v1_modalities_custom.json"),
    ):
        payload = json.loads((WSM_ROOT / "configs" / filename).read_text(encoding="utf-8"))
        for name, entry in (payload.get("wsg_v1") or {}).items():
            checkpoint = str(entry.get("recommended_checkpoint") or "").strip()
            if checkpoint and name.startswith("Channel_Head_"):
                tasks[f"{family}:{int(name.rsplit('_', 1)[-1]):06d}"] = checkpoint
    return tasks


def _paper_demo_heads() -> set[str]:
    payload = json.loads(DEMO_MANIFEST.read_text(encoding="utf-8"))
    return {
        f"{record.get('source') or 'dense'}:{int(record['head_index']):06d}"
        for record in payload.get("records", [])
    }


def _requested_heads(available: Iterable[str]) -> list[str]:
    available_set = set(available)
    profile = os.getenv("WSM_SPACE_PROFILE", "paper-demo").strip().lower()
    explicit = {
        _qualified_head(value)
        for value in os.getenv("WSM_SPACE_HEADS", "").split(",")
        if value.strip()
    }
    if profile == "paper-demo":
        requested = _paper_demo_heads()
    elif profile == "selected":
        if not explicit:
            raise ValueError("WSM_SPACE_PROFILE=selected requires WSM_SPACE_HEADS")
        requested = explicit
    elif profile == "all":
        requested = available_set
    else:
        raise ValueError("WSM_SPACE_PROFILE must be paper-demo, selected, or all")
    requested.update(explicit)
    missing = sorted(requested - available_set)
    if missing:
        raise ValueError("No recommended checkpoint is registered for: " + ", ".join(missing))
    return sorted(requested)


def _install_family_links(model_root: Path) -> None:
    for family, folder in FAMILY_ROOTS.items():
        source = model_root / "tunnelingnets" / family
        destination = WSM_ROOT / folder
        if not source.is_dir():
            continue
        if destination.is_symlink():
            if destination.resolve() == source.resolve():
                continue
            destination.unlink()
        elif destination.exists():
            raise RuntimeError(f"Refusing to replace model directory: {destination}")
        destination.symlink_to(source, target_is_directory=True)


def prepare_models() -> dict[str, object]:
    from wsms.container import WSMContainer

    configured = _configured_tasks()
    heads = _requested_heads(configured)
    print(
        f"[WSM Space] Resolving {len(heads)} TunnelingNet(s) from {MODEL_REPO}",
        flush=True,
    )
    token = os.getenv("HF_TOKEN") or None
    container = WSMContainer.open(MODEL_REPO, token=token)
    entries = {head: container.task_entry(head) for head in heads}
    backbone = dict(container.model.get("backbone", {}))
    names = list(backbone.get("artifacts", []))
    for entry in entries.values():
        names.extend(entry.get("artifacts", []))
    cache = Path(os.getenv("WSM_MODEL_CACHE", "/data/wsm_model_cache"))
    model_root = container.materialize(dict.fromkeys(names), cache)
    base_path = model_root / str(backbone.get("root", "backbone"))
    _install_family_links(model_root)

    # The local WebUI catalog remains backward compatible with historical
    # checkpoint paths. The aliases point into the selected byte-range view;
    # no second copy of a TunnelingNet is created.
    for head, entry in entries.items():
        actual = model_root / str(entry["checkpoint"])
        expected = WSM_ROOT / configured[head]
        expected.parent.mkdir(parents=True, exist_ok=True)
        if expected != actual and not expected.exists():
            expected.symlink_to(actual)
    os.environ["WSM_FLUX2_MODEL_PATH"] = str(base_path)
    os.environ["WSM_MODEL_SOURCE"] = MODEL_REPO
    os.environ["WSM_MODEL_CACHE"] = str(cache)
    return {
        "model_repo": MODEL_REPO,
        "head_count": len(heads),
        "single_file": True,
        "model_cache": str(model_root),
        "base_model": str(base_path),
    }


def validate_layout() -> None:
    required = (
        SPACE_ROOT / "start_modern.py",
        SPACE_ROOT / "controlworld_index.html",
        SPACE_ROOT / "plugins" / "plugin-loader.js",
        WSM_ROOT / "webui" / "index.js",
        WSM_ROOT / "webui" / "viser_backend.py",
        WSM_ROOT / "scripts" / "infer_TunnelingNet_Flux2_4B_wsg.py",
        WSM_ROOT / "wsg_reader" / "pipeline07_read_normals_from_wsg.py",
    )
    missing = [str(path.relative_to(SPACE_ROOT)) for path in required if not path.is_file()]
    if missing:
        raise FileNotFoundError("Incomplete Space bundle; missing: " + ", ".join(missing))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()

    os.chdir(SPACE_ROOT)
    validate_layout()
    os.environ.setdefault("WSM_WEBUI_PYTHON", sys.executable)
    os.environ.setdefault("WSM_WEBUI_GPU", "0")
    os.environ.setdefault("WSM_WEBUI_TIMEOUT", "1800")

    if _truthy("WSM_SPACE_SKIP_DOWNLOAD"):
        summary: dict[str, object] = {"download_skipped": True}
        print("[WSM Space] Model download skipped", flush=True)
    else:
        summary = prepare_models()
    print("[WSM Space] Ready: " + json.dumps(summary, sort_keys=True), flush=True)
    if args.prepare_only:
        return

    port = int(os.getenv("PORT", "7860"))
    viser_port = int(os.getenv("WSM_SPACE_VISER_PORT", "7861"))
    command = [
        sys.executable,
        str(SPACE_ROOT / "start_modern.py"),
        "--frontend-port", str(port),
        "--viser-port", str(viser_port),
        "--no-browser",
    ]
    print(f"[WSM Space] Starting ControlWorld on 0.0.0.0:{port}", flush=True)
    raise SystemExit(subprocess.call(command, cwd=SPACE_ROOT, env=os.environ.copy()))


if __name__ == "__main__":
    main()
