// Offline double-sided triangle ray cast. Returned normal is oriented toward the ray origin.
export function surfaceHit(c,from,to){
 const transform=(p,m)=>[p[0]*m[0]+p[1]*m[4]+p[2]*m[8]+m[12],p[0]*m[1]+p[1]*m[5]+p[2]*m[9]+m[13],p[0]*m[2]+p[1]*m[6]+p[2]*m[10]+m[14]];
 const a=transform(from,c.inverse),b=transform(to,c.inverse),d=b.map((x,i)=>x-a[i]),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);let best=null;
 function visit(node){
  let lo=0,hi=best?.t??1;for(let i=0;i<3;i++){const key=['x','y','z'][i];if(Math.abs(d[i])<1e-10){if(a[i]<node.min[key]||a[i]>node.max[key])return;}else{const p=(node.min[key]-a[i])/d[i],q=(node.max[key]-a[i])/d[i];lo=Math.max(lo,Math.min(p,q));hi=Math.min(hi,Math.max(p,q));if(lo>hi)return;}}
  if(node.children){node.children.forEach(visit);return;}
  for(const tri of node.triangles){const [v,w,u]=tri.map(p=>[p.x,p.y,p.z]),e=w.map((x,i)=>x-v[i]),f=u.map((x,i)=>x-v[i]),h=cross(d,f),det=dot(e,h);if(Math.abs(det)<1e-12)continue;const s=a.map((x,i)=>x-v[i]),alpha=dot(s,h)/det,q=cross(s,e),beta=dot(d,q)/det,t=dot(f,q)/det;if(alpha<0||beta<0||alpha+beta>1||t<0||t>1||t>=(best?.t??Infinity))continue;let normal=cross(e,f);if(dot(normal,d)>0)normal=normal.map(n=>-n);const len=Math.hypot(...normal);best={t,point:a.map((x,i)=>x+d[i]*t),normal:normal.map(x=>x/len)};}
 }
 visit(c.geometry.root);return best;
}
