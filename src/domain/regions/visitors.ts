import {hash01} from '../geography.mjs';

export interface WildVisitor {id:string;kind:'wolf'|'raven';e:number;n:number;h:number;heading:number;age:number;attackAt:number;}
export interface VisitorWorld {height:(e:number,n:number)=>number;blocked:(e:number,n:number)=>boolean;forestAt:(e:number,n:number)=>boolean;}

/** Rare, seeded encounters. State is local ambient life, independent of mission saves. */
export class RegionVisitors {
 private seed:number;
 clock=0;cycle=0;nextAt:number;visitor:WildVisitor|null=null;events:string[]=[];
 constructor(seed:number){this.seed=seed;this.nextAt=55+hash01(seed,1,919)*70;}
 update(dt:number,player:{e:number;n:number;mode:'walk'|'boat'},world:VisitorWorld){
  this.clock+=Math.max(0,Math.min(dt,.25));let bite=0;
  if(this.visitor){const v=this.visitor;v.age+=dt;const distance=Math.hypot(v.e-player.e,v.n-player.n);
   if(v.kind==='wolf'){
    if(distance<30&&distance>1.5){const speed=distance<12?3.3:2.1,step=Math.min(distance-1.4,speed*dt),de=(player.e-v.e)/distance*step,dn=(player.n-v.n)/distance*step;
     if(!world.blocked(v.e+de,v.n+dn)){v.e+=de;v.n+=dn;v.heading=Math.atan2(de,dn);}}
    v.h=world.height(v.e,v.n);
    if(distance<2.3&&this.clock>=v.attackAt&&player.mode==='walk'){v.attackAt=this.clock+2.1;bite=8;this.events.push('Волк напал из кустарника.');}
   }else{const a=v.age*.45;v.e=player.e+Math.cos(a)*28;v.n=player.n+Math.sin(a)*28;v.h=world.height(v.e,v.n)+9+Math.sin(a*2)*2;v.heading=a+Math.PI/2;}
   if(v.age>(v.kind==='wolf'?38:26)||distance>115){this.visitor=null;}
  }
  if(!this.visitor&&this.clock>=this.nextAt){this.cycle++;this.nextAt=this.clock+115+hash01(this.seed,this.cycle,920)*90;
   if(player.mode==='walk'&&world.forestAt(player.e,player.n)&&hash01(this.seed,this.cycle,921)<.55){
    const kind=hash01(this.seed,this.cycle,922)<.38?'wolf':'raven';
    for(let i=0;i<5;i++){const a=hash01(this.seed,this.cycle,i+923)*Math.PI*2,d=kind==='wolf'?34+hash01(this.seed,this.cycle,i+929)*15:28;
     const e=player.e+Math.cos(a)*d,n=player.n+Math.sin(a)*d;
     if(world.blocked(e,n)||!world.forestAt(e,n))continue;
     this.visitor={id:`visitor-${this.cycle}`,kind,e,n,h:world.height(e,n)+(kind==='raven'?9:0),heading:a,age:0,attackAt:this.clock+1};
     this.events.push(kind==='wolf'?'В лесу слышен одинокий волк.':'Над тропой закружил ворон.');break;
    }
   }
  }
  return {bite,visitor:this.visitor};
 }
 repel(player:{e:number;n:number},yawDeg:number){const v=this.visitor;if(!v||v.kind!=='wolf')return false;const d=Math.hypot(v.e-player.e,v.n-player.n),a=yawDeg*Math.PI/180;
  if(d>3||(v.e-player.e)*Math.sin(a)+(v.n-player.n)*Math.cos(a)<d*.2)return false;
  this.visitor=null;this.events.push('Волк отступил после удара.');return true;
 }
 drainEvents(){return this.events.splice(0);}
}
