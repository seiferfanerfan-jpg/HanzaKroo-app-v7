export function createSpeechBridge(trustedOrigin: string): string {
  const origin = JSON.stringify(trustedOrigin);
  return `(function(){
    try {
      if (location.origin !== ${origin} || !window.ReactNativeWebView) return true;
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
        if (payload.kind === 'tts-reset') {
          var speech = window.speechSynthesis;
          if (speech && typeof speech.cancel === 'function') { try { speech.cancel(); } catch(e){} }
          var utterancesToClose = window.__hanzakroUtterances || {};
          Object.keys(utterancesToClose).forEach(function(id){ try { utterancesToClose[id].dispatchEvent(new Event('end')); } catch(e){} delete utterancesToClose[id]; });
          if (speech) { try { speech.speaking=false; speech.pending=false; speech.paused=false; } catch(e){} }
          return;
        }
        if (payload.kind === 'voices') {
          window.__hanzakroVoices = payload.voices || [];
          dispatch('voiceschanged');
          return;
        }
        if (payload.kind === 'tts') {
          var synthesis = window.speechSynthesis;
          var utterances = window.__hanzakroUtterances || {};
          var utterance = utterances[payload.id];
          if (utterance) {
            var eventName = payload.name === 'start' ? 'start' : payload.name === 'error' ? 'error' : 'end';
            var utteranceEvent = new Event(eventName);
            utteranceEvent.error = payload.error || '';
            try { utterance.dispatchEvent(utteranceEvent); } catch(e){}
            if (eventName !== 'start') delete utterances[payload.id];
            synthesis.speaking = Object.keys(utterances).length > 0;
            synthesis.pending = false;
            if (eventName !== 'start') synthesis.paused = false;
          } else if (!payload.id && payload.name === 'error') {
            synthesis.paused = false;
            dispatch('error', { error: payload.error || 'not-supported' });
          }
          return;
        }
        if (payload.kind === 'recognition') {
          var rec = window.__hanzakroRecognition;
          if (!rec || !payload.sessionId || payload.sessionId !== rec._sessionId) return;
          var evt = new Event(payload.name || 'error');
          if (payload.name === 'result') {
            var item = { transcript: payload.transcript || '', confidence: payload.confidence || 0 };
            var list = [item]; list.isFinal = !!payload.isFinal;
            evt.results = [list]; evt.resultIndex = 0;
          }
          if (payload.name === 'error') { evt.error = payload.error || 'service-not-allowed'; evt.message = payload.message || ''; }
          try { if (typeof rec['on' + evt.type] === 'function') rec['on' + evt.type](evt); } catch(e){}
          try { rec.dispatchEvent(evt); } catch(e){}
          if (payload.name === 'end' || payload.name === 'error') {
            rec._sessionId = null;
            window.__hanzakroRecognition = null;
          }
        }
      };
      if (!window.SpeechSynthesisUtterance || !window.speechSynthesis || typeof window.speechSynthesis.speak !== 'function') {
        window.__hanzakroUtterances = {};
        window.SpeechSynthesisUtterance = function(text){ this.text = String(text || ''); this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.onstart = this.onend = this.onerror = this.onpause = this.onresume = null; this._id = String(Date.now()) + Math.random().toString(16).slice(2); this._listeners = {}; };
        window.SpeechSynthesisUtterance.prototype.addEventListener = function(type, fn){ this._listeners[type]=this._listeners[type]||[]; this._listeners[type].push(fn); };
        window.SpeechSynthesisUtterance.prototype.removeEventListener = function(type, fn){ this._listeners[type]=(this._listeners[type]||[]).filter(function(x){return x!==fn;}); };
        window.SpeechSynthesisUtterance.prototype.dispatchEvent = function(event){ try { var handler=this['on'+event.type]; if(typeof handler==='function') handler.call(this,event); } catch(e){} (this._listeners[event.type]||[]).slice().forEach(function(fn){try{fn(event)}catch(e){}}); return true; };
        window.speechSynthesis = {
          speaking:false, paused:false, pending:false, onvoiceschanged:null,
          getVoices:function(){ return window.__hanzakroVoices || []; },
          speak:function(utterance){
            if(!utterance) return;
            var wasSpeaking = this.speaking;
            window.__hanzakroUtterances[utterance._id] = utterance;
            this.pending = wasSpeaking;
            send({type:'tts_speak',id:utterance._id,text:utterance.text,lang:utterance.lang,rate:utterance.rate,pitch:utterance.pitch,volume:utterance.volume});
          },
          cancel:function(){
            var utterances = window.__hanzakroUtterances;
            Object.keys(utterances).forEach(function(id){ try { utterances[id].dispatchEvent(new Event('end')); } catch(e){} delete utterances[id]; });
            this.speaking=false; this.pending=false; this.paused=false; send({type:'tts_cancel'});
          },
          pause:function(){ this.paused=true; send({type:'tts_pause'}); },
          resume:function(){ this.paused=false; send({type:'tts_resume'}); },
          addEventListener:function(type,fn){ listeners[type]=listeners[type]||[]; listeners[type].push(fn); },
          removeEventListener:function(type,fn){ listeners[type]=(listeners[type]||[]).filter(function(x){return x!==fn;}); },
          dispatchEvent:function(event){ dispatch(event.type); return true; }
        };
        send({type:'tts_get_voices'});
      }
      if (!window.SpeechRecognition && !window.webkitSpeechRecognition) {
        var sessionCounter = 0;
        var Recognition = function(){ this.lang='en-US'; this.continuous=false; this.interimResults=false; this.maxAlternatives=1; this.onstart=this.onend=this.onerror=this.onresult=null; this._listeners={}; this._sessionId=null; };
        Recognition.prototype.addEventListener=function(type,fn){ this._listeners[type]=this._listeners[type]||[]; this._listeners[type].push(fn); };
        Recognition.prototype.removeEventListener=function(type,fn){ this._listeners[type]=(this._listeners[type]||[]).filter(function(x){return x!==fn;}); };
        Recognition.prototype.dispatchEvent=function(event){ (this._listeners[event.type]||[]).slice().forEach(function(fn){try{fn(event)}catch(e){}}); return true; };
        Recognition.prototype.start=function(){
          if(this._sessionId || (window.__hanzakroRecognition && window.__hanzakroRecognition._sessionId)) throw new Error('InvalidStateError: recognition is already active.');
          this._sessionId = String(Date.now()) + '-' + (++sessionCounter) + '-' + Math.random().toString(36).slice(2,8);
          window.__hanzakroRecognition=this;
          send({type:'recognition_start',sessionId:this._sessionId,lang:this.lang,continuous:this.continuous,interimResults:this.interimResults,maxAlternatives:this.maxAlternatives});
        };
        Recognition.prototype.stop=function(){ if(!this._sessionId) throw new Error('InvalidStateError: recognition is not active.'); send({type:'recognition_stop',sessionId:this._sessionId}); };
        Recognition.prototype.abort=function(){ if(!this._sessionId) return; send({type:'recognition_abort',sessionId:this._sessionId}); };
        window.SpeechRecognition=Recognition; window.webkitSpeechRecognition=Recognition;
      }
      document.addEventListener('fullscreenchange', function(){ send({type:'fullscreen',active:!!document.fullscreenElement}); });
    } catch(e) {}
    return true;
  })();true;`;
}
