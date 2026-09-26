import {useEffect,useRef} from 'react';
export function useDialog(onEscape:()=>void, active=true) {
  const ref=useRef<HTMLDivElement>(null);
  const escape=useRef(onEscape); escape.current=onEscape;
  useEffect(()=>{
    if(!active)return;
    const previous=document.activeElement as HTMLElement|null;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    ref.current?.focus();
    const handler=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();escape.current();}
      if(e.key==='Tab'){
        const nodes=Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href],[tabindex="0"]')||[]).filter(n=>n.getClientRects().length&&!n.closest('[inert]'));
        const first=nodes[0],last=nodes[nodes.length-1];
        if(!first){e.preventDefault();return;}
        if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',handler);
    return()=>{document.body.style.overflow=oldOverflow;document.removeEventListener('keydown',handler);previous?.focus();};
  },[active]);
  return ref;
}
