"""
Create a professional product showcase scene from scratch
- Oak table with studio lighting
- Clean neutral background
- 360° camera orbit (3 seconds = 90 frames at 30fps)
- Perfect for product visualization
"""

from pxr import Usd, UsdGeom, UsdLux, Sdf
import math

# ============================================================================
# CREATE NEW STAGE FROM SCRATCH
# ============================================================================
scene_path = "Z:/omniverse_assets/scenes/oak_table_product_showcase.usd"
print(f"Creating new scene: {scene_path}")

stage = Usd.Stage.CreateNew(scene_path)
print("✓ New stage created")

# Set up timeline (90 frames = 3 seconds at 30fps)
stage.SetStartTimeCode(0)
stage.SetEndTimeCode(90)
stage.SetTimeCodesPerSecond(30)

# Create World root
world = UsdGeom.Xform.Define(stage, "/World")
print("✓ World root created")

# ============================================================================
# ADD OAK TABLE
# ============================================================================
table_prim = stage.DefinePrim("/World/OakTable", "Xform")
table_prim.GetReferences().AddReference(
    "Z:/omniverse_assets/packs/Furniture_Misc/Assets/simready_content/common_assets/props/oaktablelarge/oaktablelarge.usd"
)

# Position and rotate table
table_xform = UsdGeom.Xformable(table_prim)
table_xform.ClearXformOpOrder()
table_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((0, 0, 0))
table_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((90, 0, 0))  # Lay flat
table_xform.AddScaleOp(UsdGeom.XformOp.PrecisionFloat).Set((1.0, 1.0, 1.0))

table_prim.SetInstanceable(False)  # Ensure materials load

print("✓ Oak table added")

# ============================================================================
# STUDIO LIGHTING SETUP
# ============================================================================

# Key Light - Main light from front-right
key_light = UsdLux.RectLight.Define(stage, "/World/Lights/KeyLight")
key_light.CreateIntensityAttr(3000)
key_light.CreateWidthAttr(2.0)
key_light.CreateHeightAttr(2.0)
key_light.CreateColorAttr((1.0, 0.98, 0.95))  # Warm white
key_light_xform = UsdGeom.Xformable(key_light)
key_light_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((3, 3, 2))
key_light_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((-45, -45, 0))

print("✓ Key light (main)")

# Fill Light - Soft fill from left
fill_light = UsdLux.RectLight.Define(stage, "/World/Lights/FillLight")
fill_light.CreateIntensityAttr(1500)
fill_light.CreateWidthAttr(3.0)
fill_light.CreateHeightAttr(3.0)
fill_light.CreateColorAttr((0.95, 0.95, 1.0))  # Cool white
fill_light_xform = UsdGeom.Xformable(fill_light)
fill_light_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((-3, 2, 1))
fill_light_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat).Set((-30, 45, 0))

print("✓ Fill light (soft)")

# Rim Light - Back light for depth
rim_light = UsdLux.SphereLight.Define(stage, "/World/Lights/RimLight")
rim_light.CreateIntensityAttr(2000)
rim_light.CreateRadiusAttr(0.3)
rim_light.CreateColorAttr((1.0, 0.95, 0.9))
rim_light_xform = UsdGeom.Xformable(rim_light)
rim_light_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble).Set((0, 2, -3))

print("✓ Rim light (back)")

# Dome Light - Ambient environment
dome_light = UsdLux.DomeLight.Define(stage, "/World/Lights/DomeLight")
dome_light.CreateIntensityAttr(800)
dome_light.CreateColorAttr((0.9, 0.92, 0.95))

print("✓ Dome light (ambient)")

# ============================================================================
# ANIMATED CAMERA - 360° ORBIT
# ============================================================================
camera = UsdGeom.Camera.Define(stage, "/World/Camera")
camera.CreateFocalLengthAttr(50)  # Standard lens
camera.CreateFocusDistanceAttr(3.0)
camera.CreateFStopAttr(2.8)  # Cinematic depth of field

camera_xform = UsdGeom.Xformable(camera)
camera_xform.ClearXformOpOrder()

translate_op = camera_xform.AddTranslateOp(UsdGeom.XformOp.PrecisionDouble)
rotate_op = camera_xform.AddRotateXYZOp(UsdGeom.XformOp.PrecisionFloat)

# Camera distance from table
radius = 3.0  # 3 meters
height = 1.5  # Eye level

# Animate camera in a circle around the table
num_frames = 91  # 0 to 90 inclusive
for frame in range(0, num_frames, 15):  # Keyframe every 15 frames
    # Calculate angle (0 to 360 degrees)
    angle_degrees = (frame / 90.0) * 360.0
    angle_radians = math.radians(angle_degrees)
    
    # Calculate position on circle
    x = radius * math.sin(angle_radians)
    z = radius * math.cos(angle_radians)
    y = height
    
    # Set position
    translate_op.Set((x, y, z), frame)
    
    # Rotate camera to look at table (center at origin)
    # Y rotation = angle + 180 to face inward
    rotate_op.Set((0, angle_degrees + 180, 0), frame)

print("✓ Camera animation (360° orbit)")
print(f"  - Keyframes at: 0, 15, 30, 45, 60, 75, 90")
print(f"  - Radius: {radius}m, Height: {height}m")

# ============================================================================
# SAVE STAGE
# ============================================================================
stage.GetRootLayer().Save()

print("\n" + "="*60)
print("✅ Product showcase scene created!")
print("="*60)
print(f"Scene saved to: {scene_path}")
print("\nScene contents:")
print("  • Oak table (centered at origin)")
print("  • 4-point studio lighting")
print("  • 360° camera orbit (3 seconds)")
print("\n" + "="*60)
print("NEXT STEPS:")
print("="*60)
print("1. File → Open: oak_table_product_showcase.usd")
print("2. Switch viewport camera to 'Camera'")
print("3. Press PLAY ▶️ to preview 360° rotation")
print("4. Window → Movie Capture to render")
print("   - Frame range: 0 to 90")
print("   - 30 fps")
print("="*60)
print("\n🎬 Ready for professional product showcase rendering!")
print("="*60)

