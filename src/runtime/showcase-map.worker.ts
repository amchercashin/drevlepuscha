import {showcaseHeight} from '../domain/showcase.ts';
const im={data:new Uint8ClampedArray(320*400*4)};
  for(let j=0;j<400;j++)for(let i=0;i<320;i++){
   const e=i*1.6-256,n=384-j*1.6,h=showcaseHeight(e,n),dx=(showcaseHeight(e+1,n)-showcaseHeight(e-1,n))/2,dn=(showcaseHeight(e,n+1)-showcaseHeight(e,n-1))/2;
   const shade=Math.max(.52,Math.min(1.12,.86-.28*dx+.32*dn)),v=Math.max(0,Math.min(1,(h+4)/34));
   const contour=Math.abs(h/2-Math.round(h/2))*2<Math.max(.07,Math.hypot(dx,dn)*.18),k=(j*320+i)*4;
   im.data[k]=(184+v*39)*shade*(contour?.82:1);im.data[k+1]=(194+v*22)*shade*(contour?.82:1);im.data[k+2]=(159+v*20)*shade*(contour?.82:1);im.data[k+3]=255;
  }

(self as unknown as {postMessage:(data:Uint8ClampedArray,transfer:Transferable[])=>void}).postMessage(im.data,[im.data.buffer]);
