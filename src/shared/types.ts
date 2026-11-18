export type Team = 'VANGUARD' | 'PHANTOM';
export type Mode = 'training' | 'offline' | 'tdm' | 'online';
export type Phase = 'BUY_PHASE' | 'ROUND_ACTIVE' | 'ROUND_END' | 'MATCH_END';
export type WeaponId = 'vx47' | 's1' | 'p9' | 'viper' | 'edge';
export type BotState = 'IDLE' | 'PATROL' | 'MOVE_TO_OBJECTIVE' | 'SEARCH' | 'ENGAGE' | 'RETREAT' | 'DEFEND' | 'DEAD';
export interface Vec {x:number;y:number;z:number}
export interface Input {seq:number; x:number;z:number;yaw:number;pitch:number;jump:boolean;crouch:boolean;walk:boolean;fire:boolean;reload:boolean;interact:boolean;slot:number;inspect:boolean}
export const emptyInput = ():Input => ({seq:0,x:0,z:0,yaw:0,pitch:0,jump:false,crouch:false,walk:false,fire:false,reload:false,interact:false,slot:0,inspect:false});
export interface GunState {id:WeaponId;ammo:number;reserve:number}
export interface Pickup {id:number;position:Vec;gun:GunState}
export interface Actor {id:string;name:string;team:Team;bot:boolean;position:Vec;velocity:Vec;yaw:number;pitch:number;health:number;armor:number;alive:boolean;crouch:boolean;grounded:boolean;weapon:WeaponId;inventory:GunState[];reload:number;cooldown:number;credits:number;kills:number;deaths:number;state:BotState;ack:number;objectiveProgress:number;slide?:number;respawn?:number}
export interface GameEvent {id:number;type:'shot'|'kill'|'round'|'objective'|'reload'|'step';actor:string;target?:string;position?:Vec;end?:Vec;weapon?:WeaponId;headshot?:boolean;message?:string}
export interface Snapshot {tick:number;mode:Mode;phase:Phase;time:number;round:number;score:Record<Team,number>;attacking:Team;actors:Actor[];events:GameEvent[];pickups:Pickup[];objective:{planted:boolean;site:'A'|'B'|null;remaining:number;progress:number;actor:string|null};winner:Team|null;reason:string;targetScore?:number}
export interface Settings {sensitivity:number;fov:number;volume:number;quality:'low'|'medium'|'high'|'ultra';resolution:number;fps:boolean;difficulty:'easy'|'normal'|'hard';hitmarker:boolean;tdmTarget?:number;tdmMinutes?:number;tdmTeamSize?:number}
export const defaults:Settings={sensitivity:1,fov:85,volume:.55,quality:'medium',resolution:1,fps:false,difficulty:'normal',hitmarker:true,tdmTarget:75,tdmMinutes:10,tdmTeamSize:7};
