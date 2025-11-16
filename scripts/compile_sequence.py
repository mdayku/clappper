"""
Frame Sequence to Video Compiler

Compiles PNG/EXR frame sequences from Omniverse Movie Capture into MP4 videos using FFmpeg.

Usage:
    python compile_sequence.py <frames_dir> <output_video> [--fps 30] [--crf 18]

Example:
    python compile_sequence.py C:/Users/Administrator/Documents/clappper-assets/renders/warehouse_scene_01 warehouse_scene_01.mp4
"""

import argparse
import subprocess
import sys
from pathlib import Path
import re


def find_frame_pattern(frames_dir: Path) -> str:
    """
    Detect the frame naming pattern in the directory.
    
    Common patterns:
    - frame_0001.png, frame_0002.png, ... → frame_%04d.png
    - capture_001.png, capture_002.png, ... → capture_%03d.png
    - render.0001.png, render.0002.png, ... → render.%04d.png
    """
    png_files = sorted(frames_dir.glob("*.png"))
    
    if not png_files:
        raise ValueError(f"No PNG files found in {frames_dir}")
    
    # Analyze first file to detect pattern
    first_file = png_files[0].name
    
    # Common patterns
    patterns = [
        (r"^(.+?)_(\d+)\.png$", lambda m: f"{m.group(1)}_%0{len(m.group(2))}d.png"),
        (r"^(.+?)\.(\d+)\.png$", lambda m: f"{m.group(1)}.%0{len(m.group(2))}d.png"),
        (r"^(\d+)\.png$", lambda m: f"%0{len(m.group(1))}d.png"),
    ]
    
    for pattern, formatter in patterns:
        match = re.match(pattern, first_file)
        if match:
            return formatter(match)
    
    # Fallback: assume frame_####.png
    return "frame_%04d.png"


def check_ffmpeg():
    """Check if FFmpeg is installed and accessible."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            text=True,
            check=True
        )
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False


def compile_sequence(
    frames_dir: str,
    output_path: str,
    fps: int = 30,
    crf: int = 18,
    pattern: str = None,
    verbose: bool = True
) -> bool:
    """
    Compile frame sequence to MP4 using FFmpeg.
    
    Args:
        frames_dir: Directory containing frame sequence
        output_path: Output MP4 file path
        fps: Frames per second (default: 30)
        crf: Quality (0-51, lower=better, 18=visually lossless, 23=default)
        pattern: Frame naming pattern (auto-detected if None)
        verbose: Print FFmpeg output
    
    Returns:
        True if successful, False otherwise
    """
    frames_path = Path(frames_dir)
    output_file = Path(output_path)
    
    # Validate inputs
    if not frames_path.exists():
        print(f"Error: Frames directory not found: {frames_path}")
        return False
    
    if not frames_path.is_dir():
        print(f"Error: Not a directory: {frames_path}")
        return False
    
    # Check FFmpeg
    if not check_ffmpeg():
        print("Error: FFmpeg not found. Please install FFmpeg:")
        print("  Download: https://www.gyan.dev/ffmpeg/builds/")
        print("  Or install via package manager")
        return False
    
    # Detect frame pattern
    if pattern is None:
        try:
            pattern = find_frame_pattern(frames_path)
            print(f"Detected frame pattern: {pattern}")
        except ValueError as e:
            print(f"Error: {e}")
            return False
    
    # Build FFmpeg command
    input_pattern = str(frames_path / pattern)
    
    cmd = [
        "ffmpeg",
        "-y",  # Overwrite output file
        "-framerate", str(fps),
        "-i", input_pattern,
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-crf", str(crf),
        "-movflags", "+faststart",  # Enable streaming
        str(output_file)
    ]
    
    print(f"\nCompiling sequence to video...")
    print(f"  Input: {frames_path}")
    print(f"  Pattern: {pattern}")
    print(f"  Output: {output_file}")
    print(f"  FPS: {fps}")
    print(f"  Quality (CRF): {crf}")
    print()
    
    try:
        if verbose:
            result = subprocess.run(cmd, check=True)
        else:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True
            )
        
        if output_file.exists():
            size_mb = output_file.stat().st_size / (1024 * 1024)
            print(f"\n✓ Success! Video saved to: {output_file}")
            print(f"  File size: {size_mb:.2f} MB")
            return True
        else:
            print("\n✗ Error: Output file was not created")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"\n✗ FFmpeg error: {e}")
        if hasattr(e, 'stderr') and e.stderr:
            print(e.stderr)
        return False


def main():
    parser = argparse.ArgumentParser(
        description="Compile frame sequences to MP4 video",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Basic usage (auto-detect pattern)
  python compile_sequence.py renders/warehouse_scene output.mp4
  
  # Custom FPS and quality
  python compile_sequence.py renders/warehouse_scene output.mp4 --fps 24 --crf 20
  
  # Specify frame pattern manually
  python compile_sequence.py renders/warehouse_scene output.mp4 --pattern "frame_%04d.png"
        """
    )
    
    parser.add_argument(
        "frames_dir",
        help="Directory containing frame sequence"
    )
    
    parser.add_argument(
        "output",
        help="Output MP4 file path"
    )
    
    parser.add_argument(
        "--fps",
        type=int,
        default=30,
        help="Frames per second (default: 30)"
    )
    
    parser.add_argument(
        "--crf",
        type=int,
        default=18,
        help="Quality: 0-51, lower=better (default: 18, visually lossless)"
    )
    
    parser.add_argument(
        "--pattern",
        type=str,
        default=None,
        help="Frame naming pattern (e.g., 'frame_%%04d.png'). Auto-detected if not specified."
    )
    
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress FFmpeg output"
    )
    
    args = parser.parse_args()
    
    success = compile_sequence(
        frames_dir=args.frames_dir,
        output_path=args.output,
        fps=args.fps,
        crf=args.crf,
        pattern=args.pattern,
        verbose=not args.quiet
    )
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

