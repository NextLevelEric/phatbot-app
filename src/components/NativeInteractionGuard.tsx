"use client";

import {useEffect} from "react";

export default function NativeInteractionGuard(){
  useEffect(()=>{
    const style=document.createElement("style");
    style.dataset.phatbotNativeInteraction="true";
    style.textContent=`
      a, button, [role="button"], [data-phatbot-longpress="true"] {
        -webkit-touch-callout: none !important;
        -webkit-user-select: none !important;
        user-select: none !important;
      }
      img { -webkit-user-drag: none; }
      [data-phatbot-longpress="true"] * {
        -webkit-user-select: none !important;
        user-select: none !important;
      }
    `;
    document.head.appendChild(style);
    const onContext=(event:Event)=>{
      const target=event.target as HTMLElement|null;
      if(target?.closest("a,button,[role='button'],[data-phatbot-longpress='true']")) event.preventDefault();
    };
    document.addEventListener("contextmenu",onContext,{capture:true});
    return()=>{style.remove();document.removeEventListener("contextmenu",onContext,{capture:true} as EventListenerOptions)};
  },[]);
  return null;
}
