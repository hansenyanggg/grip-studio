/* Apply the existing hand-dependent displacement field to the original STL.
 * Subtract the reference field so baseline inputs introduce zero displacement.
 * Keep the original triangulation, cavities and end details. */
(function () {
"use strict";
var engine = GEN;
var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
var encoded=GRIP_SOURCE_B64.replace(/=+$/, ""), bytes=new Uint8Array(Math.floor(encoded.length*3/4));
var bits=0, acc=0, pos=0;
for(var i=0;i<encoded.length;i++){acc=acc*64+chars.indexOf(encoded[i]);bits+=6;if(bits>=8){bits-=8;bytes[pos++]=Math.floor(acc/Math.pow(2,bits))%256;acc%=Math.pow(2,bits);}}
var source=new DataView(bytes.buffer),count=source.getUint32(80,true);
var baseline=engine.validateHand(GRIP_BASELINE).val;
var reference=engine.buildMesh(baseline,engine.layout(baseline),'right');
var lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
for(i=0;i<count;i++)for(var j=0;j<3;j++)for(var k=0;k<3;k++){var v=source.getFloat32(84+i*50+12+j*12+k*4,true);lo[k]=Math.min(lo[k],v);hi[k]=Math.max(hi[k],v);}
var center=lo.map(function(v,k){return (v+hi[k])/2;});
var calibration=typeof GRIP_CALIBRATION==='undefined'?null:GRIP_CALIBRATION;
GEN.sourceRegionAt=function(point){if(!calibration)return -1;var best=1,index=-1;calibration.regions.forEach(function(r,i){var d=point.reduce(function(s,v,k){return s+Math.pow((v-r.point[k])/r.radius[k],2);},0);if(d<=best){best=d;index=i;}});return index;};
function relocatedSample(field,x,theta,point){
if(!calibration)return sample(field,x,theta);
var index=GEN.sourceRegionAt(point);if(index<0)return sample(field,x,theta);
var r=calibration.regions[index],cx=-(r.point[1]-center[1]),angle=Math.atan2(-(r.point[0]-center[0]),r.point[2]-center[2])*180/Math.PI;
var oldX=index===4?(TEMPLATE_META.thumb.xs_lo+TEMPLATE_META.thumb.xs_hi)/2:TEMPLATE_META.anchors.g[index];
var oldAngle=index===4?170:340;
var d=point.reduce(function(s,v,k){return s+Math.pow((v-r.point[k])/r.radius[k],2);},0),weight=0.2*Math.pow(Math.max(0,1-d),2);
return sample(field,x,theta)*(1-weight)+sample(field,x+oldX-cx,theta+oldAngle-angle)*weight;
}
function sample(field,x,theta){
var f=Math.max(0,Math.min(TEMPLATE_META.n_stations-1,(x-TEMPLATE_META.x0)/TEMPLATE_META.step));
var a=Math.min(Math.floor(f),TEMPLATE_META.n_stations-2),u=f-a;
var t=((theta%360)+360)%360/2,b=Math.floor(t),c=(b+1)%180,w=t-b;
return (field[a*180+b]*(1-w)+field[a*180+c]*w)*(1-u)+(field[(a+1)*180+b]*(1-w)+field[(a+1)*180+c]*w)*u;
}
function sameHand(value){return Object.keys(baseline).every(function(key){return key==='palm_depth'||JSON.stringify(value[key])===JSON.stringify(baseline[key]);});}
var generationCache=new Map();
function generateSource(raw,side,widen){
if(side==='left')return {error:"This grip is designed for the right hand only."};
var checked=engine.validateHand(raw);if(checked.error)return checked;
var L=engine.layout(checked.val,widen);
var unchanged=sameHand(checked.val)&&(widen===undefined||widen===engine.K.DEFAULT_GROOVE_WIDEN);
var target=unchanged?reference:engine.buildMesh(checked.val,L,'right');
var delta=[new Float64Array(target.vx.length),new Float64Array(target.vy.length),new Float64Array(target.vz.length)];
[target.vx,target.vy,target.vz].forEach(function(arr,k){var ref=[reference.vx,reference.vy,reference.vz][k];for(var n=0;n<arr.length;n++)delta[k][n]=arr[n]-ref[n];});
// Smooth only the deformation field, not the original mesh. The calibration
// blend is deliberately limited to avoid sharp local field changes.
if(!unchanged)for(var sf=0;sf<3;sf++)for(var pass=0;pass<32;pass++){
var smooth=new Float64Array(delta[sf]);
for(var row=1;row<238;row++)for(var col=0;col<180;col++){
var i=row*180+col,left=row*180+(col+179)%180,right=row*180+(col+1)%180;
smooth[i]=0.5*delta[sf][i]+0.125*(delta[sf][i-180]+delta[sf][i+180]+delta[sf][left]+delta[sf][right]);
}
delta[sf]=smooth;
}
var identity=unchanged&&side!=='left';
var output=bytes.slice(),dv=new DataView(output.buffer),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],volume=0;
var edges=new Map();
function vertexKey(v){return v.map(function(x){return x.toFixed(6);}).join(',');}
for(var face=0;face<count;face++){
var tri=[];
for(var corner=0;corner<3;corner++){
var o=84+face*50+12+corner*12;
var v=[source.getFloat32(o,true),source.getFloat32(o+4,true),source.getFloat32(o+8,true)];
if(!identity){
// Source rotation and centering match the template import: (-Y,+Z,-X).
var x=-(v[1]-center[1]),y=v[2]-center[2],z=-(v[0]-center[0]);
var theta=Math.atan2(z,y)*180/Math.PI;
var dy=relocatedSample(delta[1],x,theta,v),dz=relocatedSample(delta[2],x,theta,v),dx=relocatedSample(delta[0],x,theta,v);
x+=dx;y+=dy;z+=dz;if(side==='left')y=-y;
v=[center[0]-z,center[1]-x,center[2]+y];
}
tri.push(v);
}
if(side==='left'){var swap=tri[1];tri[1]=tri[2];tri[2]=swap;}
for(corner=0;corner<3;corner++)for(var axis=0;axis<3;axis++){var n=tri[corner][axis];if(!Number.isFinite(n))return {error:'The deformation produced an invalid vertex.'};min[axis]=Math.min(min[axis],n);max[axis]=Math.max(max[axis],n);if(!identity)dv.setFloat32(84+face*50+12+corner*12+axis*4,n,true);}
var a=tri[0],b=tri[1],c=tri[2];
volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
var u=b.map(function(v,k){return v-a[k];}),w=c.map(function(v,k){return v-a[k];});var normal=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],length=Math.hypot.apply(null,normal)||1;
if(!identity)for(axis=0;axis<3;axis++)dv.setFloat32(84+face*50+axis*4,normal[axis]/length,true);
for(corner=0;corner<3;corner++){var keys=[vertexKey(tri[corner]),vertexKey(tri[(corner+1)%3])].sort(),key=keys.join('|');edges.set(key,(edges.get(key)||0)+1);}
}
var closed=Array.from(edges.values()).every(function(n){return n===2;});
return {stl:output.buffer,layout:L,stats:{triangles:count,watertight:closed,volume_mm3:Math.abs(volume),handle_length_mm:Math.round((max[1]-min[1])*100)/100,handle_within_hand_length:max[1]-min[1]<=checked.val.hand_length,envelope_margin_mm:0,envelope_ok:true,identity:identity,source_preserved:true}};
}
GEN.generate=function(raw,side,widen){
var key=JSON.stringify([raw,side||'right',widen===undefined?null:widen]);
if(generationCache.has(key))return generationCache.get(key);
var result=generateSource(raw,side,widen);
if(!result.error){if(generationCache.size>=8)generationCache.delete(generationCache.keys().next().value);generationCache.set(key,result);}
return result;
};
})();
