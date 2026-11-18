> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Open-source alternatives to Study With Mommy

Reality check first: nobody has shipped SWM's *exact* mix — narrated blackboard lesson **+ validated drawing DSL + phoneme-locked lip-sync on a portrait rig + a "call" you can interrupt**. Closed APIs aside, the closest thing is a handful of open repos that each cover 2–3 of those layers. Verified star counts / licences below are from the GitHub API today (2026-11-18).

---

## 1. Closest whole products

| Project | What it actually is | Covers | Gaps vs SWM |
|---|---|---|---|
| **[THU-MAIC/OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)** — 43.9k ★, MIT | Multi-agent classroom from Tsinghua MAIC: upload a doc → slides, quizzes, sims; AI teachers with persona/voice/avatar that **draw on an embedded whiteboard, annotate slides as TTS speaks**, PPTX export | deck→lesson, multi-agent teachers, whiteboard synced to TTS, avatars, quizzes | not a per-topic blackboard lesson engine; heavier/heavier to self-host; academic shape |
| **[HugeCatLab/ChatTutor](https://github.com/HugeCatLab/ChatTutor)** — 1.3k ★, AGPL-3.0 | Visual tutor with interactive e-whiteboard, math canvas (GeoGebra), mindmaps; Vue + ElysiaJS, Docker | whiteboard + math canvas + chat tutor | no narration/lip-sync; last push Jan 2026 |
| **[molly554/whiteboard-ai-tutor](https://github.com/molly554/whiteboard-ai-tutor)** — 229 ★, MIT | **The closest architecture to SWM's core loop**: model streams JSON drawing ops (`write/line/rect/ellipse/path/erase`) on a 1600×900 board, browser plays them as handwriting, student can interrupt and the board is sent back. Includes a 6-model benchmark | the protocol + player + interrupt loop | no audio, no portraits, replay-only gallery (no hosted app) |
| **[nitishmahawar/chalk](https://github.com/nitishmahawar/chalk)** — Next.js 16 + Excalidraw + Postgres | Topic → 12-step lesson; **narration audio per step, exact step timings from PCM sample counts**, Excalidraw scenes revealed on the audio clock, follow-up Q&A, progress saving | narrated board + sync clock + persistence | OpenAI-only, no source-slide ingestion, board is primitives only, no licence file |
| **[danish-ship-it/ai-whiteboard-tutor](https://github.com/danish-ship-it/ai-whiteboard-tutor)** ("Chalk", Braynix assignment) | Claude writes scenes/beats/actions on a 10×5 grid → validation+repair → deterministic layout → **ElevenLabs `/with-timestamps` → char clock → `boardStateAt(t)`**; single audio element as master clock; exports MP4 | the best *sync design* of the lot + video export + retrieval quiz | no licence, no slide ingestion |
| **[charanjitpanesar/ai-whiteboard-tutor](https://github.com/charanjitpanesar/ai-whiteboard-tutor)** (TutorCanvas) — demo-friendly | Gemini → timed SVG drawing actions, Web Speech narration, follow-ups | fast to clone and run | browser TTS, no licences named |
| **[akshaykumar1828/Notetutor](https://github.com/akshaykumar1828/Notetutor)** | **Notes/PDF/handwriting → narrated MP4**: LangGraph pipeline with fact-check passes, deterministic layout engine, **Kokoro local TTS**, per-sentence sync, after-render review | source→lesson→video, verification pass, fully local voice | renders video, not an interactive board; no licence stated |
| **[Deli-oi/whiteboard-tutor](https://github.com/Deli-oi/whiteboard-tutor)** — MIT | tldraw board, speak a question, OpenAI voice, drawn step by step | simplest end-to-end demo | no lesson structure |

**If you want one thing to run tonight:** `molly554/whiteboard-ai-tutor` (protocol + player, no keys needed to browse the gallery) to steal the drawing protocol, and `nitishmahawar/chalk` or `danish-ship-it/ai-whiteboard-tutor` to steal the audio-clock sync.

---

## 2. Layer-by-layer open stack (what SWM does → what you'd use)

| SWM layer | What I found in their bundle | Open alternative |
|---|---|---|
| Slide/doc ingestion | `/api`, vision transcription implied | **[Docling](https://github.com/docling-project/docling)** or **[MinerU](https://github.com/opendatalab/MinerU)** for PDF/PPTX→structure; **[PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR)** / a VLM for handwritten pages |
| Lesson writer + checker | async `planned→writing→checking→ready/held`, `cites[]` | any LLM (local: vLLM/Ollama + Qwen/Llama); enforce with **Pydantic/Zod schema + repair pass**, exactly like `validateLesson`; cite `{source, ref}` |
| Lesson ↔ drawing protocol | ~40 validated block kinds | **[molly554's PROTOCOL.md](https://github.com/molly554/whiteboard-ai-tutor)** (6 ops) or a tldraw/Excalidraw op schema; **[Excalidraw](https://github.com/excalidraw/excalidraw)** (MIT), **[tldraw](https://github.com/tldraw/tldraw)**, or plain SVG + **[KaTeX](https://github.com/KaTeX/KaTeX)** |
| Exact math on the board | Pyodide 3.14 + sympy in a Worker | **identical and free**: **[Pyodide](https://pyodide.org)** + **sympy/numpy** in a Web Worker (their sandbox is ~40 lines you can copy in spirit) |
| Narration (TTS) | streaming WAV + per-word/phoneme timings | **[Kokoro-82M](https://github.com/hexgrad/kokoro)** (Apache-2.0, 82M, CPU-fast, 24 kHz) or **[Piper](https://github.com/OHF-Voice/piper1-gpl)** (GPL-3.0 now, MIT originally) for edge; **[Chatterbox](https://github.com/resemble-ai/chatterbox)** (MIT) or **XTTS/GPT-SoVITS/CosyVoice** if you want cloning |
| Word/phoneme timestamps (the hard bit) | ARPAbet phone list with start/end | Local TTS won't hand you these. Two routes: (a) **forced alignment** with **[WhisperX](https://github.com/m-bain/whisperX)** / **[stable-ts](https://github.com/jianfch/stable-ts)** on the generated audio; (b) espeak-ng phonemes + **your own CMUdict lexicon decode** — SWM literally ships a 53 KB CMU-style lexicon, and `cmudict` is public domain |
| Portrait lip-sync | 10-shape sprite sheet + 13-sample mouth curve driven by phonemes + loudness | **Cheapest**: **[Rhubarb Lip Sync](https://github.com/DanielSWolf/rhubarb-lip-sync)** (MIT) or **[wLipSync / wawa-lipsync / HeadAudio](https://talking-avatar.dev/alternatives/10-best-open-source-lip-sync-alternatives-2026)** (MIT, 2.6–18 KB, in-browser) — that is *literally* SWM's approach, mouth shapes on an image. Richer: **[TalkingHead](https://github.com/met4citizen/TalkingHead)** (three.js, MIT), **[MuseTalk](https://github.com/TMElyralab/MuseTalk)** (MIT code, real-time photoreal, needs GPU), **SadTalker** (photo→video), **LatentSync** (quality, 18 GB VRAM) |
| "On a call", barge-in | `/call/` route, mic permission in CSP | **[LiveKit Agents](https://github.com/livekit/agents)**, **[pipecat](https://github.com/pipecat-ai/pipecat)**, or **[Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)** (14.8k ★ — voice interruption, Live2D avatar, emotion mapping; note repo is feature-frozen since May 2026) |
| Full companion shell | — | **[moeru-ai/airi](https://github.com/moeru-ai/airi)** (51.5k ★, MIT): Live2D/VRM body, real-time voice, 20+ providers, WebGPU in-browser |
| Spaced repetition / quizzes | FSRS scheduler, mastery queue | **[fsrs.js / py-fsrs](https://github.com/open-spaced-repetition)**, or **Anki** integration |
| Board ambience, hand-lettering fonts | WebAudio noise bed, CJK writing styles | procedural audio (no lib needed); open handwriting fonts (e.g. **Kalam**, **Gaegu**, **LXGW WenKai** for CJK) |

---

## 3. A minimum viable clone (weekend-scale)

```
slides.pdf ──Docling──► structure.json
             │
             ▼  LLM + JSON schema (validate → repair → cite)
   lesson.json  { scenes:[{beats:[{say, ops:[…]}]}], cites:[{source,ref}] }
             │
             ├─ Kokoro (or Piper) ─► wav per beat ─► WhisperX ─► word timings
             │                                                   │
             ▼                                                   ▼
   Excalidraw / tldraw / SVG + KaTeX             one <audio> element = master clock
             │                                                   │
             └────────► boardStateAt(t) redraws board + captions ◄┘
                              │
                              └─► optional: Rhubarb/wLipSync mouth shapes on a portrait
```
Non-negotiables, learned from their design:
1. **One clock.** `audio.currentTime` drives everything; never timer-schedule drawing. Seeking then works for free.
2. **Full board state as a function of t**, not an incremental animation — that's how backward scrub works.
3. **Validate the model's JSON and repair it** (ids, overlaps, cues) before rendering; also give every element a semantic tag (`given/follow/right/bug`) so you can highlight exactly what's being said.
4. **Cite per lesson** (`source`, `ref`) — cheap, and it's the trust feature.

## 4. What is genuinely hard / unmatched in open source

- **Phoneme-level timings from a local TTS** — every self-hosted engine makes you do forced alignment or your own lexicon decode. Commercial TTS (Cartesia / ElevenLabs / Polly speech marks) gives it to you for money.
- **A drawing DSL big enough for real coursework** (~40 block kinds + domain modules for mechanics, molecules, ledgers, graphs, 33 code languages). Nothing open matches that breadth; you'd start with 6–10 block kinds.
- **A visual identity that doesn't cost you learning** — their own `research/`-style choice is a hand-drawn marker + portrait, and the open projects argue both ways (Chalk drops the avatar deliberately).
- **The call loop with barge-in at low latency** — doable (LiveKit/pipecat), but it's the part that actually needs tuning.

## 5. Licence notes

- Kokoro **Apache-2.0** (commercial OK) · Pyodide/tldraw/Excalidraw/KaTeX/MuseTalk code/TalkingHead/wLipSync **MIT** · Piper **GPL-3.0-or-later** (was MIT) · Chalk/ChatTutor **AGPL-3.0** (network use → publish source) · XTTS v2 weights **non-commercial** · Wav2Lip **research-only** · several of the small "Chalk"-style repos ship **no licence at all**, which means all rights reserved by default — read before copying code.
