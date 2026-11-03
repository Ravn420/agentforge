import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(() => {
  return {
    plugins: [
        {
          name: 'hmr-websocket-shield',
          enforce: 'pre',
          transformIndexHtml: {
            order: 'pre',
            handler() {
              return [
                {
                  tag: 'script',
                  attrs: { type: 'text/javascript' },
                  injectTo: 'head-prepend',
                  children: `(function(){var o=console.error;console.error=function(){var m=Array.prototype.slice.call(arguments).map(function(a){return(a&&a.message)||String(a);}).join(" ");if(m.indexOf("WebSocket")!==-1||m.indexOf("vite-hmr")!==-1||m.indexOf("closed without opened")!==-1){return;}return o.apply(console,arguments);};var W=window.WebSocket;if(W){window.WebSocket=function(u,p){if(p==="vite-hmr"||p==="vite-ping"||(typeof u==="string"&&u.indexOf("vite")!==-1)){var l={};var s={binaryType:"blob",bufferedAmount:0,extensions:"",protocol:p||"",readyState:1,url:u,send:function(){},close:function(){s.readyState=3;},addEventListener:function(t,fn){if(!l[t])l[t]=[];l[t].push(fn);if(t==="open"){setTimeout(function(){try{fn({type:"open",target:s});}catch(e){}},0);}},removeEventListener:function(t,fn){if(l[t])l[t]=l[t].filter(function(c){return c!==fn;});},dispatchEvent:function(){return true;}};return s;}return new W(u,p);};window.WebSocket.prototype=W.prototype;window.WebSocket.CONNECTING=0;window.WebSocket.OPEN=1;window.WebSocket.CLOSING=2;window.WebSocket.CLOSED=3;}window.addEventListener("error",function(e){if(e&&(e.message&&(e.message.indexOf("WebSocket")!==-1||e.message.indexOf("closed without opened")!==-1)||(e.filename&&e.filename.indexOf("@vite/client")!==-1))){e.stopImmediatePropagation();e.preventDefault();return true;}},true);window.addEventListener("unhandledrejection",function(e){var r=e&&(e.reason?(e.reason.message||String(e.reason)):"");if(r&&(r.indexOf("WebSocket")!==-1||r.indexOf("closed without opened")!==-1)){e.stopImmediatePropagation();e.preventDefault();return true;}},true);})();`,
                },
              ];
            },
          },
        },
        react(), 
        tailwindcss(),
        VitePWA({
          registerType: 'autoUpdate',
          injectRegister: null,
          manifest: false,
          workbox: {
            maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
          },
          devOptions: {
            enabled: true,
            type: 'module',
          },
        })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
