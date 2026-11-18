> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Landscape scan — November 2026 (verified against GitHub API + primary repos)

Written for the VS Code "code walkthrough with a voice" project. Everything with a ★ was checked through the GitHub API today; everything in "primary source" was read from the repo, not from a blog.

## 1. TTS state of the art — the honest ranking

Blog posts disagree wildly. Verified facts:

| Model | ★ | Licence (verified) | Why it matters here |
|---|---|---|---|
| **microsoft/VibeVoice** | **57,249** | MIT | ⚠️ **TTS code was removed** from the repo (Sep 2025, misuse). Only **VibeVoice-Realtime-0.5B** survives, and the README still says *"not recommended for commercial or real-world applications… research and development purposes only"*. MIT is on the *code*, the weights carry that caveat. Not a product dependency. |
| **OpenBMB/VoxCPM2** | **42,621** | Apache-2.0 | Tokenizer-free, multilingual, creative voice design, **native 48 kHz** (everyone else is 24 kHz), CPU-capable via GGUF. The best licence-clean "high fidelity" pick. |
| **resemble-ai/chatterbox** | 27,908 | **MIT** | 0.5B Llama-backbone family: original, Multilingual v3 (23+ langs, Jun 2026), Turbo (350M), Flash, Nano. Zero-shot cloning from 5–10 s, emotion control. Its own blind test: 65.3% vs ElevenLabs' 24.5%. **MIT is the big deal** — ship it. |
| **index-tts/index-tts** | 25,181 | NOASSERTION (bilibili licence) | Fine-grained **emotion vector + duration control**. Commercial needs a deal. |
| **nari-labs/dia** | 19,412 | Apache-2.0 | Two-speaker dialogue, nonverbal tags. Great if a "Mommy + student" dialogue format ever matters. |
| **QwenLM/Qwen3-TTS** | 14,500 | **Apache-2.0** | 0.6B/1.7B, 10 languages, 3-second cloning, **natural-language delivery direction**, 97–101 ms first audio, and now the default in HF's speech-to-speech pipeline. Repo pushed 2026-03-17 (stable, not churning). |
| **stepfun-ai/Step-Audio-EditX** | 1,004 | Apache-2.0 | Highest-ranked Apache-2.0 model on the Speech Arena per secondary sources; token-space editing. |
| **kyutai-labs/delayed-streams-modeling** | 3,053 | Apache-2.0 | Kyutai TTS **and** STT. **The STT returns word-level timestamps** — see §3, this is your free timing path. |
| Kokoro-82M | 10,215 (hexgrad/kokoro) | Apache-2.0 | Still the CPU king. Measured here: **0.84× real-time**, 24 kHz, no timings. |

Leaderboard note: **Artificial Analysis Speech Arena** is the one to trust; Fish Audio Drama 3 (Elo ~1279) leads open weights but its licence caps free commercial use at **$500k revenue** and requires a separate licence for hosted TTS — disqualifying for a student product. Breeze TTS 2 (Elo 1,215) is **non-commercial weights**. The gap between open and commercial is now ~80 Elo, not a chasm.

**Recommendation:** Chatterbox (MIT) or Qwen3-TTS (Apache-2.0) as the shipping voice; VoxCPM2 if you want 48 kHz; Kokoro for the zero-friction CPU default. Avoid VibeVoice for anything user-facing.

## 2. The servers (so you don't write glue)

`Kokoro-FastAPI` (Kokoro only, fastest path) · `vLLM-Omni` (production batching for Qwen3-TTS, CosyVoice3, Voxtral, VoxCPM2, OmniVoice, MOSS-TTS) · `SGLang-Omni` (Higgs V3, Fish S2 Pro) · `LocalAI` (broadest: Piper, Qwen3-TTS, Chatterbox, fish-speech) · `kokoro-onnx` (CPU, no PyTorch).
All of them speak **OpenAI `/v1/audio/speech`**, which is exactly why `voice.js` in the extension only needs one URL.

## 3. Timings — the finding that actually changes the design

Checked by reading source, not docs:

- **Qwen3-TTS:** zero hits for timestamp/alignment/subtitle in the repo. No timings.
- **Chatterbox:** same — no timings.
- **Kyutai delayed-streams-modeling:** **`stt_from_file_pytorch.py` emits per-word timestamps** (`tokens_to_timestamped_text`, with a documented `(start, end)` per word), and the README states it plainly: *"They return word-level timestamps."* Apache-2.0, with `stt-1b-en` / `stt-2.6b-en` and MLX/Candle builds.

So the free, local, licence-clean alignment stack is now: **Chatterbox/Qwen3-TTS/Kokoro → Kyutai STT word timestamps** (or WhisperX/wav2vec2 ±10–30 ms). No ElevenLabs required, and Kyutai's is streaming-friendly.

## 4. VS Code platform reality (this decides your architecture)

Verified from the platform docs + practitioner reports:

- **`vscode.lm.selectChatModels()` + `LanguageModelChatMessage`** are **stable**. An extension can borrow the user's **GitHub Copilot** model — no API key, no billing, no local server. Since April 2026 Copilot Chat ships built into VS Code, so most users already have a model configured.
- **Chat participants** (`chat.createChatParticipant`) are stable and give you `@walkthrough …` inside the native chat.
- **Custom model providers** (`LanguageModelChatProvider`) are **proposed API only** → Marketplace-published extensions can't use them; users must run Insiders. Don't build on it.
- **Extensions have no audio API.** Confirmed: no `speechSynthesis`, no `Audio`. Real sound requires a **webview** (what I built), and webviews can't play audio before a user gesture.
- Consequence for UX: put the player and the "call" controls in **one webview panel** (audio + transcript + progress), while highlighting stays in the real editor (decorations), so the student keeps their file in front of them.

**Extension changes made today (all syntax-checked):** new `modelProvider` setting — `auto` tries VS Code's native LM first (Copilot subscription, no key) and falls back to your endpoint; `vscode` locks to Copilot; `endpoint` uses your own URL. The prompt builder and JSON parsing are now shared by both paths, and malformed output is filtered instead of thrown.

## 5. Other repos worth knowing (checked)

| Repo | ★ | Why |
|---|---|---|
| **microsoft/codetour** | 4,604, MIT | The closest *existing* thing to this idea: step-through annotations inside VS Code, written as JSON in `.vscode/codeTour`. **Steal the format** — a walkthrough that saves as a shareable tour file is a much stronger product than one that only speaks. |
| **THU-MAIC/OpenMAIC** | 43,887, MIT | Still the only open multi-agent classroom that does slides + narration + whiteboard + PPTX export. |
| **moeru-ai/airi** | 51,538, MIT | Live2D/VRM companion shell if you ever want a face. |
| Open-LLM-VTuber | 14,760 | Unmaintained since May 2026 — don't start here. |

## 6. Licensing traps found this round

- **VibeVoice:** MIT code, but TTS code pulled; weights "research only".
- **Fish Audio Drama 3:** free commercial only **< $500k revenue**, and a hosted TTS service needs a *separate* licence (exactly your use case).
- **Breeze TTS 2:** Apache code, **non-commercial weights**.
- **Voxtral TTS (Mistral):** CC BY-NC.
- **IndexTTS / Kitten TTS / LFM3-Audio:** custom licences with revenue or registration triggers.
- **Piper (current fork):** GPL-3.0 engine + per-voice licences.
- **Qwen3-TTS, Chatterbox, VoxCPM2, Kokoro, Dia, Step-Audio-EditX, Kyutai:** clean for commercial use (Apache-2.0 / MIT / Apache-2.0).

## 7. What I'd do next (ranked, one line each)

1. **Swap the default voice to Chatterbox** (MIT) behind the same `/v1/audio/speech` interface — better prosody than Kokoro at 350M, still CPU/GPU-light.
2. **Add word-level highlight using Kyutai STT** on each beat's WAV — closes the last gap to SWM's feel, Apache-2.0, streaming.
3. **Save walkthroughs as `.vscode/codeTour` JSON** (codetour-compatible) so a lesson is shareable, reviewable, and diffable.
4. **Ship the call loop in a webview** with the mic (`getUserMedia`) — VS Code can't do audio inline, so the webview is the only way to make "ask her anything" real.
5. **Keep a Kokoro fallback** — never let a student hear silence because a 2B model didn't fit in RAM.
