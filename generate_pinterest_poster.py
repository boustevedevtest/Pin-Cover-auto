#!/usr/bin/env python3
"""
Automated Pinterest Poster Generator
Creates 1000x1500px Pinterest-ready posters based on a fixed template.

Usage:
    python generate_pinterest_poster.py --title "Your Title" --image1 path/to/image1.jpg --image2 path/to/image2.jpg --output poster.jpg
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
import argparse
import requests
from io import BytesIO
import textwrap
import sys
import os

# Design Constants (Pinterest Template)
CANVAS_WIDTH = 1000
CANVAS_HEIGHT = 1500
TITLE_COLOR = "#4B6F44"  # Dark olive/hunter green
BANNER_COLOR = "#FFFFFF"  # White
BANNER_HEIGHT_RATIO = 0.22  # Banner occupies ~22% of height
TITLE_FONT_SIZE = 90  # Base font size for title
MIN_FONT_SIZE = 50  # Minimum font size if title is very long


def load_image_from_source(source):
    """Load image from URL or local path."""
    try:
        if source.startswith('http://') or source.startswith('https://'):
            response = requests.get(source, timeout=10)
            response.raise_for_status()
            img = Image.open(BytesIO(response.content))
        else:
            img = Image.open(source)
        
        return img.convert('RGB')
    except Exception as e:
        print(f"Error loading image from {source}: {e}")
        sys.exit(1)


def create_brush_banner(width, height):
    """Create a white banner with organic brush-stroke edges."""
    banner = Image.new('RGBA', (width, height), (255, 255, 255, 255))
    draw = ImageDraw.Draw(banner)
    
    # Create rough edges by drawing irregular lines
    # Top edge
    for x in range(0, width, 20):
        offset = hash(f"top{x}") % 15 - 7
        draw.ellipse([x-10, offset-5, x+10, offset+5], fill=(255, 255, 255, 255))
    
    # Bottom edge
    for x in range(0, width, 20):
        offset = hash(f"bottom{x}") % 15 - 7
        draw.ellipse([x-10, height+offset-5, x+10, height+offset+5], fill=(255, 255, 255, 255))
    
    # Apply slight blur for softer edges
    banner = banner.filter(ImageFilter.GaussianBlur(radius=2))
    
    return banner


def fit_text_to_width(text, font_path, max_width, base_size, min_size):
    """Dynamically resize text to fit within max_width."""
    current_size = base_size
    
    while current_size >= min_size:
        try:
            font = ImageFont.truetype(font_path, current_size)
        except:
            # Fallback to default font
            font = ImageFont.load_default()
            return font, text
        
        # Check if text fits in one line
        bbox = font.getbbox(text)
        text_width = bbox[2] - bbox[0]
        
        if text_width <= max_width:
            return font, text
        
        # Try splitting into 2 lines
        words = text.split()
        if len(words) > 1:
            mid = len(words) // 2
            line1 = ' '.join(words[:mid])
            line2 = ' '.join(words[mid:])
            two_line_text = f"{line1}\n{line2}"
            
            # Check if two lines fit
            bbox1 = font.getbbox(line1)
            bbox2 = font.getbbox(line2)
            max_line_width = max(bbox1[2] - bbox1[0], bbox2[2] - bbox2[0])
            
            if max_line_width <= max_width:
                return font, two_line_text
        
        current_size -= 5
    
    # Last resort: use minimum size
    try:
        font = ImageFont.truetype(font_path, min_size)
    except:
        font = ImageFont.load_default()
    
    return font, text


def generate_pinterest_poster(title, image1_source, image2_source, output_path):
    """Generate a Pinterest poster based on the template."""
    
    # Create canvas
    canvas = Image.new('RGB', (CANVAS_WIDTH, CANVAS_HEIGHT), (255, 255, 255))
    
    # Load images
    print("Loading images...")
    img1 = load_image_from_source(image1_source)
    img2 = load_image_from_source(image2_source)
    
    # Calculate image heights (each takes 50% of canvas)
    half_height = CANVAS_HEIGHT // 2
    
    # Resize and crop images to fit (center crop)
    def resize_and_crop(img, target_width, target_height):
        # Calculate aspect ratios
        img_ratio = img.width / img.height
        target_ratio = target_width / target_height
        
        if img_ratio > target_ratio:
            # Image is wider, fit to height
            new_height = target_height
            new_width = int(new_height * img_ratio)
        else:
            # Image is taller, fit to width
            new_width = target_width
            new_height = int(new_width / img_ratio)
        
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # Center crop
        left = (new_width - target_width) // 2
        top = (new_height - target_height) // 2
        img = img.crop((left, top, left + target_width, top + target_height))
        
        return img
    
    print("Processing images...")
    img1_processed = resize_and_crop(img1, CANVAS_WIDTH, half_height)
    img2_processed = resize_and_crop(img2, CANVAS_WIDTH, half_height)
    
    # Paste images onto canvas
    canvas.paste(img1_processed, (0, 0))
    canvas.paste(img2_processed, (0, half_height))
    
    # Create banner
    banner_height = int(CANVAS_HEIGHT * BANNER_HEIGHT_RATIO)
    banner_y = (CANVAS_HEIGHT - banner_height) // 2
    
    print("Creating banner...")
    banner = create_brush_banner(CANVAS_WIDTH, banner_height)
    
    # Paste banner onto canvas
    canvas.paste(banner, (0, banner_y), banner)
    
    # Add title text
    print("Adding title text...")
    draw = ImageDraw.Draw(canvas)
    
    # Try to find a good font
    font_options = [
        "/System/Library/Fonts/Supplemental/Impact.ttf",
        "/System/Library/Fonts/Helvetica.ttc",
        "/Library/Fonts/Arial Bold.ttf",
        "arial.ttf",
        "Arial.ttf"
    ]
    
    font_path = None
    for path in font_options:
        if os.path.exists(path):
            font_path = path
            break
    
    # Make title uppercase
    title_upper = title.upper()
    
    # Fit text to banner width (with padding)
    max_text_width = int(CANVAS_WIDTH * 0.85)  # 85% of canvas width
    
    if font_path:
        font, final_text = fit_text_to_width(
            title_upper, 
            font_path, 
            max_text_width, 
            TITLE_FONT_SIZE, 
            MIN_FONT_SIZE
        )
    else:
        font = ImageFont.load_default()
        final_text = title_upper
    
    # Calculate text position (center of banner)
    if '\n' in final_text:
        lines = final_text.split('\n')
        total_height = 0
        line_heights = []
        
        for line in lines:
            bbox = font.getbbox(line)
            line_height = bbox[3] - bbox[1]
            line_heights.append(line_height)
            total_height += line_height
        
        # Add spacing between lines
        total_height += 20 * (len(lines) - 1)
        
        y_start = banner_y + (banner_height - total_height) // 2
        
        for i, line in enumerate(lines):
            bbox = font.getbbox(line)
            text_width = bbox[2] - bbox[0]
            x = (CANVAS_WIDTH - text_width) // 2
            
            # Draw text with stroke for better readability
            # Stroke effect
            stroke_width = 3
            for dx in range(-stroke_width, stroke_width + 1):
                for dy in range(-stroke_width, stroke_width + 1):
                    if dx*dx + dy*dy <= stroke_width*stroke_width:
                        draw.text((x + dx, y_start + dy), line, font=font, fill=BANNER_COLOR)
            
            # Main text
            draw.text((x, y_start), line, font=font, fill=TITLE_COLOR)
            
            y_start += line_heights[i] + 20
    else:
        bbox = font.getbbox(final_text)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
        
        x = (CANVAS_WIDTH - text_width) // 2
        y = banner_y + (banner_height - text_height) // 2
        
        # Draw text with stroke
        stroke_width = 3
        for dx in range(-stroke_width, stroke_width + 1):
            for dy in range(-stroke_width, stroke_width + 1):
                if dx*dx + dy*dy <= stroke_width*stroke_width:
                    draw.text((x + dx, y + dy), final_text, font=font, fill=BANNER_COLOR)
        
        # Main text
        draw.text((x, y), final_text, font=font, fill=TITLE_COLOR)
    
    # Save as JPG
    print(f"Saving to {output_path}...")
    canvas.save(output_path, 'JPEG', quality=95, optimize=True)
    print(f"✅ Pinterest poster generated successfully: {output_path}")


def main():
    parser = argparse.ArgumentParser(description='Generate Pinterest-ready posters')
    parser.add_argument('--title', required=True, help='Title text for the poster')
    parser.add_argument('--image1', required=True, help='Path or URL to first image (top half)')
    parser.add_argument('--image2', required=True, help='Path or URL to second image (bottom half)')
    parser.add_argument('--output', default='pinterest_poster.jpg', help='Output file path (default: pinterest_poster.jpg)')
    
    args = parser.parse_args()
    
    generate_pinterest_poster(args.title, args.image1, args.image2, args.output)


if __name__ == '__main__':
    main()
