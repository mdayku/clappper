"""
Utility to redraw bounding boxes on damage detection image with specific damage type labels
"""
import sys
import json
import base64
import io
from PIL import Image, ImageDraw, ImageFont
import numpy as np

def relabel_image(image_base64: str, detections: list, labels: dict) -> str:
    """
    Redraw bounding boxes with specific damage type labels
    
    Args:
        image_base64: Base64 encoded image
        detections: List of detection objects with bbox coordinates
        labels: Dict mapping detection indices to specific damage types
    
    Returns:
        Base64 encoded image with new labels
    """
    # Decode image
    image_data = base64.b64decode(image_base64)
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    draw = ImageDraw.Draw(image)
    
    # Try to load a nice font, fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", 14)
    except:
        font = ImageFont.load_default()
    
    # Draw each detection with its specific damage type
    for idx, det in enumerate(detections):
        bbox = det['bbox']
        label = labels.get(str(idx), 'damage')  # Fallback to 'damage' if no specific type
        confidence = det.get('conf', 0)
        
        # Color: green (good/minor) to red (severe)
        color = (0, 255, 0) if confidence < 0.5 else (255, 165, 0) if confidence < 0.75 else (255, 0, 0)
        
        # Draw bounding box
        x1, y1, x2, y2 = bbox
        draw.rectangle([x1, y1, x2, y2], outline=color, width=2)
        
        # Draw label with confidence
        label_text = f"{label} ({confidence:.2f})"
        text_bbox = draw.textbbox((x1, y1 - 18), label_text, font=font)
        draw.rectangle(text_bbox, fill=color)
        
        # Draw label text
        draw.text((x1, y1 - 18), label_text, fill=(255, 255, 255), font=font)
    
    # Convert back to base64
    buffered = io.BytesIO()
    image.save(buffered, format='PNG')
    return base64.b64encode(buffered.getvalue()).decode('utf-8')

def main():
    # Read JSON input from stdin
    input_data = json.loads(sys.stdin.read())
    
    image_base64 = input_data['image']
    detections = input_data['detections']
    labels = input_data['labels']
    
    # Relabel image
    relabeled_image = relabel_image(image_base64, detections, labels)
    
    # Output
    print(json.dumps({'annotated_image': relabeled_image}), flush=True)

if __name__ == '__main__':
    main()

