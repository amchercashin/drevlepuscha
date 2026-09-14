import type {PersistentInvitation} from './persistent-protocol.ts';
/** Voice consumes membership, never movement or simulation internals. */
export interface VoiceSession {
 readonly id:string;readonly invite:PersistentInvitation;readonly phase:string;
 voiceMembers():{id:string;peerId:string;name:string}[];
 onChange(listener:()=>void):()=>void;
}
