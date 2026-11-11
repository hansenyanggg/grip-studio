const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const frames=[];
const elements={},events={},drawing=new Proxy({},{get:()=>()=>{}});
function element(id){return elements[id]??={checked:true,clientWidth:800,clientHeight:420,options:[],selectedIndex:0,textContent:'',value:'',addEventListener(type,fn){this[type]=fn},appendChild(option){this.options.push(option);if(!this.value)this.value=option.value},setAttribute(name,value){if(name==='aria-pressed')this.ariaPressed=value},setPointerCapture(){},getContext(){return drawing}};}
const context=vm.createContext({document:{getElementById:element,createElement:()=>({})},window:{createGripRenderer:()=>({draw(){}}),devicePixelRatio:1,requestAnimationFrame(fn){frames.push(fn);return frames.length},addEventListener(type,fn){events[type]=fn}},setTimeout:fn=>fn()});
for(const file of ['template','generator','source-model','calibration','deform-source','grip-surface','hand-overlay','validation'])vm.runInContext(fs.readFileSync('assets/'+file+'.js','utf8'),context);
const baseline=JSON.parse(JSON.stringify(context.GRIP_BASELINE));events['grip-generated']({detail:context.GEN.generate(baseline,'right')});assert(element('probeStatus').textContent.includes('0.0000 mm'));
events['grip-invalidated']();assert.equal(element('previewStale').hidden,false);
const changed={...baseline,grip_diameter_inside:65};events['grip-generated']({detail:context.GEN.generate(changed,'right')});assert(!element('probeStatus').textContent.includes('Identical geometry'));assert.equal(element('previewStale').hidden,true);
events['grip-generated']({detail:context.GEN.generate(baseline,'right')});assert(element('probeStatus').textContent.includes('0.0000 mm'));
assert.equal(frames.length,1);frames.shift()();element('validationCanvas').pointerdown({clientX:0,clientY:0,pointerId:1});for(let n=0;n<100;n++)element('validationCanvas').pointermove({clientX:n,clientY:n});assert.equal(frames.length,1);frames.shift()();element('validationCanvas').pointerup();assert.equal(frames.length,1);frames.shift()();console.log('PASS: 100 pointer events coalesced into one animation frame');
console.log('PASS: baseline overlay initialization, changed measurement display, identity reset');
