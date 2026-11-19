#!/usr/bin/env python3
"""Export a standalone, source-only ControlWorld Hugging Face Space bundle."""

from __future__ import annotations

import argparse
from pathlib import Path
import shutil
import subprocess


TEMPLATE_ROOT = Path(__file__).resolve().parent
CONTROLWORLD_ROOT = TEMPLATE_ROOT.parents[1]
DEFAULT_WSMS_ROOT = CONTROLWORLD_ROOT / "plugins" / "WSMs"
DEFAULT_WSG_READER_ROOT = CONTROLWORLD_ROOT / "wsg_reader"
TEMPLATE_FILES = ("README.md", "Dockerfile", ".dockerignore", "start_space.py")


def _tracked_files(repo: Path) -> list[Path]:
    output = subprocess.check_output(["git", "-C", str(repo), "ls-files", "-z"])
    return [Path(value.decode("utf-8")) for value in output.split(b"\0") if value]


def _copy_tracked(
    repo: Path,
    destination: Path,
    *,
    excluded_prefixes: tuple[str, ...] = (),
) -> int:
    copied = 0
    for relative in _tracked_files(repo):
        posix = relative.as_posix()
        if posix == ".gitmodules" or any(
            posix == prefix or posix.startswith(prefix + "/")
            for prefix in excluded_prefixes
        ):
            continue
        source = repo / relative
        # Gitlinks are directories and are copied explicitly from their repos.
        if not source.is_file() and not source.is_symlink():
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if source.is_symlink():
            resolved = source.resolve()
            if not resolved.is_file():
                continue
            shutil.copy2(resolved, target)
        else:
            shutil.copy2(source, target)
        copied += 1
    return copied


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--wsms-root", type=Path, default=DEFAULT_WSMS_ROOT)
    parser.add_argument("--wsg-reader-root", type=Path, default=None)
    args = parser.parse_args()

    destination = args.output.expanduser().resolve()
    if destination.exists() and any(destination.iterdir()):
        raise FileExistsError(f"Output directory is not empty: {destination}")
    destination.mkdir(parents=True, exist_ok=True)
    wsms_root = args.wsms_root.expanduser().resolve()
    reader_root = (
        args.wsg_reader_root.expanduser().resolve()
        if args.wsg_reader_root is not None
        else DEFAULT_WSG_READER_ROOT.resolve()
    )

    host_count = _copy_tracked(
        CONTROLWORLD_ROOT,
        destination,
        excluded_prefixes=(
            "deploy/huggingface_space", "env", "plugins/WSMs", "wsg_reader",
        ),
    )
    wsms_destination = destination / "plugins" / "WSMs"
    wsms_count = _copy_tracked(
        wsms_root,
        wsms_destination,
        excluded_prefixes=(
            "assets",
            "src/examples",
            "WSM_v1/debug",
            "WSM_v1/env",
            "WSM_v1/manual_processing",
            "WSM_v1/paper",
            "WSM_v1/wsg_reader",
        ),
    )
    reader_count = _copy_tracked(
        reader_root,
        wsms_destination / "WSM_v1" / "wsg_reader",
    )
    for filename in TEMPLATE_FILES:
        shutil.copy2(TEMPLATE_ROOT / filename, destination / filename)

    print(f"Space bundle: {destination}")
    print(f"ControlWorld tracked files: {host_count}")
    print(f"WSMs tracked files: {wsms_count}")
    print(f"WSG Reader tracked files: {reader_count}")
    print("Weights, logs, caches, outputs, environments, debug, and Git metadata: excluded")


if __name__ == "__main__":
    main()
