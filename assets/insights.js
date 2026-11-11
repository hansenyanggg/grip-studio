/* Insight panels: stat tiles, cross-section slice, size profile and measurement comparison.
 * Read-only views of the latest generated grip. Nothing here changes inputs or the exported STL. */
(function () {
'use strict';
const $=id=>document.getElementById(id);
if(!$('insights'))return;
const COLOR={yours:'#1baf7a',reference:'#eb6834',ink:'#16302b',muted:'#61746f',grid:'#e1e7e3',axis:'#b9c7c0'};
const BINS=80,CHART={w:560,h:250,l:44,r:80,t:16,b:38};
let view=null,range=null,half=1,profile=null,sliceMm=null,yDomain=[0,1];
function fmt(value,digits){return Number(value).toFixed(digits===undefined?1:digits);}

/* ---------- geometry helpers ---------- */
function yExtent(mesh){let lo=Infinity,hi=-Infinity;for(const t of mesh)for(const v of t){if(v[1]<lo)lo=v[1];if(v[1]>hi)hi=v[1];}return [lo,hi];}
function radialExtent(mesh,center){let m=0;for(const t of mesh)for(const v of t)m=Math.max(m,Math.abs(v[0]-center[0]),Math.abs(v[2]-center[2]));return m;}
// Intersect every triangle with the plane y = constant; returns [[x,z],[x,z]] segments.
function slice(mesh,y){const out=[];for(const tri of mesh){const hits=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3];if((a[1]<=y&&y<b[1])||(b[1]<=y&&y<a[1])){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);}}if(hits.length===2)out.push(hits);}return out;}
function box(segments){if(!segments.length)return null;let x0=Infinity,x1=-Infinity,z0=Infinity,z1=-Infinity;for(const s of segments)for(const p of s){x0=Math.min(x0,p[0]);x1=Math.max(x1,p[0]);z0=Math.min(z0,p[1]);z1=Math.max(z1,p[1]);}return {w:x1-x0,d:z1-z0};}
// Mean of the two cross-section extents in each band along the handle.
function bins(mesh){const lo=range[0],len=range[1]-range[0],e=[];for(let i=0;i<BINS;i++)e.push([Infinity,-Infinity,Infinity,-Infinity]);
for(const t of mesh)for(const v of t){const b=e[Math.max(0,Math.min(BINS-1,Math.floor((v[1]-lo)/len*BINS)))];if(v[0]<b[0])b[0]=v[0];if(v[0]>b[1])b[1]=v[0];if(v[2]<b[2])b[2]=v[2];if(v[2]>b[3])b[3]=v[2];}
return e.map(b=>b[0]===Infinity?null:((b[1]-b[0])+(b[3]-b[2]))/2);}

/* ---------- stat tiles ---------- */
function tiles(){
const stats=view.result.stats||{},volume=(stats.volume_mm3||0)/1000;
const material=$('material'),fill=Number($('infill').value)/100,density=Number(material.value);
$('infillValue').textContent=Math.round(fill*100)+'%';
const items=[
['Handle length',fmt(stats.handle_length_mm,1),'mm',''],
['Volume',fmt(volume,1),'cm³','solid model'],
['Estimated print mass',fmt(volume*density*fill,0),'g',material.options[material.selectedIndex].text+' at '+Math.round(fill*100)+'% fill'],
['Largest surface movement',fmt(view.metrics.max,2),'mm','versus reference grip'],
['Typical movement (RMS)',fmt(view.metrics.rms,2),'mm','versus reference grip']];
$('statTiles').innerHTML=items.map(i=>'<div class="tile"><span class="tileLabel">'+i[0]+'</span><span class="tileValue">'+i[1]+'<small> '+i[2]+'</small></span><span class="tileNote">'+i[3]+'</span></div>').join('');
}

/* ---------- cross-section ---------- */
function drawSection(){
if(!view)return;
const canvas=$('sectionCanvas'),w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);
if(!w||!h)return;
if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);
const y=range[0]+Math.max(.2,Math.min(range[1]-range[0]-.2,sliceMm)),px=Math.min(w,h)/(2*half*1.18),cx=view.center[0],cz=view.center[2];
const at=p=>[w/2+(p[0]-cx)*px,h/2-(p[1]-cz)*px];
ctx.strokeStyle=COLOR.grid;ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(w/2,8);ctx.lineTo(w/2,h-8);ctx.moveTo(8,h/2);ctx.lineTo(w-8,h/2);ctx.stroke();
const reference=slice(view.base,y),yours=slice(view.current,y);
function stroke(segments,color,width){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.beginPath();for(const s of segments){const a=at(s[0]),b=at(s[1]);ctx.moveTo(a[0],a[1]);ctx.lineTo(b[0],b[1]);}ctx.stroke();}
stroke(yours,COLOR.yours,3);stroke(reference,COLOR.reference,1.5);
// 10 mm scale bar.
ctx.strokeStyle=COLOR.ink;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(14,h-16);ctx.lineTo(14+10*px,h-16);ctx.stroke();
ctx.fillStyle=COLOR.muted;ctx.font='12px system-ui';ctx.fillText('10 mm',20+10*px,h-12);
const a=box(yours),b=box(reference);
$('sectionReadout').textContent='Slice '+fmt(sliceMm,1)+' mm from the pinky end. '+(a?'Yours '+fmt(a.w,1)+' × '+fmt(a.d,1)+' mm':'No surface here')+(b?' · reference '+fmt(b.w,1)+' × '+fmt(b.d,1)+' mm.':'.');
if(window.GripView){window.GripView.slice=yours.map(s=>[[s[0][0],y,s[0][1]],[s[1][0],y,s[1][1]]]);window.GripView.redraw();}
}

/* ---------- size profile chart ---------- */
function xAt(mm){return CHART.l+mm/(range[1]-range[0])*(CHART.w-CHART.l-CHART.r);}
function yAt(v){return CHART.t+(1-(v-yDomain[0])/(yDomain[1]-yDomain[0]))*(CHART.h-CHART.t-CHART.b);}
function binMm(i){return (i+.5)/BINS*(range[1]-range[0]);}
function path(values){let d='',pen=false;values.forEach((v,i)=>{if(v===null){pen=false;return;}d+=(pen?'L':'M')+xAt(binMm(i)).toFixed(1)+' '+yAt(v).toFixed(1);pen=true;});return d;}
function lastValue(values){for(let i=values.length-1;i>=0;i--)if(values[i]!==null)return values[i];return yDomain[0];}
function drawProfile(){
const all=profile.yours.concat(profile.reference).filter(v=>v!==null),length=range[1]-range[0];
yDomain=[Math.floor(Math.min(...all)/10)*10,Math.ceil(Math.max(...all)/10)*10];if(yDomain[0]===yDomain[1])yDomain[1]+=10;
let svg='<svg viewBox="0 0 '+CHART.w+' '+CHART.h+'" role="img" aria-label="Grip size along the handle, yours and reference">';
const step=(yDomain[1]-yDomain[0])>40?20:10,right=CHART.w-CHART.r,bottom=CHART.h-CHART.b;
for(let v=yDomain[0];v<=yDomain[1];v+=step){const y=yAt(v);svg+='<line x1="'+CHART.l+'" x2="'+right+'" y1="'+y+'" y2="'+y+'" stroke="'+(v===yDomain[0]?COLOR.axis:COLOR.grid)+'"/><text x="'+(CHART.l-8)+'" y="'+(y+4)+'" text-anchor="end">'+v+'</text>';}
for(let mm=0;mm<=length;mm+=20)svg+='<text x="'+xAt(mm)+'" y="'+(bottom+16)+'" text-anchor="middle">'+mm+'</text>';
svg+='<text x="'+CHART.l+'" y="'+(CHART.h-4)+'">Distance from pinky end (mm)</text><text x="'+(CHART.l-8)+'" y="10" text-anchor="end">mm</text>';
svg+='<path d="'+path(profile.yours)+'" fill="none" stroke="'+COLOR.yours+'" stroke-width="3" stroke-linejoin="round"/>';
svg+='<path d="'+path(profile.reference)+'" fill="none" stroke="'+COLOR.reference+'" stroke-width="1.75" stroke-linejoin="round"/>';
// Direct labels at the line ends, nudged apart when the lines coincide.
let ya=yAt(lastValue(profile.yours)),yb=yAt(lastValue(profile.reference));if(Math.abs(ya-yb)<14){const mid=(ya+yb)/2,up=ya<=yb;ya=mid+(up?-8:8);yb=mid+(up?8:-8);}
svg+='<circle cx="'+(right+8)+'" cy="'+(ya-4)+'" r="4" fill="'+COLOR.yours+'"/><text class="lead" x="'+(right+16)+'" y="'+ya+'">Yours</text>';
svg+='<circle cx="'+(right+8)+'" cy="'+(yb-4)+'" r="4" fill="'+COLOR.reference+'"/><text class="lead" x="'+(right+16)+'" y="'+yb+'">Reference</text>';
svg+='<line id="profileHover" y1="'+CHART.t+'" y2="'+bottom+'" stroke="'+COLOR.axis+'" visibility="hidden"/>';
svg+='<g id="profileSlice"><line y1="'+CHART.t+'" y2="'+bottom+'" stroke="'+COLOR.ink+'" stroke-width="1.5"/><path d="M-5 '+(CHART.t-6)+'h10l-5 7z" fill="'+COLOR.ink+'"/></g></svg>';
$('profilePlot').innerHTML=svg;placeSliceMarker();
}
function placeSliceMarker(){const g=$('profileSlice');if(!g)return;const x=xAt(sliceMm);g.setAttribute('transform','translate('+x.toFixed(1)+' 0)');}
function pointerMm(event){const svg=$('profilePlot').firstChild;if(!svg||!range)return null;const r=svg.getBoundingClientRect(),sx=(event.clientX-r.left)/r.width*CHART.w,mm=(sx-CHART.l)/(CHART.w-CHART.l-CHART.r)*(range[1]-range[0]);return mm<0||mm>range[1]-range[0]?null:mm;}
function hover(event){
const mm=pointerMm(event),tip=$('profileTip'),line=$('profileHover');
if(mm===null){tip.hidden=true;if(line)line.setAttribute('visibility','hidden');return;}
const i=Math.max(0,Math.min(BINS-1,Math.floor(mm/(range[1]-range[0])*BINS))),a=profile.yours[i],b=profile.reference[i],x=xAt(mm);
line.setAttribute('x1',x);line.setAttribute('x2',x);line.setAttribute('visibility','visible');
tip.innerHTML='<b>'+fmt(mm,0)+' mm from pinky end</b><span><i style="background:'+COLOR.yours+'"></i>Yours '+(a===null?'n/a':fmt(a,1)+' mm')+'</span><span><i style="background:'+COLOR.reference+'"></i>Reference '+(b===null?'n/a':fmt(b,1)+' mm')+'</span>';
tip.hidden=false;const host=$('profileChart').getBoundingClientRect(),left=event.clientX-host.left;tip.style.left=Math.min(Math.max(8,left+14),host.width-190)+'px';tip.style.top='8px';
if(event.buttons&1)setSlice(mm);
}

/* ---------- measurement comparison ---------- */
const GROUPS=[
['Hand',[['Hand length','hand_length'],['Hand breadth','hand_breadth'],['Inside grip diameter','grip_diameter_inside']]],
['Thumb',[['Length','thumb_length'],['Breadth','thumb_breadth'],['Thickness','thumb_thickness']]],
['Finger length',['Index','Middle','Ring','Pinky'].map((n,i)=>[n,'finger_lengths',i])],
['Finger width',['Index','Middle','Ring','Pinky'].map((n,i)=>[n,'finger_widths',i])],
['Finger thickness',['Index','Middle','Ring','Pinky'].map((n,i)=>[n,'finger_thicknesses',i])]];
function pick(source,key,index){const v=source?source[key]:null;return index===undefined?v:(v?v[index]:null);}
function compare(){
const mine=view.result.measurements||{},reference=typeof GRIP_BASELINE==='undefined'?{}:GRIP_BASELINE,LIMIT=30;
let html='';
for(const group of GROUPS){html+='<h3>'+group[0]+'</h3>';
for(const row of group[1]){const a=pick(mine,row[1],row[2]),b=pick(reference,row[1],row[2]),known=typeof a==='number'&&a>0&&typeof b==='number'&&b>0;
const pct=known?(a-b)/b*100:0,width=Math.min(Math.abs(pct),LIMIT)/LIMIT*50,side=pct>=0?'more':'less';
const bar=known&&Math.abs(pct)>=.05?'<span class="cmpBar '+side+'" style="'+(pct>=0?'left:50%':'right:50%')+';width:'+width.toFixed(1)+'%"></span>':'';
html+='<div class="cmpRow" title="'+(known?'Yours '+a+' mm · reference '+b+' mm':'No value entered')+'"><span class="cmpName">'+row[0]+'</span><span class="cmpTrack">'+bar+'</span><span class="cmpValue">'+(known?fmt(a,a%1?1:0)+' mm':'—')+'</span><span class="cmpDelta">'+(known?(pct>0?'+':pct<0?'−':'')+fmt(Math.abs(pct),1)+'%':'')+'</span></div>';}}
$('compareChart').innerHTML=html;
}

/* ---------- wiring ---------- */
function setSlice(mm){sliceMm=Math.max(0,Math.min(range[1]-range[0],mm));$('slicePos').value=sliceMm;placeSliceMarker();drawSection();}
window.addEventListener('grip-view-updated',function(event){
view=event.detail;
const a=yExtent(view.base),b=yExtent(view.current);range=[Math.min(a[0],b[0]),Math.max(a[1],b[1])];
half=Math.max(radialExtent(view.base,view.center),radialExtent(view.current,view.center));
profile={yours:bins(view.current),reference:bins(view.base)};
const length=range[1]-range[0],slider=$('slicePos');slider.max=length.toFixed(1);
sliceMm=sliceMm===null?length*.62:Math.min(sliceMm,length);slider.value=sliceMm;
$('insights').classList.remove('stale');
tiles();drawProfile();compare();drawSection();
});
window.addEventListener('grip-invalidated',function(){if(view)$('insights').classList.add('stale');});
window.addEventListener('resize',drawSection);
$('slicePos').addEventListener('input',function(){if(view)setSlice(Number(this.value));});
$('material').addEventListener('change',function(){if(view)tiles();});
$('infill').addEventListener('input',function(){if(view)tiles();});
const chart=$('profileChart');
chart.addEventListener('pointermove',hover);chart.addEventListener('pointerdown',function(e){const mm=pointerMm(e);if(mm!==null&&view)setSlice(mm);});
chart.addEventListener('pointerleave',function(){$('profileTip').hidden=true;const line=$('profileHover');if(line)line.setAttribute('visibility','hidden');});
})();
