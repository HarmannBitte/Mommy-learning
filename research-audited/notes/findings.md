> **Audit notice (2026-11-18):** Historical research, not fully verified. For material corrections and current prototype status, see [VALIDATION.md](VALIDATION.md) and [the-stack.md](the-stack.md). In particular, CodeTour coordinates are 1-based, Turbo ignores CFG/exaggeration, and prior ASMR and hardware conclusions are not established by listening or M1 tests.

# Study With Mommy — deeper technical teardown

Scope: everything below was obtained from publicly served assets (JS/CSS bundles, audio files, portrait data, DNS, certificate transparency, Wayback snapshots) and unauthenticated requests. Nothing was bypassed; the Cloudflare Access–protected hosts were left alone.

---

## 1. Infrastructure map

| Host | What it is | Evidence |
|---|---|---|
| `studywithmommy.com` | Public waitlist SPA (Vite + React 19.3.1), prerendered HTML | `index.html` arrays contain pre-rendered markup, hydration continues client-side |
| `www.` | 301 → apex | HTTP headers |
| `admin.` | Cloudflare Access SSO gate | 302 → `jay3332.cloudflareaccess.com/cdn-cgi/access/login/admin...` |
| `beta.`, `lab.` | Access-gated app builds — the real product | 302 → Access login; in bundle: `FB="lab.studywithmommy.com"`, `GB="beta.studywithmommy.com"` |
| `next.` | Access-gated | 302 → Access |
| `hooks.` | Webhook receiver, 404 on `/` | `content-length: 10`, plain text |
| `status.` | 404 (CF page) | — |

- **DNS**: Cloudflare (`ram.ns` / `lia.ns`), A = 104.21.6.21 / 172.67.134.46
- **Mail**: MX `receive.forge.rmta.net` — *not* Cloudflare Email Routing (matches the privacy page's "Resend when Cloudflare can't")
- **TXT**: only `google-site-verification` (Search Console)
- **Cert transparency** (certspotter, 22 certs): the subdomain list above; `*.beta`, `*.lab`, `*.hooks`, `*.status` are wildcards, so those families are real deployments
- **API**: one Worker. `POST /api/session` (body `{came}`) + `/api/speak` are gated on a session — they 404 without it. `GET /api/health` → `{"ok":true}`. All JSON responses are Cloudflare-Worker-shaped (`{"error":"not found"}`, `no-store`, `x-robots-tag: noindex`)
- **CSP** is tight: `default-src 'none'`, `connect-src 'self'`, `form-action 'none'`, `frame-ancestors 'none'`, `permissions-policy … microphone=(self)` → all AI traffic is forced through the same-origin Worker, which is why nothing vendor-specific leaks.

---

## 2. Voices — what the code actually does

- Three personas, each **hard-wired to a personality**: `f2t={braid:"nurturing", bob:"direct", rose:"playful"}`. Voice names are just labels (`braid/Sage`, `bob/Lavender`, `rose/Rose`); the real voice IDs never reach the browser — `/api/voices` returns `{voices:[{id,label}], default, portraits}`.
- **Warmth** (`full | caring | gentle`) and **pace** (`0.5×…2×`, applied client-side on playback) are the only delivery knobs exposed. There is *no* stability/style/similarity/exaggeration slider and no voice-cloning path anywhere in the bundle (0 hits for `clone_voice`, no mic capture in the waitlist build) — so the "voice" choices are curated stock characters, not clones.
- **Speech pipeline**: `POST /api/speak {text, priority:"now", persona, voice}` → returns a clip object `{id, url, live, finished, sentences:[{c0,c1,start,end}], words:[{c0,c1,start,end}], phones:[["EH1",6.541,6.641]…], hearing}`. While live it's polled at `GET /api/clips/{id}`, and audio is streamed as **WAV (PCM, 48 kHz)** that the client feeds into a MediaSource — i.e. the backend proxies a vendor that streams raw PCM and normalizes it.
- **Phoneme timings are ARPAbet with stress digits**. Of the mainstream vendors, Cartesia's `add_phoneme_timestamps` and ElevenLabs' alignment are the ones that expose this class of data; Amazon Polly's "speech marks" do the same. Nothing in the bundle names one, so the honest answer is: **a commercial streaming TTS behind their Worker, not identifiable from outside**.
- **Karaoke + lip-sync are built by them, not the vendor.** They ship a **53 KB CMU-style pronunciation lexicon** (`lexicon-data-BuuEfNyF.js`) that maps words → ARPAbet (`aaron G3c0`, `abandoned cpB0rc0r`, …) and decode it at runtime with an in-bundle phoneme table. After the first playback they re-time from the **decoded PCM envelope** and classify every sentence into `plain | praise | gentle | question | thought` with regexes (`/well done|good job|…/`, `/not quite|almost|no rush…/`) to pick the tone.
- **Face animation**: `/portraits/live/{id}.json` is hand-authored rig metadata — face box, chin, neck, two eyes, two brows, mouth box, `mouthLine`, and a **sprite sheet** (`braid-parts.webp`, 576×223) holding 10 mouth shapes (`a, aa, ee, oh, oo, ss, ff, a1, a3, mm`) plus a 13-sample `forms` curve (mouth top/bottom per sample) for in-between blends. So the "she's talking to you" effect is a lip-sync sprite rig driven by phonemes + loudness + RNG micro-jitter, not a neural avatar.
- Only three audio files exist as static assets: `/voice/waiting-{braid,bob,rose}.mp3` (mono MP3, LAME 3.100, ~48–64 kbps, 5.5 s / 5.5 s / 8.2 s). Everything else is generated on demand.
- If a saved voice is rejected the API returns **422** and the client silently clears the choice (`if (o.status !== 422) return o; oa({voice:null}); retry`) — a nice tell that voice IDs are server-validated against a fixed catalogue.

---

## 3. Explanations — the generation pipeline

- No prompt text or provider string ships in the bundle (0 hits for OpenAI/Anthropic/Gemini/etc.), so the "which LLM" question is not answerable from outside. What *does* ship is the entire contract the model must satisfy.
- **Lesson objects** are Zod-validated:
  `{id, title, status: planned|writing|checking|ready|held|error, cites:[{source, ref}], study:{title, goal, revision, points[], questions[], terms[], differences[], worksheet}}`
  → so generation is asynchronous with an explicit **write → check → ready/held** lifecycle and per-lesson **citations** (`source`/`ref`, i.e. "lecture 4, slide 12"), plus a **revision** counter for regeneration.
- **"Checked for mistakes just the same"** is stated for the *Quick* pace (1½ min vs 3 min writes) — i.e. the verifier pass is mandatory in both paces; it just costs latency, not quality. Nothing in the client reveals *how* it checks; the only verifiable checking that ships client-side is **Pyodide (Python 3.14.2, 9.6 MB wasm, 357 packages incl. numpy/scipy/sympy)** running in a Web Worker with a hardened sandbox (`TooMuch` output cap, `input()` disabled, traceback filtering to `main.py`) — so numeric/symbolic claims can be recomputed in the browser.
- **Drawing DSL** (the real product moat): ~40 validated block kinds — `plot3d/surface/plane/point`, `grid`, `cell`, `region`, `tangent`, `span`, `lens`, `curve`, `glyph`, `readout`, accounting ledgers (`debits/credits/balance` with auto-computed balance errors), plus specialised modules loaded on demand: `mechanics-draw`, `motion-draw`, `frames-draw`, `graph-draw`, `map-draw`, `charts-draw`, `molecule-draw`, `venn-draw`, `array-draw` — and **33 syntax-highlighted code languages** (py, c, cpp, java, rust, go, sql, verilog, vhdl, x86/arm/mips asm, matlab, r, bash, json/yaml/xml, …).
- **Semantics drive the palette**: every element tags itself `given | follow | right | bug | good | bad | time | together | inturn`, which is how "the tangent plane" gets highlighted exactly when she says it.
- **Lesson script format**: array of beats `{seconds, section, parts[], lines, says()}` where `says()` can interleave prose and `{follow:"$P$"}` hooks so a phrase binds to a drawn object; section knots and a scrub "thread" are generated from that.
- **Study loop**: FSRS spaced-repetition scheduler (`stability`, `difficulty`, `reps`, `lapse`, learning steps) + `mommy.mastery.queue`, quizzes (`options/answer/tap`), flashcards/learn/match/test modes, and "Explain It to Mommy" recall.
- **Routing inventory** in the app shell: `today, new, create, course/{id}/{plan,studio/{ask}}, call/{course}, library(+me, c/{pub}), groups/{id}/{news,courses,assignments,members,progress,leaderboard}, u/@handle, r/code, w/token, solve/{snap}/watch, lab, settings/{lessons,about,playback,mommy,study,daily,access,account,invite,data}, billing/pricing/checkout/{done,pretend}, signin/verify/reset/account, auth/callback/{google,discord}` → social/group study, public shareable libraries, referrals, "Snap & solve" photo workflow, a call UI, and Discord/Google auth.
- **Emotional model**: `mommy.mood` in **sessionStorage** with `okay | stressed | overwhelmed | tired`; when it's `overwhelmed` the UI degrades (extra "ask anyway" affordance) — deliberate "gentle" behaviour rather than a marketing line.
- **i18n beyond English**: dynamic CSS chunks for **Japanese, Korean and Chinese** in four calligraphic styles each (sans / kai / song / hand) — so transcription of CJK slides and CJK board handwriting are planned or partially shipped.

---

## 4. What changed recently (Wayback, 2026-11-08 → today)

- Bundle `index-Dc0hRodX.js` (955 KB, 9 `mommy.*` storage keys) → `index-DEIkM71m.js` (1.9 MB, 19 keys). Added: `mommy.chosen, mommy.member, mommy.mastery.queue, mommy.playback, mommy.tones, mommy.source, mommy.referrer, mommy.ask-anyway`.
- New **CSS-transition theme system** (`data-theme`, `data-motion`, `data-tones`), **audio "tones"** (a procedurally generated ambience/noise buffer), **privacy page**, **`/api/health`**, **phone-level timings + `phonesDue`**, **pronunciation lexicon**, and much bigger block/language coverage.
- Oct snapshot had no `personality` field and a smaller settings surface → the "Warmth / Personality / Voice" panel is ~10 days old.

---

## 5. Limits of what can be known from outside

1. **TTS vendor / LLM vendor**: not disclosed. Gated API + same-origin Worker + no keys in the client.
2. **How the "checking" pass works**: only the state machine is public.
3. Anything behind `admin/beta/lab/next` — I did not attempt any access.

Cheap next probes if you want to keep going (all low-effort, no auth): monitor `/assets/` for new bundles as they ship, diff each build against this one; check whether `beta.` serves an unprotected static asset path; watch for an app-store listing that names the SDK.
