r"""
Asset Catalog Generator with Visual Embeddings for Omniverse USD Library

This script crawls the S3-mounted asset library (Z:\packs\) and generates:
1. Individual JSON metadata files for each USD asset
2. Thumbnail renders for visual search
3. CLIP visual embeddings for semantic search
4. A master catalog index for LLM querying

Usage (on Windows EC2 instance with Kit Python):
    cd C:\Windows\System32\kit-app-template
    .\repo.bat python C:\Users\Administrator\Documents\clappper-assets\scripts\catalog_assets.py

Output:
    - asset_catalog/individual/{pack_name}/{asset_name}.json
    - asset_catalog/thumbnails/{asset_id}.png
    - asset_catalog/embeddings/{asset_id}.npy
    - asset_catalog/master_index.json
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, List, Optional
import hashlib
import time
import base64
import io

# Try to import USD (if available in Kit environment)
try:
    from pxr import Usd, UsdGeom, Sdf, Kind
    USD_AVAILABLE = True
except ImportError:
    print("Warning: USD Python bindings not available. Using basic file metadata only.")
    USD_AVAILABLE = False

# Try to import Omniverse Kit APIs for thumbnail generation
try:
    import omni.kit.app
    import carb
    OMNI_AVAILABLE = True
except ImportError:
    print("Warning: Omniverse Kit APIs not available. Thumbnails will be skipped.")
    OMNI_AVAILABLE = False

# Try to import CLIP for visual embeddings
try:
    import torch
    from PIL import Image
    import numpy as np
    # We'll lazy-load transformers when needed
    CLIP_AVAILABLE = True
except ImportError:
    print("Warning: PyTorch/PIL not available. Visual embeddings will be skipped.")
    CLIP_AVAILABLE = False


class AssetCatalogGenerator:
    def __init__(self, root_path: str, output_path: str, generate_thumbnails: bool = True, generate_embeddings: bool = True):
        self.root_path = Path(root_path)
        self.output_path = Path(output_path)
        self.individual_output = self.output_path / "individual"
        self.thumbnails_output = self.output_path / "thumbnails"
        self.embeddings_output = self.output_path / "embeddings"
        self.master_index_path = self.output_path / "master_index.json"
        
        # Feature flags
        self.generate_thumbnails = generate_thumbnails and OMNI_AVAILABLE
        self.generate_embeddings = generate_embeddings and CLIP_AVAILABLE
        
        # Create output directories
        self.output_path.mkdir(parents=True, exist_ok=True)
        self.individual_output.mkdir(parents=True, exist_ok=True)
        if self.generate_thumbnails:
            self.thumbnails_output.mkdir(parents=True, exist_ok=True)
        if self.generate_embeddings:
            self.embeddings_output.mkdir(parents=True, exist_ok=True)
        
        self.master_catalog = []
        
        # Lazy-load CLIP model
        self.clip_model = None
        self.clip_processor = None
        
    def find_usd_files(self) -> List[Path]:
        """Recursively find all USD files in the root path."""
        usd_extensions = ['.usd', '.usda', '.usdc', '.usdz']
        usd_files = []
        
        print(f"Scanning {self.root_path} for USD files...")
        print("This may take several minutes over S3...")
        
        for ext in usd_extensions:
            print(f"  Searching for *{ext} files...", flush=True)
            found = list(self.root_path.rglob(f'*{ext}'))
            usd_files.extend(found)
            print(f"    Found {len(found)} {ext} files (total so far: {len(usd_files)})", flush=True)
        
        print(f"\nTotal: Found {len(usd_files)} USD files")
        return usd_files
    
    def extract_basic_metadata(self, usd_path: Path) -> Dict:
        """Extract basic file metadata without USD library."""
        relative_path = usd_path.relative_to(self.root_path)
        pack_name = relative_path.parts[0] if relative_path.parts else "unknown"
        
        # Generate a simple ID from the path
        asset_id = hashlib.md5(str(relative_path).encode()).hexdigest()[:12]
        
        return {
            "asset_id": asset_id,
            "name": usd_path.stem,
            "filename": usd_path.name,
            "pack": pack_name,
            "relative_path": str(relative_path).replace('\\', '/'),
            "s3_path": f"s3://clappper-assets/omniverse_assets/packs/{str(relative_path).replace(chr(92), '/')}",
            "local_path": str(usd_path),
            "file_size_mb": round(usd_path.stat().st_size / (1024 * 1024), 2),
            "extension": usd_path.suffix,
        }
    
    def extract_usd_metadata(self, usd_path: Path) -> Optional[Dict]:
        """Extract detailed USD metadata using pxr library."""
        if not USD_AVAILABLE:
            return None
        
        try:
            stage = Usd.Stage.Open(str(usd_path))
            if not stage:
                return None
            
            metadata = {}
            
            # Get stage metadata
            metadata["up_axis"] = UsdGeom.GetStageUpAxis(stage)
            metadata["meters_per_unit"] = UsdGeom.GetStageMetersPerUnit(stage)
            
            # Get time/animation info
            metadata["start_time"] = stage.GetStartTimeCode()
            metadata["end_time"] = stage.GetEndTimeCode()
            metadata["has_animation"] = metadata["start_time"] != metadata["end_time"]
            
            # Count prims by type
            prim_counts = {}
            cameras = []
            lights = []
            meshes = []
            
            for prim in stage.Traverse():
                prim_type = prim.GetTypeName()
                prim_counts[prim_type] = prim_counts.get(prim_type, 0) + 1
                
                # Collect cameras
                if prim.IsA(UsdGeom.Camera):
                    cameras.append(str(prim.GetPath()))
                
                # Collect lights
                if "Light" in prim_type:
                    lights.append(str(prim.GetPath()))
                
                # Collect meshes (sample a few)
                if prim.IsA(UsdGeom.Mesh) and len(meshes) < 10:
                    meshes.append(str(prim.GetPath()))
            
            metadata["prim_counts"] = prim_counts
            metadata["total_prims"] = sum(prim_counts.values())
            metadata["cameras"] = cameras
            metadata["lights"] = lights
            metadata["sample_meshes"] = meshes
            
            # Get bounding box
            try:
                bbox_cache = UsdGeom.BBoxCache(Usd.TimeCode.Default(), ['default', 'render'])
                root_prim = stage.GetDefaultPrim() or stage.GetPseudoRoot()
                bbox = bbox_cache.ComputeWorldBound(root_prim)
                bbox_range = bbox.ComputeAlignedRange()
                
                metadata["bbox_min"] = list(bbox_range.GetMin())
                metadata["bbox_max"] = list(bbox_range.GetMax())
                metadata["bbox_size"] = list(bbox_range.GetSize())
            except:
                metadata["bbox_min"] = None
                metadata["bbox_max"] = None
                metadata["bbox_size"] = None
            
            # Get layer info
            metadata["layer_count"] = len(stage.GetLayerStack())
            metadata["sublayers"] = [layer.identifier for layer in stage.GetRootLayer().subLayerPaths]
            
            # Get references (external dependencies)
            references = []
            for prim in stage.Traverse():
                if prim.HasAuthoredReferences():
                    for ref in prim.GetReferences():
                        references.append(str(ref))
            metadata["external_references"] = references[:20]  # Limit to first 20
            
            return metadata
            
        except Exception as e:
            print(f"  Error extracting USD metadata from {usd_path.name}: {e}")
            return None
    
    def generate_tags(self, basic_meta: Dict, usd_meta: Optional[Dict]) -> List[str]:
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
        
        # USD metadata tags
        if usd_meta:
            if usd_meta.get("has_animation"):
                tags.append("animated")
            if usd_meta.get("cameras"):
                tags.append("has_camera")
            if usd_meta.get("lights"):
                tags.append("has_lighting")
        
        return list(set(tags))  # Remove duplicates
    
    def load_clip_model(self):
        """Lazy-load CLIP model for embeddings."""
        if self.clip_model is None and CLIP_AVAILABLE:
            print("Loading CLIP model (this may take a moment)...")
            try:
                from transformers import CLIPProcessor, CLIPModel
                self.clip_model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
                self.clip_processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
                print("CLIP model loaded successfully")
            except Exception as e:
                print(f"Failed to load CLIP model: {e}")
                self.generate_embeddings = False
    
    def generate_thumbnail(self, usd_path: Path, asset_id: str) -> Optional[str]:
        """Generate a thumbnail render of the USD asset."""
        if not self.generate_thumbnails or not USD_AVAILABLE:
            return None
        
        thumbnail_path = self.thumbnails_output / f"{asset_id}.png"
        
        # Skip if thumbnail already exists
        if thumbnail_path.exists():
            return str(thumbnail_path)
        
        try:
            # Open stage
            stage = Usd.Stage.Open(str(usd_path))
            if not stage:
                return None
            
            # Get viewport and camera
            # Note: This is a simplified version - actual implementation depends on Kit context
            # For now, we'll mark this as a placeholder that needs Kit runtime
            
            # In a full Kit environment, you would:
            # 1. Open the stage in a viewport
            # 2. Auto-frame the camera to the asset
            # 3. Capture a screenshot
            # 4. Save to thumbnail_path
            
            # Placeholder: Create a simple marker file
            # In production, this would be replaced with actual viewport capture
            print(f"  [Thumbnail generation requires Kit runtime - skipping for now]")
            return None
            
        except Exception as e:
            print(f"  Error generating thumbnail: {e}")
            return None
    
    def generate_embedding(self, thumbnail_path: str, asset_id: str) -> Optional[str]:
        """Generate CLIP visual embedding from thumbnail."""
        if not self.generate_embeddings or not thumbnail_path or not Path(thumbnail_path).exists():
            return None
        
        embedding_path = self.embeddings_output / f"{asset_id}.npy"
        
        # Skip if embedding already exists
        if embedding_path.exists():
            return str(embedding_path)
        
        try:
            # Load CLIP model if not already loaded
            if self.clip_model is None:
                self.load_clip_model()
            
            if self.clip_model is None:
                return None
            
            # Load and process image
            image = Image.open(thumbnail_path).convert('RGB')
            inputs = self.clip_processor(images=image, return_tensors="pt")
            
            # Generate embedding
            with torch.no_grad():
                image_features = self.clip_model.get_image_features(**inputs)
                embedding = image_features.cpu().numpy()[0]
            
            # Save embedding
            np.save(embedding_path, embedding)
            
            return str(embedding_path)
            
        except Exception as e:
            print(f"  Error generating embedding: {e}")
            return None
    
    def process_asset(self, usd_path: Path) -> Dict:
        """Process a single USD asset and generate its metadata."""
        print(f"Processing: {usd_path.name}")
        
        # Extract basic metadata
        basic_meta = self.extract_basic_metadata(usd_path)
        asset_id = basic_meta["asset_id"]
        
        # Extract USD metadata if available
        usd_meta = self.extract_usd_metadata(usd_path)
        
        # Generate tags
        tags = self.generate_tags(basic_meta, usd_meta)
        
        # Generate thumbnail
        thumbnail_path = None
        if self.generate_thumbnails:
            thumbnail_path = self.generate_thumbnail(usd_path, asset_id)
        
        # Generate visual embedding
        embedding_path = None
        if self.generate_embeddings and thumbnail_path:
            embedding_path = self.generate_embedding(thumbnail_path, asset_id)
        
        # Combine all metadata
        asset_data = {
            **basic_meta,
            "tags": tags,
            "usd_metadata": usd_meta if usd_meta else {},
            "thumbnail_path": str(thumbnail_path) if thumbnail_path else None,
            "thumbnail_s3": f"s3://clappper-assets/omniverse_assets/asset_catalog/thumbnails/{asset_id}.png" if thumbnail_path else None,
            "embedding_path": str(embedding_path) if embedding_path else None,
            "embedding_s3": f"s3://clappper-assets/omniverse_assets/asset_catalog/embeddings/{asset_id}.npy" if embedding_path else None,
            "has_visual_embedding": embedding_path is not None,
        }
        
        return asset_data
    
    def save_individual_json(self, asset_data: Dict):
        """Save individual JSON file for an asset."""
        pack_dir = self.individual_output / asset_data["pack"]
        pack_dir.mkdir(parents=True, exist_ok=True)
        
        json_path = pack_dir / f"{asset_data['name']}.json"
        
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(asset_data, f, indent=2)
    
    def save_master_index(self):
        """Save master catalog index."""
        print(f"\nSaving master index to {self.master_index_path}")
        
        with open(self.master_index_path, 'w', encoding='utf-8') as f:
            json.dump({
                "total_assets": len(self.master_catalog),
                "assets": self.master_catalog
            }, f, indent=2)
        
        print(f"Master index saved: {len(self.master_catalog)} assets")
    
    def generate_catalog(self):
        """Main catalog generation process."""
        print("=" * 60)
        print("Asset Catalog Generator")
        print("=" * 60)
        
        # Find all USD files
        usd_files = self.find_usd_files()
        
        if not usd_files:
            print("No USD files found!")
            return
        
        # Process each asset
        print(f"\nProcessing {len(usd_files)} assets...")
        print("-" * 60)
        
        import time
        start_time = time.time()
        
        for i, usd_path in enumerate(usd_files, 1):
            try:
                # Progress with ETA
                elapsed = time.time() - start_time
                if i > 1:
                    avg_time = elapsed / (i - 1)
                    remaining = (len(usd_files) - i) * avg_time
                    eta_mins = int(remaining / 60)
                    print(f"[{i}/{len(usd_files)}] ETA: {eta_mins}m | ", end="")
                else:
                    print(f"[{i}/{len(usd_files)}] ", end="")
                
                asset_data = self.process_asset(usd_path)
                
                # Save individual JSON
                self.save_individual_json(asset_data)
                
                # Add to master catalog (lightweight version)
                self.master_catalog.append({
                    "asset_id": asset_data["asset_id"],
                    "name": asset_data["name"],
                    "pack": asset_data["pack"],
                    "s3_path": asset_data["s3_path"],
                    "tags": asset_data["tags"],
                    "file_size_mb": asset_data["file_size_mb"],
                    "thumbnail_s3": asset_data.get("thumbnail_s3"),
                    "embedding_s3": asset_data.get("embedding_s3"),
                    "has_visual_embedding": asset_data.get("has_visual_embedding", False),
                })
                
            except Exception as e:
                print(f"Error processing {usd_path.name}: {e}")
        
        # Save master index
        print("\n" + "-" * 60)
        self.save_master_index()
        
        # Print summary
        print("\n" + "=" * 60)
        print("Catalog Generation Complete!")
        print("=" * 60)
        print(f"Total assets cataloged: {len(self.master_catalog)}")
        print(f"Output directory: {self.output_path}")
        print(f"Master index: {self.master_index_path}")


def visual_search(query_text: str, catalog_path: str, top_k: int = 10) -> List[Dict]:
    """
    Search assets using CLIP text-to-image similarity.
    
    Args:
        query_text: Natural language description (e.g., "modern office desk")
        catalog_path: Path to master_index.json
        top_k: Number of results to return
    
    Returns:
        List of top-k matching assets with similarity scores
    """
    if not CLIP_AVAILABLE:
        print("Error: CLIP not available for visual search")
        return []
    
    try:
        from transformers import CLIPProcessor, CLIPModel
        import numpy as np
        
        # Load CLIP model
        print("Loading CLIP model...")
        model = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        processor = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        
        # Encode query text
        text_inputs = processor(text=[query_text], return_tensors="pt", padding=True)
        with torch.no_grad():
            text_features = model.get_text_features(**text_inputs)
            text_embedding = text_features.cpu().numpy()[0]
        
        # Load catalog
        with open(catalog_path, 'r') as f:
            catalog = json.load(f)
        
        # Load all embeddings and compute similarities
        results = []
        for asset in catalog["assets"]:
            if not asset.get("has_visual_embedding"):
                continue
            
            embedding_path = asset.get("embedding_path")
            if not embedding_path or not Path(embedding_path).exists():
                continue
            
            # Load asset embedding
            asset_embedding = np.load(embedding_path)
            
            # Compute cosine similarity
            similarity = np.dot(text_embedding, asset_embedding) / (
                np.linalg.norm(text_embedding) * np.linalg.norm(asset_embedding)
            )
            
            results.append({
                **asset,
                "similarity_score": float(similarity)
            })
        
        # Sort by similarity and return top-k
        results.sort(key=lambda x: x["similarity_score"], reverse=True)
        return results[:top_k]
        
    except Exception as e:
        print(f"Error during visual search: {e}")
        return []


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="Asset Catalog Generator with Visual Embeddings")
    parser.add_argument("--root", default=r"Z:\packs", help="Root path to asset library")
    parser.add_argument("--output", default=r"C:\Users\Administrator\Documents\clappper-assets\asset_catalog", 
                       help="Output path for catalog")
    parser.add_argument("--no-thumbnails", action="store_true", help="Skip thumbnail generation")
    parser.add_argument("--no-embeddings", action="store_true", help="Skip embedding generation")
    parser.add_argument("--search", type=str, help="Perform visual search with query text")
    
    args = parser.parse_args()
    
    # Visual search mode
    if args.search:
        catalog_path = Path(args.output) / "master_index.json"
        if not catalog_path.exists():
            print(f"Error: Catalog not found at {catalog_path}")
            print("Run without --search first to generate the catalog")
            return
        
        print(f"Searching for: '{args.search}'")
        print("-" * 60)
        results = visual_search(args.search, str(catalog_path), top_k=10)
        
        if not results:
            print("No results found")
            return
        
        print(f"\nTop {len(results)} matches:")
        for i, result in enumerate(results, 1):
            print(f"\n{i}. {result['name']} (score: {result['similarity_score']:.3f})")
            print(f"   Pack: {result['pack']}")
            print(f"   Tags: {', '.join(result['tags'])}")
            print(f"   S3: {result['s3_path']}")
        
        return
    
    # Catalog generation mode
    ROOT_PATH = args.root
    OUTPUT_PATH = args.output
    
    # Generate catalog
    generator = AssetCatalogGenerator(
        ROOT_PATH, 
        OUTPUT_PATH,
        generate_thumbnails=not args.no_thumbnails,
        generate_embeddings=not args.no_embeddings
    )
    generator.generate_catalog()
    
    print("\n" + "=" * 60)
    print("Next steps:")
    print("=" * 60)
    print("1. Review the master_index.json file")
    print("2. Sync to S3:")
    print("   aws s3 sync asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/")
    print("3. Use master_index.json for LLM asset querying")
    print("4. Test visual search:")
    print("   python catalog_assets.py --search \"modern office desk\"")


if __name__ == "__main__":
    main()

