import http.server, threading, wave, io, math, struct, subprocess, tempfile, os, json
from pathlib import Path
class Handler(http.server.BaseHTTPRequestHandler):
 def do_POST(self):
  body=json.loads(self.rfile.read(int(self.headers['Content-Length'])))
  assert body['input']=='hello there'
  b=io.BytesIO()
  with wave.open(b,'wb') as w:
   w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000)
   w.writeframes(b''.join(struct.pack('<h',int(12000*math.sin(2*math.pi*440*i/48000))) for i in range(24000)))
  data=b.getvalue(); self.send_response(200); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
 def log_message(self,*a): pass
server=http.server.HTTPServer(('127.0.0.1',0),Handler)
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory() as tmp:
  out=Path(tmp)/'out.wav'; env=dict(os.environ,WT_TTS_URL=f'http://127.0.0.1:{server.server_port}/v1/audio/speech')
  script=Path(__file__).resolve().parents[1]/'media/render_beat.py'
  r=subprocess.run(['python3',str(script),'--backend','external','--text','hello [sigh] there','--out',str(out)],env=env,capture_output=True,text=True,check=True)
  with wave.open(str(out),'rb') as w:
   assert w.getframerate()==24000 and w.getnchannels()==1 and w.getnframes()==12000
   pcm=struct.unpack('<%dh'%w.getnframes(),w.readframes(w.getnframes()))
   assert max(map(abs,pcm))<=28000
  print('PASS mock external: tags stripped, 48 kHz input resampled to 24 kHz, PCM output and peak')
finally:
 server.shutdown()
 # renderer currently creates a fixed temporary file in media; remove test artifact
 (Path(__file__).resolve().parents[1]/'media/.tmp-external.wav').unlink(missing_ok=True)
