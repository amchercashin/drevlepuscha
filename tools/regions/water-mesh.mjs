/** Same 2 m lattice/diagonal as the height tiles, shared across both rivers at the mouth. */
export function buildWaterMeshes(geo,bounds){
 const meshes=[],step=2,size=128,cols=size/step+1,high=geo.source.states.waterLevelsM.high;
 for(let n=Math.floor(bounds.minN/size)*size;n<bounds.maxN;n+=size)for(let e=Math.floor(bounds.minE/size)*size;e<bounds.maxE;e+=size){
  if(!geo.nearbyWater(e+64,n+64).some(q=>q.distance<q.width/2+160))continue;
  const positions=[],depths=[],indices=[];
  for(let y=0;y<cols;y++)for(let x=0;x<cols;x++){
   const E=e+x*step,N=n+y*step,near=geo.nearbyWater(E,N).filter(q=>q.distance<=q.width/2+64),level=near.length?Math.max(...near.map(q=>q.level)):0;
   positions.push(x*step,level+.035,-y*step);depths.push(near.length?level-Math.fround(geo.height(E,N)):-1000);
  }
  for(let y=0;y<cols-1;y++)for(let x=0;x<cols-1;x++){
   const a=y*cols+x;for(const tri of [[a,a+1,a+cols],[a+1,a+cols+1,a+cols]])if(tri.some(k=>depths[k]+high>0))indices.push(...tri);
  }
  if(indices.length)meshes.push({e,n,positions,depths,indices});
 }
 return meshes;
}
