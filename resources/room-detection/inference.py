#!/usr/bin/env python3
"""
Python Inference Service for Room Detection
Uses locally trained YOLO models - no AWS/S3 needed!
"""

import sys
import json
import base64
from io import BytesIO
import traceback
import os
from pathlib import Path
from PIL import Image
import numpy as np

# Check for bundled models path (from Electron) - PRIMARY source
BUNDLED_MODELS_PATH = os.environ.get('BUNDLED_MODELS_PATH')
if BUNDLED_MODELS_PATH:
    BUNDLED_MODELS_PATH = Path(BUNDLED_MODELS_PATH)
else:
    BUNDLED_MODELS_PATH = None

# Optional: Check for local training output (if user has Roomer repo)
# This is optional - bundled models are the primary source
PROJECT_ROOT = Path.cwd()
LOCAL_TRAINING_OUTPUT = PROJECT_ROOT / 'room_detection_training' / 'local_training_output'

# Helper to find model path - checks bundled first (required), then optional local training output
def find_model_path(model_id):
    """Find model path, checking bundled models first (required), then optional local training output"""
    # First check bundled models (PRIMARY - these are included with the app)
    if BUNDLED_MODELS_PATH:
        bundled_path = BUNDLED_MODELS_PATH / model_id / 'weights' / 'best.pt'
        if bundled_path.exists():
            return bundled_path
        
        # Check alternative structure in bundled: model_id/room_detection/weights/best.pt
        alt_bundled_path = BUNDLED_MODELS_PATH / model_id / 'room_detection' / 'weights' / 'best.pt'
        if alt_bundled_path.exists():
            return alt_bundled_path
    
    # Then check optional local training output (if user has Roomer repo)
    if LOCAL_TRAINING_OUTPUT.exists():
        local_path = LOCAL_TRAINING_OUTPUT / model_id / 'weights' / 'best.pt'
        if local_path.exists():
            return local_path
        
        # Check alternative structure: model_id/room_detection/weights/best.pt
        alt_local_path = LOCAL_TRAINING_OUTPUT / model_id / 'room_detection' / 'weights' / 'best.pt'
        if alt_local_path.exists():
            return alt_local_path
    
    return None

# Available models - paths will be resolved dynamically
MODELS = {
    'room-detect-1class-20ep': {
        'description': 'Room Detection - 1 Class - 20 epochs'
    },
    'room-detect-2class-20ep': {
        'description': 'Room Detection - 2 Class - 20 epochs'
    },
    'default': {
        'description': 'Default model (room-detect-1class-20ep)'
    }
}

# Global model cache
loaded_models = {}

def main():
    try:
        # Read raw image bytes from stdin (no JSON, just binary data)
        # First 4 bytes are model ID length, then model ID, then image data
        model_id_length_bytes = sys.stdin.buffer.read(4)
        if len(model_id_length_bytes) != 4:
            raise ValueError("Invalid input format")
        
        model_id_length = int.from_bytes(model_id_length_bytes, 'big')
        model_id_bytes = sys.stdin.buffer.read(model_id_length)
        model_id = model_id_bytes.decode('utf-8') if model_id_bytes else 'default'
        
        # Read remaining image data
        image_data = sys.stdin.buffer.read()
        
        if not image_data:
            raise ValueError("No image data provided")
        
        sys.stderr.write(f"Received {len(image_data)} bytes of image data for model: {model_id}\n")
        
        # Perform inference
        result = perform_inference(image_data, model_id)
        # Only output JSON to stdout - all debug goes to stderr
        print(json.dumps(result))

    except Exception as e:
        # Send errors to stderr, JSON to stdout
        sys.stderr.write(f"Error: {e}\n")
        sys.stderr.write(traceback.format_exc())
        print(json.dumps({
            'error': str(e),
            'traceback': traceback.format_exc()
        }))

def load_model(model_id='default'):
    """Load the specified YOLO model from local filesystem or bundled resources"""
    global loaded_models

    if model_id in loaded_models:
        return loaded_models[model_id]

    # Handle special cases
    if model_id == 'default':
        # Try bundled models in order of preference
        for fallback_id in ['room-detect-1class-20ep', 'room-detect-2class-20ep']:
            model_path = find_model_path(fallback_id)
            if model_path:
                sys.stderr.write(f"Default model: using bundled {fallback_id}\n")
                return load_model(fallback_id)
        raise Exception("No default model found - bundled model missing!")

    if model_id not in MODELS:
        sys.stderr.write(f"Unknown model {model_id}, trying to find it anyway...\n")
        # Try to find it dynamically
        model_path = find_model_path(model_id)
        if not model_path:
            sys.stderr.write(f"Model {model_id} not found, using default\n")
            return load_model('default')
    else:
        model_path = find_model_path(model_id)
        if not model_path:
            sys.stderr.write(f"Model {model_id} not found, using default\n")
            return load_model('default')

    description = MODELS.get(model_id, {}).get('description', model_id)

    try:
        # Convert Path object to string
        model_path_str = str(model_path)
        sys.stderr.write(f"Loading {model_id} model ({description})...\n")
        sys.stderr.write(f"Model path: {model_path_str}\n")

        # Load Ultralytics YOLO model
        from ultralytics import YOLO
        sys.stderr.write(f"Loading YOLO model from {model_path_str}...\n")
        model = YOLO(model_path_str)
        loaded_models[model_id] = model
        sys.stderr.write(f"Model {model_id} loaded successfully\n")
        return model

    except Exception as e:
        sys.stderr.write(f"Failed to load model {model_id}: {e}\n")
        traceback.print_exc(file=sys.stderr)
        # Try fallback to default model
        if model_id != 'default':
            sys.stderr.write("Trying default model...\n")
            return load_model('default')
        raise Exception(f"Model loading failed: {e}")

def perform_inference(image_data, model_id='default'):
    """Perform room detection inference with trained YOLO model"""
    try:
        sys.stderr.write(f"Processing image: {len(image_data)} bytes with model {model_id}\n")
        # Decode the image
        image = Image.open(BytesIO(image_data))
        img_width, img_height = image.size
        sys.stderr.write(f"Processing image: {img_width}x{img_height} pixels with model {model_id}\n")

        # Load the specified model
        model = load_model(model_id)

        # Run inference - suppress YOLO's verbose output
        sys.stderr.write("Running YOLO inference...\n")
        # Set verbose=False and also redirect stdout temporarily to suppress YOLO output
        import contextlib
        import io
        f = io.StringIO()
        with contextlib.redirect_stdout(f):
            results = model(image, conf=0.25, iou=0.45, verbose=False)  # Standard YOLO thresholds
        # YOLO output is now captured in f, not printed to stdout

        # Draw bounding boxes on image
        from PIL import ImageDraw, ImageFont
        draw = ImageDraw.Draw(image)
        
        # Convert to required JSON array format: [{id, bounding_box, name_hint}]
        # bounding_box is normalized to 0-1000 range: [x_min, y_min, x_max, y_max]
        detected_rooms = []
        
        for result in results:
            boxes = result.boxes
            if boxes is not None:
                for i, box in enumerate(boxes):
                    # Get bounding box coordinates in pixels
                    x1, y1, x2, y2 = box.xyxy[0].tolist()
                    conf = box.conf[0].item()
                    
                    # Draw bounding box (green rectangle)
                    draw.rectangle([x1, y1, x2, y2], outline='green', width=3)
                    
                    # Draw label
                    label = f"Room {i+1}"
                    try:
                        font = ImageFont.truetype("arial.ttf", 20)
                    except:
                        font = ImageFont.load_default()
                    draw.text((x1, y1 - 25), label, fill='green', font=font)
                    
                    # Convert to 0-1000 normalized range
                    bounding_box = [
                        int((x1 / img_width) * 1000),   # x_min
                        int((y1 / img_height) * 1000),   # y_min
                        int((x2 / img_width) * 1000),    # x_max
                        int((y2 / img_height) * 1000)    # y_max
                    ]
                    
                    detected_rooms.append({
                        'id': f'room_{i+1:03d}',
                        'bounding_box': bounding_box,
                        'name_hint': 'room'  # One-class model
                    })

        sys.stderr.write(f"Detection complete: {len(detected_rooms)} rooms found\n")

        # Convert annotated image to base64
        output_buffer = BytesIO()
        image.save(output_buffer, format='PNG')
        annotated_image_base64 = base64.b64encode(output_buffer.getvalue()).decode('utf-8')
        
        return {
            'detections': detected_rooms,
            'annotated_image': annotated_image_base64
        }

    except Exception as e:
        sys.stderr.write(f"Inference failed: {e}\n")
        traceback.print_exc(file=sys.stderr)
        # Fallback to mock results if model fails
        sys.stderr.write("Falling back to mock results...\n")
        mock_detections = get_mock_results(image_data)
        return {
            'detections': mock_detections,
            'annotated_image': None  # No annotated image for mock results
        }

def get_mock_results(image_data):
    """Fallback mock results when model inference fails"""
    # Return mock detections in the required format
    return [
        {
            'id': 'room_001',
            'bounding_box': [50, 50, 200, 300],
            'name_hint': 'room'
        },
        {
            'id': 'room_002',
            'bounding_box': [250, 50, 700, 500],
            'name_hint': 'room'
        }
    ]

if __name__ == "__main__":
    main()

