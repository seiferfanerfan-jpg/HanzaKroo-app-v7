export function createSpeechBridge(trustedHost: string): string {
  const host = JSON.stringify(trustedHost.toLowerCase());
  return `(function(){
    try {
      if (location.hostname.toLowerCase() !== ${host} || !window.ReactNativeWebView) return true;
      var send = function(payload){ window.ReactNativeWebView.postMessage(JSON.stringify(payload)); };
      var listeners = {};
      var dispatch = function(type, detail){
        var event = new Event(type);
        if (detail) Object.keys(detail).forEach(function(key){ try { event[key] = detail[key]; } catch(e){} });
        (listeners[type] || []).slice().forEach(function(fn){ try { fn(event); } catch(e){} });
        if (type === 'voiceschanged' && window.speechSynthesis && typeof window.speechSynthesis.onvoiceschanged === 'function') { try { window.speechSynthesis.onvoiceschanged(event); } catch(e){} }
      };
      window.__hanzakroNativeEvent = function(payload){
        if (!payload) return;
        if (payload.kind === 'voices') {
          window.__hanzakroVoices = payload.voices || [];
          dispatch('voiceschanged');
          return;
        }
        if (payload.kind === 'tts') {
          var utterance = window.__hanzakroUtterances && window.__hanzakroUtterances[payload.id];
          if (utterance) {
            var eventName = payload.name === 'start' ? 'start' : payload.name === 'error' ? 'error' : 'end';
            var utteranceEvent = new Event(eventName);
            utteranceEvent.error = payload.error || '';
            try { utterance.dispatchEvent(utteranceEvent); } catch(e){}
            if (eventName !== 'start') delete window.__hanzakroUtterances[payload.id];
          }
          return;
        }
        if (payload.kind === 'recognition') {
          var rec = window.__hanzakroRecognition;
          if (!rec) return;
          var evt = new Event(payload.name || 'error');
          if (payload.name === 'result') {
            var item = { transcript: payload.transcript || '', confidence: payload.confidence || 0 };
            var list = [item]; list.isFinal = !!payload.isFinal;
            evt.results = [list]; evt.resultIndex = 0;
          }
          if (payload.name === 'error') { evt.error = payload.error || 'service-not-allowed'; evt.message = payload.message || ''; }
          try { if (typeof rec['on' + evt.type] === 'function') rec['on' + evt.type](evt); } catch(e){}
          try { rec.dispatchEvent(evt); } catch(e){}
        }
      };
      if (!window.SpeechSynthesisUtterance || !window.speechSynthesis || typeof window.speechSynthesis.speak !== 'function') {
        window.__hanzakroUtterances = {};
        window.SpeechSynthesisUtterance = function(text){ this.text = String(text || ''); this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.onstart = this.onend = this.onerror = this.onpause = this.onresume = null; this._id = String(Date.now()) + Math.random().toString(16).slice(2); };
        window.SpeechSynthesisUtterance.prototype.addEventListener = function(type, fn){ this._listeners=this._listeners||{}; this._listeners[type]=this._listeners[type]||[]; this._listeners[type].push(fn); };
        window.SpeechSynthesisUtterance.prototype.removeEventListener = function(type, fn){ this._listeners=this._listeners||{}; this._listeners[type]=(this._listeners[type]||[]).filter(function(x){return x!==fn;}); };
        window.SpeechSynthesisUtterance.prototype.dispatchEvent = function(event){ try { var handler=this['on'+event.type]; if(typeof handler==='function') handler.call(this,event); } catch(e){} (this._listeners&&this._listeners[event.type]||[]).slice().forEach(function(fn){try{fn(event)}catch(e){}}); return true; };
        window.speechSynthesis = {
          speaking:false, paused:false, pending:false, onvoiceschanged:null,
          getVoices:function(){ return window.__hanzakroVoices || []; },
          speak:function(u){ if(!u) return; window.__hanzakroUtterances[u._id]=u; this.speaking=true; this.pending=false; send({type:'tts_speak',id:u._id,text:u.text,lang:u.lang,rate:u.rate,pitch:u.pitch,volume:u.volume}); },
          cancel:function(){ this.speaking=false; this.pending=false; this.paused=false; send({type:'tts_cancel'}); },
          pause:function(){ this.paused=true; send({type:'tts_pause'}); },
          resume:function(){ this.paused=false; send({type:'tts_resume'}); },
          addEventListener:function(type,fn){ listeners[type]=listeners[type]||[]; listeners[type].push(fn); },
          removeEventListener:function(type,fn){ listeners[type]=(listeners[type]||[]).filter(function(x){return x!==fn;}); },
          dispatchEvent:function(event){ dispatch(event.type); return true; }
        };
        send({type:'tts_get_voices'});
      }
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        var Recognition = function(){ this.lang='en-US'; this.continuous=false; this.interimResults=false; this.maxAlternatives=1; this.onstart=this.onend=this.onerror=this.onresult=null; this._listeners={}; };
        Recognition.prototype.addEventListener=function(t,f){ this._listeners[t]=this._listeners[t]||[]; this._listeners[t].push(f); };
        Recognition.prototype.removeEventListener=function(t,f){ this._listeners[t]=(this._listeners[t]||[]).filter(function(x){return x!==f;}); };
        Recognition.prototype.dispatchEvent=function(e){ (this._listeners[e.type]||[]).forEach(function(f){try{f(e)}catch(x){}}); };
        Recognition.prototype.start=function(){ window.__hanzakroRecognition=this; send({type:'recognition_start',lang:this.lang,continuous:this.continuous,interimResults:this.interimResults,maxAlternatives:this.maxAlternatives}); };
        Recognition.prototype.stop=function(){ send({type:'recognition_stop'}); };
        Recognition.prototype.abort=function(){ send({type:'recognition_abort'}); };
        window.SpeechRecognition=Recognition; window.webkitSpeechRecognition=Recognition;
      }
      document.addEventListener('fullscreenchange', function(){ send({type:'fullscreen',active:!!document.fullscreenElement}); });
    } catch(e) {}
    return true;
  })();true;`;
}
