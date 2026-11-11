from pathlib import Path
import json,struct,math
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageChops
ROOT=Path('validation'); cases=json.loads((ROOT/'generation-results.json').read_text());out=ROOT/'screenshots';out.mkdir(exist_ok=True)
def load(path):
 b=path.read_bytes();n=struct.unpack_from('<I',b,80)[0];return np.ndarray((n,12),dtype='<f4',buffer=b,offset=84,strides=(50,4))[:,3:].reshape(n,3,3).astype(float)
base=load(Path('assets/base_handle.stl'));center=(base.min((0,1))+base.max((0,1)))/2
font=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',16); small=ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc',12)
def draw_image(case):
 mesh=load(ROOT/'stls'/(case['name']+'.stl'));w,h=400,360;im=Image.new('RGB',(w,h),'#f4f7f5');d=ImageDraw.Draw(im);name=case['name'].replace('_thickness_','  thickness ×').replace('_',' ').title();d.text((12,8),name,fill='#213d36',font=font);d.text((12,32),'Teal = generated  |  orange = baseline',fill='#60736a',font=small)
 # Common source-centered orthographic camera; model Y is vertical.
 def project(tri):
  v=tri-center; a=.866*v[:,:,0]+.5*v[:,:,2];z=-.5*v[:,:,0]+.866*v[:,:,2]; y=.966*v[:,:,1]+.259*z; depth=-.259*v[:,:,1]+.966*z
  return np.stack([w/2+a*1.8,205-y*1.8],axis=2),depth.mean(1)
 points,depth=project(mesh);norm=np.cross(mesh[:,1]-mesh[:,0],mesh[:,2]-mesh[:,0]);normlen=np.linalg.norm(norm,axis=1);shade=np.divide(np.abs(norm@np.array([-.35,.4,.85])),normlen,out=np.zeros_like(normlen),where=normlen>0);order=np.argsort(depth)
 for i in order:
  c=float(.45+.45*shade[i]);d.polygon([tuple(p) for p in points[i]],fill=(int(48*c+15),int(155*c+35),int(135*c+30)))
 baseline=base.copy()
 if case['name'].endswith('_left'):baseline[:,:,2]=2*center[2]-baseline[:,:,2]
 bp,bd=project(baseline)
 mask=Image.new('L',(w,h),0);md=ImageDraw.Draw(mask)
 for triangle in bp:md.polygon([tuple(p) for p in triangle],fill=255)
 outline=ImageChops.subtract(mask.filter(ImageFilter.MaxFilter(3)),mask.filter(ImageFilter.MinFilter(3)))
 im.paste('#d97920',(0,0,w,h),outline)
 hand=case['hand'];d.text((12,328),'Hand length: %.0f mm   Grip estimate: %.1f mm'%(hand['hand_length'],hand['grip_diameter_inside']),font=small,fill='#384e46')
 im.save(out/(case['name']+'.png'));return im
images=[]
for case in cases:
 if 'error' in case:continue
 images.append((case,draw_image(case)))
for sex in ['female','male']:
 for side in ['right','left']:
  selected=[(c,im) for c,im in images if c['name'].startswith(sex+'_') and c['name'].endswith('_'+side)];sheet=Image.new('RGB',(400*3,360*5+46),'white');d=ImageDraw.Draw(sheet);d.text((12,12),sex.title()+' reference profiles · '+side+' hand · rows: 1st, 5th, 50th, 95th, 99th hand length · columns: thickness ×0.85 / ×1 / ×1.15',font=font,fill='#1b3a32')
  for i,(_,im) in enumerate(selected):sheet.paste(im,((i%3)*400,46+(i//3)*360))
  sheet.save(ROOT/(sex+'_'+side+'_contact_sheet.png'))
print('Saved',len(images),'individual comparison renders and four contact sheets.')
