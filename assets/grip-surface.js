/* Cross-section/ray intersection on the displayed triangle mesh. */
window.createGripSurface=function(mesh,center){
const sections=new Map();
return function(y,angle,clearance=1){
const key=y.toFixed(3);let segments=sections.get(key);
if(!segments){segments=[];for(const tri of mesh){const hits=[];for(let i=0;i<3;i++){const a=tri[i],b=tri[(i+1)%3];if((a[1]<=y&&y<b[1])||(b[1]<=y&&y<a[1])){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0])-center[0],a[2]+t*(b[2]-a[2])-center[2]]);}}if(hits.length===2)segments.push(hits);}sections.set(key,segments);}
const dx=Math.sin(angle),dz=Math.cos(angle);let radius=-Infinity;
for(const [a,b] of segments){const sx=b[0]-a[0],sz=b[1]-a[1],den=dx*sz-dz*sx;if(Math.abs(den)<1e-10)continue;const r=(a[0]*sz-a[1]*sx)/den,t=(a[0]*dz-a[1]*dx)/den;if(r>=0&&t>=0&&t<=1)radius=Math.max(radius,r);}
if(!Number.isFinite(radius))return null;return [center[0]+(radius+clearance)*dx,y,center[2]+(radius+clearance)*dz];
};
};
