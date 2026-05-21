from pathlib import Path
import shutil


KEEP_NAMES = {".env", ".env.example"}


def main() -> None:
    repo_root = Path(__file__).resolve().parent
    kitty_dir = repo_root / ".kitty"
    if not kitty_dir.exists():
        print("No .kitty directory found.")
        return
    if not kitty_dir.is_dir():
        raise RuntimeError(f"{kitty_dir} is not a directory.")

    deleted = 0
    for item in kitty_dir.iterdir():
        if item.name in KEEP_NAMES:
            continue
        resolved = item.resolve()
        if kitty_dir.resolve() not in resolved.parents:
            raise RuntimeError(f"Refusing to delete outside .kitty: {resolved}")
        if item.is_dir():
            shutil.rmtree(item)
        else:
            item.unlink()
        deleted += 1

    print(f"Cleaned .kitty state. Deleted {deleted} item(s). Kept: .env, .env.example.")


if __name__ == "__main__":
    main()
