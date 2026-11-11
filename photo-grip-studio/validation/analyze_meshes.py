from pathlib import Path
import numpy as np,json,itertools,math
ROOT=Path('validation');results=json.loads((ROOT/'generation-results.json').read_text())
def load(path):
 b=path.read_bytes();n=int.from_bytes(b[80:84],'little');assert len(b)==84+50*n
 return np.ndarray((n,12),dtype='<f4',buffer=b,offset=84,strides=(50,4))[:,3:].reshape(n,3,3).astype(float)
def normals(t):return np.cross(t[:,1]-t[:,0],t[:,2]-t[:,0])
base=load(Path('assets/base_handle.stl'));bn=normals(base);ba=np.linalg.norm(bn,axis=1)/2
_,baseIds=np.unique(base.reshape(-1,3),axis=0,return_inverse=True);baseIds=baseIds.reshape(-1,3)
def structural(t,side='right'):
 n=normals(t);area=np.linalg.norm(n,axis=1)/2
 v,ids=np.unique(t.reshape(-1,3),axis=0,return_inverse=True);f=ids.reshape(-1,3);edges=np.sort(np.concatenate([f[:,[0,1]],f[:,[1,2]],f[:,[2,0]]]),axis=1);_,counts=np.unique(edges,axis=0,return_counts=True)
 ref=bn.copy()
 if side=='left':ref[:,2]*=-1
 return {'finite':bool(np.isfinite(t).all()),'triangles':len(t),'dimensions_mm':np.ptp(t.reshape(-1,3),axis=0).round(4).tolist(),'signed_volume_mm3':float(np.einsum('ij,ij->i',t[:,0],np.cross(t[:,1],t[:,2])).sum()/6),'degenerate_faces':int((area<1e-10).sum()),'new_degenerate_faces':int(((area<1e-10)&(ba>=1e-10)).sum()),'boundary_edges':int((counts==1).sum()),'nonmanifold_edges':int((counts>2).sum()),'unique_vertices':len(v),'faces_rotated_over_90deg_from_source':int(((np.einsum('ij,ij->i',n,ref)<0)&(ba>1e-10)).sum())}
def crossings(t):
 # Broad phase: shared 5 mm AABB grid. Exact segment-triangle tests for strict
 # transverse interior crossings. Excludes coplanar contacts and shared vertices.
 low=t.min(1);high=t.max(1);grid={};pairs=set()
 for i in range(len(t)):
  if ba[i]<1e-10:continue
  a=np.floor(low[i]/5).astype(int);b=np.floor(high[i]/5).astype(int)
  for key in itertools.product(*(range(a[k],b[k]+1) for k in range(3))):
   cell=grid.setdefault(key,[])
   for j in cell:
    if (high[i]>=low[j]).all() and (high[j]>=low[i]).all():pairs.add((j,i))
   cell.append(i)
 if not pairs:return 0
 pairs=np.array(sorted(pairs));shared=(baseIds[pairs[:,0],:,None]==baseIds[pairs[:,1],None,:]).any((1,2));pairs=pairs[~shared];found=[]
 for offset in range(0,len(pairs),50000):
  batch=pairs[offset:offset+50000];a=t[batch[:,0]];b=t[batch[:,1]];hit=np.zeros(len(batch),dtype=bool)
  for source,target in [(a,b),(b,a)]:
   e1=target[:,1]-target[:,0];e2=target[:,2]-target[:,0]
   for k in range(3):
    origin=source[:,k];d=source[:,(k+1)%3]-origin;p=np.cross(d,e2);det=np.einsum('ij,ij->i',e1,p);valid=abs(det)>1e-10
    inv=np.divide(1,det,out=np.zeros_like(det),where=valid);s=origin-target[:,0];u=np.einsum('ij,ij->i',s,p)*inv;q=np.cross(s,e1);v=np.einsum('ij,ij->i',d,q)*inv;dist=np.einsum('ij,ij->i',e2,q)*inv
    hit|=valid&(u>1e-8)&(v>1e-8)&(u+v<1-1e-8)&(dist>1e-8)&(dist<1-1e-8)
  found.extend(batch[hit].tolist())
 return len(found)
source=structural(base);source['strict_crossing_pairs_lower_bound']=crossings(base);print('SOURCE',source,flush=True)
for r in results:
 if r.get('error'):continue
 t=load(ROOT/'stls'/(r['name']+'.stl'));r['independent_checks']=structural(t,'left' if r['name'].endswith('left') else 'right')
 if '_thickness_1_right' in r['name']:
  r['independent_checks']['strict_crossing_pairs_lower_bound']=crossings(t)
  print(r['name'],r['independent_checks'],flush=True)
(ROOT/'mesh-audit.json').write_text(json.dumps({'source':source,'cases':results},indent=2))
print('COMPLETE',len(results),flush=True)
