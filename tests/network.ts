import assert from 'node:assert/strict';
import {Client} from 'colyseus.js';
import {startServer} from '../server/index';
import {emptyInput,type Snapshot} from '../src/shared/types';
const port=2568,server=await startServer(port),client1=new Client(`ws://localhost:${port}`),client2=new Client(`ws://localhost:${port}`);
let a:Awaited<ReturnType<Client['create']>>|undefined,b:typeof a;let failed=false;
try{a=await client1.create('spectra',{name:'TEST ALPHA',team:'VANGUARD'});let s1:Snapshot|undefined,s2:Snapshot|undefined;a.onMessage('snapshot',(s:Snapshot)=>s1=s);b=await client2.joinById(a.roomId,{name:'TEST BRAVO',team:'PHANTOM'});b.onMessage('snapshot',(s:Snapshot)=>s2=s);await waitFor(()=>s1?.actors.filter(p=>!p.bot).length===2&&s2?.actors.filter(p=>!p.bot).length===2);assert.equal(a.roomId,b.roomId);assert.equal(s1!.actors.filter(a=>!a.bot).length,2);assert.equal(s2!.actors.length,10);
 let purchase=false;a.onMessage('purchase',ok=>purchase=ok);a.send('buy','armor');await waitFor(()=>purchase);await waitFor(()=>s1!.actors.find(p=>p.id===a!.sessionId)!.armor===100);
 await waitFor(()=>s1!.phase==='ROUND_ACTIVE',16000);const before=s1!.actors.find(p=>p.id===a!.sessionId)!.position.x;let seq=0;const timer=setInterval(()=>a!.send('input',{...emptyInput(),seq:++seq,x:1}),1000/60);await new Promise(r=>setTimeout(r,1100));clearInterval(timer);a.send('input',{...emptyInput(),seq:++seq});await waitFor(()=>s2!.actors.find(p=>p.id===a!.sessionId)!.position.x>before+2);const peer=s2!.actors.find(p=>p.id===a!.sessionId)!;assert.ok(peer.ack>0);assert.ok(Number.isFinite(peer.position.x));
 const tickBefore=s2!.tick;console.log(JSON.stringify({result:'PASS',room:a.roomId,humans:s2!.actors.filter(p=>!p.bot).map(p=>({name:p.name,team:p.team})),movement:peer.position.x-before,ack:peer.ack,tick:tickBefore},null,2));
 // Abrupt socket close exercises the real reconnection reservation.
 const token=a.reconnectionToken;a.connection.close(4001);await new Promise(r=>setTimeout(r,150));a=await client1.reconnect(token);a.onMessage('snapshot',(s:Snapshot)=>s1=s);await waitFor(()=>s1!.tick>tickBefore);assert.equal(s1!.actors.filter(p=>!p.bot).length,2);console.log('PASS: reconnection retained the session and scoreboard');
}catch(error){failed=true;console.error(error)}finally{await a?.leave();await b?.leave();await server.gracefullyShutdown(false)}
if(failed)process.exitCode=1;
async function waitFor(condition:()=>boolean,timeout=5000){const start=Date.now();while(!condition()){if(Date.now()-start>timeout)throw new Error('Timed out waiting for network state');await new Promise(r=>setTimeout(r,30))}}
