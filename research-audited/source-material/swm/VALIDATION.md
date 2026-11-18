# Validation and correction log — 2026-11-18

This document and `the-stack.md` override conflicting claims in older notes. The audit is ongoing; the archive is not a fully reproduced product.

## CodeTour: material correction

Our previous assertion that `.tour` lines are 0-based was wrong. CodeTour source at commit `29955a004445d3fd2ad5df35dd00f9cc0400ba7d` writes `thread.range.start.line + 1` in `src/recorder/commands.ts` and reads `step.line - 1` in `src/player/index.ts`. The schema explicitly says selection lines and characters are 1-based. `src/tour.js` now writes and reads 1-based values. `node tests/tour.test.js` passes external fixture, selection and offset tests. This is not an integration test against the actual extension. Previous round-trip test validated only our own mutual assumptions, not interoperability.

## Current prototype: code review findings

- `Voice.playFile()` waits for WAV duration before returning. Only then does `playBeats` post audio to the webview; highlighting is ahead of sound and later beats can interrupt playback. The webview's `done` message is not awaited. Autoplay failures are swallowed.
- In word-level mode, audio is rendered and aligned but never sent to the player when alignment succeeds. Matching narration words to source-code words generally fails; output is not proven synchronized.
- `playTour` uses the active editor rather than opening the step's file. The reader ignores `pattern`, `selection`, commands, and other CodeTour semantics; missing line silently defaults to line 1. Treat interoperability as partial only.
- The voice setting is not passed to the Kokoro subprocess; `speed` isn't a package setting. The helper reads model files from `KOKORO_DIR`, default `./voice` relative to its process, not automatically from `media/`. Python dependencies and model weights are not bundled.
- `render_beat.py` is a standalone experiment, not connected to extension caching or playback. It outputs 24 kHz regardless of input; the experimental external and Chatterbox backends have not been tested here. Chatterbox Turbo ignores its supplied `cfg_weight`.
- `kokoro-js`, audio caching, microphone input and conversation loop are not implemented. No VS Code binary or real M1 Pro/NVIDIA GPU was available for end-to-end tests in this session.

## Tests executed in the current environment

- Node v20.20.2, Python 3.13.18, Linux sandbox; `node --check` all three JS source files and Python AST parse on media scripts: **pass** (syntax only).
- `node tests/tour.test.js`: **pass** for 1-based line write/read, selection columns, offset and a hand-written external fixture; no actual CodeTour UI test.
- `python3 tests/render_external_test.py`: **pass** using a local mock WAV endpoint; confirms tag removal, 48→24 kHz conversion and peak bound, not an actual model.
- Kokoro synthesis and faster-whisper inference: **not rerun**; missing ONNX model and Python packages in this environment. Previously generated samples are included as historical artifacts, not fresh proof of reproducibility. The previously reported RTF numbers are sandbox-specific and do not establish M1 performance.
- Chatterbox/VoxCPM2 inference, microphone, browser autoplay, language-model provider, VSIX install, actual VS Code tour playback: **not tested**.

## Research claims withdrawn or narrowed

1. 'One-based correction' above supersedes all earlier 0-based statements.
2. Turbo's source says CFG, min_p and exaggeration are ignored; do not use them as Turbo controls. Tags depend on model/version; source examples are not a guarantee of all sounds or Nano support.
3. 24 kHz speech can contain breath sounds below 12 kHz; 48 kHz does not automatically make a model better. A 7 kHz low-pass attenuates rather than preserves 8–14 kHz. Lower brightness does not prove subjective quality.
4. No validated M1 Pro timing, memory fit, GPU cost, deployment cost, or universal latency guarantees. No guarantee a webview bypasses autoplay, CSP, microphone permissions or other security restrictions.
5. `vscode.lm` access and pricing are provider-dependent; the code may leave the machine. Calling the stack fully local or free is misleading.
6. Claims that seven competitors lack a call loop or that a feature is a defensible moat are not comprehensive market evidence.

## Reproduction limitations

Exact earlier Python package versions, model hashes, cold/warm methodology and several original repository commit hashes are unavailable. The recovered source revisions in `SOURCES.md` are current fetched revisions, not necessarily the revisions used in the earlier audit. Recreate and report exact environment before drawing benchmark conclusions.
