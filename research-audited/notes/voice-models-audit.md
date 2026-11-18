> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Voice-model audit — your 9 repos, verified against source (2026-11-18)

Cloned shallow into `~/voices/`, read the engine code + docs, checked every repo through the GitHub API.

## 0. Two corrections before anything else

1. **`JarodMica/fish-speech` is not the project.** It's a **2-star fork**. The real one is **`fishaudio/fish-speech`** — 33,777 ★, 2,950 forks, pushed 2026-11-14 (licence: `NOASSERTION` — check before commercial use). Everything below uses the upstream.
2. **`debpalash/VoiceStudio` is real but very new.** 113,288 ★ / 12,591 forks, AGPL-3.0, **created 2026-04-09**, pushed 9 hours ago. Worth knowing: it's not a model — it's an app that **ships dozens of engines** (its default engine *is* k2-fsa/OmniVoice). Treat it as the "ElevenLabs desktop app" shell, not as a voice.

## 1. The matrix that matters: does it hand you timing?

| Repo | ★ | Licence | What it actually is | Word/phoneme timing | Runs where |
|---|---|---|---|---|---|
| **debpalash/VoiceStudio** | 113.3k | AGPL-3.0 | Desktop/server voice studio: cloning, design, dubbing, dictation, audiobook. **Default engine = OmniVoice**, plus CosyVoice 3, IndexTTS 2.5, KittenTTS, GPT-SoVITS, dots.tts, Ming, Moss, PocketTTS, VoxCPM2, supertonic3, sherpa-onnx, MLX-Audio | **Yes — but via ASR, not the TTS.** `POST /v1/audio/speech` returns **mono 24 kHz s16 PCM** (streamable, SSE); `POST /v1/audio/transcriptions` returns `words` with `timestamp_granularities[]=word`, plus `srt`/`vtt`. Ships a **WhisperX engine with wav2vec2 forced alignment, ±10–30 ms** ("that word timing is what dubbing lip-sync depends on") and a **second-pass ASR QC** after dubbing. Also: subtitle segmenter, dub-length fitting, video retiming | laptop → server (CUDA / Apple MPS / Vulkan / CPU) |
| **k2-fsa/OmniVoice** | 16.7k | Apache-2.0 | 600+ language zero-shot TTS, diffusion-LM style, cloning + voice design (`female, whisper`), non-verbal tags (`[laughter]`), pronunciation via pinyin/phonemes | **No** (accepts a fixed `duration=`, that's all) | GPU (CUDA/XPU) or CPU; **RTF 0.025** = 40× real-time |
| **kyutai-labs/moshi** | 11.6k | Apache-2.0 | **Full-duplex speech-to-speech dialogue** + Mimi streaming codec. PyTorch / MLX (iPhone+Mac) / Rust. Sibling: `delayed-streams-modeling` = Kyutai TTS/STT | **No** — it's a conversational stream, not a TTS API | Rust prod, MLX on-device, PyTorch |
| **NVIDIA/personaplex** | 12.1k | MIT | Built **on Moshi**: persona via **text role prompt + audio voice conditioning**, full duplex, low latency, endless conversations (prompt as attention sink), ~2.5 min sliding memory. Weights `nvidia/personaplex-7b-v1`, needs libopus | **No** — but it *is* the "pick a Mommy and talk to her" experience, with voice conditioning | GPU (7B) |
| **boson-ai/higgs-audio** | 8.4k | Apache-2.0 | ⚠️ **Repo is deprecated**: "Higgs Audio v3 is here — you no longer need this repo." v3 is a standalone release + hosted API (`higgs-audio-v3-tts-4b`, 100+ languages, zero-shot cloning, inline emotion/style/prosody) | No | API (free rate-limited) or own GPU |
| **studio-dots-ai/dots.tts** | 1.4k | Apache-2.0 | 2B fully-continuous AR TTS, **48 kHz** AudioVAE, no discrete tokens. Best average on Seed-TTS-Eval (WER 0.94%/1.30%). Variants: `-mf` (MeanFlow distill), `-mf-2steps`, `-soar`. **RTF p50 0.15, first chunk 204 ms**; SGLang-Omni serving | **No** | **~5.3–7.9 GB VRAM** by length bucket; tuned on H100 |
| **dograh-hq/dograh** | 6.2k | BSD-2-Clause | Self-hosted Vapi/Retell alternative: visual workflow builder, BYOK speech-to-speech or LLM/STT/TTS, MCP, telephony. Word timings live in its **STT eval harness** (Deepgram/Speechmatics `--show-words`) | Only through the STT provider | Docker, on-prem |
| **fishaudio/fish-speech** (corrected) | 33.8k | NOASSERTION | The "SOTA open TTS" people actually mean; multilingual cloning | No | GPU |
| **flybirdxx/ComfyUI-Qwen-TTS** | 2.0k | **none** | Wrapper around **Qwen3-TTS** for ComfyUI. Its pause controls (`period_pause`, `comma_pause`, `hyphen_pause`, `pause_linebreak`) are genuinely useful for pacing a lesson | No (but per-punctuation pause control is the poor man's beat control) | GPU |

**Verdict: none of the nine gives word timings from TTS.** VoiceStudio is the only one that gives you measured word timings at all — and it gets them exactly the way I recommended last turn: run **forced alignment (WhisperX)** on the audio you just generated, and re-run ASR as QC.

## 2. What each one is actually good for in *your* product

- **VoiceStudio → your local ElevenLabs replacement.** One binary that gives you a **Kokoro/OmniVoice-quality voice + 24 kHz PCM + word/srt timings + an OpenAI-compatible `/v1/audio/speech`**. That means the VS Code extension I scaffolded already talks to it by changing one setting. AGPL-3.0 is the catch: it's fine as a **sidecar process you run**, but don't link it into closed-source code.
- **OmniVoice → the voice itself** if you want one model, 600+ languages, cloning, and 40× real-time on a modest GPU. Apache-2.0, so it can go inside your product.
- **dots.tts → highest-fidelity narration** (48 kHz, best Seed-TTS numbers) if students get one voice they hear for hours. Needs ~6 GB VRAM and a real GPU; not a laptop story.
- **personaplex / moshi → the "on a call with Mommy" feature.** PersonaPlex is literally "a persona you can talk to, with a conditioned voice" — that's SWM's `/call/` route. MIT licence, 7B, needs a GPU. Moshi is the lighter research path (Rust/MLX, runs on Mac/iPhone).
- **higgs-audio → skip the repo, use the v3 API** if you want emotion/style control cheaply.
- **dograh → if you ever want real phone calls** (office hours by phone), that's the open Vapi.
- **Qwen-TTS ComfyUI → experiment only**; no licence file, and ComfyUI is a bad foundation for a product.
- **fish-speech → the cloning benchmark everyone compares against**, not a timing solution.

## 3. The revised recommendation (given "voice model is essential")

```
narration text (per beat)
   │
   ├─► VoiceStudio sidecar  /v1/audio/speech   → 24 kHz PCM  (Kokoro / OmniVoice / dots.tts)
   │        └─ /v1/audio/transcriptions (WhisperX)  → words[] ±10–30 ms  → srt/vtt
   │
   └─► or ElevenLabs /with-timestamps if you'd rather rent the timing
```
- **Local, free, AGPL-free**: Kokoro (what I already measured at 0.84× RTF on CPU) + WhisperX for timings. Two processes, both open.
- **Local, best quality**: OmniVoice (Apache-2.0) + WhisperX.
- **Zero-integration**: VoiceStudio's OpenAI-shaped API — one `ttsUrl` setting in the extension.
- **Conversational layer**: PersonaPlex for the call, Moshi if you want it on a Mac/iPhone.

## 4. Cost of ownership, measured where possible

| Option | Hardware floor | Speed | Licence risk |
|---|---|---|---|
| Kokoro-82M (measured here) | CPU, 340 MB | **0.84× RTF** CPU | Apache-2.0 ✅ |
| OmniVoice | small GPU (Arc A310 4 GB tested) | **40× RTF** | Apache-2.0 ✅ |
| dots.tts | ~6 GB VRAM minimum | 0.15 RTF, 204 ms first chunk | Apache-2.0 ✅ |
| PersonaPlex | 7B GPU | full-duplex, low latency | MIT ✅ |
| VoiceStudio | laptop, any GPU/CPU | engine-dependent | **AGPL-3.0** ⚠️ (process boundary only) |
| fish-speech | GPU | fast | **NOASSERTION** ⚠️ verify |
| Qwen-TTS (ComfyUI) | GPU | — | **no licence** ⚠️ |
