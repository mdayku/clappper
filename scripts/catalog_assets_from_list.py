r"""
Asset Catalog Generator - Optimized for S3 with Pre-generated File List

This version reads from a pre-generated file list instead of scanning directories.
Much faster for S3-mounted drives!

Usage:
    1. Generate file list with AWS CLI:
       aws s3 ls s3://clappper-assets/omniverse_assets/packs/ --recursive > usd_files_raw.txt
       Get-Content usd_files_raw.txt | Select-String "\.(usd|usda|usdc|usdz)$" | Out-File usd_files_list.txt
    
    2. Run this script:
       python catalog_assets_from_list.py usd_files_list.txt Z:\omniverse_assets\packs
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List
import hashlib
import time
import re


def parse_s3_ls_line(line: str) -> str:
    """Parse AWS S3 ls output line to extract file path."""
    # Format: "2024-11-15 12:34:56   12345 path/to/file.usd"
    parts = line.strip().split()
    if len(parts) >= 4:
        # Join everything after the size (index 2) as the path
        return ' '.join(parts[3:])
    return None


def extract_basic_metadata(s3_path: str, local_root: Path) -> Dict:
    """Extract basic file metadata."""
    # Remove "packs/" prefix if present
    relative_path = s3_path.replace("omniverse_assets/packs/", "")
    
    # Get pack name (first directory)
    parts = relative_path.split('/')
    pack_name = parts[0] if parts else "unknown"
    
    # Get filename
    filename = parts[-1] if parts else "unknown"
    name = Path(filename).stem
    
    # Generate asset ID
    asset_id = hashlib.md5(relative_path.encode()).hexdigest()[:12]
    
    # Try to get file size from local mount
    local_path = local_root / relative_path
    file_size_mb = 0
    try:
        if local_path.exists():
            file_size_mb = round(local_path.stat().st_size / (1024 * 1024), 2)
    except:
        pass
    
    return {
        "asset_id": asset_id,
        "name": name,
        "filename": filename,
        "pack": pack_name,
        "relative_path": relative_path.replace('\\', '/'),
        "s3_path": f"s3://clappper-assets/omniverse_assets/packs/{relative_path.replace(chr(92), '/')}",
        "local_path": str(local_path),
        "file_size_mb": file_size_mb,
        "extension": Path(filename).suffix,
    }


def generate_tags(basic_meta: Dict) -> List[str]:
    """Generate searchable tags based on metadata."""
    tags = []
    
    # Pack-based tags
    pack = basic_meta["pack"].lower()
    tags.append(pack)
    
    # Category tags from pack name
    if "warehouse" in pack:
        tags.extend(["warehouse", "industrial", "logistics"])
    if "commercial" in pack:
        tags.extend(["commercial", "retail", "store"])
    if "residential" in pack:
        tags.extend(["residential", "home", "interior"])
    if "character" in pack:
        tags.extend(["character", "human", "avatar"])
    if "furniture" in pack:
        tags.extend(["furniture", "prop"])
    if "material" in pack:
        tags.extend(["material", "shader"])
    if "environment" in pack:
        tags.extend(["environment", "outdoor", "landscape"])
    
    # Name-based tags
    name = basic_meta["name"].lower()
    if "forklift" in name:
        tags.append("forklift")
    if "shelf" in name or "rack" in name:
        tags.append("shelving")
    if "door" in name:
        tags.append("door")
    if "window" in name:
        tags.append("window")
    if "table" in name:
        tags.append("table")
    if "chair" in name:
        tags.append("chair")
    
    return list(set(tags))  # Remove duplicates


def main():
    if len(sys.argv) < 3:
        print("Usage: python catalog_assets_from_list.py <file_list.txt> <local_root_path>")
        print("Example: python catalog_assets_from_list.py usd_files_list.txt Z:\\omniverse_assets\\packs")
        sys.exit(1)
    
    file_list_path = sys.argv[1]
    local_root = Path(sys.argv[2])
    output_path = Path("C:\\Users\\Administrator\\Documents\\clappper-assets\\asset_catalog")
    
    # Create output directories
    individual_output = output_path / "individual"
    individual_output.mkdir(parents=True, exist_ok=True)
    
    print("=" * 60)
    print("Asset Catalog Generator (Optimized for S3)")
    print("=" * 60)
    
    # Read file list
    print(f"\nReading file list from {file_list_path}...")
    
    # Try different encodings (PowerShell uses UTF-16)
    for encoding in ['utf-16', 'utf-8', 'latin-1']:
        try:
            with open(file_list_path, 'r', encoding=encoding) as f:
                lines = f.readlines()
            print(f"Successfully read file with {encoding} encoding")
            break
        except (UnicodeDecodeError, UnicodeError):
            continue
    else:
        print("Error: Could not read file with any encoding")
        sys.exit(1)
    
    # Parse S3 paths
    s3_paths = []
    for line in lines:
        path = parse_s3_ls_line(line)
        if path:
            s3_paths.append(path)
    
    print(f"Found {len(s3_paths)} USD files to process")
    
    # Process each asset
    print("\nProcessing assets...")
    print("-" * 60)
    
    master_catalog = []
    start_time = time.time()
    
    for i, s3_path in enumerate(s3_paths, 1):
        try:
            # Progress with ETA
            elapsed = time.time() - start_time
            if i > 1:
                avg_time = elapsed / (i - 1)
                remaining = (len(s3_paths) - i) * avg_time
                eta_mins = int(remaining / 60)
                eta_secs = int(remaining % 60)
                print(f"[{i}/{len(s3_paths)}] ETA: {eta_mins}m {eta_secs}s | Processing...", flush=True)
            else:
                print(f"[{i}/{len(s3_paths)}] Processing...", flush=True)
            
            # Extract metadata
            basic_meta = extract_basic_metadata(s3_path, local_root)
            tags = generate_tags(basic_meta)
            
            asset_data = {
                **basic_meta,
                "tags": tags,
                "usd_metadata": {},
                "thumbnail_path": None,
                "thumbnail_s3": None,
                "embedding_path": None,
                "embedding_s3": None,
                "has_visual_embedding": False,
            }
            
            # Save individual JSON
            pack_dir = individual_output / asset_data["pack"]
            pack_dir.mkdir(parents=True, exist_ok=True)
            json_path = pack_dir / f"{asset_data['name']}.json"
            
            with open(json_path, 'w', encoding='utf-8') as f:
                json.dump(asset_data, f, indent=2)
            
            # Add to master catalog
            master_catalog.append({
                "asset_id": asset_data["asset_id"],
                "name": asset_data["name"],
                "pack": asset_data["pack"],
                "s3_path": asset_data["s3_path"],
                "tags": asset_data["tags"],
                "file_size_mb": asset_data["file_size_mb"],
                "thumbnail_s3": None,
                "embedding_s3": None,
                "has_visual_embedding": False,
            })
            
        except Exception as e:
            print(f"Error processing {s3_path}: {e}")
    
    # Save master index
    print("\n" + "-" * 60)
    master_index_path = output_path / "master_index.json"
    print(f"Saving master index to {master_index_path}")
    
    with open(master_index_path, 'w', encoding='utf-8') as f:
        json.dump({
            "total_assets": len(master_catalog),
            "assets": master_catalog
        }, f, indent=2)
    
    print(f"Master index saved: {len(master_catalog)} assets")
    
    # Print summary
    total_time = time.time() - start_time
    print("\n" + "=" * 60)
    print("Catalog Generation Complete!")
    print("=" * 60)
    print(f"Total assets cataloged: {len(master_catalog)}")
    print(f"Total time: {int(total_time / 60)}m {int(total_time % 60)}s")
    print(f"Output directory: {output_path}")
    print(f"Master index: {master_index_path}")
    
    print("\n" + "=" * 60)
    print("Next steps:")
    print("=" * 60)
    print("1. Review the master_index.json file")
    print("2. Sync to S3:")
    print("   aws s3 sync asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/")
    print("3. Use master_index.json for LLM asset querying")


if __name__ == "__main__":
    main()

