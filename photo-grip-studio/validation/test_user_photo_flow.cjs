/* Control integration with a small DOM harness. This does not test native UI,
 * real image decoding, clipboard permissions, or GPU shader execution. */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ids={},all=[],frames=[],timers=[],downloads=[],windowEvents={};let copied=false,scrolled=null;
class Element{
 constructor(tag,attrs={}){this.tagName=tag;this.attrs=attrs;this.children=[];this.style={};this.listeners={};this.dataset={};this.value=attrs.value||'';this.checked='checked'in attrs;this.className=attrs.class||'';this.clientWidth=800;this.clientHeight=480;this.naturalWidth=1000;this.naturalHeight=1000;this.options=[];this.selectedIndex=0;for(const k in attrs)if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attrs[k];if(attrs.id)ids[attrs.id]=this;all.push(this);this.classList={toggle:(key,on)=>{const list=new Set(this.className.split(' '));if(on)list.add(key);else list.delete(key);this.className=[...list].join(' ')},add:key=>{if(!this.className.split(' ').includes(key))this.className+=' '+key},remove:key=>{this.className=this.className.split(' ').filter(x=>x!==key).join(' ')},contains:key=>this.className.split(' ').includes(key)};}
 get value(){return this._value||'';}set value(v){this._value=String(v);}
 appendChild(child){this.children.push(child);if(typeof child!=='string')child.parentNode=this;if(typeof child!=='string'&&this.tagName==='select'&&child.tagName==='option'){this.options.push(child);if(!this.value||'selected'in child.attrs)this.value=child.value;}return child;}
 removeChild(child){this.children=this.children.filter(c=>c!==child);child.parentNode=null;}
 get textContent(){return this._text??this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}set textContent(v){this._text=String(v);}
 set innerHTML(v){this._html=v;this.children=[];}get innerHTML(){return this._html||'';}
 set src(v){this._src=v;if(this.onload)timers.push(()=>this.onload&&this.onload());}get src(){return this._src;}
 addEventListener(t,fn){(this.listeners[t]??=[]).push(fn);}async fire(t,extra={}){const e={target:this,pointerId:1,clientX:100,clientY:100,preventDefault(){},...extra};for(const fn of this.listeners[t]||[])await fn.call(this,e);}
 click(){if(this.tagName==='a'){downloads.push(this);return;}return this.fire('click');}select(){copied=true;}scrollIntoView(){scrolled=this.attrs.id;}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];}getBoundingClientRect(){return {left:0,top:0,width:800,height:480};}setPointerCapture(){}closest(){return null;}
 querySelectorAll(selector){const descendants=[];function walk(n){for(const c of n.children)if(typeof c!=='string'){descendants.push(c);walk(c);}}walk(this);return descendants.filter(n=>selector==='.dot'?n.className.split(' ').includes('dot'):selector==='td.hint'?n.tagName==='td'&&n.className==='hint':selector==='input'?n.tagName==='input':selector==='button'?n.tagName==='button':false);}
 getContext(){return new Proxy({},{get:()=>()=>{}});}
}
function build(n){if(typeof n==='string')return n;const el=new Element(n.tag,n.attrs);for(const c of n.children)el.appendChild(build(c));return el;}
const root=build(JSON.parse(require('child_process').execFileSync('python3',[__dirname+'/../tools/html_dom.py'],{encoding:'utf8'}))),body=all.find(n=>n.tagName==='body');
const doc={body,getElementById:id=>ids[id]||null,createElement:tag=>new Element(tag),querySelectorAll:s=>s==='#stepTabs button'?ids.stepTabs.querySelectorAll('button'):s==='#manualFields input'?ids.manualFields.querySelectorAll('input'):[],execCommand:()=>true};
const win={URL:{},devicePixelRatio:1,createGripRenderer:()=>({draw(){}}),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},addEventListener(t,fn){(windowEvents[t]??=[]).push(fn)},dispatchEvent(e){for(const fn of windowEvents[e.type]||[])fn(e)}};
let urlId=0;const urls=new Map();const URL={createObjectURL:b=>{let u='blob:test'+urlId++;urls.set(u,b);return u},revokeObjectURL:u=>urls.delete(u)};win.URL=URL;
const context=vm.createContext({document:doc,window:win,URL,Blob,CustomEvent:class{constructor(type,o={}){this.type=type;this.detail=o.detail}},setTimeout:fn=>{timers.push(fn)},confirm:()=>false,console});
for(const name of ['template','generator','source-model','calibration','deform-source','grip-surface','hand-overlay','validation','app'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),context,{filename:name+'.js'});
async function click(id){assert(ids[id],id);await ids[id].click();}

(async()=>{
await click('photoMode');
// Image decoding is mocked; use synthetic bytes so this coordinate-flow test
// does not depend on private photos or a particular machine's Downloads folder.
const photoBytes=Buffer.from('mock image; dimensions supplied by test');
async function usePhoto(step,name,w,h){await ids.stepTabs.querySelectorAll('button')[step].click();ids.photo.naturalWidth=w;ids.photo.naturalHeight=h;ids.file.files=[new Blob([photoBytes],{type:'image/jpeg'})];await ids.file.fire('change');while(timers.length)timers.shift()();assert(ids.photoStatus.textContent.includes('Photo loaded'));}
async function tap(x,y,w,h){const z=1.12280701754,s=Math.min(800/w,480/h),ox=(800-w*s)/2,oy=(480-h*s)/2;const evt={clientX:ox+x*z*s,clientY:oy+y*z*s};await ids.viewport.fire('pointerdown',evt);await ids.viewport.fire('pointerup',evt);}
await usePhoto(0,'WhatsApp Image 2026-10-30 at 12.26.57.jpeg',1536,2048);
await tap(424,470,1536,2048);await tap(430,824,1536,2048);await click('modeMeas');
for(const point of [[710,1345],[836,930],[835,667],[735,930],[720,612],[650,940],[661,653],[570,970],[565,744],[860,1090],[980,909]])await tap(...point,1536,2048);
await click('genBtn');assert.equal(ids.genStatus.style.display,'block');assert(ids.genStatus.textContent.includes('grip diameter'));console.log('After palm-up:',ids.jsonOut.value);
await usePhoto(1,'WhatsApp Image 2026-10-30 at 12.26.56 (1).jpeg',2048,1536);
await tap(1176,374,2048,1536);await tap(1176,681,2048,1536);await click('modeMeas');
for(const point of [[850,635],[850,900],[750,490],[785,520],[1000,570],[1000,625],[1010,680],[1010,740],[1000,780],[1000,835],[910,900],[895,945]])await tap(...point,2048,1536);
assert.equal(ids.genStatus.style.display,'none','outdated missing-grip error should clear once estimate is available');assert(ids.photoProgress.textContent.includes('Estimated grip diameter: 52 mm'));console.log('After palm-down:',ids.jsonOut.value);
await usePhoto(2,'WhatsApp Image 2026-10-30 at 12.26.56.jpeg',1536,2048);
await tap(375,752,1536,2048);await tap(645,752,1536,2048);await click('modeMeas');await tap(630,850,1536,2048);await tap(675,850,1536,2048);
console.log('After side view:',ids.jsonOut.value);await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');console.log('Generate status:',ids.genStatus.textContent,ids.genStatus.innerHTML,'download:',ids.dlBtn.style.display);console.log('PASS: simulated three-photo flow, landmark coordinates, error clears when estimate available, STL generated');
})().catch(e=>{console.error(e);process.exitCode=1});
