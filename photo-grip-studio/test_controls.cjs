/* Control integration with a small DOM harness. This does not test native UI,
 * real image decoding, clipboard permissions, or GPU shader execution. */
const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ids={},all=[],frames=[],timers=[],downloads=[],windowEvents={};let copied=false,scrolled=null;
class Element{
 constructor(tag,attrs={}){this.tagName=tag;this.attrs=attrs;this.children=[];this.style={};this.listeners={};this.dataset={};this.value=attrs.value||'';this.checked='checked'in attrs;this.className=attrs.class||'';this.clientWidth=800;this.clientHeight=480;this.naturalWidth=1000;this.naturalHeight=1000;this.options=[];this.selectedIndex=0;for(const k in attrs)if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=attrs[k];if(attrs.id)ids[attrs.id]=this;all.push(this);this.classList={toggle:(key,on)=>{const list=new Set(this.className.split(' '));if(on)list.add(key);else list.delete(key);this.className=[...list].join(' ')},contains:key=>this.className.split(' ').includes(key)};}
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
const root=build(JSON.parse(require('child_process').execFileSync('python3',[__dirname+'/tools/html_dom.py'],{encoding:'utf8'}))),body=all.find(n=>n.tagName==='body');
const doc={body,getElementById:id=>ids[id]||null,createElement:tag=>new Element(tag),querySelectorAll:s=>s==='#stepTabs button'?ids.stepTabs.querySelectorAll('button'):s==='#manualFields input'?ids.manualFields.querySelectorAll('input'):[],execCommand:()=>true};
const win={URL:{},devicePixelRatio:1,createGripRenderer:()=>({draw(){}}),requestAnimationFrame:fn=>{frames.push(fn);return frames.length},addEventListener(t,fn){(windowEvents[t]??=[]).push(fn)},dispatchEvent(e){for(const fn of windowEvents[e.type]||[])fn(e)}};
let urlId=0;const urls=new Map();const URL={createObjectURL:b=>{let u='blob:test'+urlId++;urls.set(u,b);return u},revokeObjectURL:u=>urls.delete(u)};win.URL=URL;
const context=vm.createContext({document:doc,window:win,URL,Blob,CustomEvent:class{constructor(type,o={}){this.type=type;this.detail=o.detail}},setTimeout:fn=>{timers.push(fn)},confirm:()=>false,console});
for(const name of ['template','generator','source-model','calibration','deform-source','grip-surface','hand-overlay','validation','app'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),context,{filename:name+'.js'});
async function click(id){assert(ids[id],id);await ids[id].click();}
(async()=>{
for(const n of all.filter(n=>n.tagName==='button'&&n.attrs.id))assert(n.listeners.click?.length,'Unwired button '+n.attrs.id);
assert(!ids.exampleBtn);assert.equal(body.dataset.inputMode,'manual');assert.equal(ids.dlBtn.style.display,'inline-block');
await click('loadBaseline');assert.equal(ids.dlBtn.style.display,'none');await click('applyHand');assert.equal(ids.manualError.textContent,'');await click('dlBtn');assert.equal(downloads.length,1);assert(Buffer.from(await urls.get(downloads[0].href).arrayBuffer()).equals(fs.readFileSync('assets/base_handle.stl')));
await click('exampleResultsBtn');assert.equal(scrolled,'secGen');await click('copyBtn');assert(copied);
const field=doc.querySelectorAll('#manualFields input').find(n=>n.dataset.field==='grip_diameter_inside');field.value='60';await ids.manualFields.fire('input');assert.equal(ids.dlBtn.style.display,'none');await click('applyHand');assert.equal(ids.manualError.textContent,'');
ids.manualHand.value='{';await ids.manualHand.fire('input');await click('applyHand');assert(ids.manualError.textContent);assert.equal(ids.dlBtn.style.display,'none');await click('loadBaseline');await click('applyHand');
assert.equal(ids.previewStale.hidden,true);assert.equal(ids.meshNotice.hidden,false);assert(ids.meshNotice.textContent.includes('Mesh repair required'));assert(!ids.sideSel);await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');
for(const name of ['resetValidationView'])await click(name);
await click('photoMode');assert.equal(body.dataset.inputMode,'photo');for(const button of ids.stepTabs.querySelectorAll('button'))await button.click();assert(ids.stepTitle.textContent.includes('Side view'));await ids.stepTabs.querySelectorAll('button')[0].click();
assert(!('hidden' in ids.secFingers.attrs));assert.equal(ids.secResults.hidden,false);await click('aiBtn');assert(ids.aiStatus.innerHTML.includes('photo first'));await ids.stepTabs.querySelectorAll('button')[1].click();assert(!ids.aiStatus.innerHTML.includes('photo first'));await ids.stepTabs.querySelectorAll('button')[0].click();await click('modeCal');await click('modeMeas');await click('skipBtn');await click('undoBtn');
ids.file.files=[new Blob(['test'],{type:'image/png'})];await ids.file.fire('change');while(timers.length)timers.shift()();assert(ids.photoStatus.textContent.includes('Photo loaded'));
await click('zoomIn');const zoom=ids.zoomLabel.textContent;await click('zoomOut');assert.notEqual(ids.zoomLabel.textContent,zoom);await click('fitBtn');assert.equal(ids.zoomLabel.textContent,'100%');
await click('manualMode');assert.equal(body.dataset.inputMode,'manual');assert(ids.exampleStatus.textContent.includes('Manual measurement mode'));assert.equal(ids.secResults.hidden,true);assert.equal(ids.previewStale.hidden,false);
// Switching from an incomplete photo back to manual must never reuse photo results.
await click('loadBaseline');await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');
await click('photoMode');await click('genBtn');assert.equal(ids.dlBtn.style.display,'none');assert(ids.genStatus.textContent.includes('photo profile'));assert(ids.genStatus.textContent.includes('Load baseline measurements'));assert(ids.genStatus.textContent.includes('Still needed:'));
await click('manualMode');await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');
const changed=doc.querySelectorAll('#manualFields input').find(n=>n.dataset.field==='grip_diameter_inside');changed.value='60';await ids.manualFields.fire('input');await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');
changed.value='';await ids.manualFields.fire('input');await click('genBtn');assert.equal(ids.dlBtn.style.display,'none');assert(ids.genStatus.textContent.includes('grip_diameter_inside'));ids.gripOverride.value='55';await click('genBtn');assert.equal(ids.dlBtn.style.display,'inline-block');
console.log('PASS: mode switching, direct manual generation, missing grip error and override;');console.log('PASS: every static button wired; baseline/apply/download exact bytes; manual edits/invalid JSON; right-hand-only generation; copy/export jump; viewer controls; photo tabs/upload callback; calibration/measurement mode; skip/undo; zoom/fit; AI no-photo message.');
})().catch(e=>{console.error(e);process.exitCode=1});
