#!/usr/bin/env python3
"""Recompress WebP images under assets/ for smaller file size while preserving color."""

from __future__ import annotations

import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
QUALITY = 92
MAX_EDGE = 2560


def compress_one(path: Path) -> tuple[int, int] | None:
    before = path.stat().st_size
    with Image.open(path) as im:
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

        with tempfile.NamedTemporaryFile(suffix=".webp", delete=False, dir=path.parent) as tmp:
            tmp_path = Path(tmp.name)
        try:
            im.save(tmp_path, "WEBP", **save_kwargs)
            after = tmp_path.stat().st_size
            if after >= before:
                tmp_path.unlink(missing_ok=True)
                return None
            tmp_path.replace(path)
            return before, after
        except Exception:
            tmp_path.unlink(missing_ok=True)
            raise


def main() -> int:
    files = sorted(
        p
        for p in ASSETS.rglob("*.webp")
        if p.is_file() and "node_modules" not in p.parts
    )
    print(f"Found {len(files)} WebP files (quality={QUALITY}, max_edge={MAX_EDGE})")

    saved = 0
    skipped = 0
    failed: list[str] = []
    before_total = 0
    after_total = 0

    for path in files:
        try:
            result = compress_one(path)
            if result is None:
                skipped += 1
                continue
            b, a = result
            before_total += b
            after_total += a
            saved += 1
            rel = path.relative_to(ROOT)
            print(f"OK  {rel}  {b/1024:.0f}KB -> {a/1024:.0f}KB")
        except Exception as e:  # noqa: BLE001
            failed.append(f"{path}: {e}")
            print(f"FAIL {path.relative_to(ROOT)}: {e}", file=sys.stderr)

    print("\n=== Summary ===")
    print(f"Compressed: {saved}  Skipped: {skipped}  Failed: {len(failed)}")
    if saved:
        print(f"Saved: {(before_total - after_total)/1024/1024:.1f}MB ({before_total/1024/1024:.1f}MB -> {after_total/1024/1024:.1f}MB)")
    if failed:
        for f in failed:
            print(" ", f)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
