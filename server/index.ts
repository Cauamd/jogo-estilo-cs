import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import type {Room as RoomType, Client} from '@colyseus/core';
const require = createRequire(import.meta.url);
const {Server, Room} = require('@colyseus/core') as typeof import('@colyseus/core');
const {WebSocketTransport} = require('@colyseus/ws-transport') as typeof import('@colyseus/ws-transport');
import {Simulation} from '../src/core/Simulation';
import {initPhysics} from '../src/physics/PhysicsWorld';
import {emptyInput,type Input,type Team} from '../src/shared/types';
import {WEAPONS} from '../src/shared/weapons';
export class SpectraRoom extends Room{
 maxClients=10;sim!:Simulation;queues=new Map<string,Input[]>();lastSeen=new Map<string,number>();lastSeq=new Map<string,number>();acc=0;
 async onCreate(){await initPhysics();this.sim=new Simulation('online');this.sim.actors[0].bot=true;
 this.onMessage('input',(client,data)=>{const input=sanitize(data);if(!input||input.seq<=(this.lastSeq.get(client.sessionId)??-1))return;const q=this.queues.get(client.sessionId);if(!q||q.length>=120)return;this.lastSeq.set(client.sessionId,input.seq);q.push(input);this.lastSeen.set(client.sessionId,Date.now())});
 this.onMessage('buy',(client,item)=>{if(typeof item==='string'&&(item==='armor'||Object.hasOwn(WEAPONS,item)))client.send('purchase',this.sim.buy(client.sessionId,item as any))});
 this.onMessage('drop',client=>this.sim.drop(client.sessionId));
 this.onMessage('ping',(client,t)=>{if(typeof t==='number')client.send('pong',t)});
 this.setSimulationInterval(dt=>{this.acc+=Math.min(dt/1000,.1);while(this.acc>=1/60){for(const a of this.sim.actors){if(a.bot)continue;const q=this.queues.get(a.id),next=q?.shift();if(next)this.sim.inputs.set(a.id,next);else{const old=this.sim.inputs.get(a.id);if(old){old.reload=false;old.slot=0;old.jump=false;if(Date.now()-(this.lastSeen.get(a.id)??0)>250){old.x=old.z=0;old.fire=old.interact=false}}}}
 this.sim.update(1/60);this.acc-=1/60;if(this.sim.tick%3===0)this.broadcast('snapshot',this.sim.snapshot())}},1000/60);
 }
 onJoin(client:Client,options:{name?:unknown;team?:unknown}){let team:Team=options.team==='PHANTOM'?'PHANTOM':'VANGUARD';if(!this.sim.actors.some(a=>a.bot&&a.team===team))team=team==='VANGUARD'?'PHANTOM':'VANGUARD';const name=typeof options.name==='string'?options.name.replace(/[<>\x00-\x1f]/g,'').trim().slice(0,18)||'OPERADOR':'OPERADOR';this.sim.humanJoin(client.sessionId,name,team);this.queues.set(client.sessionId,[]);client.send('snapshot',this.sim.snapshot())}
 async onLeave(client:Client,consented:boolean){const a=this.sim.get(client.sessionId);this.sim.inputs.set(client.sessionId,emptyInput());this.queues.set(client.sessionId,[]);try{if(consented)throw new Error('left');await this.allowReconnection(client,20)}catch{this.sim.humanLeave(client.sessionId);this.queues.delete(client.sessionId);this.lastSeen.delete(client.sessionId);this.lastSeq.delete(client.sessionId)}if(a)this.sim.inputs.set(client.sessionId,emptyInput())}
 onDispose(){this.sim?.dispose()}
}
export function sanitize(v:unknown):Input|null{if(!v||typeof v!=='object')return null;const i=v as Record<string,unknown>;if(!['seq','x','z','yaw','pitch'].every(k=>typeof i[k]==='number'&&Number.isFinite(i[k])))return null;return {seq:Math.max(0,Math.floor(i.seq as number)),x:Math.max(-1,Math.min(1,i.x as number)),z:Math.max(-1,Math.min(1,i.z as number)),yaw:(i.yaw as number)%(Math.PI*2),pitch:Math.max(-1.48,Math.min(1.48,i.pitch as number)),jump:i.jump===true,crouch:i.crouch===true,walk:i.walk===true,fire:i.fire===true,reload:i.reload===true,interact:i.interact===true,slot:[1,2,3].includes(i.slot as number)?i.slot as number:0,inspect:false}}
export async function startServer(port=2567){const http=createServer((req,res)=>{if(req.url==='/health'){res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({name:'SPECTRA',status:'ready'}))}});const server=new Server({transport:new WebSocketTransport({server:http}),greet:false});server.define('spectra',SpectraRoom);await server.listen(port,'0.0.0.0');return server}
if(process.argv[1]?.replace(/\\/g,'/').endsWith('/server/index.ts')){startServer(Number(process.env.PORT)||2567).then(()=>console.log('SPECTRA authoritative server · ws://localhost:2567')).catch(e=>{console.error(e);process.exitCode=1})}
