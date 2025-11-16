"""
Add a chair to roadscene1.usd - CORRECTED VERSION
Places the chair at the correct location and scale for the roadscene.
"""

from pxr import Usd, UsdGeom, Sdf

# ============================================================================
# OPEN EXISTING SCENE
# ============================================================================
scene_path = "Z:/omniverse_assets/scenes/roadscene1.usd"
print(f"Opening scene: {scene_path}")

stage = Usd.Stage.Open(scene_path)
if not stage:
    print(f"ERROR: Could not open {scene_path}")
    exit(1)

print("✓ Scene opened successfully")

# ============================================================================
# REMOVE OLD CHAIR (if it exists)
# ============================================================================
old_chair = stage.GetPrimAtPath("/World/SappingtonChair")
if old_chair:
    stage.RemovePrim("/World/SappingtonChair")
    print("✓ Removed old chair")

# ============================================================================
# ADD CHAIR TO SCENE - PROPERLY POSITIONED
# ============================================================================
# Create a new prim for the chair
chair_prim = stage.DefinePrim("/World/SappingtonChair", "Xform")

# Reference the chair asset
chair_prim.GetReferences().AddReference(
    "Z:/omniverse_assets/packs/Furniture_Misc/Assets/simready_content/common_assets/props/sappington_chair/sappington_chair.usd"
)

print("✓ Chair reference added")

# ============================================================================
# POSITION THE CHAIR - MATCHED TO ROADSCENE SCALE
# ============================================================================
# The roadscene plane is at:
# Position: (-79.97, 311.16, 1918.14)
# Scale: (458.21, 4.74, 8.04)
#
# Place chair on the road, slightly to the side, at proper scale
chair_xform = UsdGeom.Xformable(chair_prim)
chair_xform.ClearXformOpOrder()

# Position: On the road surface, to the right side
# Y=311 is the ground level, placing slightly to the side of center
chair_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((20, 311.5, 1920))

# Rotate to face down the road
chair_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((0, 45, 0))

# Scale up to match the massive roadscene scale (chair is tiny by default)
chair_xform.AddScaleOp(UsdGeom.XformOp.PrecisionFloat).Set((15.0, 15.0, 15.0))

print("✓ Chair positioned at (20, 311.5, 1920) with 15x scale")

# Make sure materials load
chair_prim.SetInstanceable(False)

# ============================================================================
# SAVE MODIFIED SCENE
# ============================================================================
stage.GetRootLayer().Save()

print("\n" + "="*60)
print("✅ Chair added successfully!")
print("="*60)
print(f"Modified scene saved to: {scene_path}")
print("\nThe chair is now:")
print("  - Positioned on the road surface (Y=311.5)")
print("  - Slightly to the right side (X=20)")
print("  - Near the road center (Z=1920)")
print("  - Scaled 15x to match the massive roadscene")
print("\nNext steps:")
print("1. Press 'F' to frame the entire scene")
print("2. Navigate to find the chair on the road")
print("3. The chair should now be visible at proper scale!")
print("="*60)

