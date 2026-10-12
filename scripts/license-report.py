import json, subprocess, hashlib, tomllib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
packages=tomllib.loads((root/'src-tauri/Cargo.lock').read_text())['package']
metadata={'packages':[]}
for item in packages:
 matches=list((Path.home()/'.cargo/registry/src').glob('*/'+item['name']+'-'+item['version']+'/Cargo.toml'))
 if not matches: continue
 manifest=matches[0]
 package=tomllib.loads(manifest.read_text()).get('package',{})
 metadata['packages'].append({'name':item['name'],'version':item['version'],'license':package.get('license'),'repository':package.get('repository'),'manifest_path':str(manifest)})
report=['# Third-party dependencies and license texts\n','Rust dependencies locked in Cargo.lock; JS dependencies locked in package-lock.json.\n']
texts={}
for package in sorted(metadata['packages'],key=lambda x:x['name']):
 if package['name']=='polyu-better-canvas':continue
 report.append(f"- {package['name']} {package['version']}: {package.get('license') or 'see source'}, {package.get('repository') or 'https://crates.io/crates/'+package['name']}\n")
 folder=Path(package['manifest_path']).parent
 for p in list(folder.glob('LICENSE*'))+list(folder.glob('COPYING*')):
  if p.is_file():
   content=p.read_text(errors='replace');digest=hashlib.sha256(content.encode()).hexdigest()
   if digest not in texts:texts[digest]=[content,[]]
   texts[digest][1].append(package['name']+' '+package['version'])
for name in ['react','react-dom','scheduler','lucide-react','@tauri-apps/api']:
 folder=root/'node_modules'/name
 package=json.loads((folder/'package.json').read_text())
 report.append(f"- {name} {package['version']}: {package.get('license','see source')}\n")
 for p in folder.glob('LICENSE*'):
  if p.is_file():
   content=p.read_text(errors='replace');digest=hashlib.sha256(content.encode()).hexdigest()
   if digest not in texts:texts[digest]=[content,[]]
   texts[digest][1].append(name+' '+package['version'])
for content,names in texts.values():report.append('\n## '+', '.join(names)+'\n\n```text\n'+content+'\n```\n')
(root/'src-tauri/resources/THIRD_PARTY_LICENSES.md').write_text('\n'.join(line.rstrip() for line in ''.join(report).rstrip().splitlines())+'\n')
(root/'src-tauri/resources/NOTICE.md').write_text((root/'NOTICE.md').read_text())
print('License report generated:',len(metadata['packages']),'Rust packages')
