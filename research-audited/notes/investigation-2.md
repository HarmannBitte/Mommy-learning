> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Investigation 2 — what actually shipped, and what it cost

*2026-11-18. Follow-up to `landscape-nov-2026.md`. Everything below was executed in this sandbox, not read off a README.*

---

## 1. The decisive experiment: word timings on **synthetic** audio

The open question from the last report was whether any timing path survives the thing we actually do — synthesise speech with TTS, then highlight words against *that* audio. Measured, on this box (2 vCPU, 1 GB RAM, no GPU, no ffmpeg):

| Path | Verdict | Evidence |
|---|---|---|
| **Qwen3-TTS** | ❌ no timings | source grep = 0 hits for word timestamps / alignment / srt |
| **Chatterbox** | ❌ no timings | source grep = 0 hits |
| **Kyutai STT 1B (en_fr)** | ⚠️ right answer, wrong box | word-level `(start,end)` decode confirmed in `stt_from_file_pytorch.py`; **model OOM-killed** at 1 GB (needs ~2.4 GB: 1.98 GB LM + 0.38 GB Mimi) |
| **faster-whisper tiny.en** | ✅ **works, fast** | 14.8 s of Kokoro audio → 43 words, **0.80 s wall = RTF 0.05**, MIT, no torch, 75 MB |

**Decision: faster-whisper `tiny.en` int8 is the timing layer**, not a TTS-native feature. It is the only option in this class that (a) runs on a £5 VPS, (b) needs no GPU, (c) works with *any* TTS backend — Kokoro, Chatterbox, OpenAI, edge-tts — because it measures the audio rather than trusting the synthesiser.

Timing shape of real output (Kokoro, "Here's the function. It takes a list of numbers."):

```
"Here's"     0.00 → 0.68    'It'      2.20 → 2.40    'a'     2.76 → 2.94
'the'        0.68 → 1.06    'takes'   2.40 → 2.76    'list'  2.94 → 3.14
'function.'  1.06 → 1.56    'Of'      3.14 → 3.34    ...
```

Two harmless artefacts to handle, both now handled in code: the leading contraction is emitted as `"Here's"` (assumes a preceding quote — strip it), and Whisper sometimes capitalises mid-sentence (`'Of'`) — compare case-insensitively.

Kyutai is still the better *streaming* answer (0.5 s delay, semantic VAD, Apache-2.0) and remains the upgrade path if this ever runs on a box with ≥4 GB RAM. It is not the deployment answer for a $5 VPS.

---

## 2. The market just closed on "AI voice code walkthrough" — mostly

Searching the Marketplace and GitHub for the exact concept turned up **seven** extensions/agents in the space, five of them free:

| Product | Installs | Notable |
|---|---|---|
| **CodeWalk AI** (`guystez.codewalk-ai`) | 39 | *Nearly our spec*: voice narration, row highlighting in real time, shareable tours, borrows Copilot/Claude subscription, MIT. Local TTS. |
| Markdown TTS (`AbhishekShr.markdown-tts`) | 343 | Read/explain/narrate, offline SAPI/`say` + Edge neural, BYO key |
| **AI CodeSensei** | 9 | Voice-driven *knowledge-check interview* after a tour — the recall step |
| Codo Voice Tutor | 1 | Gemini Live bidirectional voice, audio-synced "ghost cursor", 120 Python modules |
| CodeUnderstander Gemini | 1 | Explain + speak-to-out-loud, Ctrl+Alt+F/E |
| AI-TTS / Voice Coder | 0 | Chinese / Japanese prototypes |
| **`Royal-lobster/code-explainer`** (GitHub) | 105★, 14 forks, MIT, active to 2026-08-21 | Agent skill + extension: sidebar, 1–8 line highlights, **Kokoro local TTS**, three modes (walkthrough/read/**podcast**), saves `.walkthrough.json` |

**What this means for the plan.** The bare "select code, hear it explained, line highlights" idea is taken and free. Three things in that list are *not* done by any of them:

1. **Word-level highlight inside the line.** Everyone highlights the *line*. None animates by word. That is the single visual differentiator, and §1 says it costs 0.05× real time.
2. **Speaking to it — the tutorial loop.** Every product above is one-way. Codo does live conversation but only inside its own 120 Python modules, not your repo. "Explain this, now quiz me on it, I answer out loud, you tell me where I'm wrong" — the original studywithmommy concept — is unimplemented anywhere.
3. **Tours that open in CodeTour.** `code-explainer` invented `.walkthrough.json`; CodeWalk exports its own. Nothing writes the format a 4,604★ MIT extension already plays.

**Honest read:** a feature-identical clone is no longer worth building. Differentiate on 1 and 2, and interoperate via 3.

---

## 3. CodeTour format — verified against `schema.json`, not docs

Cloned `microsoft/codetour` (4,604★, MIT). The schema is draft-04 and strict:

- **Tour required:** `title` (string), `steps` (array). Optional: `description`, `ref`, `isPrimary`, `stepMarker`, `nextTour`, `when`.
- **Step required:** `description` only. Optional: `file`, `directory`, `view`, `uri`, `line`, `pattern` (regex — used *only* when `line` is absent), `title`, `selection`, `commands`.
- **File location:** `.vscode/codeTour/<name>.tour`. The extension appends `.tour` if the name lacks it (`src/extension.ts:40`).
- **`line` is 0-based.** Every internal use (`store.activeTour.step`) is a 0-based index.

That last point was a live bug in my first pass: the writer emitted 1-based lines and the reader added another +1, so a tour written at line 1 came back at line 3. Fixed and verified by round-trip:

```
on-disk 0-based lines:  [0, 1]        (expect [0,1])   ✓
round-trip 1-based:     [1, 2]        (expect [1,2])   ✓
```

We write `description` (required, markdown) *and* a sibling `say` key holding the plain spoken line, so CodeTour renders one and our player speaks the other. A `stripMarkdown()` helper converts third-party tours to speech (`` `x` `` → x, links → text, code fences dropped).

---

## 4. What is now in the extension

`~/vscode-walkthrough/` — 4 commands, 12 settings, all files pass `node --check` / JSON parse.

**New: `src/tour.js`** — `toTour`, `saveTour`, `loadTour`, `listTours`, `stripMarkdown`. Schema-conformant, round-trip tested, off-by-one fixed.

**New: `src/voice.js → class Aligner`** — spawns `media/align_server.py` once, keeps it warm, one JSON line per request, 20 s timeout so a stuck aligner can never freeze a walkthrough. Never throws into the playback loop.

**New: `media/align_server.py`** — faster-whisper `tiny.en` int8, stdin/stdout line protocol:
```
$ printf "%s\n" beat2.wav | python3 align_server.py
{"path":"beat2.wav","words":[{"w":"This","s":0.0,"e":0.48}, …]}
```
Tested on both Kokoro renders: 12 and 43 words respectively.

**New: `Voice.renderToFile(text, path)`** — synthesise without pacing, so the wav can be aligned before the first syllable plays.

**New: `playBeats()` + `speakWithWordHighlight()`** — the loop is now reusable (live run *and* saved tour), maps aligned words onto character ranges in the source line by case-insensitive search, then drives `setDecorations` on a timer. Degrades to plain line highlight if alignment returns nothing.

**New commands:** `codeWalkthrough.saveTour`, `codeWalkthrough.playTour` (QuickPick over `.vscode/codeTour/*.tour`).
**New setting:** `codeWalkthrough.wordLevel` (default **false** — off unless `faster-whisper` is installed).

---

## 5. Ranked next steps

1. **Turn `wordLevel` on by default once the setup story is one line.** Right now it needs `pip install faster-whisper`. Bundle a `.venv` bootstrap like `code-explainer`'s `setup.sh` (which downloads a 330 MB voice model — so the precedent for a heavier install exists).
2. **Build the "call" loop** — webview `getUserMedia` → faster-whisper for *input* too (same model, already loaded, RTF 0.05) → LLM answers → TTS. This is the part nobody ships.
3. **Ship `playTour` against a real CodeTour install** to confirm third-party tours with `pattern`-only steps (no `line`) resolve; my reader currently assumes `line`.
4. **Only then** consider Kyutai (needs ≥4 GB) or Chatterbox-default voice (MIT, 27.9k★) — both are quality upgrades, not blockers.
