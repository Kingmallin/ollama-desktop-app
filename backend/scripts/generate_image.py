#!/usr/bin/env python3
"""
Image generation script using Hugging Face diffusers.
Uses AutoPipelineForText2Image so SD 1.5, SDXL, and other variants work.
"""

import argparse
import sys
import os
from pathlib import Path

def generate_image(prompt, model_name, output_dir, use_cpu=False):
    try:
        from diffusers import AutoPipelineForText2Image
        import torch
        
        print(f"Loading model: {model_name}", file=sys.stderr, flush=True)
        
        # Determine device
        device = "cpu" if use_cpu else ("cuda" if torch.cuda.is_available() else "cpu")
        print(f"Using device: {device}", file=sys.stderr, flush=True)
        
        dtype = torch.float16 if device == "cuda" else torch.float32
        pipe = AutoPipelineForText2Image.from_pretrained(
            model_name,
            torch_dtype=dtype,
        )
        pipe = pipe.to(device)
        
        if device == "cpu":
            pipe.enable_attention_slicing()
        
        # Turbo models need 1–4 steps; SDXL 25–30; SD 1.5 ~25
        is_turbo = "turbo" in model_name.lower()
        is_sdxl = "xl" in model_name.lower() or "sdxl" in model_name.lower()
        if is_turbo:
            num_steps = 4
            guidance = 1.0  # Turbo often uses low guidance
        elif is_sdxl:
            num_steps = 30
            guidance = 7.5
        else:
            num_steps = 25
            guidance = 7.5
        
        print("Generating image...", file=sys.stderr, flush=True)
        image = pipe(
            prompt,
            num_inference_steps=num_steps,
            guidance_scale=guidance,
        ).images[0]
        
        os.makedirs(output_dir, exist_ok=True)
        output_path = os.path.join(output_dir, f"generated-{int(__import__('time').time())}.png")
        image.save(output_path)
        
        print(f"IMAGE_PATH:{output_path}", flush=True)
        return output_path
        
    except ImportError as e:
        print(f"ERROR: Missing required library: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR: {str(e)}", file=sys.stderr, flush=True)
        import traceback
        traceback.print_exc(file=sys.stderr)
        sys.stderr.flush()
        sys.exit(1)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Generate image from text prompt')
    parser.add_argument('--prompt', required=True, help='Text prompt for image generation')
    parser.add_argument('--model', default='runwayml/stable-diffusion-v1-5', help='Model name from Hugging Face (e.g. SD 1.5, Realistic_Vision, SDXL)')
    parser.add_argument('--output-dir', required=True, help='Output directory for generated images')
    parser.add_argument('--use-cpu', type=str, default='false', help='Force CPU usage')
    
    args = parser.parse_args()
    
    use_cpu = args.use_cpu.lower() == 'true'
    generate_image(args.prompt, args.model, args.output_dir, use_cpu)
