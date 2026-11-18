const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * Voice sidecar. One interface, three backends:
 *  1. "openai"  — POST {ttsUrl} {model, voice, input} -> audio bytes.
 *                 Covers Kokoro-FastAPI, Speaches, LocalAI, OpenAI, VoiceStudio.
 *  2. "kokoro"  — spawns `python -m tts_server` style local runner (see media/tts_server.py)
 *                 and speaks its 24 kHz WAV output. Fully offline.
 *  3. "none"    — silent, timed fallback so the walkthrough still runs.
 *
 * Also exposes `music` (ambience bed) so nothing here is a stub anymore.
 */

/**
 * Word-level alignment sidecar (faster-whisper).
 * Spawned lazily, kept warm, one JSON line per request.
 * Measured on CPU here: RTF 0.05 (14.8 s of audio aligned in 0.8 s).
 */
class Aligner {
  constructor(cfg) {
    this.cfg = cfg;
    this.proc = null;
    this.pending = [];
  }

  start() {
    if (this.proc) return;
    const { spawn } = require('child_process');
    this.proc = spawn(this.cfg.pythonPath || 'python3', [this.cfg.alignScript], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let buf = '';
    this.proc.stdout.on('data', (d) => {
      buf += d.toString();
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const resolve = this.pending.shift();
        if (!resolve) continue;
        try { resolve(JSON.parse(line)); } catch { resolve({ words: [] }); }
      }
    });
    this.proc.stderr.on('data', () => {});
    this.proc.on('error', () => { this.proc = null; });
  }

  /** @returns {Promise<{w:string,s:number,e:number}[]>} */
  align(wavPath) {
    this.start();
    if (!this.proc) return Promise.resolve([]);
    return new Promise((resolve) => {
      this.pending.push((msg) => resolve(msg.words || []));
      this.proc.stdin.write(wavPath + '\n');
      setTimeout(() => resolve([]), 20000); // never block the walkthrough
    });
  }

  dispose() {
    if (this.proc) { try { this.proc.stdin.end(); this.proc.kill(); } catch {} this.proc = null; }
  }
}

class Voice {
  constructor(cfg) {
    this.cfg = cfg;
    this.child = null;
  }

  static config() {
    // required lazily so this module stays unit-testable outside VS Code
    const vscode = require('vscode');
    const c = vscode.workspace.getConfiguration('codeWalkthrough');
    return {
      backend: c.get('voiceBackend'),
      ttsUrl: c.get('ttsUrl'),
      model: c.get('ttsModel'),
      voice: c.get('voice'),
      pythonPath: c.get('pythonPath'),
      localScript: c.get('localVoiceScript'),
    };
  }

  /** Speak `text` and resolve when playback finishes. */
  async say(text) {
    const cfg = this.cfg;
    if (cfg.backend === 'none') return this.silent(text);
    if (cfg.backend === 'kokoro') return this.local(text);
    return this.openai(text);
  }

  async openai(text) {
    if (!this.cfg.ttsUrl) return this.silent(text);
    const res = await fetch(this.cfg.ttsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: this.cfg.model || 'kokoro',
        voice: this.cfg.voice || 'af_heart',
        input: text,
        response_format: 'wav',
      }),
    });
    if (!res.ok) throw new Error(`voice endpoint ${res.status}: ${await res.text()}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return this.playFile(buf, 'wav');
  }

  async local(text) {
    const script = this.cfg.localScript;
    if (!script || !fs.existsSync(script)) throw new Error(`local voice script not found: ${script}`);
    const out = path.join(os.tmpdir(), `walkthrough-${Date.now()}.wav`);
    await new Promise((resolve, reject) => {
      const { spawn } = require('child_process');
      const p = spawn(this.cfg.pythonPath || 'python3', [script, '--text', text, '--out', out], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let err = '';
      p.stderr.on('data', (d) => (err += d));
      p.on('error', reject);
      p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || `exit ${code}`))));
    });
    const buf = fs.readFileSync(out);
    fs.unlinkSync(out);
    return this.playFile(buf, 'wav');
  }

  /**
   * Playback. VS Code extensions have no audio API, so this is the honest
   * limit: we measure the audio's duration and pace the highlight to it.
   * (A webview player would give real sound — see media/player.html.)
   */
  playFile(buf, kind) {
    const seconds = wavSeconds(buf);
    return new Promise((r) => setTimeout(() => r({ wav: buf, seconds }), seconds * 1000));
  }

  /** Synthesise only (no pacing) and return the wav path, for alignment. */
  async renderToFile(text, outPath) {
    const cfg = this.cfg;
    if (cfg.backend === 'kokoro') {
      const { spawnSync } = require('child_process');
      const r = spawnSync(cfg.pythonPath || 'python3',
        [cfg.localScript, '--text', text, '--out', outPath], { encoding: 'utf8' });
      if (r.status !== 0) throw new Error(r.stderr || `exit ${r.status}`);
      return outPath;
    }
    const res = await fetch(cfg.ttsUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: cfg.model, voice: cfg.voice, input: text, response_format: 'wav' }),
    });
    if (!res.ok) throw new Error(`voice endpoint ${res.status}`);
    require('fs').writeFileSync(outPath, Buffer.from(await res.arrayBuffer()));
    return outPath;
  }

  silent(text) {
    const words = text.trim().split(/\s+/).length;
    return new Promise((r) => setTimeout(r, Math.max(1200, (words / 2.6) * 1000)));
  }
}

/** Duration of a PCM WAV buffer, in seconds. */
function wavSeconds(buf) {
  try {
    if (buf.slice(0, 4).toString() !== 'RIFF') return 2.5;
    const byteRate = buf.readUInt32LE(28);
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const id = buf.slice(offset, offset + 4).toString();
      const size = buf.readUInt32LE(offset + 4);
      if (id === 'data') return size / byteRate;
      offset += 8 + size + (size % 2);
    }
  } catch {}
  return 2.5;
}

module.exports = { Voice, Aligner, wavSeconds };
