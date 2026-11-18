# Source manifest and provenance

Recovered on 2026-11-18. The commit hashes below identify **newly fetched source**, not necessarily the precise versions used during earlier investigations. The checkouts in `recovered-sources/` exclude `.git` metadata from the archive but include source and license files. Repository code licenses do not automatically establish model-weight or reference-voice rights; check each release independently.

| Project | Source | Recovered commit | What it supports |
|---|---|---|---|
| Microsoft CodeTour | https://github.com/microsoft/codetour | `29955a004445d3fd2ad5df35dd00f9cc0400ba7d` | Recorder and player use 1-based tour coordinates; schema describes 1-based selections. MIT license in `LICENSE.txt`. |
| Resemble Chatterbox | https://github.com/resemble-ai/chatterbox | `ab55923c27757c90cfcc407baa57dc25a7d25217` | `src/chatterbox/tts_turbo.py` warns unsupported CFG, min_p and exaggeration are ignored. Check weights' terms separately. |
| OpenBMB VoxCPM | https://github.com/OpenBMB/VoxCPM | `300e4260b509066151d623dc9c0aa922cf82232b` | README documents VoxCPM2 and 48 kHz output; Apache-2.0 code and model claim. No quality or local-device performance established by this. |

Additional links:
- Kokoro ONNX model release (model not bundled): https://github.com/thewh1teagle/kokoro-onnx/releases/tag/model-files-v1.0
- Kokoro original model: https://huggingface.co/hexgrad/Kokoro-82M
- faster-whisper: https://github.com/SYSTRAN/faster-whisper
- VoxCPM2 model: https://huggingface.co/openbmb/VoxCPM2
- Original site investigated: https://studywithmommy.com/ ; captured browser assets in `source-material/swm/` are historical snapshots and may contain third-party content. Do not assume redistribution rights.

`source-material/new`, `voices`, and `alt` are **partial prior snapshots** from the workspace, not complete Git clones. Refer to their READMEs and existing historical notes for original links; original commit identifiers are unavailable. Historical market figures are time-sensitive and have not all been independently rechecked during this audit. Model weights, runtime packages, full benchmark environment, git histories and some earlier downloads are absent.

The bundle includes `SHA256SUMS.txt` covering included files (excluding itself); this identifies the archive contents but cannot establish provenance of material whose original revision is unknown.
