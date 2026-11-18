# Code Walkthrough — research prototype

**Not production-ready.** Syntax and narrow unit tests pass; end-to-end speech playback and highlighting do not currently work reliably. Read `../swm/VALIDATION.md` (in the research bundle: `../notes/VALIDATION.md`) before trying the prototype.

## What is present

Four VS Code commands: explain selection, stop, save CodeTour, play tour. Planning uses `vscode.lm` or a configured OpenAI-compatible endpoint. Python sidecars synthesize with Kokoro or attempt faster-whisper alignment. A webview contains an audio player. `render_beat.py` is a separate experiment and is not wired into a cache.

## What is broken or unverified

Playback is posted only after the audio's duration has elapsed; word-level mode does not play its successfully aligned audio. Tour playback does not open the step's file and ignores pattern-based steps. No extension-host test has been run. See validation log for details. Do not use on sensitive code without checking your chosen provider's data handling.

## Standalone Kokoro renderer setup (not verified on M1)

Requires Python, NumPy, `kokoro-onnx`, compatible ONNX runtime and model files. Model files are excluded from the bundle. See the upstream instructions and release assets at https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0 . Model and runtime dependencies can change; we could not recover the exact earlier package versions, so this is a starting point, not a locked reproducible environment.

```sh
cd extension
python3 -m venv .venv
. .venv/bin/activate
python -m pip install numpy kokoro-onnx
# Download kokoro-v1.0.onnx and voices-v1.0.bin from the release page into media/.
python media/render_beat.py --backend kokoro --text "This line divides the total." --out /tmp/beat.wav
```

Apple Silicon phonemizer prerequisites may require extra setup; consult upstream. The extension's separate `tts_server.py` uses `$KOKORO_DIR` (default `./voice`), not `media/`; setting model paths alone does not fix playback. The extension needs a usable language-model provider or endpoint to plan narration.

## Tests

```sh
node tests/tour.test.js
python3 tests/render_external_test.py # NumPy required; uses a local mock, no external TTS service
node --check src/extension.js
```

These do not exercise VS Code, model inference, provider access, real audio output or M1 performance. An optional word timing experiment requires `faster-whisper` and downloadable model weights; check sample rate before providing audio, since the current aligner does not resample it explicitly.
