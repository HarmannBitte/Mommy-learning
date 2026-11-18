> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Voice audit of the open-source alternatives (read from source, not from READMEs)

Cloned shallow at 2026-11-18 into `~/alt/`, then read the actual synthesis path in each. Verified star/licence via GitHub API. Kokoro numbers below are measured on this machine, not quoted.

## 1. The voice matrix — this is the whole answer

| Project | Engine (verified in code) | Word/phoneme timings? | Cost | Needs GPU? | Licence |
|---|---|---|---|---|---|
| **domZippilli/whiteboard-teacher** | **4 swappable backends**: ElevenLabs (`/with-timestamps`), OpenAI `/v1/audio/speech` (Kokoro-FastAPI / Speaches / LocalAI / OpenAI), **in-browser Kokoro via transformers.js**, browser SpeechSynthesis | ElevenLabs: **character-level**. Others: **no timings** → drawings spread evenly from the WAV header duration | free → paid | no | MIT |
| **danish-ship-it/ai-whiteboard-tutor** (Chalk) | ElevenLabs `/v1/text-to-speech/{voice}/with-timestamps`, `mp3_44100_96`, settings `{stability .5, similarity .75, style .15}` | **character-level**, mapped to words (`exact / mapped / estimated`) | € per char | no | none |
| **nitishmahawar/chalk** | OpenAI `gpt-4o-mini-tts`, voice `coral`, `outputFormat:"pcm"`, 24 kHz mono, plus a per-step `instructions` string | **none** — step times come from **PCM sample counts** (exact for step boundaries, nothing inside a step) | € | no | none |
| **akshaykumar1828/Notetutor** | **Piper** (`en_US-lessac-medium.onnx`) → **Kokoro** (`kokoro-v1.0.onnx`) → Orpheus, selected by env `NOTETUTOR_TTS` | **none** — per-sentence sync only | **free, local** | no | none |
| **THU-MAIC/OpenMAIC** | 7 TTS providers: OpenAI, **Azure**, GLM, Qwen, Doubao, **Gemini TTS**, **browser Web Speech**; slot/preset config with SSRF guards. ElevenLabs/Cartesia/PlayHT/Deepgram listed as *future* | **none used** — no alignment/timestamp code in `lib/audio/*`; whiteboard annotates per slide, not per word | mix | no | MIT |
| **charanjitpanesar/ai-whiteboard-tutor** | `window.speechSynthesis`, `rate 0.96`, `pitch 1.02`, prefers a Google/Microsoft/Samantha voice | **none** | free | no | none |
| **Deli-oi/whiteboard-tutor** | Voice is **input only** (Web Speech STT). Output is a sandboxed HTML visualization — no narration at all | n/a | free | no | MIT |
| **HugeCatLab/ChatTutor** | **no TTS whatsoever** (text + board only) | n/a | — | no | AGPL-3.0 |
| **molly554/whiteboard-ai-tutor** | **no audio at all** — replay-only player | n/a | — | no | MIT |
| **Open-LLM-VTuber** | 9+ TTS backends (sherpa-onnx, MeloTTS, Piper, GPT-SoVITS, CosyVoice, Bark, Edge, Fish, Azure) | none (lip-sync from volume/audio levels, not phonemes) | free | optional | mixed |

**Conclusion that matters for you:** across ten repos, **only ElevenLabs gives you the timing fidelity SWM has** (they use ARPAbet phoneme spans; ElevenLabs gives per-character spans — close enough to rebuild phoneme spans using their own CMU lexicon trick). Every local/free engine in this set ships **zero** sub-sentence timing. That is the real moat, and it is not a model-quality question — it's a metadata question.

## 2. Kokoro, measured on this box (the realistic free option)

Model `kokoro-v1.0.onnx` (311 MB) + `voices-v1.0.bin` (27 MB) via `kokoro-onnx` 1.x, CPU only, Python 3.13:

| Voice | Audio | Synth time | RTF |
|---|---|---|---|
| `af_heart` (best-rated US female) | 9.17 s | 7.69 s | **0.84×** |
| `af_bella` | 9.60 s | 8.04 s | 0.84× |
| `bf_emma` (British female) | 8.19 s | 7.06 s | 0.86× |
| `am_michael` (US male) | 10.11 s | 8.34 s | 0.83× |

- Output **24 kHz mono**, no GPU needed. First load ~2–3 s, then it's warm.
- `has_timings` → **False**; `create_timed()` returns an **empty timing list**. So no word alignment from the model itself.
- `create_stream()` yields many small chunks — usable to derive *prosodic* onsets, **not** phonemes.
- **Clause-level sync works though** (this is what I'd ship): split narration on `, ; : .`, synth each clause, concatenate, and you get exact clause boundaries for free — `"At P,"` 0.00→0.83 s, `"the bowl's slope is one in x and one in y."` 0.83→3.61 s. Good enough to highlight the *phrase* being explained and to drive mouth shapes.
- It also exposes a real phonemizer: `At P, the bowl's slope is one in x and one in y.` → `æt pˈiː, ðə bˈoʊlz slˈoʊp ɪz wˈʌn ɪn ˈɛks ænd wˈʌn ɪn wˈaɪ.` Use that if you want the SWM-style lexicon decode.

Hear it: `voice/vscode-walkthrough-demo.wav` (14.8 s, Kokoro `af_heart`, a 4-beat code walkthrough I wrote for the VS Code idea).

## 3. How to get SWM-grade timing without ElevenLabs

Ranked by effort, all verified as technically consistent with what these repos do:

1. **Clause-split synthesis** (Kokoro/Piper) — exact phrase boundaries, zero extra deps. Perfect for "highlight the line being explained".
2. **Forced alignment** after synthesis: WhisperX / stable-ts on your own audio → word timings, ~±50 ms. Adds a model but no cost.
3. **espeak-ng phonemes + CMUdict** → drive mouth sprites, SWM-style. `cmudict` is public domain; Kokoro's own phonemizer already produces IPA you can map.
4. **Pay per character** (ElevenLabs ~$0.05–0.10/1k chars) and skip all of the above.

## 4. Where each repo actually beats SWM (and where it doesn't)

- **whiteboard-teacher** — the only one with a *pluggable voice interface* (`capabilities.timings`, `runsIn: 'server' | 'browser'`, voice catalogs, concurrency queueing). This is the architecture to copy, not the lessons.
- **Chalk (danish)** — best sync design: one `<audio>` master clock, `boardStateAt(t)`, char-clock mapping, MP4 export from the same function.
- **Chalk (nitish)** — best *plumbing*: per-step PCM segments stored privately, lease/idempotency, progress revisions, ownership checks, mocked tests.
- **Notetutor** — the only fully-local voice, plus a real **fact-check pass** in the pipeline (their claim: 0% contradicting claims under an LLM judge).
- **OpenMAIC** — 43.9k stars, real provider-slot architecture, but heavy (237 MB checkout) and per-slide, not per-word.
- **None of them** has: slide-deck ingestion with per-slide citations, a validated drawing DSL of SWM's breadth, phoneme-driven portrait lip-sync, or an interruptible call loop.
