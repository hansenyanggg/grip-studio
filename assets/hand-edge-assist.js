/* Locate approximate visible skin boundaries along a line through a landmark.
 * This is a color heuristic, not a medical measurement or segmentation model.
 * It can fail with shadows, similar backgrounds, occlusion, or unusual lighting. */
window.handEdgeAssist=(function(){
'use strict';
function unit(x,y){var d=Math.hypot(x,y);return d>1e-6?{x:x/d,y:y/d}:null;}
function pair(image,center,direction){
var dir=unit(direction.x,direction.y),w=image.width,h=image.height,pixels=image.data;
if(!dir||center.x<0||center.y<0||center.x>=w||center.y>=h)return null;
function rgb(x,y){x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return null;var i=4*(y*w+x);return [pixels[i],pixels[i+1],pixels[i+2]];}
var seeds=[];for(var yy=-2;yy<=2;yy++)for(var xx=-2;xx<=2;xx++){var v=rgb(center.x+xx,center.y+yy);if(v)seeds.push(v);}
if(seeds.length<9)return null;
var ref=[0,1,2].map(function(k){return seeds.map(function(v){return v[k];}).sort(function(a,b){return a-b;})[Math.floor(seeds.length/2)];});
// Near-neutral/light seeds often mean a landmark landed on the background.
if(ref[0]<25||ref[0]-ref[2]<10||ref[0]-ref[1]<2)return null;
function similar(v){if(!v)return false;var distance=Math.hypot(v[0]-ref[0],v[1]-ref[1],v[2]-ref[2]);return distance<92&&Math.abs((v[0]-v[2])-(ref[0]-ref[2]))<55&&v[0]-v[2]>3;}
var limit=Math.floor(Math.min(w,h)*.18),step=Math.max(1,Math.floor(Math.min(w,h)/1600));
function edge(sign){var last=0,miss=0;for(var d=step;d<limit;d+=step){var v=rgb(center.x+sign*dir.x*d,center.y+sign*dir.y*d);if(similar(v)){last=d;miss=0;}else if(++miss>=3)break;}if(last<2||last>=limit-step*4)return null;return {x:center.x+sign*dir.x*last,y:center.y+sign*dir.y*last};}
var a=edge(-1),b=edge(1);return a&&b?[a,b]:null;
}
function across(image,a,b){var d=unit(b.x-a.x,b.y-a.y);if(!d)return null;return pair(image,{x:a.x*.65+b.x*.35,y:a.y*.65+b.y*.35},{x:-d.y,y:d.x});}
return {unit:unit,pair:pair,across:across};
})();
