# Recommended stack — revised after audit

**Status: architecture recommendation, not a finished product.** See `VALIDATION.md` for test results and known failures. This document supersedes earlier claims in the research notes.

| Layer | Recommendation | Status |
|---|---|---|
| User interface | VS Code extension with a webview player | Prototype exists; playback synchronization is broken and end-to-end use has not been tested in VS Code. |
| Lesson planning | `vscode.lm`, with OpenAI-compatible endpoint fallback | Code exists; no provider integration test. Availability, permissions and costs depend on the user's provider and subscription; source code may be sent to the provider. |
| Voice | Kokoro ONNX on CPU initially, using `af_sky` as a candidate | Kokoro audio was previously generated in the sandbox, but the current runtime lacks weights and dependencies. Preference requires listening. `kokoro-js` is a possible future integration, not implemented or tested. |
| Higher-quality experiments | Evaluate VoxCPM2 offline for cached tour audio | Candidate, not proven superior for this persona. Requires separate inference setup and licensing checks. Current renderer resamples everything to 24 kHz, so it does not preserve 48 kHz. |
| Word timing | faster-whisper `tiny.en` CPU, offline | Separate experiment reported 0.80 seconds for 14.8 seconds of audio in the earlier sandbox; not reproduced in this environment. ASR word timestamps are approximate, and matching spoken words to code is not generally possible. |
| Storage | CodeTour `.tour` plus proposed audio cache | CodeTour uses **1-based** line and selection coordinates. Writer/reader corrected and unit-tested. The extension does not yet implement a cache or full CodeTour semantics. |

## Important voice caveats

- Chatterbox Turbo explicitly warns that `cfg_weight`, `exaggeration` and `min_p` are unsupported and ignored. The existing Chatterbox renderer is experimental and passes a parameter that does not control pace.
- A 7 kHz low-pass attenuates the 8–14 kHz region. The existing renderer resamples all audio to 24 kHz; no high-frequency advantage of 48 kHz is retained. Its simple resampler also has not been validated for aliasing.
- The included raw/soft A/B is **one Kokoro sample**. A lower spectral centroid does not prove better or more intimate sound, nor superiority over another voice model.
- M1 Pro performance and compatibility are **not measured here**. Performance reported on other devices cannot be transferred directly. Model sample rate alone is not a measure of naturalness.

## Build sequence

1. Fix the webview playback lifecycle: send audio immediately, wait for a reliable playback-start/ended/error acknowledgment, handle user gesture and cancellation, and test synchronization.
2. Make Kokoro configuration and model paths explicit; install dependencies and test locally.
3. Fix tour playback to open each step's actual file and support or clearly reject unsupported `pattern` and selection behavior.
4. Add alignment and validate against speech/audio time, not assumptions about code tokens. Add a per-tour cache only after playback works.
5. A/B comparable voices with consented reference material, then decide whether VoxCPM2 improves the result enough to justify its complexity.
6. Only after those steps consider microphone input and a conversation loop. Neither is implemented.

Do not treat a VS Code webview as exempt from origin, security, permission, or autoplay restrictions. A hosted model may require a subscription or API key. Voice cloning requires appropriate consent and review of model and reference-audio terms.
