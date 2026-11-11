const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict');
const ctx=vm.createContext({});for(const name of ['template','generator','source-model','calibration','deform-source'])vm.runInContext(fs.readFileSync('assets/'+name+'.js','utf8'),ctx);
const baseline=JSON.parse(JSON.stringify(ctx.GRIP_BASELINE)),original=fs.readFileSync('assets/base_handle.stl');
const identity=ctx.GEN.generate(baseline,'right');assert(Buffer.from(identity.stl).equals(original));assert.equal(identity.stats.identity,true);
for(const [name,hand,side] of [['larger grip',{...baseline,grip_diameter_inside:60},'right'],['missing thumb',{...baseline,thumb_length:null,thumb_breadth:null},'right'],['missing middle',{...baseline,finger_lengths:[75,null,73,62]},'right']]){const r=ctx.GEN.generate(hand,side);assert.equal(r.error,undefined);assert.equal(r.stl.byteLength,original.length);assert(!Buffer.from(r.stl).equals(original));assert.equal(r.stats.triangles,13780);console.log('PASS:',name);}
const near=ctx.GEN.generate({...baseline,grip_diameter_inside:55.0001},'right');let max=0;const v=new DataView(near.stl);for(let i=0;i<13780;i++)for(let k=0;k<9;k++)max=Math.max(max,Math.abs(v.getFloat32(84+i*50+12+k*4,true)-original.readFloatLE(84+i*50+12+k*4)));assert(max<.001);console.log('PASS: exact baseline bytes, continuous near-baseline change ('+max+' mm), original triangle count retained');

assert.match(ctx.GEN.generate(baseline,'left').error,/right hand only/);console.log('PASS: left-hand generation rejected');
