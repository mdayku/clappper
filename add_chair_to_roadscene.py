"""
Add a chair to the existing roadscene.usd
This tests the LLM → USD script generation workflow with a simple modification.
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
# ADD CHAIR TO SCENE
# ============================================================================
# Create a new prim for the chair
chair_prim = stage.DefinePrim("/World/SappingtonChair", "Xform")

# Reference the chair asset from our catalog
chair_prim.GetReferences().AddReference(
    "Z:/omniverse_assets/packs/Furniture_Misc/Assets/simready_content/common_assets/props/sappington_chair/sappington_chair.usd"
)

print("✓ Chair reference added")

# ============================================================================
# POSITION THE CHAIR
# ============================================================================
# Position the chair in a visible location
# Placing it at ground level, slightly to the side of the road
chair_xform = UsdGeom.Xformable(chair_prim)
chair_xform.ClearXformOpOrder()  # Clear any existing transforms
chair_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((5, 0, 2))  # X=5m right, Y=0 ground, Z=2m forward
chair_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((0, 45, 0))  # Rotate 45° for better view
chair_xform.AddScaleOp(UsdGeom.XformOp.PrecisionFloat).Set((1.0, 1.0, 1.0))  # Normal scale

print("✓ Chair positioned at (5, 0, 2) with 45° rotation")

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
print("\nThe Sappington chair has been added to the roadscene.")
print("Position: 5 meters to the right, at ground level, 2 meters forward")
print("Rotation: 45° for better visibility")
print("\nNext steps:")
print("1. The chair should now be visible in the viewport")
print("2. Press 'F' to frame the entire scene")
print("3. Navigate to find the chair (look to the right side)")
print("4. Take a screenshot to validate the addition")
print("="*60)

