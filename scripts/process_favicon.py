#!/usr/bin/env python3
"""
Process the car image to remove dark background and create a transparent favicon.
The car is a green-to-cyan gradient, so we keep those colors and remove dark grays.
"""

from PIL import Image
import os

def remove_dark_background(input_path, output_path):
    """Remove dark background and crop to the car, making it transparent."""
    img = Image.open(input_path).convert("RGBA")
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            
            is_car_color = False
            
            if g > 100 and (g > r + 20 or b > r + 20):
                is_car_color = True
            
            if b > 150 and g > 150:
                is_car_color = True
            
            if not is_car_color:
                pixels[x, y] = (0, 0, 0, 0)
    
    bbox = img.getbbox()
    if bbox:
        padding = 5
        left = max(0, bbox[0] - padding)
        top = max(0, bbox[1] - padding)
        right = min(width, bbox[2] + padding)
        bottom = min(height, bbox[3] + padding)
        img = img.crop((left, top, right, bottom))
    
    img.save(output_path, "PNG")
    print(f"Saved transparent image to {output_path} ({img.size[0]}x{img.size[1]})")
    return img

def create_favicon(input_img, output_path):
    """Create a favicon from the transparent image."""
    favicon = input_img.copy()
    favicon.thumbnail((128, 128), Image.Resampling.LANCZOS)
    favicon.save(output_path, "PNG")
    print(f"Saved favicon to {output_path} ({favicon.size[0]}x{favicon.size[1]})")

def create_favicon_sizes(input_img, public_dir):
    """Create multiple favicon sizes for browser compatibility."""
    sizes = {
        "favicon-16x16.png": 16,
        "favicon-32x32.png": 32,
        "favicon-192x192.png": 192,
        "apple-touch-icon.png": 180,
    }
    
    for filename, size in sizes.items():
        resized = input_img.copy()
        resized = resized.resize((size, size), Image.Resampling.LANCZOS)
        output_path = os.path.join(public_dir, filename)
        resized.save(output_path, "PNG")
        print(f"Saved {filename} ({size}x{size})")
    
    ico_sizes = [(16, 16), (32, 32), (48, 48)]
    ico_images = []
    for size in ico_sizes:
        resized = input_img.copy()
        resized = resized.resize(size, Image.Resampling.LANCZOS)
        ico_images.append(resized)
    
    ico_path = os.path.join(public_dir, "favicon.ico")
    ico_images[0].save(ico_path, format="ICO", sizes=[(img.width, img.height) for img in ico_images], append_images=ico_images[1:])
    print(f"Saved favicon.ico with sizes: {ico_sizes}")

if __name__ == "__main__":
    input_file = "attached_assets/Gemini_Generated_Image_uqkl5auqkl5auqkl_1765235092499.png"
    transparent_output = "client/public/car-logo-transparent.png"
    favicon_output = "client/public/favicon.png"
    public_dir = "client/public"
    
    os.makedirs(public_dir, exist_ok=True)
    
    transparent_img = remove_dark_background(input_file, transparent_output)
    
    create_favicon(transparent_img, favicon_output)
    create_favicon_sizes(transparent_img, public_dir)
    
    print("Done!")
