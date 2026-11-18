import {Client,type Room} from 'colyseus.js';
import {PhysicsWorld} from '../physics/PhysicsWorld';
import type {Actor,Input,Snapshot,Team} from '../shared/types';
export class NetworkClient {
 client:Client;room?:Room;physics=new PhysicsWorld();predicted?:Actor;pending:Input[]=[];snapshot?:Snapshot;ping=0;status='CONECTANDO';closed=false;onStatus:()=>void=()=>{};onPurchase:(ok:boolean)=>void=()=>{};lastRound=0;
 constructor(url:string){this.client=new Client(url)}
 async connect(code:string,name:string,team:Team){const room=code?await this.client.joinById(code,{name,team}):await this.client.create('spectra',{name,team});this.bind(room);return room}
 bind(room:Room){this.room=room;this.status='CONECTADO';this.onStatus();room.onMessage('snapshot',(s:Snapshot)=>this.receive(s));room.onMessage('pong',(t:number)=>{this.ping=Math.round(performance.now()-t)});room.onMessage('purchase',(ok:boolean)=>this.onPurchase(ok));room.onLeave(async(code)=>{if(this.closed||code===1000)return;this.status='RECONECTANDO';this.onStatus();try{const fresh=await this.client.reconnect(room.reconnectionToken);this.bind(fresh)}catch{this.status='DESCONECTADO';this.onStatus()}})}
 receive(s:Snapshot){this.snapshot=s;const a=s.actors.find(a=>a.id===this.room?.sessionId);if(!a)return;
 this.pending=this.pending.filter(i=>i.seq>a.ack);this.predicted=structuredClone(a);
 if(!this.physics.bodies.has(a.id))this.physics.add(this.predicted);else this.physics.teleport(this.predicted);
 if(s.round!==this.lastRound){this.pending=[];this.lastRound=s.round}
 for(const i of this.pending){this.physics.move(this.predicted,i,1/60,s.phase!=='ROUND_ACTIVE');this.physics.step()}
 }
 send(input:Input){if(!this.room||this.status!=='CONECTADO')return;this.room.send('input',input);this.pending.push(input);if(this.pending.length>120)this.pending.shift();if(this.predicted){this.physics.move(this.predicted,input,1/60,this.snapshot?.phase!=='ROUND_ACTIVE');this.physics.step()}if(input.seq%60===0)this.room.send('ping',performance.now())}
 dispose(){this.closed=true;void this.room?.leave();this.physics.dispose()}
}
