"""Rebuild the browser's embedded template from assets/base_handle.stl.
Requires NumPy. Feature masks are transferred proportionally from upstream;
they are an initial approximation, not annotations measured on the new scan.
"""
from pathlib import Path
import base64, json, re, struct
import numpy as np
ROOT = Path(__file__).resolve().parents[1]
p = ROOT / 'index.html'
import subprocess
s = subprocess.check_output(['git','show','HEAD:index.html'],cwd=ROOT,text=True)
start = s.index('var TEMPLATE_B64 =')
end = s.index('var B64IDX', start)
block = s[start:end]
old = base64.b64decode(''.join(re.findall(r'"([A-Za-z0-9+/=]+)"', block.split('var TEMPLATE_META')[0])))
meta = json.loads(re.search(r'var TEMPLATE_META = (.*);', block)[1])
nv, nf, ns, nt = struct.unpack_from('<HIHH', old, 5)
o = 15 + nv*8 + nf*6 + ns*nt + ns*4
masks = np.frombuffer(old, dtype='<u2', offset=o).copy().reshape(5,nt,2)
b = (ROOT/'assets/base_handle.stl').read_bytes()
n = struct.unpack_from('<I', b, 80)[0]
assert len(b) == 84+50*n, 'Expected binary STL'
f = np.ndarray((n,12), dtype='<f4', buffer=b, offset=84, strides=(50,4))[:,3:].reshape(n,3,3).astype(float)
# Proper rotation: source long Y -> -X, source Z -> +Y, source X -> -Z.
f = np.stack([-f[:,:,1], f[:,:,2], -f[:,:,0]],axis=2)
lo, hi = f.reshape(-1,3).min(0), f.reshape(-1,3).max(0)
f -= (lo+hi)/2
lo, hi = f.reshape(-1,3).min(0), f.reshape(-1,3).max(0)
oldlo, oldhi = meta['x_tip_lo'], meta['x_tip_hi']
ratio = (hi[0]-lo[0])/(oldhi-oldlo)
def mapx(x): return float(lo[0]+(x-oldlo)*ratio)
for key in ['x0','x_tip_lo','x_tip_hi']: meta[key] = mapx(meta[key])
meta['step'] *= ratio
for key in ['dome_tip','taper_tip']: meta['anchors'][key]=mapx(meta['anchors'][key])
meta['anchors']['g']=[mapx(x) for x in meta['anchors']['g']]
for key in ['xs_lo','xs_hi']: meta['thumb'][key]=mapx(meta['thumb'][key])
masks[masks!=65535] = np.rint(masks[masks!=65535]*ratio).astype('<u2')
grid=[]; centers=[]
angles=np.arange(nt)*2*np.pi/nt
rays=np.column_stack([np.cos(angles), np.sin(angles)])
for j in range(ns):
 x=meta['x0']+j*meta['step']
 seg=[]
 for tri in f[(f[:,:,0].min(1)<=x)&(f[:,:,0].max(1)>=x)]:
  hits=[]
  for a,c in [(tri[0],tri[1]),(tri[1],tri[2]),(tri[2],tri[0])]:
   if (a[0]<=x<c[0]) or (c[0]<=x<a[0]): hits.append(a[1:]+(c[1:]-a[1:])*(x-a[0])/(c[0]-a[0]))
  if len(hits)==2: seg.append(hits)
 assert seg, f'No cross section at {x}'
 seg=np.array(seg); center=(seg.reshape(-1,2).min(0)+seg.reshape(-1,2).max(0))/2
 centers.append(center); a=seg[:,0]-center; d=seg[:,1]-seg[:,0]
 row=[]
 for ray in rays:
  den=ray[0]*d[:,1]-ray[1]*d[:,0]
  with np.errstate(divide='ignore', invalid='ignore'):
   r=(a[:,0]*d[:,1]-a[:,1]*d[:,0])/den
   t=(a[:,0]*ray[1]-a[:,1]*ray[0])/den
  valid=r[(abs(den)>1e-10)&(r>=0)&(t>=-1e-8)&(t<=1+1e-8)]
  row.append(max(valid) if len(valid) else float('nan'))
 row=np.array(row)
 good=np.flatnonzero(np.isfinite(row))
 assert len(good), 'Empty radial section'
 row=np.interp(np.arange(nt),good,row[good],period=nt)
 grid.append(row)
grid=np.array(grid); centers=np.array(centers)
assert grid.max()<25.55, 'Packed radius exceeds byte range'
verts, inverse=np.unique(np.round(f.reshape(-1,3),6),axis=0,return_inverse=True)
faces=inverse.reshape(-1,3)
# Correct triangle winding if the uploaded model is inverted.
vol=np.sum(np.einsum('ij,ij->i',f[:,0],np.cross(f[:,1],f[:,2])))/6
if vol<0: faces=faces[:,[0,2,1]]
assert len(verts)<65536
th=(np.degrees(np.arctan2(verts[:,2],verts[:,1]))%360*100).astype('<u2')
blob=struct.pack('<4sBHIHH',b'TG06',2,len(verts),len(faces),ns,nt)
blob+=np.rint(verts*100).astype('<i2').tobytes()+th.tobytes()+faces.astype('<u2').tobytes()
blob+=np.rint(grid*10).astype('u1').tobytes()
blob+=np.rint(centers[:,0]*100).astype('<i2').tobytes()+np.rint(centers[:,1]*100).astype('<i2').tobytes()+masks.astype('<u2').tobytes()
meta['source']='assets/base_handle.stl'
meta['r_max']=float(grid.max())
encoded=base64.b64encode(blob).decode()
new='var TEMPLATE_B64 =\n'+ '\n'.join(json.dumps(encoded[i:i+120]) + (' +' if i+120<len(encoded) else ';') for i in range(0,len(encoded),120))
new+='\nvar TEMPLATE_META = '+json.dumps(meta,separators=(',',':'))+';\n'
s=s[:start]+new+s[end:]
s=s.replace('var STL_HEADER = "evertonians handle v0.11";', 'var STL_HEADER = "Evertonians HY base handle";')
# Update template data only; preserve the maintained interface and generator.
a = s.index('var TEMPLATE_B64 =')
b = s.index('var B64IDX', a)
(ROOT / 'assets/template.js').write_text(s[a:b])
print(json.dumps({'vertices':len(verts),'triangles':len(faces),'dimensions_mm':(hi-lo).tolist(),'signed_volume_mm3':float(abs(vol)),'max_radius_mm':float(grid.max())},indent=2))
