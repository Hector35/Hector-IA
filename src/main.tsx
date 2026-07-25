const root=document.getElementById('root');

document.documentElement.style.background='#000';
document.documentElement.style.colorScheme='dark';
document.body.style.margin='0';
document.body.style.minHeight='100dvh';
document.body.style.background='#000';
document.body.style.overflow='hidden';

if(root){
  root.setAttribute('aria-hidden','true');
  root.style.position='fixed';
  root.style.inset='0';
  root.style.background='#000';
  root.replaceChildren();
}

if('serviceWorker' in navigator){
  window.addEventListener('load',async()=>{
    const hadController=Boolean(navigator.serviceWorker.controller);
    let reloaded=false;
    navigator.serviceWorker.addEventListener('controllerchange',()=>{
      if(hadController&&!reloaded){
        reloaded=true;
        window.location.reload();
      }
    });
    try{
      const registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
      registration.waiting?.postMessage({type:'SKIP_WAITING'});
      await registration.update();
    }catch{}
  });
}
