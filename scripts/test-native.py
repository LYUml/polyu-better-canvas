import subprocess, json, tempfile
from pathlib import Path
root = Path(__file__).resolve().parent.parent
fixtures = Path(tempfile.mkdtemp(prefix='polyu-native-fixtures-'))
subprocess.run(['xcrun','swift',str(root/'scripts/native-fixtures.swift'),str(fixtures)],check=True)
results=[]
for name in ('text.pdf','scan.pdf'):
 r=subprocess.run([str(root/'src-tauri/resources/DocumentReader')],input=json.dumps({'version':1,'path':str(fixtures/name),'textOnly':False}),text=True,capture_output=True,check=True)
 data=json.loads(r.stdout); assert data['version']==1
 page=data['pages'][0]; assert page['page']==1
 content=page['text']+'\n'+'\n'.join(page.get('ocrRows',[]))
 assert '2026' in content and '23:59' in content, name
 results.append({'fixture':name,'page':page['page'],'method':page['method'],'passed':True})
print(json.dumps({'native_reader':results},ensure_ascii=False))

bridge=root/'src-tauri/resources/NativeBridge.app/Contents/MacOS/NativeBridge'
r=subprocess.run([str(bridge)],input=json.dumps({'version':1,'operation':'file-icon','path':str(fixtures/'text.pdf')}),text=True,capture_output=True,check=True)
icon=json.loads(r.stdout);assert icon['version']==1 and icon['dataUrl'].startswith('data:image/png;base64,')
import base64
assert base64.b64decode(icon['dataUrl'].split(',',1)[1]).startswith(b'\x89PNG\r\n\x1a\n')
print('Native system file icon: passed')
