/* Full-resolution GPU surface rendering; canvas labels remain a separate layer. */
window.createGripRenderer=function(canvas){
'use strict';
const gl=canvas.getContext('webgl',{alpha:true,antialias:true});
if(!gl)return null;
function shader(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
const program=gl.createProgram();
gl.attachShader(program,shader(gl.VERTEX_SHADER,`attribute vec3 position;attribute vec3 normal;attribute vec3 regionColor;varying mediump vec3 tint;uniform float offset;uniform float fit;uniform vec3 center;uniform vec4 rotation;uniform vec3 projection;varying mediump vec3 n;
vec3 rotate(vec3 p){float a=p.x*rotation.x+p.z*rotation.y;float b=-p.x*rotation.y+p.z*rotation.x;return vec3(a,p.y*rotation.z-b*rotation.w,p.y*rotation.w+b*rotation.z);}
void main(){vec3 p=rotate(position-center);gl_Position=vec4(p.x*projection.x*fit+offset,p.y*projection.y*fit,-p.z*projection.z,1.0);n=rotate(normal);tint=regionColor;}`));
gl.attachShader(program,shader(gl.FRAGMENT_SHADER,`precision mediump float;varying mediump vec3 n;varying mediump vec3 tint;uniform float regions;uniform vec4 color;uniform float surface;void main(){float light=.4+.6*abs(dot(normalize(n+vec3(.00001)),normalize(vec3(-.4,.6,1.))));gl_FragColor=vec4(mix(color.rgb,tint,regions*surface)*mix(1.,light,surface),color.a);}`));
gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
const pos=gl.getAttribLocation(program,'position'),normal=gl.getAttribLocation(program,'normal');
const tintLocation=gl.getAttribLocation(program,'regionColor');
const uniforms={};for(const key of ['center','rotation','projection','color','surface','regions','offset','fit'])uniforms[key]=gl.getUniformLocation(program,key);
const cache=new WeakMap();
function buffers(mesh){if(cache.has(mesh))return cache.get(mesh);const data=new Float32Array(mesh.length*18),edges=new Float32Array(mesh.length*36);let a=0,b=0;
for(const t of mesh){const u=t[1].map((x,k)=>x-t[0][k]),v=t[2].map((x,k)=>x-t[0][k]);const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],len=Math.hypot(...n)||1;for(let j=0;j<3;j++){for(let k=0;k<3;k++)data[a++]=t[j][k];for(let k=0;k<3;k++)data[a++]=n[k]/len;for(const vertex of [t[j],t[(j+1)%3]]){for(let k=0;k<3;k++)edges[b++]=vertex[k];for(let k=0;k<3;k++)edges[b++]=0;}}}
function upload(array){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,array,gl.STATIC_DRAW);return buffer;}
const colors=new Float32Array(mesh.length*9),palette=[[.2,.48,.95],[.75,.3,.82],[.92,.65,.15],[.16,.22,.27],[.95,.35,.25]];
let lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
for(const tri of mesh)for(const v of tri)for(let k=0;k<3;k++){lo[k]=Math.min(lo[k],v[k]);hi[k]=Math.max(hi[k],v[k]);}
// Regions are assigned from the original baseline, then retained through deformation.
const origin=baselineMesh||mesh;
const mid=baselineCenter||lo.map((v,k)=>(v+hi[k])/2);
for(let i=0;i<mesh.length;i++){const t=origin[i],x=-(t[0][1]+t[1][1]+t[2][1])/3+mid[1],y=(t[0][2]+t[1][2]+t[2][2])/3-mid[2],z=-(t[0][0]+t[1][0]+t[2][0])/3+mid[0];const r=(GEN.sourceRegionAt?GEN.sourceRegionAt(t[0].map((v,k)=>{const coord=(v+t[1][k]+t[2][k])/3;return handSide==='left'&&k===2?2*mid[2]-coord:coord;})):GEN.regionAt(x,Math.atan2(z,y)*180/Math.PI)),c=r<0?[.25,.68,.57]:palette[r];for(let j=0;j<3;j++)colors.set(c,i*9+j*3);}
// Sparse baseline edges avoid obscuring the filled output surface.
const sparse=[];for(let i=0;i<mesh.length;i+=12)for(let j=0;j<36;j++)sparse.push(edges[i*36+j]);
const result={surface:upload(data),edges:upload(new Float32Array(sparse)),colors:upload(colors),count:mesh.length*3,edgeCount:sparse.length/6};cache.set(mesh,result);return result;}
let lastCurrent=null,lastBuffers=null,baselineMesh=null,baselineCenter=null,handSide="right";
function release(entry){if(entry){gl.deleteBuffer(entry.surface);gl.deleteBuffer(entry.edges);gl.deleteBuffer(entry.colors);}}
// Optional view settings: zoom factor and a per-vertex tint array (9 floats per triangle).
let tintSource=null,tintBuffer=null;
return {draw(base,current,yaw,pitch,center,size,showBaseline,showRegions,separate,side,options){
const zoom=(options&&options.zoom)||1,tint=(options&&options.tint)||null;
if(tint!==tintSource){if(tintBuffer)gl.deleteBuffer(tintBuffer);tintBuffer=null;tintSource=tint;if(tint){tintBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,tintBuffer);gl.bufferData(gl.ARRAY_BUFFER,tint,gl.STATIC_DRAW);}}
if(baselineMesh!==base||handSide!==(side||'right')){
if(lastCurrent){release(lastBuffers);cache.delete(lastCurrent);}if(baselineMesh&&baselineMesh!==lastCurrent){release(cache.get(baselineMesh));cache.delete(baselineMesh);}
baselineMesh=base;baselineCenter=center.slice();handSide=side||'right';lastCurrent=null;lastBuffers=null;
}
const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(window.devicePixelRatio||1,2);if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(.94,.96,.95,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
const span=Math.max(...size),scale=Math.min(w,h)*.72/span*zoom;gl.uniform1f(uniforms.fit,separate?.55:1);gl.uniform1f(uniforms.offset,separate?.46:0);gl.uniform1f(uniforms.regions,(showRegions||tintBuffer)?1:0);gl.uniform3fv(uniforms.center,center);gl.uniform4f(uniforms.rotation,Math.cos(yaw),Math.sin(yaw),Math.cos(pitch),Math.sin(pitch));gl.uniform3f(uniforms.projection,scale*2/w,scale*2/h,1/(span*2));
// Keep only the current GPU buffers plus the fixed baseline.
if(current!==lastCurrent){if(lastCurrent&&lastCurrent!==base){release(lastBuffers);cache.delete(lastCurrent);}lastCurrent=current;lastBuffers=buffers(current);}
function bind(buffer){gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(pos);gl.vertexAttribPointer(pos,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(normal);gl.vertexAttribPointer(normal,3,gl.FLOAT,false,24,12);}
gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);bind(lastBuffers.surface);gl.bindBuffer(gl.ARRAY_BUFFER,tintBuffer||lastBuffers.colors);gl.enableVertexAttribArray(tintLocation);gl.vertexAttribPointer(tintLocation,3,gl.FLOAT,false,12,0);gl.uniform4f(uniforms.color,.25,.68,.57,1);gl.uniform1f(uniforms.surface,1);gl.drawArrays(gl.TRIANGLES,0,lastBuffers.count);
if(showBaseline){const original=buffers(base);gl.disable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);bind(original.edges);gl.disableVertexAttribArray(tintLocation);gl.vertexAttrib3f(tintLocation,0,0,0);gl.uniform1f(uniforms.offset,separate?-.46:0);const wire=(options&&options.wire)||[.95,.42,.06,.65];gl.uniform4f(uniforms.color,wire[0],wire[1],wire[2],wire[3]);gl.uniform1f(uniforms.surface,0);gl.drawArrays(gl.LINES,0,original.edgeCount);gl.disable(gl.BLEND);}
}};
};
