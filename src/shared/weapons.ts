import type {WeaponId} from './types';
export interface WeaponSpec {id:WeaponId;name:string;label:string;price:number;damage:number;headMultiplier:number;capacity:number;reserve:number;interval:number;reload:number;spread:number;range:number;recoil:number;automatic:boolean;slot:number}
export const WEAPONS:Record<WeaponId,WeaponSpec>={
 vx47:{id:'vx47',name:'VX-47',label:'RIFLE DE ASSALTO',price:2700,damage:31,headMultiplier:3,capacity:30,reserve:90,interval:.105,reload:2.3,spread:.008,range:100,recoil:.017,automatic:true,slot:1},
 s1:{id:'s1',name:'SPECTRE S1',label:'RIFLE DE PRECISÃO',price:4200,damage:88,headMultiplier:2,capacity:5,reserve:25,interval:1.2,reload:3,spread:.001,range:150,recoil:.05,automatic:false,slot:1},
 p9:{id:'p9',name:'PHANTOM P9',label:'PISTOLA',price:400,damage:23,headMultiplier:3,capacity:15,reserve:60,interval:.22,reload:1.6,spread:.009,range:70,recoil:.024,automatic:false,slot:2},
 viper:{id:'viper',name:'VIPER SMG',label:'SUBMETRALHADORA',price:1500,damage:21,headMultiplier:2.5,capacity:32,reserve:96,interval:.07,reload:2,spread:.014,range:60,recoil:.012,automatic:true,slot:1},
 edge:{id:'edge',name:'EDGE',label:'LÂMINA TÁTICA',price:0,damage:55,headMultiplier:1,capacity:1,reserve:0,interval:.55,reload:0,spread:0,range:2.4,recoil:.08,automatic:false,slot:3}
};
export class Weapon {
 readonly spec:WeaponSpec;
 constructor(id:WeaponId){this.spec=WEAPONS[id]}
 spread(moving:boolean,airborne:boolean,crouching:boolean){return this.spec.spread*(airborne?5:moving?2.5:crouching?.55:1)}
}
