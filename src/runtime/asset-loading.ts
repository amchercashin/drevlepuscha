const requests=new Map<string,Promise<unknown>>();
/** A scene may start its requests in boot and consume the same promises later. */
export function loadJSON<T>(url:string):Promise<T>{
 let request=requests.get(url);
 if(!request){
  request=fetch(url).then(r=>{if(!r.ok)throw Error(`Не удалось загрузить ${url}`);return r.json();});
  requests.set(url,request);
  void request.catch(()=>requests.delete(url));
 }
 return request as Promise<T>;
}
const preloaded=new Set<string>();
export function preloadImages(urls:readonly string[]){
 for(const url of urls){if(preloaded.has(url))continue;preloaded.add(url);
  // WebGPU's image-bitmap path reads bytes with XHR, not an <img> request.
  // Match its destination and CORS mode so preload is consumed instead of fetched twice.
  const link=document.createElement('link');link.rel='preload';link.as='fetch';link.crossOrigin='anonymous';link.href=url;document.head.append(link);
 }
}
