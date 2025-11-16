"""
Add an oak table to roadscene with animated camera pan
- Places oak table in the middle of the road
- Animates camera to pan past it over 3 seconds (90 frames at 30fps)
- Ready for Movie Capture rendering
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
# REMOVE OLD OBJECTS (if they exist)
# ============================================================================
old_table = stage.GetPrimAtPath("/World/OakTable")
if old_table:
    stage.RemovePrim("/World/OakTable")
    print("✓ Removed old table")

old_camera = stage.GetPrimAtPath("/World/AnimatedCamera")
if old_camera:
    stage.RemovePrim("/World/AnimatedCamera")
    print("✓ Removed old camera")

# ============================================================================
# ADD OAK TABLE TO SCENE
# ============================================================================
# Create prim for the table
table_prim = stage.DefinePrim("/World/OakTable", "Xform")

# Reference the oak table asset from catalog
table_prim.GetReferences().AddReference(
    "Z:/omniverse_assets/packs/Furniture_Misc/Assets/simready_content/common_assets/props/oaktablelarge/oaktablelarge.usd"
)

print("✓ Oak table reference added")

# ============================================================================
# POSITION THE TABLE - CENTER OF ROAD
# ============================================================================
# Roadscene plane is at: (-79.97, 311.16, 1918.14) with massive scale
# Place table in center of road, on the surface

table_xform = UsdGeom.Xformable(table_prim)
table_xform.ClearXformOpOrder()

# Position: Center of road, on ground surface
# X=-80 (center), Y=320 (elevated above ground), Z=1920 (middle of road)
table_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((-80, 320, 1920))

# Rotate to lay flat (table was on its side)
# Rotate 90 degrees on X axis to make it horizontal
table_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((90, 0, 0))

# Scale up to match roadscene (oak table is ~2m wide, scale 25x for better visibility)
table_xform.AddScaleOp(UsdGeom.XformOp.PrecisionFloat).Set((25.0, 25.0, 25.0))

print("✓ Oak table positioned at center of road")
print("  Position: (-80, 312, 1920)")
print("  Scale: 20x")

# Make sure materials load
table_prim.SetInstanceable(False)

# ============================================================================
# CREATE ANIMATED CAMERA
# ============================================================================
# Create camera
camera = UsdGeom.Camera.Define(stage, "/World/AnimatedCamera")

# Camera settings
camera.CreateFocalLengthAttr(50)  # Standard lens
camera.CreateFocusDistanceAttr(10.0)
camera.CreateFStopAttr(2.8)  # Cinematic depth of field

print("✓ Camera created")

# ============================================================================
# ANIMATE CAMERA - PAN PAST TABLE (3 seconds = 90 frames at 30fps)
# ============================================================================
# Get the camera's xformable interface
camera_xform = UsdGeom.Xformable(camera)
camera_xform.ClearXformOpOrder()

# Create transform ops for animation
translate_op = camera_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble)
rotate_op = camera_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat)

# Set timeline to 90 frames (3 seconds at 30fps)
stage.SetStartTimeCode(0)
stage.SetEndTimeCode(90)
stage.SetTimeCodesPerSecond(30)

# Frame 0: Camera starts to the side of table, looking at it
start_pos = (-80, 330, 1970)  # Same X as table, elevated, back from table
start_rot = (-10, 0, 0)  # Looking slightly down at table

translate_op.Set(start_pos, 0)
rotate_op.Set(start_rot, 0)

# Frame 45: Camera moves to the side, looking at table from angle
mid_pos = (-40, 330, 1920)  # To the right, same Z as table
mid_rot = (-10, -45, 0)  # Looking at table from side

translate_op.Set(mid_pos, 45)
rotate_op.Set(mid_rot, 45)

# Frame 90: Camera continues around, completing the pan
end_pos = (-80, 330, 1870)  # Same X, front of table
end_rot = (-10, 0, 0)  # Looking back at table

translate_op.Set(end_pos, 90)
rotate_op.Set(end_rot, 90)

print("✓ Camera animation created")
print("  Duration: 90 frames (3 seconds at 30fps)")
print("  Motion: Smooth pan from left to right past table")

# ============================================================================
# SET ACTIVE CAMERA
# ============================================================================
# Note: You'll need to manually set this as the active viewport camera in Kit
# Or use the Perspective dropdown → select "AnimatedCamera"

print("\n" + "="*60)
print("IMPORTANT: Set the viewport camera!")
print("="*60)
print("In the viewport, click the camera dropdown (top left)")
print("Select: 'AnimatedCamera'")
print("="*60)

# ============================================================================
# SAVE MODIFIED SCENE
# ============================================================================
stage.GetRootLayer().Save()

print("\n" + "="*60)
print("✅ Scene created successfully!")
print("="*60)
print(f"Modified scene saved to: {scene_path}")
print("\nWhat was added:")
print("  • Oak table in center of road (20x scale)")
print("  • Animated camera panning past table (3 seconds)")
print("\nNext steps:")
print("="*60)
print("1. Set viewport camera to 'AnimatedCamera' (dropdown at top)")
print("2. Press PLAY button to preview animation")
print("3. Window → Movie Capture")
print("4. Set frame range: 0 to 90")
print("5. Set output directory")
print("6. Click 'Capture' to render sequence")
print("7. Use compile_sequence.py to create MP4")
print("="*60)

