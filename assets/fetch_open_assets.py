"""
Minimal helper script to fetch a small set of public CC0 / permissively licensed
assets (HDRIs, textures, models) into the local `assets/` tree.

This is intended as a seed for Omniverse / USD-based ad environments:
- Studio HDRIs and simple indoor HDRIs for lighting
- A few PBR texture sets for backgrounds / surfaces

Sources (as of 2024):
- Poly Haven (https://polyhaven.com) – CC0 assets

The URLs are hard-coded and may occasionally change; if a download 404s,
check the asset's page on Poly Haven and update the URL.
"""

from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from typing import Dict, Iterable, Tuple

import requests

ROOT = Path(__file__).resolve().parent


# (relative_path, url)
HDRI_ASSETS: Iterable[Tuple[str, str]] = [
    # Studio-style lighting, good for product ads
    (
        "hdris/studio_small_08_2k.exr",
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/studio_small_08_2k.exr",
    ),
    (
        "hdris/studio_small_09_2k.exr",
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/studio_small_09_2k.exr",
    ),
    # Simple indoor space
    (
        "hdris/empty_warehouse_01_2k.exr",
        "https://dl.polyhaven.org/file/ph-assets/HDRIs/exr/empty_warehouse_01_2k.exr",
    ),
]

TEXTURE_ASSETS: Iterable[Tuple[str, str]] = [
    # Useful generic surfaces for backgrounds / props
    (
        "textures/concrete_floor_01_2k.zip",
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/concrete_floor_01_2k.zip",
    ),
    (
        "textures/painted_plaster_01_2k.zip",
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/painted_plaster_01_2k.zip",
    ),
    (
        "textures/paper_packaging_01_2k.zip",
        "https://dl.polyhaven.org/file/ph-assets/Textures/jpg/2k/paper_bag_01_2k.zip",
    ),
]


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def download_file(rel_path: str, url: str, timeout: int = 60) -> None:
    dest = ROOT / rel_path
    dest.parent.mkdir(parents=True, exist_ok=True)

    if dest.exists():
        print(f"[skip] {rel_path} already exists")
        return

    print(f"[get ] {url}")
    resp = requests.get(url, stream=True, timeout=timeout)
    resp.raise_for_status()

    tmp = dest.with_suffix(dest.suffix + ".part")
    with tmp.open("wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 256):
            if chunk:
                f.write(chunk)

    tmp.rename(dest)
    print(f"[done] {rel_path} ({dest.stat().st_size / 1_048_576:.1f} MB)")


def main(args: Iterable[str]) -> int:
    groups: Dict[str, Iterable[Tuple[str, str]]] = {
        "hdris": HDRI_ASSETS,
        "textures": TEXTURE_ASSETS,
        "all": list(HDRI_ASSETS) + list(TEXTURE_ASSETS),
    }

    target = "all" if not args else args[0]
    if target not in groups:
        print(f"Unknown target '{target}'. Choose from: {', '.join(groups.keys())}")
        return 1

    for rel_path, url in groups[target]:
        try:
            download_file(rel_path, url)
        except Exception as e:  # noqa: BLE001
            print(f"[err ] Failed to download {url}: {e}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))


