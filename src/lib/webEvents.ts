export type BridgeMessage =
  | { type: 'tts_speak'; id: string; text: string; lang?: string; rate?: number; pitch?: number; volume?: number }
  | { type: 'tts_cancel' | 'tts_pause' | 'tts_resume' | 'tts_get_voices' }
  | { type: 'recognition_start'; lang?: string; continuous?: boolean; interimResults?: boolean; maxAlternatives?: number }
  | { type: 'recognition_stop' | 'recognition_abort' }
  | { type: 'fullscreen'; active: boolean };

export function makePageEvent(payload: Record<string, unknown>): string {
  return `window.__hanzakroNativeEvent && window.__hanzakroNativeEvent(${JSON.stringify(payload)});true;`;
}
