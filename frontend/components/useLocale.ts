"use client";
import {useSyncExternalStore} from 'react';
import {INTEGRATION_TEXT,Locale} from '../lib/i18n';
const subscribe=(fn:()=>void)=>{window.addEventListener('spherex-locale',fn);return ()=>window.removeEventListener('spherex-locale',fn);};
const snapshot=():Locale=>new URLSearchParams(window.location.search).get('lang')==='en'?'en':'es';
export function useLocale(){const locale=useSyncExternalStore(subscribe,snapshot,():Locale=>'es');return {locale,text:INTEGRATION_TEXT[locale],setLocale:(value:Locale)=>{const url=new URL(location.href);url.searchParams.set('lang',value);history.replaceState(null,'',url);document.documentElement.lang=value;window.dispatchEvent(new Event('spherex-locale'));}};}
