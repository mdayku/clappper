"""
Add an oak table to warehouse scene with animated camera pan
- Uses warehouse1.usd (more reasonable scale than roadscene)
- Places oak table in the warehouse
- Animates camera to pan around it over 3 seconds (90 frames at 30fps)
"""

from pxr import Usd, UsdGeom, Sdf

# ============================================================================
# OPEN WAREHOUSE SCENE
# ============================================================================
scene_path = "Z:/omniverse_assets/scenes/warehouse1.usd"
print(f"Opening scene: {scene_path}")

stage = Usd.Stage.Open(scene_path)
if not stage:
    print(f"ERROR: Could not open {scene_path}")
    exit(1)

print("✓ Warehouse scene opened successfully")

# ============================================================================
# REMOVE OLD OBJECTS (if they exist)
# ============================================================================
for old_path in ["/World/OakTable", "/World/AnimatedCamera", "/World/SappingtonChair"]:
    old_prim = stage.GetPrimAtPath(old_path)
    if old_prim:
        stage.RemovePrim(old_path)
        print(f"✓ Removed old object at {old_path}")

# ============================================================================
# ADD OAK TABLE TO WAREHOUSE
# ============================================================================
table_prim = stage.DefinePrim("/World/OakTable", "Xform")

# Reference the oak table asset
table_prim.GetReferences().AddReference(
    "Z:/omniverse_assets/packs/Furniture_Misc/Assets/simready_content/common_assets/props/oaktablelarge/oaktablelarge.usd"
)

print("✓ Oak table reference added")

# ============================================================================
# POSITION THE TABLE - WAREHOUSE SCALE (NORMAL HUMAN SCALE)
# ============================================================================
table_xform = UsdGeom.Xformable(table_prim)
table_xform.ClearXformOpOrder()

# Position: Center of warehouse floor at origin
# Using normal scale - warehouse is at human scale!
table_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((0, 0, 0))

# Rotate table to lay flat (table asset is vertical by default)
table_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((90, 0, 0))

# Normal scale - warehouse is realistic human scale
table_xform.AddScaleOp(UsdGeom.XformOp.PrecisionFloat).Set((1.0, 1.0, 1.0))

print("✓ Oak table positioned at warehouse center")
print("  Position: (0, 0, 0) - origin")
print("  Rotation: 90° to lay flat")
print("  Scale: 1.0 (normal size)")

# Make sure materials load
table_prim.SetInstanceable(False)

# ============================================================================
# CREATE ANIMATED CAMERA
# ============================================================================
camera = UsdGeom.Camera.Define(stage, "/World/AnimatedCamera")

# Camera settings - cinematic
camera.CreateFocalLengthAttr(35)  # Wide angle for interior
camera.CreateFocusDistanceAttr(3.0)
camera.CreateFStopAttr(2.8)

print("✓ Camera created")

# ============================================================================
# ANIMATE CAMERA - PAN AROUND TABLE (3 seconds = 90 frames at 30fps)
# ============================================================================
camera_xform = UsdGeom.Xformable(camera)
camera_xform.ClearXformOpOrder()

translate_op = camera_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble)
rotate_op = camera_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat)

# Set timeline
stage.SetStartTimeCode(0)
stage.SetEndTimeCode(90)
stage.SetTimeCodesPerSecond(30)

# Frame 0: Camera starts in front of table, looking at it
start_pos = (0, 1.5, 4)  # In front, at eye level (1.5m up), 4m away
start_rot = (-10, 0, 0)  # Looking slightly down

translate_op.Set(start_pos, 0)
rotate_op.Set(start_rot, 0)

# Frame 45: Camera moves to the side
mid_pos = (4, 1.5, 0)  # To the side, same height
mid_rot = (-10, -90, 0)  # Looking at table from side

translate_op.Set(mid_pos, 45)
rotate_op.Set(mid_rot, 45)

# Frame 90: Camera behind table
end_pos = (0, 1.5, -4)  # Behind table
end_rot = (-10, -180, 0)  # Looking back at table

translate_op.Set(end_pos, 90)
rotate_op.Set(end_rot, 90)

print("✓ Camera animation created")
print("  Duration: 90 frames (3 seconds at 30fps)")
print("  Motion: Smooth 180° arc around table at eye level")
print("  Camera distance: 4 meters from table")

# ============================================================================
# SAVE SCENE
# ============================================================================
stage.GetRootLayer().Save()

print("\n" + "="*60)
print("✅ Scene created successfully!")
print("="*60)
print(f"Scene saved to: {scene_path}")
print("\nWhat was added:")
print("  • Oak table at warehouse center (normal 1:1 scale)")
print("  • Animated camera (3-second pan around table)")
print("\n" + "="*60)
print("NEXT STEPS:")
print("="*60)
print("1. In viewport, change camera to 'AnimatedCamera'")
print("   (dropdown at top left of viewport)")
print("2. Press PLAY ▶️ to preview animation")
print("3. If table not visible:")
print("   - Select 'OakTable' in Stage panel")
print("   - Press 'F' key to frame it")
print("4. Window → Movie Capture to render sequence")
print("="*60)
print("\n💡 TIP: Warehouse is at NORMAL human scale")
print("   (unlike roadscene which was massive)")
print("="*60)

