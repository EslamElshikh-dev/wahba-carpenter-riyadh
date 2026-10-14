(() => {
  const q=(s,r=document)=>r.querySelector(s), qa=(s,r=document)=>Array.from(r.querySelectorAll(s));
  const menu=q('.menu-toggle'), nav=q('#site-nav');
  const closeMenu=()=>{nav?.classList.remove('open');menu?.setAttribute('aria-expanded','false');menu?.setAttribute('aria-label','فتح القائمة');};
  menu?.addEventListener('click',()=>{const open=menu.getAttribute('aria-expanded')!=='true';nav.classList.toggle('open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'إغلاق القائمة':'فتح القائمة');});
  document.addEventListener('click',e=>{if(!e.target.closest('.header'))closeMenu();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu();});
  qa('#site-nav a').forEach(a=>a.addEventListener('click',closeMenu));
  const header=q('.header'), back=q('.back-top');
  let tick=false;
  const scrollState=()=>{header?.classList.toggle('scrolled',window.scrollY>15);if(back)back.hidden=window.scrollY<800;tick=false;};
  window.addEventListener('scroll',()=>{if(!tick){requestAnimationFrame(scrollState);tick=true;}},{passive:true});scrollState();
  back?.addEventListener('click',()=>window.scrollTo({top:0,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if(!reduced&&'IntersectionObserver' in window){
    const targets=qa('.reveal');const ob=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');ob.unobserve(e.target);}}),{rootMargin:'0px 0px 70px 0px',threshold:.04});
    document.body.classList.add('motion-ready');targets.forEach(x=>ob.observe(x));
  }
  const galleryCards=qa('.gallery-card');
  qa('.filter').forEach(b=>b.addEventListener('click',()=>{qa('.filter').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-pressed',String(x===b));});galleryCards.forEach(c=>{c.hidden=b.dataset.filter!=='all'&&c.dataset.category!==b.dataset.filter;if(!c.hidden)c.classList.add('visible');});}));
  const dialog=q('.lightbox'), full=q('.lightbox>img'), caption=q('#lightbox-caption');let activePhoto=0,returnFocus;
  const visiblePhotos=()=>qa('.gallery-card:not([hidden]) .gallery-open');
  const showPhoto=i=>{const photos=visiblePhotos();if(!photos.length)return;activePhoto=(i+photos.length)%photos.length;full.src=photos[activePhoto].dataset.full;full.alt=photos[activePhoto].dataset.caption;full.width=Number(photos[activePhoto].dataset.width);full.height=Number(photos[activePhoto].dataset.height);caption.textContent=photos[activePhoto].dataset.caption;};
  if(dialog){
    qa('.gallery-open').forEach(b=>b.addEventListener('click',()=>{returnFocus=b;showPhoto(visiblePhotos().indexOf(b));if(typeof dialog.showModal==='function'){dialog.showModal();document.body.style.overflow='hidden';}else window.open(b.dataset.full,'_blank','noopener');}));
    q('.lightbox-close').addEventListener('click',()=>dialog.close());
    q('.lightbox-next').addEventListener('click',()=>showPhoto(activePhoto+1));q('.lightbox-prev').addEventListener('click',()=>showPhoto(activePhoto-1));
    dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
    dialog.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'){e.preventDefault();showPhoto(activePhoto+1);}if(e.key==='ArrowRight'){e.preventDefault();showPhoto(activePhoto-1);}});
    dialog.addEventListener('close',()=>{document.body.style.overflow='';returnFocus?.focus();});
  }
  const form=q('[data-brief]');
  const event=(name,detail={})=>window.wahbaAnalytics?.track(name,detail);
  qa('[data-event]').forEach(a=>a.addEventListener('click',()=>event(a.dataset.event,{page_path:location.pathname})));
  if(form){
    qa('input[name="mood"]',form).forEach(r=>r.addEventListener('change',()=>{const img=q('.mood-image'), label=q('.mood-label');if(img){img.src=r.dataset.image;img.removeAttribute('srcset');img.alt=`تصور تصميم بطابع ${r.value}`;}if(label)label.textContent=`طابع ${r.value}`;}));
    form.addEventListener('submit',e=>{
      e.preventDefault();if(!form.reportValidity())return;
      const d=new FormData(form);const text=['حياكم الله، عندي طلب لدى وهبة النجار في الرياض.',`الخدمة: ${d.get('service')}`,`الطابع: ${d.get('mood')}`,`الحي: ${String(d.get('district')).trim()}`,d.get('dimensions')?`المقاسات التقريبية: ${String(d.get('dimensions')).trim()}`:'',d.get('details')?`التفاصيل: ${String(d.get('details')).trim()}`:'','سأرفق صور المكان والفكرة هنا.'].filter(Boolean).join('\n');
      const link=document.createElement('a');link.href=`https://wa.me/966595080326?text=${encodeURIComponent(text)}`;link.target='_blank';link.rel='noopener noreferrer';document.body.appendChild(link);link.click();link.remove();
      event('quote_prepared',{page_path:location.pathname,service:d.get('service')});event('whatsapp_click',{page_path:location.pathname,source:'brief_form'});
      q('.form-status',form).textContent='تم تجهيز رسالة الطلب. أكمل إرسالها في واتساب وأرفق صور المساحة.';
    });
  }
})();
