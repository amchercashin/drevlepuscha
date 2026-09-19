"""Local-only positional derivatives; source FLAC and its natural ending remain intact."""
import json,hashlib,subprocess,shutil,sys,numpy as np
from pathlib import Path
root=Path(__file__).resolve().parents[2];batch=root/'.artwork/wildlife/audio-01';out=root/'public/wildlife/audio';out.mkdir(parents=True,exist_ok=True)
ff=Path(sys.argv[1]);assets=[]
for name,id in [('squirrel-scramble','WLS01'),('deer-startle','WLD01')]:
 folder=batch/(name+'-v001');source=folder/'source.flac';r=json.loads((folder/'result.json').read_text());assert r['technical_pass']
 raw=subprocess.check_output([str(ff),'-v','error','-i',str(source),'-f','f32le','-ac','2','-ar','48000','pipe:1']);a=np.frombuffer(raw,np.float32).reshape(-1,2);mono=a.mean(1);ratio=float(np.sqrt(np.mean(mono**2)/np.mean(a**2)));assert ratio>.7
 onset=float(np.flatnonzero(abs(mono)>abs(mono).max()*.02)[0]/48000);trim=max(0,onset-.02);encoded=folder/'runtime.opus'
 subprocess.run([str(ff),'-y','-v','error','-i',str(source),'-af',f'atrim=start={trim},asetpts=PTS-STARTPTS','-ac','1','-ar','48000','-c:a','libopus','-b:a','96k','-application','audio',str(encoded)],check=True)
 decoded=np.frombuffer(subprocess.check_output([str(ff),'-v','error','-i',str(encoded),'-f','f32le','-ac','1','-ar','48000','pipe:1']),np.float32);assert np.isfinite(decoded).all() and abs(decoded).max()<1
 digest=hashlib.sha256(encoded.read_bytes()).hexdigest();file=f'{id}-{digest[:12]}.opus';shutil.copyfile(encoded,out/file)
 asset={'id':id,'event':name,'file':file,'basePath':'wildlife/audio','kind':'one_shot','group':'visible_wildlife','channels':1,'trim':1,'status':'candidate-unheard','sha256':digest,'bytes':encoded.stat().st_size,'duration':len(decoded)/48000,'peakDb':float(20*np.log10(abs(decoded).max())),'sourceSha256':r['source_sha256'],'sourceModel':'Stable Audio 3 Medium local','seed':r['seed'],'workflowSha256':r['workflow_sha256'],'processing':{'leadingQuietTrimSeconds':trim,'monoRmsRatio':ratio,'tailTrimSeconds':0,'gainDb':0,'codec':'Opus 96 kbps mono 48 kHz'},'recipe':'tools/wildlife/prepare-audio.py'};assets.append(asset)
 (folder/'derivative.json').write_text(json.dumps(asset,indent=2))
(root/'config/wildlife/audio.json').write_text(json.dumps({'v':1,'status':'candidate-unheard','assets':assets},indent=2)+'\n');print(json.dumps([{'id':a['id'],'bytes':a['bytes'],'duration':a['duration'],'processing':a['processing']} for a in assets]))
