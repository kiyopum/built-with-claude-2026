"use client";

// 録音ボタンの中身。
//   1) 話した言葉をその場で文字にする（Web Speech API・無料）
//   2) 同時に録音ファイルも残す（MediaRecorder）
// iPhone Safari・Mac で同時に動くことを実機で確認済み（2026-11-03）。
// どちらかが使えない端末でも、使える方だけで動く（手入力はいつでも可）。
import { useCallback, useEffect, useRef, useState } from "react";

type SRResult = ArrayLike<{ transcript: string }> & { isFinal: boolean };
type SR = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<SRResult> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};

function getSR(): (new () => SR) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: new () => SR; webkitSpeechRecognition?: new () => SR };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function pickMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"]) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return "";
}

export type Recording = { blob: Blob; seconds: number };

export function useVoiceInput(onFinalText: (text: string) => void) {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [warning, setWarning] = useState("");

  const srRef = useRef<SR | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activeRef = useRef(false);
  const srFailedRef = useRef(false);
  const secondsRef = useRef(0);
  const onFinalRef = useRef(onFinalText);
  useEffect(() => {
    onFinalRef.current = onFinalText;
  }, [onFinalText]);

  const startSpeech = useCallback(() => {
    const C = getSR();
    if (!C) {
      setWarning("この端末では、その場で文字にする機能が使えません。録音は残るので、文字は手で入れてください。");
      return;
    }
    const sr = new C();
    sr.lang = "ja-JP";
    sr.continuous = true;
    sr.interimResults = true;
    sr.onresult = (e) => {
      let fin = "";
      let mid = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) fin += r[0].transcript;
        else mid += r[0].transcript;
      }
      if (fin.trim()) onFinalRef.current(fin.trim());
      setInterim(mid);
    };
    sr.onerror = (e) => {
      // 無音（no-speech）は再開すればよい。それ以外は止める
      if (e.error === "no-speech" || e.error === "aborted") return;
      srFailedRef.current = true;
      setWarning(
        e.error === "not-allowed" || e.error === "service-not-allowed"
          ? "文字起こしが許可されていません。iPhone の 設定 → 一般 → キーボード →「音声入力」をオンにしてください。録音は続いています。"
          : `文字起こしが止まりました（${e.error}）。録音は続いています。`,
      );
    };
    // iPhone は無音が続くと止まるので、録音中なら自動で再開する
    sr.onend = () => {
      setInterim("");
      if (activeRef.current && !srFailedRef.current) {
        try {
          sr.start();
        } catch {
          /* すでに動いている場合は無視 */
        }
      }
    };
    srRef.current = sr;
    try {
      sr.start();
    } catch {
      setWarning("文字起こしを始められませんでした。録音は続いています。");
    }
  }, []);

  const start = useCallback(async () => {
    setWarning("");
    setInterim("");
    srFailedRef.current = false;
    activeRef.current = true;
    secondsRef.current = 0;
    setSeconds(0);

    // 録音（先にマイクを取る）
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = pickMime();
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        const blob = new Blob(chunks, { type: rec.mimeType || mime });
        if (blob.size > 0) setRecordings((r) => [...r, { blob, seconds: secondsRef.current }]);
      };
      rec.start(); // iPhone は細切れ指定（timeslice）にすると空になることがあるので指定しない
      recRef.current = rec;
    } catch {
      setWarning("マイクを使えませんでした。ブラウザのマイクの許可を確認してください。文字は手で入れられます。");
    }

    startSpeech();
    setRecording(true);
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
    }, 1000);
  }, [startSpeech]);

  const stop = useCallback(() => {
    activeRef.current = false;
    srRef.current?.stop();
    srRef.current = null;
    if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    recRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    setRecording(false);
    setInterim("");
  }, []);

  const clearRecordings = useCallback(() => setRecordings([]), []);

  return { recording, interim, seconds, recordings, warning, start, stop, clearRecordings };
}
