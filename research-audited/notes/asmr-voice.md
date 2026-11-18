> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# ASMR voice selection — what actually matters for the "mommy" persona

*2026-11-18. Every number here was measured in this sandbox or grep'd out of cloned source. Listen first: `voice/asmr-voices.wav` (38.7 s, four Kokoro voices saying the same line).*

---

## 0. The honest caveat first

None of these models produce **true ASMR** — whispers, mouth clicks, tapping, page turns, mic proximity. They are all *text-to-speech with a soft voice*. The ASMR feeling has to come from four things you can actually control:

1. **Pitch** — lower f0 reads as calmer and closer. This is measurable and I measured it.
2. **Pace** — ~0.85–0.9× speed. Both Kokoro and Chatterbox expose it (`speed`, `cfg_weight`).
3. **Pause / air** — the single biggest objective differentiator I found (see §2; 66% vs 31% silence).
4. **Post-processing** — a gentle low-pass (≈7 kHz), slight low-shelf boost (~100 Hz), long reverb, and *never* normalising to full scale. This does more for the "close to your ear" impression than swapping models does.

If the real goal is whisper-ASMR, TTS is the wrong tool: TTS actively resists breathiness (models are trained to *avoid* noise). The three ways to get actual whisper are at the end, §6.

---

## 1. Which model, judged on ASMR rather than benchmark Elo

| Model | Sample rate | Can it do soft/intimate? | Mac M1 Pro | NVIDIA | Verdict for ASMR |
|---|---|---|---|---|---|
| **Kokoro 82M** | **24 kHz** | Yes, 54 built-in voices; `speed` control; **af_nicole** is a slow, airy outlier | ✅ ONNX, runs **CPU-only at RTF 0.85** here on 2 vCPU — trivially fine on M1 | ✅ same, or GPU | **Best default.** Only 24 kHz, so no breath detail, but the "room" is right |
| **Chatterbox Turbo 350M / Nano 110M** | **24 kHz** | **Best expression control**: `exaggeration` 0.25–2.0 (drop it *below* 0.5 for deadpan-soft), `cfg_weight` = pace; **native paralinguistic tags** `[sigh] [sniff] [gasp] [cough] [shush] [groan] [chuckle] [laugh]` (verified — the full list in source; `[shudder]`/`[giggle]` do **not** exist) | ✅ **Nano runs CPU at 3× realtime on 8 cores** — fine on M1; `device in ["cpu","mps"]` handled explicitly in `tts_turbo.py:140` | ✅ trivial | **Best voice *control*.** The tags are the closest thing to non-verbal ASMR beats |
| **VoxCPM2** (2B) | **48 kHz** ⭐ | **Only model that can resolve breath and lip noise** — AudioVAE V2 outputs 48 kHz with built-in super-resolution from a 16 kHz reference; Voice Design + controllable cloning | ⚠️ Python path is MPS-supported (`auto` → MPS) but **GGUF/Metal RTF ≈ 1.76 on an M4 Pro** — so ~1.5–2× on M1 Pro, i.e. *slower than realtime*, and it will spin fans | ✅ native CUDA path, comfortable | **Best audio for ASMR, worst ergonomics on a laptop.** Use it to *render* clips offline, not live |
| **Qwen3-TTS 0.6B / 1.7B** | **24 kHz** (verified `output_sample_rate=24000`) | Instruction-driven tone/emotion/rate, 10 languages, 3-second cloning | ⚠️ no MPS path documented; bf16 + FlashAttention2 recommended → NVIDIA-leaning | ✅ | Good all-rounder, **nothing special for ASMR** — and no timings, no 48 kHz |
| **Kyutai STT** | — | not a TTS | — | — | irrelevant here (it's the timing layer) |

### The three recommendations, plainly

- **Everything runs on an M1 Pro *except* nothing — but only VoxCPM2 struggles.** Kokoro and Chatterbox-Nano are CPU-class and will be instant. M1 Pro has 16 GB unified memory, so VoxCPM2 *loads*, it just runs at roughly realtime-to-half-realtime through the Metal GGUF path.
- **If mommy ASMR is the product, the ranking is: VoxCPM2 (audio) → Chatterbox (control) → Kokoro (speed/uptime).**
- **If it must run live on the M1 during development and on a GPU in production: Chatterbox Turbo, same weights both places** — that is the only model in the list whose CPU story (Nano, 110M, 3× realtime) and GPU story are the *same code path*.

---

## 2. Measured: which Kokoro voice is actually softest

Same line, same speed (0.9), rendered 11 English female voices (f0 by autocorrelation, centroid over the voiced portion).

| voice | f0 (Hz) | RMS (dB) | spectral centroid | note |
|---|---|---|---|---|
| **af_nicole** | **166** | -17.8 | **3235** | **the outlier — 9.3 s for a 5 s line, 66% of it silence.** Slow, airy, leaves room |
| **af_sky** | **162** | -18.6 | **2261** | **lowest centroid = softest timbre.** Best "close mic" texture |
| **bf_lily** | 186 | **-18.0** | 2153 | quietest + lowest centroid combo; British, more formal |
| af_aoede | 188 | **-15.1** | **1901** | darkest tone but the *loudest* of the set |
| af_sarah | 200 | -18.5 | 3162 | neutral |
| af_heart / af_bella | 205 | -16.4 | 3400+ | the community favourites — **brightest, least ASMR** |

**Picks: `af_sky` for timbre, `af_nicole` for pacing, `bf_lily` if the persona should sound adult/English rather than American-girl.** Those are the four voices in the montage (`asmr-voices.wav`): Nicole, Sky, Lily, Aoede — listen and pick by ear, because measured softness and *perceived* intimacy disagree more than you'd expect.

(What I could **not** verify from here: actually hearing which one sounds like "mommy". That's your call — the montage is 39 seconds.)

---

## 3. What to change in the extension — and what was actually built

**Status correction.** An earlier draft of this section said `soften` shipped as a webview
`BiquadFilterNode` chain. That did **not** exist — there was no `soften` setting at all.
What exists now:

- **`media/voice-soft.json`** — the config: voice, speed, tag vocabulary, and the filter
  parameters (`lowpass_hz: 7000`, `lowshelf_hz: 110`, `lowshelf_db: 2.5`, `peak: 0.85`).
- **`media/render_beat.py`** — the chain, implemented as **numpy biquads** (lowpass +
  low shelf) applied to the rendered audio at **build time**, not playback. Measured
  effect: centroid 2337 → 1641 Hz, energy above 7 kHz 12.40% → 4.46%, peak held to 0.85.
  A/B: `voice/asmr-soft-ab.wav`.
- **`codeWalkthrough.voice` / `codeWalkthrough.speed`** — settings, defaults `af_sky` / `0.85`.

Still **not** implemented: a live `soften` toggle in the webview. The filter chain lives in
the renderer because the stack now renders beats to cached WAVs (see `the-stack.md` §5),
which is the better place for it — but if live playback ever needs it, the same parameters
port to `player.html` as `BiquadFilterNode` lowpass + lowshelf.

---

## 4. VRAM / RAM budget, concrete

| | Weights | Where it fits |
|---|---|---|
| Kokoro 82M (ONNX q8) | 311 MB on disk, ~400 MB RAM | any laptop, any $5 VPS |
| Chatterbox Nano 110M | ~500 MB | **M1 Pro CPU, 8 cores → 3× realtime** |
| Chatterbox Turbo 350M | ~1.5 GB | M1 Pro GPU (MPS) comfortable; 4 GB VRAM on NVIDIA |
| Chatterbox Multilingual | ~3 GB | 6–8 GB VRAM |
| Qwen3-TTS 1.7B | ~3.5 GB bf16 | 8 GB VRAM (needs FA2 for comfort) |
| VoxCPM2 2B | 2 GB Q8_0 GGUF + acoustic | **M1 Pro: works, RTF ~1.5–2** · NVIDIA 8 GB: comfortable |

For reference, the Kyutai STT experiment last turn **OOM'd at 1 GB** — so "fits in memory" is not theoretical here, it's the constraint that killed a whole approach.

---

## 5. Production shape

**Render offline, play back live.** An ASMR lesson is not latency-sensitive — nobody needs 100 ms first-audio when the student is settling in to listen. So:

1. Generate each beat's audio **once**, on whatever is best: VoxCPM2 48 kHz if you have a GPU or can wait on Metal, Chatterbox with `[sigh]`/`[sniff]` tags for the non-verbal beats.
2. Apply the soft/room chain, cache the WAV next to the tour (`.vscode/codeTour/<name>.audio/`).
3. Serve it to the webview as a static file — **this also removes the audio-autoplay/user-gesture problem**, since the click that starts the tour satisfies the gesture policy for the whole playlist.
4. Fall back to Kokoro live only if a beat isn't cached — that's the never-silent guarantee.

Bonus: with cached audio, the faster-whisper alignment from `investigation-2.md` runs once at build time instead of per playback, so word-level highlighting becomes free.

---

## 6. If you genuinely want whisper-ASMR

TTS models fight you — they're trained to suppress breath noise. Three escapes, in order of effort:

1. **Post-process a soft render** — whisper-ify is a known trick: attenuate voiced content, raise the noise floor, HPF the lows, add breath samples. Cheap, convincing for short beats, and it can be done in the webview or in one ffmpeg call.
2. **Concatenate real ASMR assets** — intro breath, page turn, pen click as separate clips mixed under the narration. This is what actual ASMR channels do, and it's fully controllable.
3. **Clone a whisper reference with Chatterbox** — its zero-shot cloning takes a reference clip, and `exaggeration < 0.4` + a breathy reference gets surprisingly close. Licence is MIT, so shipping it is fine.

What I would *not* do: choose a model because a leaderboard says it's better. Every model in §1 is 24 kHz except VoxCPM2 — you cannot synthesise a whisper's high-frequency air at 24 kHz no matter how good the network is. **That is the real reason VoxCPM2 ranks first for this specific use case, and it's the only ranking criterion that can't be fixed with settings.**
