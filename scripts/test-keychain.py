import json, subprocess, tempfile, uuid
from pathlib import Path
root=Path(__file__).resolve().parent.parent
folder=Path(tempfile.mkdtemp(prefix='polyu-keychain-test-'))
chain=folder/'isolated.keychain-db'
helper=folder/'NativeBridgeTest'
subprocess.run(['xcrun','swiftc','-D','DEBUG',str(root/'src-tauri/native/NativeBridge.swift'),'-o',str(helper)],check=True,capture_output=True)
subprocess.run(['codesign','--force','--sign','-',str(helper)],check=True,capture_output=True)
subprocess.run(['security','create-keychain','-p','synthetic-test-password',str(chain)],check=True,capture_output=True)
subprocess.run(['security','unlock-keychain','-p','synthetic-test-password',str(chain)],check=True,capture_output=True)
def call(operation,value=''):
 r=subprocess.run([str(helper)],input=json.dumps({'version':1,'operation':'key-'+operation,'account':'synthetic-'+account,'value':value,'testKeychain':str(chain)}),capture_output=True,text=True)
 data=json.loads(r.stdout)
 assert r.returncode==0, data
 return data.get('value','')
account=str(uuid.uuid4())
try:
 assert call('get')==''
 call('set','synthetic-secret'); assert call('get')=='synthetic-secret'
 call('set','updated-secret'); assert call('get')=='updated-secret'
 call('delete'); assert call('get')==''
 print('Isolated Keychain create/read/update/delete: passed; login Keychain untouched.')
finally:
 subprocess.run(['security','delete-keychain',str(chain)],check=True,capture_output=True)
