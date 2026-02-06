#!/usr/bin/env python3
"""
Download and cache an image model for local use (same pipeline as generate_image.py).
Run once per model; after this, generate_image.py will use the cached model.
First-time download is 4–6GB+ and often takes 10–30 minutes.
"""

import argparse
import os
import sys
import threading
import time

# Disable Hugging Face's in-place progress bar so progress shows line-by-line when stderr is captured
os.environ["HF_HUB_DISABLE_PROGRESS_BARS"] = "1"

def main():
    parser = argparse.ArgumentParser(description='Install (download) an image model for local generation')
    parser.add_argument('--model', required=True, help='Hugging Face model ID (e.g. runwayml/stable-diffusion-v1-5)')
    parser.add_argument('--use-cpu', type=str, default='false', help='Use CPU only')
    args = parser.parse_args()

    try:
        from diffusers import AutoPipelineForText2Image
        import torch

        model_name = args.model
        use_cpu = args.use_cpu.lower() == 'true'

        print(f"Downloading model: {model_name}", file=sys.stderr, flush=True)
        print("First install is 4–6GB+ and often takes 10–30 min.", file=sys.stderr, flush=True)
        print("If it runs longer than 30 min with no change, cancel and retry (network may have stalled).", file=sys.stderr, flush=True)

        # Print progress every 15s so the user sees activity and knows it's not frozen
        done = threading.Event()
        def progress_ping():
            count = 0
            while not done.is_set():
                done.wait(timeout=15)
                if done.is_set():
                    break
                count += 1
                elapsed = count * 15
                print(f"  Still downloading... ({elapsed}s elapsed). Normal for 10–30 min.", file=sys.stderr, flush=True)
        t = threading.Thread(target=progress_ping, daemon=True)
        t.start()

        try:
            device = "cpu" if use_cpu else ("cuda" if torch.cuda.is_available() else "cpu")
            dtype = torch.float16 if device == "cuda" else torch.float32

            # Optional: HF_TOKEN/HUGGING_FACE_HUB_TOKEN for gated models (Stability 2.x/SDXL).
            # For local-only use, no API key needed; for gated models you can run
            #   huggingface-cli login
            # once so the download works (no token in this app required).
            token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGING_FACE_HUB_TOKEN")
            pipe = AutoPipelineForText2Image.from_pretrained(
                model_name,
                torch_dtype=dtype,
                token=token if token else None,
            )
        finally:
            done.set()

        print(f"Model installed successfully: {model_name}", file=sys.stderr, flush=True)
        print("INSTALL_OK")
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
    main()
