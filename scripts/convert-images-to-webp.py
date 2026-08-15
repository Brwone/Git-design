#!/usr/bin/env python3
"""Convert jpg/jpeg/png under assets/ to WebP and rewrite HTML/CSS/JS refs."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
TEXT_GLOBS = ("*.html", "*.css", "*.js")
IMAGE_EXTS = {".jpg", ".jpeg", ".png"}
QUALITY = 92
MAX_EDGE = 2560


def restore_deleted_sources() -> int:
    """Restore deleted tracked image sources from git so we can re-encode losslessly."""
    result = subprocess.run(
        ["git", "ls-files", "-d"],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    paths = [
        p
        for p in result.stdout.splitlines()
        if p.startswith("assets/") and Path(p).suffix.lower() in IMAGE_EXTS
    ]
    if not paths:
        return 0
    subprocess.run(["git", "checkout", "HEAD", "--", *paths], cwd=ROOT, check=True)
    return len(paths)


def convert_one(src: Path, *, force: bool = False) -> tuple[Path, int, int] | None:
    dest = src.with_suffix(".webp")
    if (
        not force
        and dest.exists()
        and dest.stat().st_mtime >= src.stat().st_mtime
    ):
        return None

    with Image.open(src) as im:
        icc = im.info.get("icc_profile")
        if im.mode in ("P", "LA"):
            im = im.convert("RGBA")
        elif im.mode == "CMYK":
            im = im.convert("RGB")
        elif im.mode not in ("RGB", "RGBA"):
            im = im.convert("RGB")

        w, h = im.size
        long_edge = max(w, h)
        if long_edge > MAX_EDGE:
            scale = MAX_EDGE / long_edge
            im = im.resize(
                (max(1, int(w * scale)), max(1, int(h * scale))),
                Image.Resampling.LANCZOS,
            )

        save_kwargs: dict = {"quality": QUALITY, "method": 6}
        if im.mode == "RGBA":
            save_kwargs["exact"] = True
        if icc:
            save_kwargs["icc_profile"] = icc

        im.save(dest, "WEBP", **save_kwargs)

    return dest, src.stat().st_size, dest.stat().st_size


def rewrite_text(content: str) -> str:
    """Rewrite image extensions only in URL/path contexts (src, href, poster, url())."""

    def swap_ext(m: re.Match[str]) -> str:
        return f"{m.group(1)}.webp{m.group(3) or ''}{m.group(4)}"

    content = re.sub(
        r'((?:src|href|poster)\s*=\s*["\'][^"\']*?)\.(jpg|jpeg|png)(\?[^"\']*)?(["\'])',
        swap_ext,
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'(url\(\s*["\']?[^)"\']*?)\.(jpg|jpeg|png)(\?[^)"\']*)?(["\']?\s*\))',
        swap_ext,
        content,
        flags=re.IGNORECASE,
    )
    content = re.sub(
        r'(["\'](?:\.\./)*(?:assets/)[^"\']*?)\.(jpg|jpeg|png)(\?[^"\']*)?(["\'])',
        swap_ext,
        content,
        flags=re.IGNORECASE,
    )
    return content


def main() -> int:
    restore = "--no-restore" not in sys.argv
    force = "--force" in sys.argv or restore

    restored = restore_deleted_sources() if restore else 0
    if restored:
        print(f"Restored {restored} deleted source images from git")

    images = sorted(
        p
        for p in ASSETS.rglob("*")
        if p.is_file() and p.suffix.lower() in IMAGE_EXTS and "node_modules" not in p.parts
    )
    print(f"Found {len(images)} source images to convert (lossless WebP, no resize)")

    converted = 0
    skipped = 0
    failed: list[str] = []
    before = 0
    after = 0

    for src in images:
        try:
            result = convert_one(src, force=force)
            if result is None:
                skipped += 1
                continue
            dest, b, a = result
            before += b
            after += a
            converted += 1
            src.unlink()
            rel = dest.relative_to(ROOT)
            print(f"OK  {rel}  {b/1024:.0f}KB -> {a/1024:.0f}KB")
        except Exception as e:  # noqa: BLE001
            failed.append(f"{src}: {e}")
            print(f"FAIL {src.relative_to(ROOT)}: {e}", file=sys.stderr)

    files_touched = 0
    skip_names = {"convert-images-to-webp.py", "deploy-tencent-cos.js"}
    for pattern in TEXT_GLOBS:
        for path in ROOT.rglob(pattern):
            if any(x in path.parts for x in (".venv-webp", "node_modules", ".git")):
                continue
            if path.name in skip_names:
                continue
            text = path.read_text(encoding="utf-8")
            new = rewrite_text(text)
            if new != text:
                path.write_text(new, encoding="utf-8")
                files_touched += 1
                print(f"REWRITE {path.relative_to(ROOT)}")

    print("\n=== Summary ===")
    print(f"Restored from git: {restored}")
    print(f"Converted: {converted}  Failed: {len(failed)}  Skipped: {skipped}")
    if converted:
        print(f"Size: {before/1024/1024:.1f}MB -> {after/1024/1024:.1f}MB")
    print(f"Files rewritten: {files_touched}")
    if failed:
        print("Failures:")
        for f in failed:
            print(" ", f)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
