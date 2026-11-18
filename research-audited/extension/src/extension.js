const vscode = require('vscode');
const path = require('path');
const { Voice, Aligner } = require('./voice');
const tour = require('./tour');
const os = require('os');

/**
 * Beats: [{ line, say }]  — one spoken sentence per source line (or line range).
 * The player speaks each beat, and highlights that line while it speaks.
 * Sync strategy: beats are sequential, so the audio clock *is* the timeline —
 * no timestamps needed from the TTS engine. (Same trick as chalk/whiteboard-teacher.)
 */

let current = null;
let lastBeats = [];
let lastSelection = { firstLine: 0 };

function stop() {
  if (!current) return;
  current.cancelled = true;
  if (current.audio) { current.audio.pause(); current.audio.src = ''; }
  current = null;
  vscode.window.setStatusBarMessage('');
}

/** Build the walkthrough prompt (shared by both model paths). */
function buildPrompt(selectionText, languageId) {
  return `You are a patient tutor walking a student through a piece of code, line by line.

Return ONLY JSON: {"beats":[{"line":<1-based line number within the snippet>,"say":"<one spoken sentence, max 25 words>"}]}

Rules:
- One beat per meaningful line; skip blank lines and lone brackets.
- Speak like a person: "This line divides the total by the count."
- Name the idea the line implements, not the syntax.
- Never read punctuation aloud. No markdown, no code fences, no backticks.
- If a line is a trap or edge case, say so plainly.

Language: ${languageId}

Code:
\`\`\`
${selectionText}
\`\`\``;
}

/**
 * Plan via VS Code's native Language Model API: borrows the user's Copilot
 * subscription, so no API key and no local server are needed.
 */
async function planWithVsCode(selectionText, languageId, token) {
  const models = await vscode.lm.selectChatModels({});
  if (!models.length) throw new Error('no VS Code language model available');
  const model = models[0];
  const res = await model.sendRequest(
    [vscode.LanguageModelChatMessage.User(buildPrompt(selectionText, languageId))],
    {}, token
  );
  let text = '';
  for await (const frag of res.text) text += frag;
  return parseBeats(text);
}

function parseBeats(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  const parsed = JSON.parse(text.slice(start, end + 1));
  return (parsed.beats || []).filter((b) => b && typeof b.say === 'string');
}

/** Ask an OpenAI-compatible chat endpoint for a per-line walkthrough. */
async function plan(selectionText, languageId, cfg, token) {
  const prompt = buildPrompt(selectionText, languageId);

  const res = await fetch(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cfg.apiKey ? { authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`model endpoint ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content ?? '{}';
  const parsed = JSON.parse(text);
  return (parsed.beats || []).filter((b) => b && typeof b.say === 'string');
}

let panel = null;
function ensurePlayer(context) {
  if (panel) return panel;
  panel = vscode.window.createWebviewPanel(
    'codeWalkthroughPlayer', 'Walkthrough voice',
    { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
    { enableScripts: true, retainContextWhenHidden: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')] }
  );
  panel.webview.html = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'media', 'player.html'), 'utf8');
  panel.webview.onDidReceiveMessage((m) => { if (m.type === 'stop') stop(); });
  panel.onDidDispose(() => { panel = null; });
  return panel;
}

function makeVoice() {
  const c = Voice.config();
  // Default the bundled runner to this extension's own media/ folder.
  if (c.backend === 'kokoro' && !c.localScript) {
    c.localScript = path.join(__dirname, '..', 'media', 'tts_server.py');
  }
  return new Voice(c);
}

async function run(editor) {
  stop();
  const sel = editor.selection;
  if (sel.isEmpty) return vscode.window.showInformationMessage('Select some code first.');

  const cfg = vscode.workspace.getConfiguration('codeWalkthrough');
  const selectionText = editor.document.getText(sel);
  lastSelection = { firstLine: sel.start.line };

  let beats;
  const provider = cfg.get('modelProvider') || 'auto';
  try {
    await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Planning the walkthrough…' },
      async () => {
        const wanted = provider === 'auto' ? 'vscode' : provider;
        if (wanted === 'vscode') {
          try {
            beats = await planWithVsCode(selectionText, editor.document.languageId,
              new vscode.CancellationTokenSource().token);
            return;
          } catch (e) {
            if (provider !== 'auto') throw e;
            vscode.window.setStatusBarMessage('$(info) No Copilot model — falling back to your endpoint');
          }
        }
        beats = await plan(selectionText, editor.document.languageId, {
          baseUrl: cfg.get('baseUrl'), model: cfg.get('model'), apiKey: cfg.get('apiKey'),
        });
      }
    );
  } catch (e) {
    return vscode.window.showErrorMessage(`Walkthrough failed: ${e.message}`);
  }
  lastBeats = beats;
  await playBeats(editor, beats, { firstLine: sel.start.line });
}

/** Play a list of beats: speak each, highlight its line, optionally word-level highlight. */
async function playBeats(editor, beats, { firstLine = 0 } = {}) {
  const cfg = vscode.workspace.getConfiguration('codeWalkthrough');
  const job = { cancelled: false, voice: makeVoice() };
  current = job;

  const lineDeco = vscode.window.createTextEditorDecorationType({
    isWholeLine: true,
    backgroundColor: new vscode.ThemeColor('editor.findMatchHighlightBackground'),
    borderColor: new vscode.ThemeColor('editor.findMatchBorder'),
    borderStyle: 'solid',
    borderWidth: '1px',
  });
  const wordDeco = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightStrongBackground'),
    borderRadius: '2px',
  });

  const aligner = cfg.get('wordLevel') ? new Aligner({
    pythonPath: cfg.get('pythonPath'),
    alignScript: require('path').join(__dirname, '..', 'media', 'align_server.py'),
  }) : null;

  try {
    for (const beat of beats) {
      if (job.cancelled) break;
      const lineNo = Math.min(firstLine + Math.max(0, (beat.line ?? 1) - 1), editor.document.lineCount - 1);
      const line = editor.document.lineAt(lineNo);
      editor.revealRange(line.range, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
      editor.setDecorations(lineDeco, [line.range]);
      vscode.window.setStatusBarMessage(`$(megaphone) ${beat.say}`);

      // Word-level: synthesise to a file, align it, then drive the highlight.
      if (aligner) {
        try {
          const wav = require('path').join(os.tmpdir(), `wt-${Date.now()}.wav`);
          await job.voice.renderToFile(beat.say, wav);
          const words = await aligner.align(wav);
          if (words.length) {
            await speakWithWordHighlight(editor, beat.say, words, line, wordDeco, job);
            continue;
          }
        } catch { /* fall through to plain playback */ }
      }

      try {
        const spoken = await job.voice.say(beat.say);
        if (spoken && spoken.wav && panel) {
          panel.webview.postMessage({ type: 'say', wav: spoken.wav.toString('base64'), text: beat.say });
        }
      } catch (e) {
        vscode.window.showWarningMessage(`Voice unavailable (${e.message}) — continuing silently.`);
        await new Promise((r) => setTimeout(r, 2500));
      }
    }
  } finally {
    editor.setDecorations(lineDeco, []);
    editor.setDecorations(wordDeco, []);
    aligner?.dispose();
    if (current === job) current = null;
    vscode.window.setStatusBarMessage('');
  }
}

/**
 * Highlight words inside the line as they are spoken, using the aligned
 * timestamps. Falls back to a single pass if the line has no word mapping.
 */
async function speakWithWordHighlight(editor, say, words, line, wordDeco, job) {
  const text = line.text;
  // Map aligned words onto character ranges in the source line.
  const ranges = [];
  let cursor = 0;
  for (const w of words) {
    const needle = w.w.replace(/[^\w']/g, '');
    if (!needle) continue;
    const at = text.toLowerCase().indexOf(needle.toLowerCase(), cursor);
    if (at < 0) continue;
    ranges.push({ start: at, end: at + needle.length, t0: w.s, t1: w.e });
    cursor = at + needle.length;
  }
  const t0 = Date.now();
  for (const r of ranges) {
    if (job.cancelled) return;
    const wait = r.t0 * 1000 - (Date.now() - t0);
    if (wait > 0) await new Promise((res) => setTimeout(res, wait));
    const range = new vscode.Range(line.lineNumber, r.start, line.lineNumber, r.end);
    editor.setDecorations(wordDeco, [range]);
  }
  const tail = ranges.length ? ranges[ranges.length - 1].t1 * 1000 - (Date.now() - t0) : 0;
  if (tail > 0) await new Promise((res) => setTimeout(res, tail));
  editor.setDecorations(wordDeco, []);
}

function activate(context) {
  // Register the browser-voice command on the webview-less path: VS Code's
  // SpeechSynthesis isn't available in extensions, so this is a stub that
  // resolves immediately — swap in a webview player if you want a real fallback.
  context.subscriptions.push(
    vscode.commands.registerCommand('codeWalkthrough.explainSelection', () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      ensurePlayer(context);   // real audio lives in the webview
      run(editor);
    }),
    vscode.commands.registerCommand('codeWalkthrough.stop', stop),
    vscode.commands.registerCommand('codeWalkthrough.saveTour', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || !lastBeats.length) return vscode.window.showInformationMessage('Run a walkthrough first.');
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return vscode.window.showErrorMessage('Open a folder to save a tour.');
      const title = await vscode.window.showInputBox({ prompt: 'Tour title', value: 'Voice walkthrough' });
      if (!title) return;
      const rel = require('path').relative(root, editor.document.uri.fsPath);
      const file = tour.saveTour(root, tour.toTour(lastBeats, {
        title, file: rel, firstLine: lastSelection.firstLine + 1,
      }));
      vscode.window.showInformationMessage(`Saved ${require('path').basename(file)} — CodeTour can play it.`);
    }),
    vscode.commands.registerCommand('codeWalkthrough.playTour', async () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      if (!root) return;
      const files = tour.listTours(root);
      if (!files.length) return vscode.window.showInformationMessage('No .vscode/codeTour/*.tour files here.');
      const pick = await vscode.window.showQuickPick(files.map((f) => ({ label: require('path').basename(f), f })));
      if (!pick) return;
      const loaded = tour.loadTour(pick.f);
      const editor = vscode.window.activeTextEditor || vscode.window.visibleTextEditors[0];
      if (!editor) return vscode.window.showErrorMessage('Open a file first.');
      await playBeats(editor, loaded.steps.map((s2) => ({ line: s2.line, say: s2.say })), { save: false });
    })
  );
}

function deactivate() { stop(); }

module.exports = { activate, deactivate };
