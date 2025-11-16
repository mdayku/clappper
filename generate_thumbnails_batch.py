"""
Generate thumbnails for all assets in the catalog - OVERNIGHT BATCH JOB
Run this script INSIDE Omniverse Kit's Script Editor.

IMPORTANT NOTES:
- This will take 4-8 hours for 3,092 assets
- Progress is saved every 50 assets (resumable if interrupted)
- Thumbnails saved to Z:/omniverse_assets/asset_catalog/thumbnails/
- Keep Kit window open and don't interact with it while running

BEFORE RUNNING:
1. Make sure you have a clean viewport (close any open scenes)
2. Save any unsaved work
3. Run this script and walk away!
"""

import json
import time
from pathlib import Path
from pxr import Usd, UsdGeom, Gf
import omni.kit.viewport.utility as vp_util
import omni.usd

# ============================================================================
# CONFIGURATION
# ============================================================================
CATALOG_PATH = "Z:/omniverse_assets/asset_catalog/master_index.json"
THUMBNAIL_DIR = "Z:/omniverse_assets/asset_catalog/thumbnails"
PROGRESS_FILE = "Z:/omniverse_assets/asset_catalog/thumbnail_progress.json"

print("="*80)
print("THUMBNAIL GENERATOR - Overnight Batch Processing")
print("="*80)
print("⚠️  WARNING: This will take 4-8 hours!")
print("⚠️  Keep Kit open and don't interact with it")
print("⚠️  Progress saved every 50 assets (resumable)")
print("="*80)

# ============================================================================
# LOAD CATALOG
# ============================================================================
print(f"\nLoading catalog from: {CATALOG_PATH}")

try:
    with open(CATALOG_PATH, 'r') as f:
        catalog = json.load(f)
except Exception as e:
    print(f"ERROR: Could not load catalog: {e}")
    raise

total_assets = len(catalog['assets'])
print(f"✓ Loaded {total_assets} assets")

# ============================================================================
# LOAD PROGRESS (if resuming)
# ============================================================================
processed_assets = set()
progress_path = Path(PROGRESS_FILE)

if progress_path.exists():
    try:
        with open(PROGRESS_FILE, 'r') as f:
            progress = json.load(f)
            processed_assets = set(progress.get('processed', []))
        print(f"✓ Resuming: {len(processed_assets)} assets already processed")
    except:
        print("⚠️  Could not load progress file, starting fresh")
else:
    print("✓ Starting fresh - no previous progress found")

# Create thumbnail directory
Path(THUMBNAIL_DIR).mkdir(parents=True, exist_ok=True)
print(f"✓ Thumbnail directory: {THUMBNAIL_DIR}")

# ============================================================================
# GET VIEWPORT AND STAGE CONTEXT
# ============================================================================
viewport_api = vp_util.get_active_viewport()
if not viewport_api:
    print("ERROR: No active viewport found!")
    raise RuntimeError("No viewport available")

usd_context = omni.usd.get_context()
print("✓ Viewport and USD context ready")

# ============================================================================
# THUMBNAIL GENERATION LOOP
# ============================================================================
print("\n" + "="*80)
print("STARTING THUMBNAIL GENERATION")
print("="*80)

start_time = time.time()
success_count = 0
error_count = 0
skipped_count = len(processed_assets)

for idx, asset in enumerate(catalog['assets'], 1):
    asset_id = asset['asset_id']
    
    # Skip if already processed
    if asset_id in processed_assets:
        continue
    
    # Progress update every 10 assets
    if idx % 10 == 0:
        elapsed = time.time() - start_time
        processed_so_far = idx - skipped_count
        rate = processed_so_far / elapsed if elapsed > 0 else 0
        remaining = total_assets - idx
        eta_seconds = remaining / rate if rate > 0 else 0
        eta_hours = eta_seconds / 3600
        
        print(f"\n{'='*60}")
        print(f"Progress: [{idx}/{total_assets}] {(idx/total_assets)*100:.1f}%")
        print(f"Success: {success_count} | Errors: {error_count} | Skipped: {skipped_count}")
        print(f"Rate: {rate:.2f} assets/sec | ETA: {eta_hours:.2f} hours")
        print(f"{'='*60}")
    
    # Get asset path
    s3_path = asset['s3_path']
    usd_path = s3_path.replace('s3://clappper-assets/', 'Z:/')
    
    # Find the actual USD file
    usd_file = None
    path_obj = Path(usd_path)
    
    if path_obj.is_file() and str(path_obj).endswith(('.usd', '.usda', '.usdc')):
        usd_file = str(path_obj)
    elif path_obj.is_dir():
        # Look for main USD file in directory
        for ext in ['.usd', '.usda', '.usdc']:
            candidates = list(path_obj.glob(f'*{ext}'))
            if candidates:
                usd_file = str(candidates[0])
                break
    
    if not usd_file or not Path(usd_file).exists():
        print(f"[{idx}] SKIP: No USD file - {asset['name']}")
        error_count += 1
        processed_assets.add(asset_id)
        continue
    
    try:
        # Open the asset in Kit
        success = usd_context.open_stage(usd_file)
        if not success:
            print(f"[{idx}] ERROR: Could not open - {asset['name']}")
            error_count += 1
            processed_assets.add(asset_id)
            continue
        
        # Wait for stage to load
        time.sleep(0.5)
        
        # Frame the asset in viewport (press F programmatically)
        viewport_api.frame_viewport()
        
        # Wait for framing
        time.sleep(0.3)
        
        # Generate thumbnail filename
        thumbnail_filename = f"{asset_id}.png"
        thumbnail_path = str(Path(THUMBNAIL_DIR) / thumbnail_filename)
        
        # Capture screenshot
        viewport_api.capture_viewport_to_file(thumbnail_path)
        
        # Wait for capture to complete
        time.sleep(0.3)
        
        # Verify thumbnail was created
        if Path(thumbnail_path).exists():
            # Update asset catalog entry
            asset['thumbnail_s3'] = f"s3://clappper-assets/omniverse_assets/asset_catalog/thumbnails/{thumbnail_filename}"
            success_count += 1
            if idx % 10 != 0:  # Don't double-print on progress updates
                print(f"[{idx}] ✓ {asset['name']}")
        else:
            print(f"[{idx}] ERROR: Thumbnail not created - {asset['name']}")
            error_count += 1
        
    except Exception as e:
        print(f"[{idx}] ERROR: {asset['name']} - {str(e)}")
        error_count += 1
    
    finally:
        # Mark as processed
        processed_assets.add(asset_id)
        
        # Save progress every 50 assets
        if len(processed_assets) % 50 == 0:
            try:
                with open(PROGRESS_FILE, 'w') as f:
                    json.dump({
                        'processed': list(processed_assets),
                        'success_count': success_count,
                        'error_count': error_count,
                        'last_updated': time.time()
                    }, f, indent=2)
                print(f"  💾 Progress saved ({len(processed_assets)} assets)")
            except Exception as e:
                print(f"  ⚠️  Could not save progress: {e}")

# ============================================================================
# SAVE FINAL RESULTS
# ============================================================================
total_time_hours = (time.time() - start_time) / 3600

print("\n" + "="*80)
print("🎉 THUMBNAIL GENERATION COMPLETE!")
print("="*80)
print(f"Total processed: {len(processed_assets)}")
print(f"✓ Successful: {success_count}")
print(f"✗ Errors: {error_count}")
print(f"⏱️  Total time: {total_time_hours:.2f} hours")
print(f"📊 Rate: {success_count / total_time_hours:.1f} assets/hour")

# Save updated catalog
try:
    with open(CATALOG_PATH, 'w') as f:
        json.dump(catalog, f, indent=2)
    print(f"\n✓ Updated catalog saved to: {CATALOG_PATH}")
except Exception as e:
    print(f"\n✗ ERROR saving catalog: {e}")

# Save final progress
try:
    with open(PROGRESS_FILE, 'w') as f:
        json.dump({
            'processed': list(processed_assets),
            'completed': True,
            'success_count': success_count,
            'error_count': error_count,
            'total_time_hours': total_time_hours,
            'completion_time': time.time()
        }, f, indent=2)
    print(f"✓ Progress saved to: {PROGRESS_FILE}")
except Exception as e:
    print(f"✗ ERROR saving progress: {e}")

print("\n" + "="*80)
print("NEXT STEPS:")
print("="*80)
print("1. Sync thumbnails to S3:")
print("   aws s3 sync Z:/omniverse_assets/asset_catalog/thumbnails/ \\")
print("     s3://clappper-assets/omniverse_assets/asset_catalog/thumbnails/")
print("\n2. Review errors (if any) in thumbnail_progress.json")
print("\n3. Optional: Generate visual embeddings from thumbnails")
print("="*80)
