/* Diagnostic viewer. Probes never modify the user's inputs or exported build. */
(function () {
'use strict';
const canvas=document.getElementById('validationCanvas'),ctx=canvas.getContext('2d');
const gpu=window.createGripRenderer(document.getElementById('validationSurface'));
const status=document.getElementById('probeStatus');
const parsedMeshes=new WeakMap();
function parse(buffer){if(parsedMeshes.has(buffer))return parsedMeshes.get(buffer);const dv=new DataView(buffer),n=dv.getUint32(80,true),out=[];for(let i=0;i<n;i++){const tri=[];for(let j=0;j<3;j++)tri.push([0,1,2].map(k=>dv.getFloat32(84+i*50+12+j*12+k*4,true)));out.push(tri);}parsedMeshes.set(buffer,out);return out;}
const HOME={yaw:.6,pitch:-.2};
let base=null,current=null,latest=null,yaw=HOME.yaw,pitch=HOME.pitch,zoom=1,spin=false,pending=0,activeSide="right",skeleton=null,drag=null,frame=null;
const center=[0,0,0],size=[0,0,0],regionCentroids=new WeakMap(),heatCache=new WeakMap();
// Shared with the insight panels: they supply the slice outline and request redraws.
const shared=window.GripView={slice:null,redraw:scheduleDraw};
function setBaseline(side){
activeSide=side==='left'?'left':'right';
const result=GEN.generate(GRIP_BASELINE,activeSide);if(result.error)throw Error(result.error);
base=parse(result.stl);
for(let k=0;k<3;k++){let lo=Infinity,hi=-Infinity;for(const t of base)for(const v of t){lo=Math.min(lo,v[k]);hi=Math.max(hi,v[k]);}center[k]=(lo+hi)/2;size[k]=hi-lo;}
}
function compare(mesh){let max=0,sum=0,count=0;for(let i=0;i<base.length;i++)for(let j=0;j<3;j++){const d=Math.hypot(...mesh[i][j].map((v,k)=>v-base[i][j][k]));max=Math.max(max,d);sum+=d*d;count++;}return {max,rms:Math.sqrt(sum/count)};}
// Radial shape change: how far each vertex moved away from (+) or toward (-) the handle axis.
// Diverging blue / gray / red tint; gray means no change.
function heat(mesh){
if(heatCache.has(mesh))return heatCache.get(mesh);
const moved=new Float32Array(mesh.length*3),tint=new Float32Array(mesh.length*9);let max=0;
for(let i=0;i<base.length;i++)for(let j=0;j<3;j++){const b=base[i][j],c=mesh[i][j],rx=b[0]-center[0],rz=b[2]-center[2],len=Math.hypot(rx,rz)||1,d=((c[0]-b[0])*rx+(c[2]-b[2])*rz)/len;moved[i*3+j]=d;max=Math.max(max,Math.abs(d));}
const scale=Math.max(max,.05),mid=[.80,.80,.79],thicker=[.89,.29,.28],thinner=[.16,.47,.84];
for(let n=0;n<moved.length;n++){const t=Math.max(-1,Math.min(1,moved[n]/scale)),pole=t>=0?thicker:thinner,w=Math.abs(t);for(let k=0;k<3;k++)tint[n*3+k]=mid[k]+(pole[k]-mid[k])*w;}
const result={tint,max};heatCache.set(mesh,result);return result;
}
function surfaceMode(){const el=document.getElementById('surfaceMode');return (el&&el.value)||'regions';}
function scheduleDraw(){if(frame!==null)return;frame=window.requestAnimationFrame(function(){frame=null;draw();});}
function draw(){if(!base||!current)return;const width=canvas.clientWidth,height=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,1.5);if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
const viewSize=size.slice();
const scale=Math.min(width,height)*.72/Math.max(...viewSize)*zoom,cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
function project(v){const x=v[0]-center[0],y=v[1]-center[1],z=v[2]-center[2],a=x*cy+z*sy,b=-x*sy+z*cy;return [width/2+a*scale,height/2-(y*cp-b*sp)*scale];}
const mode=surfaceMode(),shape=mode==='heat'?heat(current):null;
const legend=document.getElementById('heatLegend');
if(legend){legend.hidden=!shape;if(shape){const text=shape.max<.00001?'0.00':shape.max.toFixed(2);document.getElementById('heatMin').textContent='−'+text+' mm';document.getElementById('heatMax').textContent='+'+text+' mm';}}
if(gpu)gpu.draw(base,current,yaw,pitch,center,viewSize,false,mode==='regions',false,activeSide,{zoom:zoom,tint:shape?shape.tint:null,wire:shape?[.09,.19,.17,.3]:null});
else {ctx.fillStyle='#235c50';ctx.font='14px system-ui';ctx.fillText('3D graphics unavailable. Enable hardware acceleration in your browser.',20,40);}

// Outline of the cross-section currently shown in the slice panel.
const sliceToggle=document.getElementById('showSlice');
if(shared.slice&&shared.slice.length&&(!sliceToggle||sliceToggle.checked)){
ctx.lineCap='round';
for(const [color,lineWidth] of [['rgba(255,255,255,.9)',4.5],['#16302b',2]]){ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.beginPath();for(const segment of shared.slice){const a=project(segment[0]),b=project(segment[1]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.stroke();}
}

// Nominal regions from the inherited template, transformed back to source axes.
if(document.getElementById('showRegions').checked){
const names=['Index','Middle','Ring','Pinky','Thumb'],colors=['#337bf2','#bf4dd1','#ce920e','#293744','#f25a40'];
let sums=regionCentroids.get(current);
if(!sums){sums=names.map(()=>[0,0,0,0]);
// Region centroids follow corresponding current vertices, rather than floating on the axis.
for(let i=0;i<base.length;i++){const t=base[i],v=t[0],x=-(v[1]-center[1]),y=v[2]-center[2],z=-(v[0]-center[0]);const r=GEN.sourceRegionAt?GEN.sourceRegionAt(activeSide==='left'?[v[0],v[1],2*center[2]-v[2]]:v):GEN.regionAt(x,Math.atan2(z,y)*180/Math.PI);if(r>=0){for(let k=0;k<3;k++)sums[r][k]+=current[i][0][k];sums[r][3]++;}}
regionCentroids.set(current,sums);}
ctx.font='bold 13px system-ui';
for(let i=0;i<5;i++){if(!sums[i][3])continue;const point=project(sums[i].slice(0,3).map(v=>v/sums[i][3]));const bx=i===4?width-124:12,by=32+i*38;ctx.strokeStyle=colors[i];ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(bx+(i===4?0:98),by+13);ctx.lineTo(point[0],point[1]);ctx.stroke();ctx.fillStyle=colors[i];ctx.beginPath();ctx.arc(point[0],point[1],4,0,Math.PI*2);ctx.fill();ctx.fillStyle='rgba(255,255,255,.95)';ctx.fillRect(bx,by,110,27);ctx.fillStyle=colors[i];ctx.fillText(names[i],bx+9,by+18);}
}

if(spin&&!drag){yaw+=.01;scheduleDraw();}
}
function show(result,message,hand,side){const targetSide=side||result.handedness||'right';if(!base||activeSide!==targetSide)setBaseline(targetSide);current=parse(result.stl);const contactSurface=window.createGripSurface(current,center);const checked=GEN.validateHand(hand||result.measurements||GRIP_BASELINE);skeleton=checked.error?null:window.buildGripSkeleton(checked.val,center,side||result.handedness||"right",typeof GRIP_CALIBRATION!=="undefined"?GRIP_CALIBRATION.regions:null,contactSurface);current=parse(result.stl);const metrics=compare(current);status.textContent=message+' · maximum vertex movement '+metrics.max.toFixed(4)+' mm · RMS '+metrics.rms.toFixed(4)+' mm'+(metrics.max<.00001?' · Identical geometry: the orange baseline coincides exactly with the surface.':'');
shared.slice=null;
if(window.dispatchEvent&&typeof CustomEvent==='function')window.dispatchEvent(new CustomEvent('grip-view-updated',{detail:{base:base,current:current,center:center.slice(),size:size.slice(),metrics:metrics,result:result}}));
scheduleDraw();}
function on(id,type,handler){const el=document.getElementById(id);if(el&&el.addEventListener)el.addEventListener(type,handler);}
for(const id of ['showRegions','showSlice','surfaceMode'])on(id,'change',scheduleDraw);
canvas.addEventListener('pointerdown',e=>{drag=[e.clientX,e.clientY];canvas.setPointerCapture(e.pointerId);});canvas.addEventListener('pointermove',e=>{if(!drag)return;yaw+=(e.clientX-drag[0])*.01;pitch+=(e.clientY-drag[1])*.01;drag=[e.clientX,e.clientY];scheduleDraw();});for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{drag=null;scheduleDraw();});
function setZoom(value){zoom=Math.max(.5,Math.min(6,value));scheduleDraw();}
canvas.addEventListener('wheel',e=>{e.preventDefault();setZoom(zoom*(e.deltaY<0?1.1:1/1.1));},{passive:false});
on('viewZoomIn','click',()=>setZoom(zoom*1.25));on('viewZoomOut','click',()=>setZoom(zoom/1.25));
// Camera presets. The handle's long axis is vertical on screen; "End" looks along it.
const views={viewFront:[0,0],viewSide:[Math.PI/2,0],viewEnd:[0,Math.PI/2],view3d:[HOME.yaw,HOME.pitch]};
for(const id in views)on(id,'click',()=>{yaw=views[id][0];pitch=views[id][1];scheduleDraw();});
on('autoRotate','click',function(){spin=!spin;this.setAttribute('aria-pressed',String(spin));scheduleDraw();});
on('saveView','click',()=>{
if(!base||!current)return;draw();
const surface=document.getElementById('validationSurface'),out=document.createElement('canvas');out.width=surface.width;out.height=surface.height;
const paint=out.getContext('2d');paint.fillStyle='#f0f5f3';paint.fillRect(0,0,out.width,out.height);paint.drawImage(surface,0,0);paint.drawImage(canvas,0,0,out.width,out.height);
out.toBlob(blob=>{const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='grip-preview.png';document.body.appendChild(link);link.click();setTimeout(()=>{URL.revokeObjectURL(url);link.remove();},2000);});
});
on('resetValidationView','click',()=>{yaw=HOME.yaw;pitch=HOME.pitch;zoom=1;scheduleDraw();});window.addEventListener('resize',scheduleDraw);
window.addEventListener('grip-invalidated',()=>{document.getElementById('previewStale').hidden=!latest;});
window.addEventListener('grip-generated',event=>{document.getElementById('previewStale').hidden=true;latest=event.detail;pending++;show(latest,'Latest generated output · '+(latest.handedness||'right')+' hand');});
})();
