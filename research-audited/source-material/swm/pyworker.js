const _=String.raw`
import builtins, io, json, linecache, math, sys, traceback

LIMIT = ${2e4}

class TooMuch(BaseException):
    pass

class Out(io.TextIOBase):
    def __init__(self, emit=None):
        self.parts = []
        self.size = 0
        self.emit = emit
    def writable(self):
        return True
    def write(self, s):
        s = str(s)
        room = LIMIT - self.size
        if len(s) > room:
            self._add(s[:max(0, room)])
            raise TooMuch()
        self._add(s)
        return len(s)
    def _add(self, s):
        if not s:
            return
        self.parts.append(s)
        self.size += len(s)
        if self.emit is not None:
            self.emit(s)
    def text(self):
        return "".join(self.parts)

class In(io.TextIOBase):
    def __init__(self, text, out):
        self.lines = None if text is None else io.StringIO(text)
        self.out = out
    def readable(self):
        return True
    def readline(self, size=-1):
        if self.lines is None:
            raise EOFError("input() has nothing to read here: this runner has no keyboard, so put the value in the code instead")
        line = self.lines.readline()
        if not line:
            raise EOFError("input() has read every line it was given")
        self.out.write(line if line.endswith("\n") else line + "\n")
        return line

def error_of(e):
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "main.py"]
    line = frames[-1].lineno if frames else None
    if isinstance(e, SyntaxError) and e.filename == "main.py":
        line = e.lineno
    text = ""
    if frames:
        text = "Traceback (most recent call last):\n" + "".join(traceback.format_list(frames))
    text += "".join(traceback.format_exception_only(type(e), e))
    message = (e.msg or "") if isinstance(e, SyntaxError) else str(e)
    return {"type": type(e).__name__, "message": message, "line": line, "text": text}

def execute(src, stdin, emit):
    out = Out(emit)
    ns = {"__name__": "__main__", "__builtins__": builtins}
    linecache.cache["main.py"] = (len(src), None, src.splitlines(True), "main.py")
    old = sys.stdout, sys.stderr, sys.stdin
    sys.stdout = sys.stderr = out
    sys.stdin = In(stdin, out)
    error = None
    stopped = None
    try:
        exec(compile(src, "main.py", "exec"), ns)
    except SystemExit:
        pass
    except TooMuch:
        stopped = "output"
    except KeyboardInterrupt:
        stopped = "time"
    except MemoryError as e:
        error = error_of(e)
        stopped = "memory"
    except BaseException as e:
        error = error_of(e)
    finally:
        sys.stdout, sys.stderr, sys.stdin = old
    return ns, out, error, stopped

def run(src, stdin=None, emit=None):
    ns, out, error, stopped = execute(src, stdin, emit)
    return json.dumps({"out": out.text(), "error": error, "stopped": stopped})

def same(got, want):
    if isinstance(want, bool) or isinstance(got, bool):
        return type(got) is type(want) and got == want
    if isinstance(want, float) or isinstance(got, float):
        if isinstance(got, (int, float)) and isinstance(want, (int, float)):
            return math.isclose(got, want, rel_tol=1e-9, abs_tol=1e-9)
        return False
    if isinstance(want, (list, tuple)):
        return type(got) is type(want) and len(got) == len(want) and all(same(a, b) for a, b in zip(got, want))
    if isinstance(want, dict):
        return isinstance(got, dict) and got.keys() == want.keys() and all(same(got[k], want[k]) for k in want)
    return type(got) == type(want) and got == want

def lines_of(text):
    return [line.rstrip() for line in text.rstrip("\n").split("\n")]

def test(src, tests_json, stdin=None):
    tests = json.loads(tests_json)
    ns, out, error, stopped = execute(src, stdin, None)
    if error is not None or stopped is not None:
        return json.dumps({"out": out.text(), "error": error, "stopped": stopped, "results": []})
    results = []
    for t in tests:
        r = {"call": t["call"], "pass": False}
        buf = Out()
        old = sys.stdout, sys.stderr, sys.stdin
        sys.stdout = sys.stderr = buf
        sys.stdin = In(stdin, buf)
        try:
            got = eval(compile(t["call"], "test", "eval"), ns)
            r["got"] = repr(got)[:300]
            ok = True
            if "expect" in t:
                ok = same(got, eval(t["expect"], {"__builtins__": builtins}))
            if "prints" in t:
                ok = ok and lines_of(buf.text()) == lines_of(t["prints"])
            r["pass"] = ok
        except TooMuch:
            r["stopped"] = "output"
        except KeyboardInterrupt:
            r["stopped"] = "time"
        except MemoryError as e:
            r["error"] = error_of(e)
            r["stopped"] = "memory"
        except BaseException as e:
            r["error"] = error_of(e)
        finally:
            sys.stdout, sys.stderr, sys.stdin = old
        r["printed"] = buf.text()[:2000]
        results.append(r)
    return json.dumps({"out": out.text(), "error": None, "stopped": None, "results": results})
`,g=String.raw`
import builtins, sys
def _guard(real):
    blocked = ("js", "pyodide", "pyodide_js", "_pyodide", "_pyodide_core", "micropip", "importlib", "ctypes")
    def guarded(name, globals=None, locals=None, fromlist=(), level=0):
        if level == 0 and name.split(".")[0] in blocked:
            frame = sys._getframe(1)
            while frame is not None:
                if frame.f_code.co_filename in ("main.py", "test"):
                    raise ImportError("this runner keeps Python away from the browser, so " + name + " isn't available here")
                frame = frame.f_back
        return real(name, globals, locals, fromlist, level)
    return guarded
builtins.__import__ = _guard(builtins.__import__)
del _guard
`,b=WebAssembly.Memory.prototype.grow;let p=0;WebAssembly.Memory.prototype.grow=function(s){if(p&&this.buffer.byteLength/65536+s>p)throw new RangeError("over the memory cap");return b.call(this,s)};let c={};const h={wasm:"application/wasm",zip:"application/zip",json:"application/json"};self.fetch=async s=>{const e=String(s instanceof Request?s.url:s).split("?")[0].split("/").pop(),t=c[e];if(!t)throw new TypeError(`no network here (${e})`);return new Response(t,{headers:{"Content-Type":h[e.split(".").pop()]??"application/octet-stream"}})};function w(){const s=["fetch","XMLHttpRequest","WebSocket","WebSocketStream","EventSource","WebTransport","importScripts","Worker","SharedWorker","indexedDB","caches","BroadcastChannel","cookieStore","Request"];for(let t=self;t&&t!==Object.prototype;t=Object.getPrototypeOf(t))for(const r of s)if(Object.hasOwn(t,r)){try{delete t[r]}catch{}try{Object.defineProperty(t,r,{value:void 0,configurable:!1,writable:!1})}catch{}}const e=self.navigator;for(const t of["serviceWorker","sendBeacon","storage"])try{Object.defineProperty(e,t,{value:void 0})}catch{}}let f=null,d=null,a=Promise.resolve();async function x(s,e){const t=performance.now();c=e;const{loadPyodide:r}=await import(`${s}pyodide.mjs`),n=await r({indexURL:s,packages:[],fullStdLib:!1}),o=n.toPy({});n.runPython(_,{globals:o}),n.runPython(g),f=o.get("run"),d=o.get("test"),c={},w(),p=256*1024*1024/65536,self.postMessage({type:"ready",ms:Math.round(performance.now()-t)})}self.onmessage=s=>{const e=s.data;if(e.type==="load"){a=a.then(()=>x(e.base,e.files)).catch(r=>self.postMessage({type:"failed",why:String(r)}));return}const t=e.id;a=a.then(()=>{if(!f||!d){self.postMessage({type:"done",id:t,result:null});return}let r="",n=0;const o=()=>{r&&self.postMessage({type:"out",id:t,text:r}),r=""},m=i=>{r+=i;const u=performance.now();(u-n>50||r.length>4e3)&&(n=u,o())},y=performance.now();let l=null;try{const i=e.type==="run"?f(e.source,e.stdin,m):d(e.source,JSON.stringify(e.tests),e.stdin);l={...JSON.parse(i),ms:Math.round(performance.now()-y)}}catch(i){l={out:"",error:{type:"RunnerError",message:String(i).slice(-300),line:null,text:""},stopped:null,results:[]}}o(),self.postMessage({type:"done",id:t,result:l})})};
