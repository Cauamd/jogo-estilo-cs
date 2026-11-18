import {blocked} from '../shared/map';
// Static occupancy graph. A* paths never cut diagonally through corners.
export class Navigation {
 readonly cell=1.5; readonly cols=41;readonly rows=49;readonly grid:Uint8Array;
 constructor(){this.grid=new Uint8Array(this.cols*this.rows);for(let z=0;z<this.rows;z++)for(let x=0;x<this.cols;x++)this.grid[z*this.cols+x]=blocked((x-20)*this.cell,(z-24)*this.cell,.52)?1:0}
 point(i:number){return {x:(i%this.cols-20)*this.cell,z:(Math.floor(i/this.cols)-24)*this.cell}}
 index(x:number,z:number){return Math.max(0,Math.min(48,Math.round(z/this.cell)+24))*this.cols+Math.max(0,Math.min(40,Math.round(x/this.cell)+20))}
 nearest(i:number){if(!this.grid[i])return i;const p=this.point(i);let best=-1,d=Infinity;for(let j=0;j<this.grid.length;j++){if(this.grid[j])continue;const q=this.point(j),s=(q.x-p.x)**2+(q.z-p.z)**2;if(s<d){d=s;best=j}}return best}
 path(ax:number,az:number,bx:number,bz:number){const start=this.nearest(this.index(ax,az)),end=this.nearest(this.index(bx,bz));if(start<0||end<0)return [];const open=new Set([start]),from=new Map<number,number>(),g=new Map([[start,0]]),f=new Map([[start,0]]);let loops=0;
 while(open.size&&loops++<2500){let u=-1,best=Infinity;for(const i of open){const v=f.get(i)??Infinity;if(v<best){best=v;u=i}}if(u===end){const result=[];let c=end;while(c!==start){result.push(this.point(c));c=from.get(c)!}return result.reverse()}open.delete(u);
 for(const offset of [-1,1,-this.cols,this.cols]){const v=u+offset;if(v<0||v>=this.grid.length||this.grid[v]||Math.abs(v%this.cols-u%this.cols)>1)continue;const n=(g.get(u)??Infinity)+1;if(n<(g.get(v)??Infinity)){from.set(v,u);g.set(v,n);const p=this.point(v),q=this.point(end);f.set(v,n+Math.abs(p.x-q.x)/this.cell+Math.abs(p.z-q.z)/this.cell);open.add(v)}}}return [];
 }
}
