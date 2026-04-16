from PIL import Image
import os
import sys

def convert_to_ico(input_path, output_path):
    img = Image.open(input_path)
    # Ensure it's square for a clean icon (standard icons are 256x256)
    img = img.resize((256, 256), Image.Resampling.LANCZOS)
    img.save(output_path, format='ICO', sizes=[(256, 256), (128, 128), (64, 64), (48, 48), (32, 32), (16, 16)])
    print(f"Successfully converted {input_path} to {output_path}")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python convert_ico.py <input_png> <output_ico>")
    else:
        convert_to_ico(sys.argv[1], sys.argv[2])
