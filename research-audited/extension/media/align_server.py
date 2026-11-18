#!/usr/bin/env python3
"""Word-level alignment sidecar for the walkthrough extension.

stdin:  one audio path per line (a WAV the extension just synthesised)
stdout: one JSON line per input — {"words":[{"w":"total","s":1.23,"e":1.55}, ...]}

Uses faster-whisper (CTranslate2, int8) — no torch, no GPU, ~50x real-time on CPU.
Install:  pip install faster-whisper
"""
import json, sys, wave
import numpy as np
from faster_whisper import WhisperModel

MODEL = WhisperModel("tiny.en", device="cpu", compute_type="int8", download_root="./models")

def read_wav(path):
    with wave.open(path) as w:
        sr = w.getframerate()
        n = w.getnframes()
        ch = w.getnchannels()
        if w.getsampwidth() != 2:
            raise ValueError("expect 16-bit PCM wav")
        raw = np.frombuffer(w.readframes(n), dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        raw = raw.reshape(-1, ch).mean(axis=1)
    return raw, sr

def main():
    for line in sys.stdin:
        path = line.strip()
        if not path:
            continue
        try:
            audio, sr = read_wav(path)
            segs, _ = MODEL.transcribe(audio, word_timestamps=True, beam_size=1, language="en")
            words = [{"w": w.word.strip(), "s": round(w.start, 3), "e": round(w.end, 3)}
                     for s in segs for w in s.words if w.word.strip()]
            print(json.dumps({"path": path, "words": words}), flush=True)
        except Exception as e:
            print(json.dumps({"path": path, "error": str(e)}), flush=True)

if __name__ == "__main__":
    main()
