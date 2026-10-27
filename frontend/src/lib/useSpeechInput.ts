import { useEffect, useRef, useState } from "react";

// Voice input via the Web Speech API (Chrome, Edge, Safari). `supported` is
// false elsewhere, so callers can hide the mic button. Recognition happens in
// the browser/OS; nothing is sent to Jaziba until the text is submitted.
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}

const LOCALES: Record<string, string> = { ja: "ja-JP", en: "en-US", zh: "zh-CN", ko: "ko-KR" };

function getRecognitionCtor(): (new () => RecognitionLike) | null {
  const w = window as unknown as { SpeechRecognition?: new () => RecognitionLike; webkitSpeechRecognition?: new () => RecognitionLike };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useSpeechInput(lang: string, onText: (text: string, final: boolean) => void) {
  const [listening, setListening] = useState(false);
  const recRef = useRef<RecognitionLike | null>(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const supported = getRecognitionCtor() !== null;

  useEffect(() => () => recRef.current?.stop(), []);

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor || listening) return;
    const rec = new Ctor();
    rec.lang = LOCALES[lang] ?? "ja-JP";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final = e.results[i].isFinal;
      }
      onTextRef.current(text, final);
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
  }

  return { supported, listening, start, stop };
}
