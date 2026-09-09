interface LoadingTexture {isReady():boolean;loadingError:boolean;}
/** Do not let the player enter a scene whose textured surfaces are still invisible. */
export async function waitForTextures(textures:readonly LoadingTexture[],progress:(ready:number,total:number)=>void,timeoutMs=90000){
 const deadline=performance.now()+timeoutMs;
 for(;;){
  if(textures.some(t=>t.loadingError))throw new Error('Не удалось загрузить материалы леса. Проверьте соединение и перезагрузите страницу.');
  const ready=textures.filter(t=>t.isReady()).length;progress(ready,textures.length);
  if(ready===textures.length)return;
  if(performance.now()>=deadline)throw new Error('Материалы леса загружаются слишком долго. Проверьте соединение и повторите загрузку.');
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
