#!/usr/bin/env python3
"""Minimal local voice for the walkthrough extension.

Usage:  python3 tts_server.py --text "..." --out /tmp/x.wav
Reads kokoro-v1.0.onnx + voices-v1.0.bin from $KOKORO_DIR (default ./voice).
Prints the WAV so the extension can time its highlight to the real audio.
"""
import argparse, os, sys, wave
import numpy as np

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--voice", default=os.environ.get("KOKORO_VOICE", "af_heart"))
    ap.add_argument("--speed", type=float, default=0.95)
    a = ap.parse_args()

    from kokoro_onnx import Kokoro
    d = os.environ.get("KOKORO_DIR", "voice")
    k = Kokoro(os.path.join(d, "kokoro-v1.0.onnx"), os.path.join(d, "voices-v1.0.bin"))
    samples, sr = k.create(a.text, voice=a.voice, speed=a.speed, lang="en-us")

    pcm = (np.clip(samples, -1, 1) * 32767).astype("<i2")
    with wave.open(a.out, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes(pcm.tobytes())
    sys.stderr.write(f"wrote {a.out} ({len(samples)/sr:.2f}s @ {sr}Hz)\n")

if __name__ == "__main__":
    main()
