#!/usr/bin/env python3
"""
Python Inference Service for Damage Detection (Roof/Property)
Adapted from TipTop - follows room detection stdin/stdout protocol
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
import cv2

# Optional: OpenAI for GPT-4 Vision cost estimation
try:
    from openai import OpenAI
    OPENAI_AVAILABLE = True
except ImportError:
    OPENAI_AVAILABLE = False
    sys.stderr.write("OpenAI library not available - using heuristic cost estimates\n")

# Check for bundled models path (from Electron) - PRIMARY source
BUNDLED_MODELS_PATH = os.environ.get('BUNDLED_MODELS_PATH')
if BUNDLED_MODELS_PATH:
    BUNDLED_MODELS_PATH = Path(BUNDLED_MODELS_PATH)
else:
    BUNDLED_MODELS_PATH = None

# Damage classes (roof damage)
DAMAGE_CLASSES = {
    0: "missing_shingle",
    1: "lifted_shingle",
    2: "torn_shingle",
    3: "hail_bruise"
}

# Cost estimation constants
SETUP_MIN_USD = 150.00
CLASS_BASE_COSTS = {
    "missing_shingle": 125.00,
    "lifted_shingle": 125.00,
    "torn_shingle": 125.00,
    "hail_bruise": 90.00,
}
SEVERITY_MULTIPLIER = 400.00
DISPOSAL_USD = 25.00
CONTINGENCY_PCT = 0.10
LABOR_PCT = 0.60

# Helper to find model path
def find_model_path(model_id):
    """Find model path in bundled models"""
    if BUNDLED_MODELS_PATH:
        bundled_path = BUNDLED_MODELS_PATH / model_id / 'weights' / 'best.pt'
        if bundled_path.exists():
            return bundled_path
    
    return None

# Available models
MODELS = {
    'roof_damage_nano_300ep': {
        'description': 'Roof Damage Detection - Nano - 300 epochs'
    },
    'roof_damage_small_200ep': {
        'description': 'Roof Damage Detection - Small - 200 epochs'
    },
    'default': {
        'description': 'Default model (roof_damage_nano_300ep)'
    }
}

# Global model cache
loaded_models = {}

def main():
    try:
        # Read raw image bytes from stdin
        # First 4 bytes are model ID length, then model ID, then image data
        model_id_length_bytes = sys.stdin.buffer.read(4)
        if len(model_id_length_bytes) != 4:
            raise ValueError("Invalid input format")
        
        model_id_length = int.from_bytes(model_id_length_bytes, 'big')
        model_id_bytes = sys.stdin.buffer.read(model_id_length)
        model_id = model_id_bytes.decode('utf-8') if model_id_bytes else 'default'
        
        # Read confidence threshold (4 bytes, float)
        import struct
        confidence_bytes = sys.stdin.buffer.read(4)
        if len(confidence_bytes) == 4:
            confidence = struct.unpack('>f', confidence_bytes)[0]  # Big-endian float
        else:
            confidence = 0.2  # Default fallback
        
        # Read remaining image data
        image_data = sys.stdin.buffer.read()
        
        if not image_data:
            raise ValueError("No image data provided")
        
        sys.stderr.write(f"Received {len(image_data)} bytes of image data for model: {model_id}, confidence: {confidence}\n")
        
        # Perform inference
        result = perform_inference(image_data, model_id, conf_threshold=confidence)
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
    """Load the specified YOLO model from bundled resources"""
    global loaded_models

    if model_id in loaded_models:
        return loaded_models[model_id]

    # Handle special cases
    if model_id == 'default':
        # Try bundled models in order of preference
        for fallback_id in ['roof_damage_nano_300ep', 'roof_damage_small_200ep']:
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

def calculate_severity(bbox, img_width, img_height):
    """Calculate severity from bounding box area"""
    x, y, w, h = bbox
    bbox_area = w * h
    img_area = img_width * img_height
    return min(1.0, max(0.0, bbox_area / img_area)) if img_area > 0 else 0.0

def estimate_cost_with_gpt_vision(image_base64, detections, img_width, img_height):
    """Use GPT-4 Vision to estimate repair costs based on the annotated image"""
    try:
        if not OPENAI_AVAILABLE:
            sys.stderr.write("OpenAI not available, using fallback\n")
            return None
            
        api_key = os.environ.get('OPENAI_API_KEY')
        if not api_key:
            sys.stderr.write("OPENAI_API_KEY not found, using fallback\n")
            return None
        
        sys.stderr.write(f"Calling GPT-4 Vision for cost estimation ({len(detections)} damage areas detected)...\n")
        
        client = OpenAI(api_key=api_key)
        
        # Calculate total affected area
        total_area_pct = sum(d.get('affected_area_pct', 0) for d in detections)
        
        prompt = f"""You are an experienced roofing contractor. Analyze this roof damage image with YOLO detection annotations.

Detected damage areas: {len(detections)}
Total affected area: {total_area_pct:.2f}% of image
Image dimensions: {img_width}x{img_height} pixels

Provide a realistic repair cost estimate for this roof damage including:
1. Labor costs (hourly rate × estimated hours)
2. Materials costs (shingles, underlayment, nails, etc.)
3. Disposal/dump fees for old materials
4. Contingency buffer (10-15%)

Respond ONLY with valid JSON in this exact format:
{{
  "labor_usd": <number>,
  "materials_usd": <number>,
  "disposal_usd": <number>,
  "contingency_usd": <number>,
  "total_usd": <number>,
  "assumptions": "<brief explanation of your estimate>"
}}"""

        response = client.chat.completions.create(
            model="gpt-4o",  # or gpt-4-vision-preview
            messages=[
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": prompt},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{image_base64}"
                            }
                        }
                    ]
                }
            ],
            max_tokens=500,
            temperature=0.3
        )
        
        # Parse the JSON response
        content = response.choices[0].message.content
        sys.stderr.write(f"GPT-4 Vision response: {content[:200]}...\n")
        
        # Try to extract JSON from markdown code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        
        cost_data = json.loads(content)
        
        # Validate required fields
        required_fields = ['labor_usd', 'materials_usd', 'disposal_usd', 'contingency_usd', 'total_usd', 'assumptions']
        if all(field in cost_data for field in required_fields):
            sys.stderr.write("GPT-4 Vision cost estimation successful!\n")
            return cost_data
        else:
            sys.stderr.write(f"GPT-4 Vision response missing required fields\n")
            return None
            
    except Exception as e:
        sys.stderr.write(f"GPT-4 Vision cost estimation failed: {e}\n")
        traceback.print_exc(file=sys.stderr)
        return None

def estimate_cost(detections):
    """Fallback heuristic cost estimation from detections"""
    has_findings = len(detections) > 0
    setup_min = SETUP_MIN_USD if has_findings else 0.00
    
    disposal = DISPOSAL_USD if any(
        d["cls"] in ("missing_shingle", "torn_shingle") 
        for d in detections
    ) else 0.00
    
    subtotal = setup_min
    for d in detections:
        cls = d.get("cls", "")
        sev = float(d.get("severity", 0.0))
        base = CLASS_BASE_COSTS.get(cls, 100.00)
        subtotal += base + (SEVERITY_MULTIPLIER * sev)
    
    contingency = CONTINGENCY_PCT * subtotal
    total = subtotal + disposal + contingency
    
    return {
        "labor_usd": round(subtotal * LABOR_PCT, 2),
        "materials_usd": round(subtotal * (1 - LABOR_PCT), 2),
        "disposal_usd": round(disposal, 2),
        "contingency_usd": round(contingency, 2),
        "total_usd": round(total, 2),
        "assumptions": "Heuristic fallback: class base + area severity + setup minimum + 10% contingency."
    }

def perform_inference(image_data, model_id='default', conf_threshold=0.2):
    """Perform damage detection inference with trained YOLO model"""
    try:
        # Load model
        model = load_model(model_id)
        
        # Convert binary image data to PIL Image
        image_bytes = BytesIO(image_data)
        pil_image = Image.open(image_bytes)
        
        # Convert to numpy array for OpenCV
        img_array = np.array(pil_image)
        
        # Get dimensions
        if len(img_array.shape) == 2:  # Grayscale
            img_height, img_width = img_array.shape
        else:  # Color
            img_height, img_width = img_array.shape[:2]
        
        sys.stderr.write(f"Image dimensions: {img_width}x{img_height}\n")
        
        # Run inference
        results = model(pil_image, conf=conf_threshold, verbose=False)
        
        if not results or len(results) == 0:
            return {
                "detections": [],
                "cost_estimate": estimate_cost([]),
                "image_width": img_width,
                "image_height": img_height,
                "annotated_image": None
            }
        
        r = results[0]
        
        # Parse detections
        detections = []
        for box in r.boxes:
            xyxy = box.xyxy[0].tolist()  # [x1, y1, x2, y2]
            conf = float(box.conf[0])
            cls_id = int(box.cls[0])
            cls_name = DAMAGE_CLASSES.get(cls_id, f"unknown_{cls_id}")
            
            # Convert to [x, y, w, h]
            x1, y1, x2, y2 = xyxy
            bbox = [x1, y1, x2 - x1, y2 - y1]
            
            # Calculate severity
            severity = calculate_severity(bbox, img_width, img_height)
            
            detections.append({
                "cls": cls_name,
                "bbox": bbox,
                "conf": conf,
                "severity": severity,
                "affected_area_pct": round(severity * 100, 2)
            })
        
        sys.stderr.write(f"Found {len(detections)} detections\n")
        
        # Generate annotated image
        annotated_image = None
        try:
            # Get annotated image from YOLO
            annotated_array = r.plot()  # Returns BGR numpy array
            
            # Convert BGR to RGB
            annotated_rgb = cv2.cvtColor(annotated_array, cv2.COLOR_BGR2RGB)
            
            # Convert to PIL Image
            annotated_pil = Image.fromarray(annotated_rgb)
            
            # Convert to base64
            buffered = BytesIO()
            annotated_pil.save(buffered, format="PNG")
            annotated_image = base64.b64encode(buffered.getvalue()).decode('utf-8')
            
            sys.stderr.write("Generated annotated image\n")
        except Exception as e:
            sys.stderr.write(f"Failed to generate annotated image: {e}\n")
        
        # Estimate cost
        cost_estimate = estimate_cost(detections)
        
        return {
            "detections": detections,
            "cost_estimate": cost_estimate,
            "image_width": img_width,
            "image_height": img_height,
            "annotated_image": annotated_image
        }
        
    except Exception as e:
        sys.stderr.write(f"Inference error: {e}\n")
        traceback.print_exc(file=sys.stderr)
        raise

if __name__ == "__main__":
    main()
