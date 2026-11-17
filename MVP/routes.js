/* Canonical user routes. Technical editor resources remain at their original URLs. */
(function(G){'use strict';
const kinds=['menu','tutorial','main','import'];
const locale=()=>G.__PLAY12_LOCALE__||document.documentElement.lang||(/^\/ru\//.test(location.pathname)?'ru':'en');
const path=(kind,lang=locale())=>{if(!kinds.includes(kind))throw Error('Unknown Play12 route');return(lang==='ru'?'/ru':'')+'/MVP/'+kind+'/';};
const kind=pathname=>{const p=pathname.replace(/\/index\.html$/,'/').replace(/\/+$/,'')+'/';if(p==='/MVP/'||p==='/MVP/ru/')return'tutorial';if(p==='/MVP/editor/'||p==='/ru/MVP/editor/')return'import';return kinds.find(k=>p===path(k,'en')||p===path(k,'ru'))||null;};
const url=(type,lang=locale(),search=location.search,hash=location.hash)=>{const q=new URLSearchParams(search);if(q.has('lang'))q.set('lang',lang);return path(type,lang)+(q.size?'?'+q:'')+hash;};
function languages(container,type=kind(location.pathname)){if(!container||!type)return;const lang=locale();if(container.dataset.play12Kind===type&&container.dataset.play12Locale===lang){for(const a of container.querySelectorAll('a'))a.href=url(type,a.lang);return;}container.dataset.play12Kind=type;container.dataset.play12Locale=lang;container.innerHTML=lang==='ru'?'<a data-play12-language="en" lang="en">EN</a><span aria-hidden="true">/</span><span class="active-language mvp-active-language" aria-current="page">RU</span>':'<span class="active-language mvp-active-language" aria-current="page">EN</span><span aria-hidden="true">/</span><a data-play12-language="ru" lang="ru">RU</a>';for(const a of container.querySelectorAll('a')){a.href=url(type,a.lang);if(type==='tutorial')a.addEventListener('click',()=>sessionStorage.setItem('play12.tutorial.locale-resume','true'));}}
G.Play12Routes={path,kind,url,locale,languages};if(typeof module!=='undefined')module.exports=G.Play12Routes;
})(typeof window!=='undefined'?window:globalThis);
