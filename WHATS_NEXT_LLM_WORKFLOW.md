# What's Next: LLM → USD Scene Generation Workflow

🎉 **Congratulations!** You've completed the entire Omniverse + Asset Catalog setup. Here's what we accomplished and what's next.

---

## ✅ What We've Built

### 1. Complete Omniverse Kit Environment
- ✅ Windows EC2 instance (`g5.xlarge`) with NVIDIA A10G GPU
- ✅ Omniverse Kit app (`mdayku`) with Movie Capture extensions
- ✅ RDP access for interactive scene authoring
- ✅ Python + FFmpeg installed for video compilation

### 2. S3-Backed Asset Library
- ✅ **3,092 unique USD assets** cataloged across 14 packs
- ✅ Mounted via rclone as `Z:` drive for direct access
- ✅ Asset distribution:
  - **Warehouse**: 2,340 assets (forklifts, shelving, industrial equipment)
  - **Furniture**: 490 assets (desks, chairs, tables)
  - **Residential**: 66 assets (home interiors)
  - **Commercial**: 32 assets (retail/store elements)
  - **Characters**: 28 assets (human avatars)
  - **Environments, Particles, Demos**: 56 assets

### 3. Asset Catalog with Metadata
- ✅ **Master index JSON**: `s3://clappper-assets/omniverse_assets/asset_catalog/master_index.json`
- ✅ **Individual asset JSONs**: Detailed metadata for each asset
- ✅ **Searchable tags**: warehouse, industrial, forklift, furniture, etc.
- ✅ **S3 paths**: Direct links to each asset for programmatic loading

### 4. Video Capture & Compilation Pipeline
- ✅ Movie Capture extension enabled in Kit
- ✅ 240-frame sequence captured and compiled to MP4
- ✅ `compile_sequence.py` script for automated PNG → MP4 conversion

---

## 🚀 Next: Test the LLM → USD Workflow

This is the **final piece** that brings everything together: **automated scene generation from natural language**.

### The Workflow

```
User describes scene
    ↓
LLM queries asset catalog
    ↓
LLM checks asset availability
    ↓
LLM confirms: "Found 5 forklifts, 12 shelving units"
    ↓
LLM generates USD Python script
    ↓
User runs script in Kit Script Editor
    ↓
Scene created automatically
    ↓
Movie Capture → PNG sequence
    ↓
compile_sequence.py → MP4 video
    ↓
✅ Final video ready!
```

---

## 📝 Test Scenarios

### Scenario 1: Warehouse Scene (Easy)
**User prompt:**
> "Create a warehouse scene with 3 forklifts and industrial shelving. Camera at eye level."

**Expected LLM response:**
1. Query catalog for "forklift" and "shelving" tags
2. Confirm: "Found 2,340 warehouse assets including forklifts and shelving"
3. Generate Python script that:
   - Creates new USD stage
   - Loads 3 forklift assets from `Z:\omniverse_assets\packs\Warehouse_Assets\`
   - Loads shelving assets
   - Positions them in a warehouse layout
   - Sets camera at eye level (height ~1.7m)
   - Adds default lighting
   - Saves stage to `scenes/warehouse_test_01.usd`

### Scenario 2: Office Scene (Medium)
**User prompt:**
> "Build an office scene with 5 desks, 5 chairs, and a meeting table. Modern style."

**Expected LLM response:**
1. Query catalog for "desk", "chair", "table" tags
2. Check availability in Furniture_Misc and Commercial_Assets packs
3. Generate script with office layout

### Scenario 3: Mixed Scene (Advanced)
**User prompt:**
> "Create a loading dock scene with 2 forklifts, a warehouse door, and 3 characters standing near the door."

**Expected LLM response:**
1. Query multiple packs: Warehouse_Assets, Characters1
2. Check for "forklift", "door", "character" tags
3. If "loading dock" not found, suggest alternatives (warehouse door, platform, ramp)
4. Generate script with character placement

---

## 🛠️ How to Test (When You're Ready)

### Step 1: Sync Catalog to S3 (if not done)

```powershell
cd C:\Users\Administrator\Documents\clappper-assets
aws s3 sync asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/
```

### Step 2: Download Catalog to Local Machine

```powershell
# On your local machine (not EC2)
aws s3 cp s3://clappper-assets/omniverse_assets/asset_catalog/master_index.json master_index.json
```

### Step 3: Describe a Scene to Me (Claude)

Just tell me what scene you want, for example:
- "Create a warehouse with forklifts"
- "Build an office with desks and chairs"
- "Make a loading dock scene"

I'll:
1. Load the catalog
2. Search for matching assets
3. Confirm availability
4. Generate a complete USD Python script
5. Provide instructions for running it in Kit

### Step 4: Run the Script in Kit

1. Open Omniverse Kit (`mdayku` app)
2. Open **Script Editor** (Window → Script Editor)
3. Paste the generated Python script
4. Click **Run**
5. Scene appears in viewport!

### Step 5: Capture & Compile Video

1. Use **Movie Capture** to export PNG sequence
2. Run `compile_sequence.py` to create MP4
3. Sync video to S3

---

## 📊 Current Asset Inventory Summary

```json
{
  "total_assets": 3092,
  "packs": {
    "Warehouse_Assets": 1453,
    "Warehouse_Collection_1": 573,
    "Warehouse_Collection_2": 314,
    "Furniture_Misc": 490,
    "Residential_Assets": 66,
    "Commercial_Assets": 32,
    "Characters1": 28,
    "environments": 24,
    "particles": 33,
    "core_demos": 35,
    "scene_templates": 8,
    "showcase_content": 9,
    "extensions": 10
  }
}
```

**Strengths:**
- **Excellent warehouse coverage** (2,340 assets) - perfect for industrial scenes
- **Good furniture variety** (490 assets) - desks, chairs, tables, shelves
- **Character support** (28 avatars) - can add people to scenes
- **Environment elements** (24 assets) - backgrounds, landscapes

**Limitations:**
- Fewer residential/commercial assets (but still usable)
- Limited specialized props (but can be added later)

---

## 🎯 Success Criteria

The LLM workflow test is **successful** if:

1. ✅ LLM can query the catalog and find relevant assets
2. ✅ LLM generates syntactically correct USD Python code
3. ✅ Script runs in Kit without errors
4. ✅ Scene is created with assets loaded and positioned
5. ✅ Scene can be captured and compiled to video

**Bonus points:**
- LLM handles missing assets gracefully (suggests alternatives)
- LLM generates reasonable camera positions and lighting
- Generated scenes look visually coherent

---

## 🔮 After the LLM Workflow Test

Once the LLM workflow is validated, the next steps are:

### Phase 4: Cosmos Integration (Currently Blocked)
- Waiting on NVIDIA account permissions
- Will use Cosmos to generate AI video from Omniverse renders
- Pipeline: Omniverse scene → render → Cosmos → AI-enhanced video

### Phase 5: Web App Integration
- API endpoint to trigger scene generation
- Upload prompts from Clappper web app
- Retrieve generated videos

### Phase 6: Production Optimization
- Headless rendering on Ubuntu instance
- Batch processing multiple scenes
- Cost optimization (auto-shutdown idle instances)

---

## 📚 Reference Commands

### EC2 Instance Management
```powershell
# Start instance
aws ec2 start-instances --instance-ids i-01abf54c88529c526

# Get public IP
aws ec2 describe-instances --instance-ids i-01abf54c88529c526 --query "Reservations[0].Instances[0].PublicIpAddress" --output text

# Stop instance
aws ec2 stop-instances --instance-ids i-01abf54c88529c526
```

### Rclone S3 Mount
```powershell
# Mount S3 as Z: drive
cd C:\Users\Administrator\Downloads\rclone-v1.71.2-windows-amd64\rclone-v1.71.2-windows-amd64
.\rclone mount s3omni:clappper-assets Z: --vfs-cache-mode writes
```

### Video Compilation
```powershell
python C:\Users\Administrator\Documents\clappper-assets\scripts\compile_sequence.py <frames_dir> output.mp4 --fps 30
```

### S3 Sync
```powershell
# Sync renders to S3
aws s3 sync C:\Users\Administrator\Documents\clappper-assets\renders s3://clappper-assets/renders/

# Sync catalog to S3
aws s3 sync C:\Users\Administrator\Documents\clappper-assets\asset_catalog s3://clappper-assets/omniverse_assets/asset_catalog/
```

---

## 🎉 You're Ready!

When you get back from your walk, just say:

**"Create a warehouse scene with 3 forklifts and industrial shelving"**

And I'll generate the complete USD Python script for you to run in Kit!

---

**Mode:** DOCS  
**Evidence:** Comprehensive documentation of completed work and next steps for LLM workflow testing  
**Checkpoint:** N/A (documentation mode)

