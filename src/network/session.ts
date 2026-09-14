import type {Player,Position} from './protocol.ts';
import type {Phase} from './room.ts';
import type {SessionInvitation,WorldClock} from './persistent-protocol.ts';
export interface WalkSession {
 readonly id:string;readonly host:boolean;readonly invite:SessionInvitation;
 readonly players:Map<string,Player>;readonly persistent?:boolean;
 phase:Phase;detail:string;
 move(x:number,y:number,extra?:Partial<Position>):void;
 leave():Promise<void>;
 diagnostics():Promise<Record<string,unknown>>;
 clock?():WorldClock|null;
}
