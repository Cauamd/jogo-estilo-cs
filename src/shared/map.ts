export interface Obstacle {x:number;y:number;z:number;w:number;h:number;d:number;kind:'wall'|'crate'|'container'|'concrete'|'step'|'tank';color?:number}
export const MAP={width:64,depth:76,sites:{A:{x:-22,z:-20},B:{x:22,z:-20}},spawn:{VANGUARD:{x:0,z:30},PHANTOM:{x:0,z:-30}}};
export const obstacles:Obstacle[]=[];
const add=(x:number,z:number,w:number,d:number,h:number,kind:Obstacle['kind']='wall',y=h/2,color?:number)=>obstacles.push({x,y,z,w,h,d,kind,color});
add(-32,0,1,76,7);add(32,0,1,76,7);add(0,-38,64,1,7);add(0,38,64,1,7);
// Three lanes, with cross connections at both spawns and the central yard.
for(const x of [-11,11]){add(x,-20,8,15,7);add(x,20,8,15,6.2)}
// Walk-through west warehouse, side walls and a raised rear platform.
add(-28,0,.6,20,5.6);add(-16,0,.6,20,5.6);
add(-22,9,12,.6,5.6); // south opening is split below
obstacles.pop();add(-26,9,4,.6,5.6);add(-18,9,4,.6,5.6);
add(-26,-9,4,.6,5.6);add(-18,-9,4,.6,5.6);
add(-25,-5,4,4,1.2,'concrete');
for(let i=0;i<5;i++)add(-25,-1-i*.42,3,.42,.24*(i+1),'step');
// East freight yard and central compressor.
add(22,3,4,10,2.8,'container',1.4,0x305e67);
add(27,-5,4,9,2.8,'container',1.4,0xa65632);
add(0,0,5,7,2.5,'concrete');
add(0,0,3.6,4,2.1,'tank',3.55);
add(-4,13,3,2,1.5,'crate');add(4,-12,3,2,1.5,'crate');
add(-22,18,3,3,1.6,'crate');add(-19,-20,2.5,2.5,1.7,'crate');
add(23,-19,3,3,1.3,'concrete');add(21,19,3,3,1.6,'crate');
add(-4,-29,2,3,1.3,'crate');add(6,28,3,2,1.4,'crate');
export function blocked(x:number,z:number,r=.5){return obstacles.some(o=>o.y-o.h/2<1.6&&o.h>.35&&Math.abs(x-o.x)<o.w/2+r&&Math.abs(z-o.z)<o.d/2+r)}
export function rayBox(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number,b:{x:number;y:number;z:number;w:number;h:number;d:number}):number{
 let lo=0,hi=Infinity;
 for(const [o,d,c,s] of [[ox,dx,b.x,b.w],[oy,dy,b.y,b.h],[oz,dz,b.z,b.d]]){if(Math.abs(d)<1e-8){if(o<c-s/2||o>c+s/2)return Infinity}else{let a=(c-s/2-o)/d,b2=(c+s/2-o)/d;if(a>b2)[a,b2]=[b2,a];lo=Math.max(lo,a);hi=Math.min(hi,b2);if(lo>hi)return Infinity}}
 return lo;
}
export function wallDistance(ox:number,oy:number,oz:number,dx:number,dy:number,dz:number){let d=Infinity;for(const o of obstacles)d=Math.min(d,rayBox(ox,oy,oz,dx,dy,dz,o));if(dy<0)d=Math.min(d,-oy/dy);return d}
