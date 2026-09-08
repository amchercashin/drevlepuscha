/** Build closed crown volumes from connected source lobes, then merge nearest neighbours.
 * Plain decimation destroys tiny disconnected leaf lobes; this preserves their spatial coverage. */
export function canopyProxy(source,targetCount,segments,rings){
 const count=source.positions.length/3,parent=Array.from({length:count},(_,i)=>i);
 function root(i){while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;}
 for(let i=0;i<source.indices.length;i+=3){const a=root(source.indices[i]);parent[root(source.indices[i+1])]=a;parent[root(source.indices[i+2])]=a;}
 const groups=new Map();
 for(let i=0;i<count;i++){const id=root(i);let g=groups.get(id);if(!g){g={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity],color:[0,0,0],weight:0};groups.set(id,g);}g.weight++;for(let d=0;d<3;d++){g.min[d]=Math.min(g.min[d],source.positions[i*3+d]);g.max[d]=Math.max(g.max[d],source.positions[i*3+d]);g.color[d]+=source.colors[i*4+d];}}
 const clusters=[...groups.values()];for(const g of clusters)g.color=g.color.map(c=>c/g.weight);
 const centre=g=>g.min.map((v,d)=>(v+g.max[d])/2);
 while(clusters.length>targetCount){let best=Infinity,pair=[0,1];for(let i=0;i<clusters.length;i++)for(let j=i+1;j<clusters.length;j++){const a=centre(clusters[i]),b=centre(clusters[j]);const cost=a.reduce((n,v,d)=>n+(v-b[d])**2*(d===1?3:1),0);if(cost<best){best=cost;pair=[i,j];}}const [i,j]=pair,a=clusters[i],b=clusters[j],weight=a.weight+b.weight;clusters[i]={min:a.min.map((v,d)=>Math.min(v,b.min[d])),max:a.max.map((v,d)=>Math.max(v,b.max[d])),color:a.color.map((v,d)=>(v*a.weight+b.color[d]*b.weight)/weight),weight};clusters.splice(j,1);}
 const p={name:'canopy',positions:[],normals:[],colors:[],uvs:[],indices:[]};
 for(const cluster of clusters){const c=centre(cluster),scale=cluster.min.map((v,d)=>Math.max(0.05,(cluster.max[d]-v)/2)),base=p.positions.length/3;
  for(let i=0;i<=rings;i++)for(let j=0;j<segments;j++){
   const lat=i/rings*Math.PI,a=j/segments*Math.PI*2,v=[Math.sin(lat)*Math.cos(a),Math.cos(lat),Math.sin(lat)*Math.sin(a)],n=v.map((x,d)=>x/scale[d]),length=Math.hypot(...n);
   p.positions.push(...v.map((x,d)=>c[d]+x*scale[d]));p.normals.push(...n.map(x=>x/length));p.colors.push(...cluster.color,1);p.uvs.push(j/segments,i/rings);
  }
  for(let i=0;i<rings;i++)for(let j=0;j<segments;j++){const a=base+i*segments+j,b=base+i*segments+(j+1)%segments,c=a+segments,d=b+segments;if(i!==0)p.indices.push(a,b,c);if(i!==rings-1)p.indices.push(b,d,c);}
 }
 return p;
}
