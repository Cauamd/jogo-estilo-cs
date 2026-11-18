import RAPIER from '@dimforge/rapier3d-compat';
import {obstacles} from '../shared/map';
import type {Actor,Input,Vec} from '../shared/types';
let ready:Promise<void>|undefined;
export async function initPhysics(){ready??=RAPIER.init();await ready}
export class PhysicsWorld{
 world=new RAPIER.World({x:0,y:-20,z:0});
 controller=this.world.createCharacterController(.015);
 bodies=new Map<string,{body:RAPIER.RigidBody;collider:RAPIER.Collider;crouch:boolean;wasCrouch:boolean;slide:number;slideCooldown:number;slideDirX:number;slideDirZ:number}>();
 constructor(){this.controller.enableAutostep(.33,.2,true);this.controller.enableSnapToGround(.2);this.controller.setApplyImpulsesToDynamicBodies(false);this.world.timestep=1/60;
 this.world.createCollider(RAPIER.ColliderDesc.cuboid(33,.5,39).setTranslation(0,-.5,0));
 for(const o of obstacles)this.world.createCollider(RAPIER.ColliderDesc.cuboid(o.w/2,o.h/2,o.d/2).setTranslation(o.x,o.y,o.z));
 }
 add(a:Actor){const body=this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(a.position.x,a.position.y+.9,a.position.z));const collider=this.world.createCollider(RAPIER.ColliderDesc.capsule(.57,.32),body);this.bodies.set(a.id,{body,collider,crouch:false,wasCrouch:false,slide:0,slideCooldown:0,slideDirX:0,slideDirZ:0})}
 remove(id:string){const b=this.bodies.get(id);if(b){this.world.removeRigidBody(b.body);this.bodies.delete(id)}}
 teleport(a:Actor){const b=this.bodies.get(a.id);if(b){b.slide=0;b.slideCooldown=0;b.body.setTranslation({x:a.position.x,y:a.position.y+(a.crouch?.6:.9),z:a.position.z},true)}}
 move(a:Actor,input:Input,dt:number,freeze=false){const b=this.bodies.get(a.id);if(!b||!a.alive)return;
 b.slideCooldown=Math.max(0,b.slideCooldown-dt);
 const horizSpeed=Math.hypot(a.velocity.x,a.velocity.z);
 if(!freeze&&a.grounded&&input.crouch&&!b.wasCrouch&&b.slide<=0&&b.slideCooldown<=0&&horizSpeed>4.2&&!input.walk){
  b.slide=.62;b.slideCooldown=.95;b.slideDirX=a.velocity.x/horizSpeed;b.slideDirZ=a.velocity.z/horizSpeed;
 }
 b.wasCrouch=input.crouch;
 if(b.slide>0&&(!input.crouch||!a.grounded||freeze||input.jump))b.slide=0;
 if(b.slide>0)b.slide=Math.max(0,b.slide-dt);

 let crouch=input.crouch||b.slide>0;
 if(b.crouch&&!crouch){const pos=b.body.translation();const hit=this.world.castRay(new RAPIER.Ray({x:pos.x,y:pos.y+.58,z:pos.z},{x:0,y:1,z:0}),.7,true,undefined,undefined,b.collider);if(hit)crouch=true}
 if(b.crouch!==crouch){b.collider.setShape(new RAPIER.Capsule(crouch?.27:.57,.32));b.body.setTranslation({x:a.position.x,y:a.position.y+(crouch?.6:.9),z:a.position.z},true);b.crouch=crouch}
 a.crouch=crouch;a.slide=b.slide;a.yaw=input.yaw;a.pitch=input.pitch;

 if(b.slide>0&&!freeze){
  const slideSpeed=2.2+(b.slide/.62)*5.6;
  const steerX=(input.x*Math.cos(a.yaw)-input.z*Math.sin(a.yaw))*.8;
  const steerZ=(-input.x*Math.sin(a.yaw)-input.z*Math.cos(a.yaw))*.8;
  a.velocity.x=b.slideDirX*slideSpeed+steerX;
  a.velocity.z=b.slideDirZ*slideSpeed+steerZ;
 }else{
  const speed=freeze?0:crouch?2.15:input.walk?2.85:a.weapon==='edge'?6.6:5.7;
  const len=Math.max(1,Math.hypot(input.x,input.z)),mx=input.x/len,mz=input.z/len;
  const vx=(mx*Math.cos(a.yaw)-mz*Math.sin(a.yaw))*speed,vz=(-mx*Math.sin(a.yaw)-mz*Math.cos(a.yaw))*speed;
  const accel=a.grounded?20:4.2;a.velocity.x+=(vx-a.velocity.x)*Math.min(1,dt*accel);a.velocity.z+=(vz-a.velocity.z)*Math.min(1,dt*accel);
 }
 if(a.grounded&&input.jump&&!freeze){a.velocity.y=7.2;a.grounded=false;b.slide=0;a.slide=0}else if(a.grounded)a.velocity.y=-1;
 a.velocity.y-=20*dt;
 this.controller.computeColliderMovement(b.collider,{x:a.velocity.x*dt,y:a.velocity.y*dt,z:a.velocity.z*dt},undefined,undefined,(collider)=>collider.parent()===null);
 const m=this.controller.computedMovement(),p=b.body.translation();b.body.setNextKinematicTranslation({x:p.x+m.x,y:p.y+m.y,z:p.z+m.z});
 a.position={x:p.x+m.x,y:p.y+m.y-(crouch?.6:.9),z:p.z+m.z};a.grounded=this.controller.computedGrounded();if(a.grounded)a.velocity.y=0;
 if(a.position.y< -8){a.position={x:0,y:.1,z:a.team==='VANGUARD'?30:-30};a.velocity={x:0,y:0,z:0};this.teleport(a)}
 }
 step(){this.world.step()}
 dispose(){this.world.free()}
}
export const eye=(a:Actor):Vec=>({x:a.position.x,y:a.position.y+((a.slide??0)>0?.92:a.crouch?1.08:1.62),z:a.position.z});
