#!/usr/bin/env python3
from __future__ import annotations

import argparse
import shutil
from pathlib import Path


PRESERVED_FILES = {".env", ".env.example"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Clean project-local .kitty runtime state while preserving .env and .env.example."
    )
    parser.add_argument(
        "--root",
        default=".",
        help="Project root that contains .kitty. Defaults to the current working directory.",
    )
    return parser.parse_args()


def remove_path(path: Path) -> None:
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
        return
    path.unlink()


def clean_kitty(root: Path) -> list[Path]:
    kitty_dir = root / ".kitty"
    if not kitty_dir.exists():
        return []
    if not kitty_dir.is_dir():
        raise RuntimeError(f"{kitty_dir} is not a directory.")

    removed: list[Path] = []
    for entry in kitty_dir.iterdir():
        if entry.is_file() and entry.name in PRESERVED_FILES:
            continue
        remove_path(entry)
        removed.append(entry)
    return removed


def main() -> int:
    args = parse_args()
    root = Path(args.root).expanduser().resolve()
    removed = clean_kitty(root)
    print(f"清理完成：{root / '.kitty'}")
    print("保留：.env, .env.example")
    print(f"删除：{len(removed)} 项")
    for path in removed:
        print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
