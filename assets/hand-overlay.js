/* Idealized skeletal grip pose in STL millimetres. This is not an anatomical
 * solver: joint proportions and wrap pose are assumptions, with no collision
 * or force analysis. Bone lengths sum to the supplied digit lengths. */
window.buildGripSkeleton=function(hand,center,side,calibration,surface){
const fingers=[],bones=[],joints=[],palette=['#337bf2','#bf4dd1','#ce920e','#293744','#f25a40'];
const widths=hand.finger_widths,span=widths.reduce((a,b)=>a+b,0);
let edge=center[1]+span/2;
function point(radius,angle,y){return [center[0]+radius*Math.sin(angle),y,center[2]+radius*Math.cos(angle)*(side==='left'?-1:1)];}
function digit(name,index,length,thickness,y,start,fractions){
const radius=hand.grip_diameter_inside/2+thickness*.5;
const anchor=calibration&&calibration[index];if(anchor){y=center[1]+(anchor.point[1]-center[1])*span/83;start=Math.atan2(anchor.point[0]-center[0],anchor.point[2]-center[2]);}
// Thumb lies along the handle toward the pinky end, with a gentle diagonal wrap.
// Source model long axis is Y; lower Y is toward the pinky.
if(index===4){
function thumbPoint(travel){const angle=start+travel*.2/radius,axial=y-travel;
return (surface&&surface(axial,side==='left'?Math.PI-angle:angle,thickness*.5))||point(radius,angle,axial);}
const points=[thumbPoint(0)];let travel=0;
for(const fraction of fractions){const wanted=length*fraction,previous=points[points.length-1];let low=travel,high=travel+wanted;
for(let step=0;step<32;step++){const mid=(low+high)/2,p=thumbPoint(mid),distance=Math.hypot(...p.map((v,k)=>v-previous[k]));if(distance<wanted)low=mid;else high=mid;}
travel=(low+high)/2;let next=thumbPoint(travel);
// Preserve bone length if a cross-section is unavailable or discontinuous at an end.
const actual=Math.hypot(...next.map((v,k)=>v-previous[k]));if(Math.abs(actual-wanted)>1e-5){const ratio=wanted/(actual||1);next=previous.map((v,k)=>v+(next[k]-v)*ratio);}
bones.push({a:previous,b:next,color:palette[index],digit:name,length:wanted,orientation:'toward-pinky'});points.push(next);}
for(const p of points)joints.push({point:p,color:palette[index]});return points;
}
// Fingers curl toward the marked underside; the opposing thumb curls the other way.
const direction=index===4?1:-1;
// Tilt toward the pinky end as each finger wraps: a gentle -5-degree helical pose.
const fingerTilt=-5*Math.PI/180;
function around(angle){const physicalAngle=side==='left'?Math.PI-angle:angle;
const axial=y+Math.abs(angle-start)*radius*Math.tan(fingerTilt);
return (surface&&surface(axial,physicalAngle,thickness*.5))||point(radius,angle,axial);}
const points=[around(start)];let angle=start;
for(const fraction of fractions){
const boneLength=length*fraction,previous=points[points.length-1];let next=null,advance=0;
// Find the first point around the cross-section one bone length away.
// This preserves measured chord lengths, rather than treating bone length as arc length.
for(let step=1;step<=96;step++){
 const candidateAdvance=step*Math.PI/96,candidate=around(angle+direction*candidateAdvance);
 const distance=Math.hypot(...candidate.map((v,k)=>v-previous[k]));
 if(distance>=boneLength){let low=advance,high=candidateAdvance;
 for(let n=0;n<28;n++){const mid=(low+high)/2,p=around(angle+direction*mid);if(Math.hypot(...p.map((v,k)=>v-previous[k]))<boneLength)low=mid;else high=mid;}
 advance=(low+high)/2;next=around(angle+direction*advance);break;
 }
 advance=candidateAdvance;
}
if(next)angle+=direction*advance;
else {const d=[direction*Math.cos(angle)*Math.cos(fingerTilt),Math.sin(fingerTilt),-direction*Math.sin(angle)*(side==='left'?-1:1)*Math.cos(fingerTilt)];next=previous.map((v,k)=>v+d[k]*boneLength);}
// Cross-section changes can introduce a discontinuity near an end or a slot.
// Keep the skeletal segment length exact even when the surface solver crosses one.
const segmentLength=Math.hypot(...next.map((v,k)=>v-previous[k]));
if(Math.abs(segmentLength-boneLength)>1e-6&&segmentLength>0)next=previous.map((v,k)=>v+(next[k]-v)*boneLength/segmentLength);
bones.push({a:previous,b:next,color:palette[index],digit:name,length:boneLength,curlDirection:direction});points.push(next);}
for(const p of points)joints.push({point:p,color:palette[index]});return points;
}
for(let i=0;i<4;i++){const y=edge-widths[i]/2;edge-=widths[i];if(hand.finger_lengths[i]>0)fingers.push({index:i,points:digit(['Index','Middle','Ring','Pinky'][i],i,hand.finger_lengths[i],hand.finger_thicknesses[i],y,-.45,[.45,.32,.23])});}
if(hand.thumb_length>0){const y=center[1]+span*.36;const points=digit('Thumb',4,hand.thumb_length,hand.thumb_thickness||hand.thumb_breadth*.88,y,1.8,[.55,.45]);}
return {bones,joints,boundsPoints:bones.flatMap(b=>[b.a,b.b])};
};
window.drawGripSkeleton=function(ctx,skeleton,project){
for(const bone of skeleton.bones){const a=project(bone.a),b=project(bone.b);ctx.lineCap='round';for(const [color,width] of [['#263a39',7],['#fff4dc',4]]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.stroke();}}
for(const joint of skeleton.joints){const p=project(joint.point);ctx.fillStyle=joint.color;ctx.strokeStyle='#233c36';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(p[0],p[1],4,0,Math.PI*2);ctx.fill();ctx.stroke();}
};
