import {PhysicsWorld,eye} from '../physics/PhysicsWorld';
import {Navigation} from '../bots/Navigation';
import {MAP,rayBox,wallDistance} from '../shared/map';
import {WEAPONS,Weapon} from '../shared/weapons';
import {emptyInput,type Actor,type GameEvent,type Input,type Mode,type Snapshot,type Team,type WeaponId} from '../shared/types';
const names=['Kestrel','Nomad','Vega','Atlas','Echo','Cipher','Rook','Mantis','Ghost','Onyx','Sable','Talon','Valkyrie','Zephyr'];
type Brain={path:{x:number;z:number}[];repath:number;reaction:number;target:string;lane:number;stage:number;respawn:number;noise:number};
export class Simulation {
 physics=new PhysicsWorld();nav=new Navigation();actors:Actor[]=[];inputs=new Map<string,Input>();brains=new Map<string,Brain>();pickups:Snapshot['pickups']=[];pickupId=0;
 tick=0;phase:Snapshot['phase']='BUY_PHASE';time=12;round=1;score:Record<Team,number>={VANGUARD:0,PHANTOM:0};attacking:Team='VANGUARD';winner:Team|null=null;reason='';events:GameEvent[]=[];eventId=0;
 objective:Snapshot['objective']={planted:false,site:null,remaining:40,progress:0,actor:null};difficulty:'easy'|'normal'|'hard'='normal';
 targetScore=75;tdmDuration=600;
 constructor(public mode:Mode,team:Team='VANGUARD',public localId='local',options?:{targetScore?:number;duration?:number;teamSize?:number}){
  const teamSize=mode==='tdm'?Math.max(2,Math.min(7,options?.teamSize??7)):5;
  const total=teamSize*2;
  this.targetScore=options?.targetScore??75;
  this.tdmDuration=options?.duration??600;
  for(let i=0;i<total;i++)this.addActor(i===0?localId:`bot-${i}`,i===0?'OPERADOR':names[i%names.length],i<teamSize?team:other(team),i!==0);
  if(mode==='training'){
   this.phase='ROUND_ACTIVE';this.time=0;
   this.actors=this.actors.filter(a=>{if(a.team===team&&a.id!==localId){this.physics.remove(a.id);return false}return true});
   this.actors.forEach((a,i)=>{if(a.bot){a.position={x:[-22,0,22,-22,22][i-1],y:.05,z:[14,14,14,-18,-18][i-1]};a.yaw=Math.PI;this.physics.teleport(a)}});
  }else if(mode==='tdm'){
   this.phase='ROUND_ACTIVE';this.time=this.tdmDuration;
   const loadouts:WeaponId[]=['vx47','viper','vx47','s1','viper','vx47','vx47'];
   this.actors.forEach((a,i)=>{
    a.armor=100;a.credits=16000;
    if(a.bot){const w=loadouts[i%loadouts.length];a.inventory=[gun(w),gun('p9'),gun('edge')];a.weapon=w}
   });
  }
 }
 addActor(id:string,name:string,team:Team,bot:boolean){
  const index=this.actors.filter(a=>a.team===team).length;
  const z=team===this.attacking?30:-30;
  const spreadX=((index%5)-2)*2.3+(index>=5?(index===5?-3.4:3.4):0);
  const a:Actor={id,name,team,bot,position:{x:spreadX,y:.1,z:z+(index%2)*2*(z>0?1:-1)},velocity:{x:0,y:0,z:0},yaw:z>0?0:Math.PI,pitch:0,health:100,armor:0,alive:true,crouch:false,grounded:false,weapon:'vx47',inventory:[gun('vx47'),gun('p9'),gun('edge')],reload:0,cooldown:0,credits:this.mode==='training'||this.mode==='tdm'?16000:3500,kills:0,deaths:0,state:'IDLE',ack:0,objectiveProgress:0,slide:0,respawn:0};
  this.actors.push(a);this.physics.add(a);this.brains.set(id,{path:[],repath:0,reaction:0,target:'',lane:(index%3-1)*22,stage:0,respawn:0,noise:0});return a;
 }
 respawnActor(a:Actor){
  const mates=this.actors.filter(b=>b.team===a.team);
  const index=mates.indexOf(a);
  const baseZ=a.team===this.attacking?30:-30;
  const candidates=[
   {x:((index%5)-2)*2.4,z:baseZ+(index%2)*1.8*(baseZ>0?1:-1)},
   {x:-22+(index%3)*2,z:baseZ*.78},
   {x:22-(index%3)*2,z:baseZ*.78},
  ];
  let best=candidates[0],bestDist=-1;
  for(const c of candidates){
   let minEnemy=Infinity;
   for(const e of this.actors)if(e.alive&&e.team!==a.team)minEnemy=Math.min(minEnemy,Math.hypot(e.position.x-c.x,e.position.z-c.z));
   if(minEnemy>bestDist){bestDist=minEnemy;best=c}
  }
  a.position={x:best.x,y:.1,z:best.z};
  a.velocity={x:0,y:0,z:0};
  a.yaw=baseZ>0?0:Math.PI;
  a.pitch=0;
  a.health=100;
  a.armor=100;
  a.alive=true;
  a.crouch=false;
  a.slide=0;
  a.reload=0;
  a.cooldown=0;
  a.respawn=0;
  a.state='IDLE';
  if(!a.inventory.some(g=>WEAPONS[g.id].slot===1)){
   const w:WeaponId=a.bot?(['vx47','viper','s1'][this.tick%3] as WeaponId):'vx47';
   a.inventory=[gun(w),gun('p9'),gun('edge')];
   a.weapon=w;
  }else{
   a.inventory.forEach(g=>{g.ammo=WEAPONS[g.id].capacity;g.reserve=WEAPONS[g.id].reserve});
   const prim=a.inventory.find(g=>WEAPONS[g.id].slot===1);
   if(prim)a.weapon=prim.id;
  }
  this.physics.teleport(a);
  const b=this.brains.get(a.id);
  if(b){b.stage=0;b.path=[];b.repath=0;b.target='';b.respawn=0}
 }
 humanJoin(id:string,name:string,team:Team){const bot=this.actors.find(a=>a.bot&&a.team===team);if(!bot)throw new Error('Equipe cheia');const index=this.actors.indexOf(bot);this.physics.remove(bot.id);this.brains.delete(bot.id);this.actors.splice(index,1);const a=this.addActor(id,name,team,false);a.position={...bot.position};a.yaw=bot.yaw;this.physics.teleport(a);if(this.phase==='ROUND_ACTIVE'&&this.mode!=='tdm'){a.alive=false;a.health=0}return a}
 humanLeave(id:string){const a=this.get(id);if(!a)return;this.physics.remove(id);this.brains.delete(id);this.inputs.delete(id);this.actors.splice(this.actors.indexOf(a),1);const b=this.addActor(`bot-${id}`,names[this.tick%names.length],a.team,true);Object.assign(b,{position:{...a.position},health:a.health,alive:a.alive,armor:a.armor,inventory:a.inventory.map(g=>({...g})),weapon:a.weapon,credits:a.credits,kills:a.credits,deaths:a.deaths});this.physics.teleport(b)}
 emit(event:Omit<GameEvent,'id'>){this.events.push({...event,id:++this.eventId});if(this.events.length>48)this.events.shift()}
 get(id:string){return this.actors.find(a=>a.id===id)}
 buy(id:string,item:WeaponId|'armor'){
  const a=this.get(id);if(!a)return false;
  const freeMode=this.mode==='training'||this.mode==='tdm';
  if(!freeMode&&(!a.alive||this.phase!=='BUY_PHASE'))return false;
  const cost=freeMode?0:item==='armor'?650:WEAPONS[item].price;
  if(a.credits<cost)return false;
  if(item==='armor'){if(a.armor===100)return false;a.armor=100}
  else{
   if(a.inventory.some(g=>g.id===item)){a.weapon=item;a.reload=0;return true}
   const slot=WEAPONS[item].slot;
   a.inventory=a.inventory.filter(g=>WEAPONS[g.id].slot!==slot);
   a.inventory.push(gun(item));
   a.weapon=item;a.reload=0;
  }
  a.credits-=cost;return true;
 }
 drop(id:string){const a=this.get(id);if(!a||!a.alive||a.weapon==='edge'||this.phase==='ROUND_END'||this.phase==='MATCH_END')return;
 const w=a.weapon,old=a.inventory.find(g=>g.id===w)!;this.pickups.push({id:++this.pickupId,position:{...a.position,y:a.position.y+.1},gun:{...old}});if(this.pickups.length>32)this.pickups.shift();a.inventory=a.inventory.filter(g=>g.id!==w);a.weapon=a.inventory.find(g=>g.id==='p9')?.id??'edge';a.reload=0;
 }
 pickup(a:Actor){const p=this.pickups.find(p=>Math.hypot(p.position.x-a.position.x,p.position.z-a.position.z)<1.6);if(!p)return false;const slot=WEAPONS[p.gun.id].slot;if(a.inventory.some(g=>WEAPONS[g.id].slot===slot))return false;a.inventory.push({...p.gun});a.weapon=p.gun.id;a.reload=0;this.pickups=this.pickups.filter(x=>x.id!==p.id);return true}
 update(dt=1/60){
  this.tick++;
  if(this.mode==='tdm'){
   if(this.phase==='MATCH_END')return;
   this.time=Math.max(0,this.time-dt);
   if(this.time<=0){
    this.phase='MATCH_END';
    this.winner=this.score.VANGUARD>=this.score.PHANTOM?'VANGUARD':'PHANTOM';
    this.reason='TEMPO REGULAMENTAR ESGOTADO';
    this.emit({type:'round',actor:'',message:`${this.winner} VENCEU A OPERAÇÃO`});
    return;
   }
  }else if(this.mode!=='training'){
   this.time=Math.max(0,this.time-dt);
   if(this.phase==='BUY_PHASE'&&this.time<=0){this.phase='ROUND_ACTIVE';this.time=115;this.emit({type:'round',actor:'',message:'RODADA INICIADA'})}
   if(this.phase==='ROUND_END'&&this.time<=0)this.nextRound();
   if(this.phase==='MATCH_END')return;
  }
  for(const a of this.actors){
   a.cooldown=Math.max(0,a.cooldown-dt);
   if(a.reload>0){a.reload=Math.max(0,a.reload-dt);if(a.reload===0){const g=a.inventory.find(g=>g.id===a.weapon)!;const n=Math.min(WEAPONS[a.weapon].capacity-g.ammo,g.reserve);g.ammo+=n;g.reserve-=n}}
   if(!a.alive){
    if(this.mode==='training'&&a.bot){
     const b=this.brains.get(a.id)!;b.respawn+=dt;
     if(b.respawn>2.5){a.alive=true;a.health=100;b.respawn=0}
    }else if(this.mode==='tdm'){
     const b=this.brains.get(a.id)!;b.respawn+=dt;
     a.respawn=Math.max(0,3.0-b.respawn);
     if(b.respawn>=3.0)this.respawnActor(a);
    }
    continue;
   }
   const input=a.bot?this.botInput(a,dt):this.inputs.get(a.id)??emptyInput();a.ack=input.seq;
   if(input.slot){const w=a.inventory.find(g=>WEAPONS[g.id].slot===input.slot);if(w&&w.id!==a.weapon){a.weapon=w.id;a.reload=0;a.cooldown=.25}}
   const freeze=this.phase==='BUY_PHASE'||this.phase==='ROUND_END';this.physics.move(a,input,dt,freeze);
   if(this.phase==='ROUND_ACTIVE'){if(input.reload)this.reload(a);if(input.fire)this.fire(a,input);if(input.interact&&this.pickup(a))a.cooldown=.2;else this.interact(a,input,dt)}
   if(a.bot&&a.inventory.find(g=>g.id===a.weapon)?.ammo===0)this.reload(a);
  }
  this.physics.step();
  if(this.mode!=='training'&&this.mode!=='tdm'&&this.phase==='ROUND_ACTIVE'){
   if(this.objective.planted){this.objective.remaining-=dt;if(this.objective.remaining<=0)this.endRound(this.attacking,'DISPOSITIVO ATIVADO')}
   else if(this.time<=0)this.endRound(other(this.attacking),'TEMPO ESGOTADO');
   const attackAlive=this.actors.some(a=>a.team===this.attacking&&a.alive),defendAlive=this.actors.some(a=>a.team!==this.attacking&&a.alive);
   if(!defendAlive)this.endRound(this.attacking,'EQUIPE ADVERSÁRIA ELIMINADA');
   else if(!attackAlive&&!this.objective.planted)this.endRound(other(this.attacking),'EQUIPE ADVERSÁRIA ELIMINADA');
  }
 }
 reload(a:Actor){const g=a.inventory.find(g=>g.id===a.weapon);if(g&&(this.mode==='training'||this.mode==='tdm')&&g.reserve===0)g.reserve=WEAPONS[a.weapon].reserve;if(!g||a.reload>0||g.ammo===WEAPONS[a.weapon].capacity||!g.reserve||a.weapon==='edge')return;a.reload=WEAPONS[a.weapon].reload;this.emit({type:'reload',actor:a.id,position:eye(a)})}
 fire(a:Actor,input:Input){if(a.cooldown>0||a.reload>0)return;const g=a.inventory.find(g=>g.id===a.weapon)!;if(!g.ammo)return;const spec=WEAPONS[a.weapon];if(a.weapon!=='edge')g.ammo--;a.cooldown=spec.interval;
 const e=eye(a),spread=new Weapon(a.weapon).spread(Math.hypot(a.velocity.x,a.velocity.z)>1,!a.grounded,a.crouch);
 const seed=Math.sin(this.tick*12.9898+a.position.x*78.233)*43758.5453,rand=(seed-Math.floor(seed))-.5;
 const yaw=input.yaw+rand*spread*2,pitch=input.pitch+Math.cos(this.tick*4.13)*spread;
 const dx=-Math.sin(yaw)*Math.cos(pitch),dy=Math.sin(pitch),dz=-Math.cos(yaw)*Math.cos(pitch);
 let distance=Math.min(spec.range,wallDistance(e.x,e.y,e.z,dx,dy,dz)),victim:Actor|undefined,head=false;
 for(const b of this.actors){if(!b.alive||b.id===a.id)continue;const h=b.crouch?1.2:1.78;const d=rayBox(e.x,e.y,e.z,dx,dy,dz,{x:b.position.x,y:b.position.y+h/2,z:b.position.z,w:.64,h,d:.64});if(d<distance){distance=d;victim=b;head=e.y+dy*d>b.position.y+h-.36}}
 const end={x:e.x+dx*distance,y:e.y+dy*distance,z:e.z+dz*distance};this.emit({type:'shot',actor:a.id,target:victim?.team!==a.team?victim?.id:undefined,position:e,end,weapon:a.weapon,headshot:head});
 if(victim&&victim.team!==a.team){
  const base=spec.damage*(head?spec.headMultiplier:1),absorb=Math.min(victim.armor,base*.35);
  victim.armor-=absorb;victim.health=Math.max(0,victim.health-(base-absorb));
  if(victim.health<=0){
   victim.alive=false;victim.state='DEAD';victim.deaths++;a.kills++;a.credits=Math.min(16000,a.credits+300);
   this.emit({type:'kill',actor:a.id,target:victim.id,weapon:a.weapon,headshot:head});
   if(this.mode==='tdm'){
    victim.respawn=3.0;
    const vb=this.brains.get(victim.id);if(vb)vb.respawn=0;
    this.score[a.team]++;
    if(this.score[a.team]>=this.targetScore){
     this.phase='MATCH_END';this.winner=a.team;this.reason=`META DE ${this.targetScore} ELIMINAÇÕES ATINGIDA`;
     this.emit({type:'round',actor:'',message:`${a.team} VENCEU A PARTIDA`});
    }
   }
  }
 }
 }
 interact(a:Actor,input:Input,dt:number){if(this.mode==='training'||this.mode==='tdm'){a.objectiveProgress=0;return}const site=(['A','B'] as const).find(k=>Math.hypot(a.position.x-MAP.sites[k].x,a.position.z-MAP.sites[k].z)<3.6);
 const valid=input.interact&&site&&(a.team===this.attacking?!this.objective.planted:this.objective.planted&&site===this.objective.site)&&Math.hypot(a.velocity.x,a.velocity.z)<.7;
 if(!valid){a.objectiveProgress=0;if(this.objective.actor===a.id){this.objective.actor=null;this.objective.progress=0}return}
 if(this.objective.actor&&this.objective.actor!==a.id)return;
 this.objective.actor=a.id;a.objectiveProgress+=dt;const duration=a.team===this.attacking?3:4.5;this.objective.progress=a.objectiveProgress/duration;
 if(a.objectiveProgress>=duration){if(a.team===this.attacking){this.objective.planted=true;this.objective.site=site!;this.objective.remaining=40;this.emit({type:'objective',actor:a.id,message:`DISPOSITIVO ATIVO · SETOR ${site}`});a.credits=Math.min(16000,a.credits+300)}else this.endRound(a.team,'DISPOSITIVO DESATIVADO');a.objectiveProgress=0;this.objective.actor=null;this.objective.progress=0}
 }
 endRound(team:Team,reason:string){if(this.phase!=='ROUND_ACTIVE')return;this.phase='ROUND_END';this.time=6;this.winner=team;this.reason=reason;this.score[team]++;for(const a of this.actors)a.credits=Math.min(16000,a.credits+(a.team===team?3000:1900));this.emit({type:'round',actor:'',message:`${team} VENCEU`})}
 nextRound(){if(this.score.VANGUARD>=4||this.score.PHANTOM>=4){this.phase='MATCH_END';return}this.round++;this.pickups=[];if(this.round===4)this.attacking=other(this.attacking);this.phase='BUY_PHASE';this.time=12;this.winner=null;this.objective={planted:false,site:null,remaining:40,progress:0,actor:null};
 for(const a of this.actors){const i=this.actors.filter(b=>b.team===a.team).indexOf(a),z=a.team===this.attacking?30:-30;a.position={x:(i-2)*2.2,y:.1,z:z+(i%2)*2*(z>0?1:-1)};a.velocity={x:0,y:0,z:0};a.yaw=z>0?0:Math.PI;a.pitch=0;if(!a.alive){a.inventory=[gun('p9'),gun('edge')];a.weapon='p9';a.armor=0}a.inventory.forEach(g=>{g.ammo=WEAPONS[g.id].capacity;g.reserve=WEAPONS[g.id].reserve});a.health=100;a.alive=true;a.crouch=false;a.slide=0;a.reload=0;a.cooldown=0;a.objectiveProgress=0;this.physics.teleport(a);const b=this.brains.get(a.id)!;b.stage=0;b.path=[];b.repath=0;b.target='';if(a.bot){if(!a.inventory.some(g=>WEAPONS[g.id].slot===1))this.buy(a.id,a.credits>=2700?'vx47':'viper');this.buy(a.id,'armor')}}
 }
 botInput(a:Actor,dt:number):Input {const input=emptyInput();input.yaw=a.yaw;input.pitch=a.pitch;if(this.mode==='training')return input;const brain=this.brains.get(a.id)!;if(this.phase!=='ROUND_ACTIVE')return input;brain.repath-=dt;
 const e=eye(a);let target:Actor|undefined,best=Infinity;
 for(const t of this.actors){if(!t.alive||t.team===a.team)continue;const p=eye(t),dx=p.x-e.x,dy=p.y-e.y-.12,dz=p.z-e.z,d=Math.hypot(dx,dy,dz);const dot=(-Math.sin(a.yaw)*dx-Math.cos(a.yaw)*dz)/d;
 const heard=t.cooldown>WEAPONS[t.weapon].interval*.3&&d<26;
 if(d<best&&d<48&&(dot>.15||d<7.5||heard||brain.target===t.id)&&wallDistance(e.x,e.y,e.z,dx/d,dy/d,dz/d)>d-.3){target=t;best=d}}
 if(target){
  if(brain.target!==target.id){brain.target=target.id;brain.reaction=this.difficulty==='easy'?.85:this.difficulty==='hard'?.22:.45}
  brain.reaction-=dt;a.state=a.health<25?'RETREAT':'ENGAGE';
  const p=eye(target),desired=Math.atan2(-(p.x-e.x),-(p.z-e.z));
  let delta=angle(desired-a.yaw);
  input.yaw=a.yaw+Math.max(-dt*5.5,Math.min(dt*5.5,delta));
  input.pitch=Math.atan2(p.y-e.y-.09,Math.hypot(p.x-e.x,p.z-e.z));
  const error=this.difficulty==='easy'?.055:this.difficulty==='hard'?.008:.022;
  input.yaw+=Math.sin(this.tick*.07+a.position.x)*error;
  input.fire=brain.reaction<=0&&Math.abs(delta)<.15;
  input.crouch=best>16&&a.health>25;
  if(best<22&&a.health>25)input.x=Math.sin(this.tick*.06+a.id.length)>.2?.65:Math.sin(this.tick*.06+a.id.length)<-.2?-.65:0;
  input.z=a.health<25?-.6:best>28?.5:0;
  return input;
 }
 brain.target='';input.pitch=0;
 if(this.mode==='tdm'){
  a.state='PATROL';
  const enemyZ=a.team===this.attacking?-22:22;
  const waypoints=[
   {x:brain.lane,z:0},
   {x:brain.lane,z:enemyZ},
   {x:-brain.lane,z:enemyZ*.5},
  ];
  const goal=waypoints[brain.stage%waypoints.length];
  if(Math.hypot(a.position.x-goal.x,a.position.z-goal.z)<3.2){brain.stage=(brain.stage+1)%waypoints.length;brain.repath=0}
  if(brain.repath<=0){brain.path=this.nav.path(a.position.x,a.position.z,goal.x,goal.z);brain.repath=1.4}
  while(brain.path.length&&Math.hypot(brain.path[0].x-a.position.x,brain.path[0].z-a.position.z)<.6)brain.path.shift();
  const node=brain.path[0];
  if(node){const dx=node.x-a.position.x,dz=node.z-a.position.z;input.yaw=Math.atan2(-dx,-dz);input.z=1}
  return input;
 }
 const attack=a.team===this.attacking;let goal:{x:number;z:number};const site=brain.lane<0?'A':'B';
 if(this.objective.planted){goal=MAP.sites[this.objective.site!];a.state=attack?'DEFEND':'MOVE_TO_OBJECTIVE';if(attack&&Math.hypot(a.position.x-goal.x,a.position.z-goal.z)<9){input.yaw=a.yaw+dt*.3;return input}}
 else if(attack){a.state='MOVE_TO_OBJECTIVE';goal=brain.stage===0?{x:brain.lane,z:15}:brain.stage===1?{x:brain.lane,z:-9}:MAP.sites[site];if(Math.hypot(a.position.x-goal.x,a.position.z-goal.z)<2&&brain.stage<2){brain.stage++;brain.repath=0}}
 else{a.state='DEFEND';goal={x:brain.lane,z:-16};if(Math.hypot(a.position.x-goal.x,a.position.z-goal.z)<2){input.yaw=Math.PI+Math.sin(this.tick*.009)*.7;return input}}
 if(Math.hypot(a.position.x-goal.x,a.position.z-goal.z)<2.6&&((attack&&!this.objective.planted)||(!attack&&this.objective.planted))&&brain.stage>= (attack?2:0)){input.interact=true;return input}
 if(brain.repath<=0){brain.path=this.nav.path(a.position.x,a.position.z,goal.x,goal.z);brain.repath=1.5}
 while(brain.path.length&&Math.hypot(brain.path[0].x-a.position.x,brain.path[0].z-a.position.z)<.5)brain.path.shift();const node=brain.path[0];if(node){const dx=node.x-a.position.x,dz=node.z-a.position.z;input.yaw=Math.atan2(-dx,-dz);input.z=1;input.walk= !attack&&Math.abs(a.position.z)<20}else a.state='SEARCH';return input;
 }
 snapshot():Snapshot{return {tick:this.tick,mode:this.mode,phase:this.phase,time:this.time,round:this.round,score:{...this.score},attacking:this.attacking,actors:this.actors.map(a=>({...a,position:{...a.position},velocity:{...a.velocity},inventory:a.inventory.map(g=>({...g}))})),events:this.events.slice(),pickups:this.pickups.map(p=>({...p,position:{...p.position},gun:{...p.gun}})),objective:{...this.objective},winner:this.winner,reason:this.reason,targetScore:this.targetScore}}
 dispose(){this.physics.dispose()}
}
export const other=(t:Team):Team=>t==='VANGUARD'?'PHANTOM':'VANGUARD';
const gun=(id:WeaponId)=>({id,ammo:WEAPONS[id].capacity,reserve:WEAPONS[id].reserve});
export const angle=(r:number)=>Math.atan2(Math.sin(r),Math.cos(r));
