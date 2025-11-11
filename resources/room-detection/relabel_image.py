"""
Utility to redraw bounding boxes on an image with custom labels
"""
import sys
import json
import base64
import io
from PIL import Image, ImageDraw, ImageFont
import numpy as np

def relabel_image(image_base64: str, detections: list, labels: dict) -> str:
    """
    Redraw bounding boxes with custom labels
    
    Args:
        image_base64: Base64 encoded image
        detections: List of detection objects with bounding_box coordinates
        labels: Dict mapping detection IDs to custom labels
    
    Returns:
        Base64 encoded image with new labels
    """
    # Decode image
    image_data = base64.b64decode(image_base64)
    image = Image.open(io.BytesIO(image_data)).convert('RGB')
    draw = ImageDraw.Draw(image)
    
    # Try to load a nice font, fallback to default
    try:
        font = ImageFont.truetype("arial.ttf", 16)
    except:
        font = ImageFont.load_default()
    
    # Colors for bounding boxes (cycling through for multiple detections)
    colors = [
        (255, 0, 0),    # Red
        (0, 255, 0),    # Green
        (0, 0, 255),    # Blue
        (255, 255, 0),  # Yellow
        (255, 0, 255),  # Magenta
        (0, 255, 255),  # Cyan
    ]
    
    # Draw each detection
    for idx, det in enumerate(detections):
        bbox = det['bounding_box']
        det_id = det['id']
        label = labels.get(det_id, det.get('name_hint', 'room'))
        
        # Get color for this detection
        color = colors[idx % len(colors)]
        
        # Draw bounding box
        x1, y1, x2, y2 = bbox
        draw.rectangle([x1, y1, x2, y2], outline=color, width=3)
        
        # Draw label background
        text_bbox = draw.textbbox((x1, y1 - 20), label, font=font)
        draw.rectangle(text_bbox, fill=color)
        
        # Draw label text
        draw.text((x1, y1 - 20), label, fill=(255, 255, 255), font=font)
    
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

