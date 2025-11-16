# Asset Catalog Generator with Visual Embeddings

Comprehensive asset cataloging system for Omniverse USD libraries with CLIP-based visual search.

## Features

1. **Metadata Extraction**: Extracts USD metadata (cameras, lights, meshes, animation, bbox, etc.)
2. **Thumbnail Generation**: Renders preview images for each asset (requires Kit runtime)
3. **Visual Embeddings**: Generates CLIP embeddings for semantic visual search
4. **Searchable Index**: Creates master JSON index for LLM querying

## Installation

### On EC2 Windows Instance

```powershell
# 1. Upload scripts to S3 (from local machine)
aws s3 cp scripts/catalog_assets.py s3://clappper-assets/scripts/
aws s3 cp scripts/compile_sequence.py s3://clappper-assets/scripts/
aws s3 cp scripts/requirements_catalog.txt s3://clappper-assets/scripts/

# 2. Download on EC2 instance
aws s3 cp s3://clappper-assets/scripts/catalog_assets.py C:\Users\Administrator\Documents\clappper-assets\scripts\
aws s3 cp s3://clappper-assets/scripts/compile_sequence.py C:\Users\Administrator\Documents\clappper-assets\scripts\
aws s3 cp s3://clappper-assets/scripts/requirements_catalog.txt C:\Users\Administrator\Documents\clappper-assets\scripts\

# 3. Install FFmpeg (for video compilation)
# Download from: https://www.gyan.dev/ffmpeg/builds/
# Extract to C:\ffmpeg\ and add to PATH:
$env:Path += ";C:\ffmpeg\bin"

# 4. Install Python dependencies (if using system Python)
pip install -r C:\Users\Administrator\Documents\clappper-assets\scripts\requirements_catalog.txt
```

## Usage

### Compile Frame Sequences to Video

```powershell
# After Movie Capture exports PNG frames, compile to MP4
python C:\Users\Administrator\Documents\clappper-assets\scripts\compile_sequence.py <frames_dir> output.mp4 --fps 30

# Example:
python scripts\compile_sequence.py renders\warehouse_scene_01 warehouse_scene_01.mp4 --fps 30 --crf 18

# Custom quality (lower CRF = better quality)
python scripts\compile_sequence.py renders\scene output.mp4 --fps 24 --crf 15
```

### Generate Full Catalog (with thumbnails + embeddings)

```powershell
# Using Kit Python (recommended - has USD library)
cd C:\Windows\System32\kit-app-template
.\repo.bat python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py
```

### Generate Catalog (metadata only, skip thumbnails/embeddings)

```powershell
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --no-thumbnails --no-embeddings
```

### Visual Search

```powershell
# Search for assets matching a description
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "modern office desk"
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "industrial forklift"
python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py --search "warehouse shelving"
```

## Output Structure

```
asset_catalog/
├── individual/              # Detailed JSON for each asset
│   ├── warehouse_assets/
│   │   ├── forklift_01.json
│   │   └── shelf_industrial.json
│   └── commercial_assets/
│       └── desk_modern.json
├── thumbnails/              # Preview images
│   ├── abc123def456.png
│   └── xyz789uvw012.png
├── embeddings/              # CLIP embeddings (numpy arrays)
│   ├── abc123def456.npy
│   └── xyz789uvw012.npy
└── master_index.json        # Lightweight catalog for LLM querying
```

## Master Index Format

```json
{
  "total_assets": 45882,
  "assets": [
    {
      "asset_id": "abc123def456",
      "name": "forklift_yellow_v2",
      "pack": "warehouse_assets",
      "s3_path": "s3://clappper-assets/omniverse_assets/packs/warehouse_assets/vehicles/forklift_yellow_v2.usd",
      "tags": ["warehouse", "industrial", "forklift", "vehicle"],
      "file_size_mb": 12.5,
      "thumbnail_s3": "s3://clappper-assets/omniverse_assets/asset_catalog/thumbnails/abc123def456.png",
      "embedding_s3": "s3://clappper-assets/omniverse_assets/asset_catalog/embeddings/abc123def456.npy",
      "has_visual_embedding": true
    }
  ]
}
```

## Sync to S3

```powershell
# After generation, sync catalog to S3
aws s3 sync C:\Users\Administrator\Documents\clappper-assets\asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/
```

## LLM Integration

### Text-Based Search (Tag/Keyword Matching)

```python
import json

# Load catalog
with open("asset_catalog/master_index.json") as f:
    catalog = json.load(f)

# Search by tags
def find_assets_by_tag(tag):
    return [a for a in catalog["assets"] if tag in a["tags"]]

# Example: Find all warehouse assets
warehouse_assets = find_assets_by_tag("warehouse")
```

### Visual Search (Semantic Similarity)

```python
# Use the built-in visual_search function
from catalog_assets import visual_search

results = visual_search(
    query_text="modern office desk",
    catalog_path="asset_catalog/master_index.json",
    top_k=10
)

for result in results:
    print(f"{result['name']}: {result['similarity_score']:.3f}")
```

## LLM-Based USD Scene Generation Workflow

1. **User describes scene**: "Create a warehouse with 3 forklifts and industrial shelving"

2. **LLM queries catalog**:
   ```python
   forklifts = find_assets_by_tag("forklift")
   shelving = find_assets_by_tag("shelving")
   ```

3. **LLM checks availability**:
   - ✅ Found 5 forklift assets
   - ✅ Found 12 shelving assets
   - Confirms all required assets available

4. **LLM generates USD Python script**:
   ```python
   from pxr import Usd, UsdGeom
   
   stage = Usd.Stage.CreateNew("warehouse_scene.usd")
   
   # Load forklift assets
   forklift1 = stage.DefinePrim("/World/Forklift1")
   forklift1.GetReferences().AddReference("Z:/packs/warehouse_assets/vehicles/forklift_yellow_v2.usd")
   # ... position, rotate, etc.
   
   # Load shelving
   shelf1 = stage.DefinePrim("/World/Shelf1")
   shelf1.GetReferences().AddReference("Z:/packs/warehouse_assets/furniture/shelf_industrial_01.usd")
   # ... position, rotate, etc.
   
   # Set camera, lighting, render settings
   # ...
   
   stage.Save()
   ```

5. **User runs script in Kit** → Scene generated automatically

6. **Capture renders** → Video/image sequence exported

## Notes

- **Thumbnail generation** requires Kit runtime environment (viewport + capture APIs)
- **Visual embeddings** require PyTorch + transformers (~2GB download for CLIP model)
- **First run** will be slow (CLIP model download + processing all assets)
- **Subsequent runs** skip already-processed assets (incremental updates)

## Troubleshooting

### "USD Python bindings not available"
- Run with Kit's Python: `.\repo.bat python script.py`
- Or install USD: `pip install usd-core`

### "CLIP not available"
- Install dependencies: `pip install torch transformers pillow numpy`
- Or run with `--no-embeddings` flag

### "Thumbnail generation requires Kit runtime"
- Thumbnails need active viewport - currently a placeholder
- For now, run with `--no-thumbnails` or implement custom viewport capture

