import { grammarJson } from "./match";

// Not a .gz name: static hosts treat that suffix as Content-Encoding and would
// unwrap the archive before Vosk can.
export const VOICE_MODEL_URL = "/vosk/model.bin";
export const VOICE_VOCAB_URL = "/vosk/words.txt";

export type VoicePhase = "requesting-mic" | "loading-model" | "listening";
export type ListenSource = "grammar" | "free";

export interface HeardFinal {
  text: string;
  confidence: number | null;
  source: ListenSource;
}

export type VoiceFailure =
  | { type: "denied" }
  | { type: "unsupported" }
  | { type: "no-model-offline" }
  | { type: "failed"; message: string };

type Model = import("vosk-browser").Model;
type KaldiRecognizer = import("vosk-browser").KaldiRecognizer;

interface StartHandlers {
  tags: string[];
  onPhase: (phase: VoicePhase) => void;
  onProgress: (ratio: number | null) => void;
  onPartial: (text: string) => void;
  onFinal: (heard: HeardFinal) => void;
  onSource: (source: "on-device" | "browser") => void;
  onFailed: (message: string) => void;
}

let modelPromise: Promise<Model> | null = null;
let vocabPromise: Promise<Set<string> | null> | null = null;

function isDenied(error: unknown): boolean {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  return name === "NotAllowedError" || name === "PermissionDeniedError" || name === "SecurityError";
}

function isMissingMic(error: unknown): boolean {
  const name = error instanceof DOMException || error instanceof Error ? error.name : "";
  return name === "NotFoundError" || name === "NotReadableError";
}

async function loadVocab(): Promise<Set<string> | null> {
  if (!vocabPromise) {
    vocabPromise = fetch(VOICE_VOCAB_URL)
      .then(async (res) => {
        if (!res.ok) return null;
        const text = await res.text();
        return new Set(text.split(/\s+/).filter(Boolean));
      })
      .catch(() => null);
  }
  return vocabPromise;
}

async function readModel(onProgress: (ratio: number | null) => void): Promise<Uint8Array> {
  const res = await fetch(VOICE_MODEL_URL);
  if (!res.ok || !res.body) throw new Error("Voice model is missing.");
  const total = Number(res.headers.get("content-length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let got = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    got += value.byteLength;
    if (total > 0) onProgress(Math.min(0.98, got / total));
  }
  const bytes = new Uint8Array(got);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  onProgress(null);
  return bytes;
}

function getModel(onProgress: (ratio: number | null) => void): Promise<Model> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const { createModel } = await import("vosk-browser");
      // Read once so the service worker / HTTP cache holds the archive and the
      // sheet can show progress. Vosk then fetches the stable URL, which is
      // also the key for its IndexedDB unpack — a blob URL would unpack again
      // on every visit.
      await readModel(onProgress);
      return await createModel(new URL(VOICE_MODEL_URL, window.location.href).href, -1);
    })().catch((error: unknown) => {
      modelPromise = null;
      throw error;
    });
  }
  return modelPromise;
}

function meanConfidence(words: Array<{ conf?: number }> | undefined): number | null {
  if (!words?.length) return null;
  const values = words.map((word) => word.conf).filter((value): value is number => typeof value === "number");
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

interface BrowserSpeechAlternative {
  transcript: string;
  confidence: number;
}

interface BrowserSpeechResult {
  isFinal: boolean;
  [index: number]: BrowserSpeechAlternative;
}

interface BrowserSpeech {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<BrowserSpeechResult> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function browserRecognition(): { new (): BrowserSpeech } | null {
  const host = window as Window & {
    SpeechRecognition?: { new (): BrowserSpeech };
    webkitSpeechRecognition?: { new (): BrowserSpeech };
  };
  return host.SpeechRecognition ?? host.webkitSpeechRecognition ?? null;
}

function openAudioContext(): AudioContext {
  const host = window as Window & { webkitAudioContext?: typeof AudioContext };
  const Ctor = window.AudioContext || host.webkitAudioContext;
  if (!Ctor) throw new Error("This browser has no audio engine.");
  return new Ctor();
}

/**
 * Keeps the microphone open and emits one phrase each time the speaker pauses.
 * On-device Vosk is the primary path. Browser speech is only a fallback when
 * the model cannot load and the phone is online.
 */
export class VoiceSession {
  private stopped = false;
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private processor: ScriptProcessorNode | null = null;
  private mute: GainNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private model: Model | null = null;
  private recognizer: KaldiRecognizer | null = null;
  private web: BrowserSpeech | null = null;
  private tags: string[] = [];
  private vocab: Set<string> | null = null;
  private handlers: StartHandlers | null = null;
  private usingGrammar = true;
  private generation = 0;

  async start(handlers: StartHandlers): Promise<void> {
    this.stopped = false;
    this.handlers = handlers;
    this.tags = handlers.tags;
    if (!navigator.mediaDevices?.getUserMedia) {
      throw { type: "unsupported" } satisfies VoiceFailure;
    }
    handlers.onPhase("requesting-mic");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch (error) {
      if (isDenied(error)) throw { type: "denied" } satisfies VoiceFailure;
      if (isMissingMic(error)) throw { type: "unsupported" } satisfies VoiceFailure;
      throw { type: "unsupported" } satisfies VoiceFailure;
    }
    if (this.stopped) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.stream = stream;
    try {
      this.context = openAudioContext();
      await this.context.resume();
    } catch {
      this.stopTracks();
      throw { type: "unsupported" } satisfies VoiceFailure;
    }

    handlers.onPhase("loading-model");
    try {
      this.vocab = await loadVocab();
      this.model = await getModel(handlers.onProgress);
    } catch (error) {
      if (!navigator.onLine) {
        this.stopTracks();
        throw { type: "no-model-offline" } satisfies VoiceFailure;
      }
      const Browser = browserRecognition();
      if (!Browser) {
        this.stopTracks();
        const message = error instanceof Error ? error.message : "Could not load offline speech.";
        throw { type: "failed", message } satisfies VoiceFailure;
      }
      this.stopTracks();
      this.startBrowser(Browser);
      return;
    }
    if (this.stopped) return;
    this.usingGrammar = true;
    this.mountRecognizer();
    this.mountMeter();
    handlers.onSource("on-device");
    handlers.onPhase("listening");
  }

  updateTags(tags: string[]) {
    this.tags = tags;
    if (!this.model || this.stopped || this.web) return;
    this.mountRecognizer();
  }

  beep(kind: "ok" | "choose" | "unknown") {
    const ctx = this.context;
    if (!ctx || ctx.state === "closed") return;
    void ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.connect(gain);
    gain.connect(ctx.destination);
    const now = ctx.currentTime;
    const freqs = kind === "ok" ? [784, 1174] : kind === "choose" ? [494, 392] : [220, 165];
    osc.frequency.setValueAtTime(freqs[0] ?? 440, now);
    if (freqs[1]) osc.frequency.setValueAtTime(freqs[1], now + 0.09);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.15, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24);
    osc.start(now);
    osc.stop(now + 0.26);
    if (navigator.vibrate) {
      if (kind === "ok") navigator.vibrate(20);
      else if (kind === "choose") navigator.vibrate([18, 40, 18]);
      else navigator.vibrate([28, 50, 28]);
    }
  }

  stop() {
    this.stopped = true;
    this.generation += 1;
    try {
      this.web?.stop();
    } catch {
      /* already stopped */
    }
    this.web = null;
    this.recognizer?.remove();
    this.recognizer = null;
    this.processor?.disconnect();
    this.sourceNode?.disconnect();
    this.mute?.disconnect();
    this.processor = null;
    this.sourceNode = null;
    this.mute = null;
    this.stopTracks();
    const ctx = this.context;
    this.context = null;
    if (ctx && ctx.state !== "closed") void ctx.close();
  }

  private stopTracks() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
  }

  private mountRecognizer() {
    const model = this.model;
    const ctx = this.context;
    const handlers = this.handlers;
    if (!model || !ctx || !handlers) return;
    this.recognizer?.remove();
    const generation = ++this.generation;
    const grammar = this.usingGrammar ? grammarJson(this.tags, this.vocab) : undefined;
    let recognizer: KaldiRecognizer;
    try {
      recognizer = grammar
        ? new model.KaldiRecognizer(ctx.sampleRate, grammar)
        : new model.KaldiRecognizer(ctx.sampleRate);
    } catch {
      if (grammar && this.usingGrammar) {
        this.usingGrammar = false;
        this.mountRecognizer();
      }
      return;
    }
    this.recognizer = recognizer;
    recognizer.setWords(true);
    recognizer.on("partialresult", (message) => {
      if (generation !== this.generation || this.stopped || message.event !== "partialresult") return;
      handlers.onPartial(message.result.partial ?? "");
    });
    recognizer.on("result", (message) => {
      if (generation !== this.generation || this.stopped || message.event !== "result") return;
      const text = message.result.text.replace(/\[unk\]/g, " ").replace(/\s+/g, " ").trim();
      handlers.onPartial("");
      if (!text) return;
      handlers.onFinal({
        text,
        confidence: meanConfidence(message.result.result),
        source: this.usingGrammar ? "grammar" : "free",
      });
    });
    recognizer.on("error", (message) => {
      if (generation !== this.generation || message.event !== "error") return;
      const text = message.error.toLowerCase();
      if (this.usingGrammar && (text.includes("grammar") || text.includes("word") || text.includes("symbol"))) {
        this.usingGrammar = false;
        this.mountRecognizer();
        return;
      }
      if (text.includes("not ready")) return;
      handlers.onFailed(message.error);
    });
  }

  private mountMeter() {
    const ctx = this.context;
    const stream = this.stream;
    if (!ctx || !stream || this.processor) return;
    const source = ctx.createMediaStreamSource(stream);
    const processor = ctx.createScriptProcessor(4096, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    processor.onaudioprocess = (event) => {
      if (this.stopped) return;
      try {
        this.recognizer?.acceptWaveform(event.inputBuffer);
      } catch {
        /* recognizer swapped mid-buffer */
      }
    };
    source.connect(processor);
    processor.connect(mute);
    mute.connect(ctx.destination);
    this.sourceNode = source;
    this.processor = processor;
    this.mute = mute;
  }

  private startBrowser(Browser: { new (): BrowserSpeech }) {
    const handlers = this.handlers;
    if (!handlers) return;
    const rec = new Browser();
    this.web = rec;
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result?.[0]?.transcript ?? "";
        if (result?.isFinal) {
          const confidence = typeof result[0]?.confidence === "number" ? result[0].confidence : null;
          handlers.onFinal({ text, confidence, source: "free" });
        } else {
          interim += text;
        }
      }
      if (interim) handlers.onPartial(interim);
    };
    rec.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        handlers.onPhase("listening");
      }
    };
    rec.onend = () => {
      if (this.stopped || this.web !== rec) return;
      try {
        rec.start();
      } catch {
        /* start while already started */
      }
    };
    try {
      rec.start();
    } catch {
      this.stopTracks();
      throw { type: "failed", message: "Browser speech could not start." } satisfies VoiceFailure;
    }
    handlers.onSource("browser");
    handlers.onPhase("listening");
  }
}
