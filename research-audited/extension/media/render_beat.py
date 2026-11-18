#!/usr/bin/env python3
"""Render one walkthrough beat to a cached, softened WAV.

Called by the extension at *build* time, never during playback. One process,
one beat, no server — so it fits inside a VS Code extension without asking the
user to keep a daemon running.

  python3 render_beat.py --text "This line divides the total." --out beat-003.wav

Backends (pick with --backend, default auto):
  kokoro     82M, 24 kHz, ONNX, CPU-only.  Apache-2.0.   ~0.9x realtime.
  chatterbox 110M/350M, 24 kHz, torch.     MIT.          Turbo only: tags ignored
             unless the model version supports them (see tts_turbo.py).
  external   POST whatever /v1/audio/speech server you have (VoxCPM2 etc).

Everything downstream is identical, which is the point: the voice is a flag.
"""
import argparse
import json
import os
import struct
import sys
import wave

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
CFG = json.load(open(os.path.join(HERE, "voice-soft.json")))
TAGS = set(CFG.get("tags", []))


def log(*a):
    print(*a, file=sys.stderr, flush=True)


# ---------------------------------------------------------------- backends
def render_kokoro(text, speed, lang="en-us"):
    from kokoro_onnx import Kokoro
    k = Kokoro(
        os.path.join(HERE, "kokoro-v1.0.onnx"),
        os.path.join(HERE, "voices-v1.0.bin"),
    )
    audio, sr = k.create(text, voice=CFG["voice"], speed=speed, lang=lang)
    return np.asarray(audio, dtype=np.float32), sr


def render_chatterbox(text, speed):
    """Chatterbox: tags are spoken-level, so they must NOT be stripped.
    cfg_weight is the pace knob; exaggeration is NOT supported on Turbo."""
    from chatterbox.tts_turbo import ChatterboxTurboTTS
    dev = os.environ.get("WT_DEVICE", "cpu")
    model = ChatterboxTurboTTS.from_pretrained(device=dev, nano=True)
    wav = model.generate(text, cfg_weight=0.5 / max(speed, 0.1))
    return wav.squeeze(0).numpy(), model.sr


def render_external(text, speed):
    import urllib.request
    url = os.environ.get("WT_TTS_URL", "http://127.0.0.1:8880/v1/audio/speech")
    body = json.dumps({
        "model": os.environ.get("WT_TTS_MODEL", "voxcpm2"),
        "voice": os.environ.get("WT_TTS_VOICE", "default"),
        "input": text, "speed": speed, "response_format": "wav",
    }).encode()
    req = urllib.request.Request(url, data=body, headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=600) as r:
        raw = r.read()
    tmp = os.path.join(HERE, ".tmp-external.wav")
    open(tmp, "wb").write(raw)
    return read_wav(tmp)


# ---------------------------------------------------------------- audio io
def read_wav(path):
    with wave.open(path) as w:
        sr, n, ch, sw = w.getframerate(), w.getnframes(), w.getnchannels(), w.getsampwidth()
        raw = w.readframes(n)
    if sw != 2:
        raise ValueError("expect 16-bit PCM")
    a = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if ch > 1:
        a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def write_wav(path, audio, sr):
    pcm = (np.clip(audio, -1, 1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes(pcm.tobytes())


def resample(a, sr, target=24000):
    if sr == target:
        return a, target
    n = int(round(len(a) * target / sr))
    return np.interp(np.linspace(0, len(a) - 1, n), np.arange(len(a)), a).astype(np.float32), target


# ------------------------------------------------------------- soft chain
def biquad_lowpass(a, sr, fc, q=0.707):
    w0 = 2 * np.pi * fc / sr
    alpha = np.sin(w0) / (2 * q)
    b0 = (1 - np.cos(w0)) / 2
    b1 = 1 - np.cos(w0)
    b2 = b0
    a0 = 1 + alpha
    a1, a2 = -2 * np.cos(w0), 1 - alpha
    return _filt(a, b0, b1, b2, a0, a1, a2)


def lowshelf(a, sr, fc, gain_db, s=1.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * fc / sr
    alpha = np.sin(w0) / 2 * np.sqrt((A + 1 / A) * (1 / s - 1) + 2)
    c = np.cos(w0)
    b0 = A * ((A + 1) - (A - 1) * c + 2 * np.sqrt(A) * alpha)
    b1 = 2 * A * ((A - 1) - (A + 1) * c)
    b2 = A * ((A + 1) - (A - 1) * c - 2 * np.sqrt(A) * alpha)
    a0 = (A + 1) + (A - 1) * c + 2 * np.sqrt(A) * alpha
    a1 = -2 * ((A - 1) + (A + 1) * c)
    a2 = (A + 1) + (A - 1) * c - 2 * np.sqrt(A) * alpha
    return _filt(a, b0, b1, b2, a0, a1, a2)


def _filt(x, b0, b1, b2, a0, a1, a2):
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = np.zeros_like(x)
    x1 = x2 = y1 = y2 = 0.0
    for i, xn in enumerate(x):
        yn = b0 * xn + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1 = x1, xn
        y2, y1 = y1, yn
        y[i] = yn
    return y


def soften(a, sr):
    post = CFG.get("post", {})
    y = biquad_lowpass(a, sr, post.get("lowpass_hz", 7000))
    y = lowshelf(y, sr, post.get("lowshelf_hz", 110), post.get("lowshelf_db", 2.5))
    peak = float(np.abs(y).max()) or 1.0
    return y / peak * float(post.get("peak", 0.85))


# ------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--backend", default="auto", choices=["auto", "kokoro", "chatterbox", "external"])
    ap.add_argument("--speed", type=float, default=float(CFG.get("speed", 0.85)))
    ap.add_argument("--no-soften", action="store_true")
    a = ap.parse_args()

    text = a.text
    backend = a.backend
    if backend == "auto":
        backend = os.environ.get("WT_BACKEND", "kokoro")

    # Kokoro speaks tags literally, so strip them; Chatterbox needs them.
    speech = text
    if backend in ("kokoro", "external"):
        for t in TAGS:
            speech = speech.replace(t, " ")
        speech = " ".join(speech.split())

    try:
        if backend == "kokoro":
            audio, sr = render_kokoro(speech, a.speed)
        elif backend == "chatterbox":
            audio, sr = render_chatterbox(speech, a.speed)
        else:
            audio, sr = render_external(speech, a.speed)
    except Exception as e:
        log(f"backend '{backend}' failed: {e}")
        return 2

    audio, sr = resample(np.asarray(audio, dtype=np.float32), sr)
    audio = audio / (np.abs(audio).max() or 1.0) * 0.95      # normalise before filtering
    if not a.no_soften:
        audio = soften(audio, sr)                             # then pull back to 0.85
    # short fades so cached clips splice without clicks
    f = min(int(0.02 * sr), len(audio) // 2)
    audio[:f] *= np.linspace(0, 1, f)
    audio[-f:] *= np.linspace(1, 0, f)

    write_wav(a.out, audio, sr)
    log(f"{os.path.basename(a.out)}  {backend}  {sr} Hz  {len(audio)/sr:.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
