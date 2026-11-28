import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Trash2, Volume2 } from 'lucide-react';
import { MAX_VOICE_NOTE_BYTES, MAX_VOICE_NOTE_SECONDS, VOICE_NOTE_TYPES } from './voice-note-config';

function formatDuration(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
}

function recordingType() {
  if (typeof MediaRecorder === 'undefined') return '';
  return VOICE_NOTE_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

export function VoiceNoteRecorder({
  file,
  duration,
  onChange,
  disabled,
  testId,
}: {
  file: File | null;
  duration: number;
  onChange: (file: File | null, duration: number) => void;
  disabled: boolean;
  testId: string;
}) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => () => {
    if (timerRef.current) clearInterval(timerRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (recorderRef.current?.state === 'recording') {
      recorderRef.current.onstop = null;
      recorderRef.current.stop();
    }
  }, []);

  async function startRecording() {
    setError('');
    setElapsed(0);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setError('Audio recording is not supported in this browser.');
      return;
    }
    const type = recordingType();
    if (!type) {
      setError('This browser cannot record a supported audio format.');
      return;
    }
    let stream: MediaStream | null = null;
    try {
      const recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream = recordingStream;
      const recorder = new MediaRecorder(recordingStream, { mimeType: type });
      streamRef.current = recordingStream;
      recorderRef.current = recorder;
      chunksRef.current = [];
      startedAtRef.current = Date.now();
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        setRecording(false);
        const seconds = Math.max(1, Math.min(MAX_VOICE_NOTE_SECONDS, Math.round((Date.now() - startedAtRef.current) / 1000)));
        const mimeType = (recorder.mimeType || type).split(';')[0].trim().toLowerCase();
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size > MAX_VOICE_NOTE_BYTES) {
          setError('This recording is too large. Record a shorter voice note.');
        } else if (blob.size > 0) {
          const extension = mimeType === 'audio/mp4' ? 'm4a' : mimeType === 'audio/ogg' ? 'ogg' : mimeType === 'audio/wav' ? 'wav' : 'webm';
          onChange(new File([blob], `voice-note.${extension}`, { type: mimeType }), seconds);
        } else {
          setError('The recording was empty. Please try again.');
        }
        recordingStream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        chunksRef.current = [];
      };
      recorder.start();
      setRecording(true);
      timerRef.current = setInterval(() => {
        const seconds = Math.floor((Date.now() - startedAtRef.current) / 1000);
        setElapsed(Math.min(seconds, MAX_VOICE_NOTE_SECONDS));
        if (seconds >= MAX_VOICE_NOTE_SECONDS) stopRecording();
      }, 250);
    } catch {
      stream?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      recorderRef.current = null;
      setError('Microphone access was not available. Allow microphone access and try again.');
    }
  }

  function stopRecording() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }

  return <div className="flex min-w-0 flex-wrap items-center gap-2" data-testid={`${testId}-voice-control`}>
    {!file && !recording && <button type="button" onClick={() => void startRecording()} disabled={disabled} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-secondary hover:text-primary disabled:opacity-50" data-testid={`${testId}-record`}>
      <Mic className="h-4 w-4" />Record voice note
    </button>}
    {recording && <button type="button" onClick={stopRecording} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-destructive/10 px-2.5 text-xs font-semibold text-destructive" data-testid={`${testId}-stop`}>
      <Square className="h-3.5 w-3.5 fill-current" />Stop · {formatDuration(elapsed)} / 1:30
    </button>}
    {file && previewUrl && <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-2" data-testid={`${testId}-preview`}>
      <Volume2 className="h-4 w-4 shrink-0 text-primary" />
      <audio controls preload="metadata" src={previewUrl} aria-label={`Preview voice note, ${formatDuration(duration)}`} className="h-10 min-w-0 max-w-full flex-1" data-testid={`${testId}-preview-player`} />
      <span className="text-[11px] tabular-nums text-muted-foreground">{formatDuration(duration)}</span>
      <button type="button" onClick={() => { onChange(null, 0); setError(''); }} disabled={disabled} aria-label="Discard voice note" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-muted-foreground hover:bg-secondary disabled:opacity-50" data-testid={`${testId}-discard`}>
        <Trash2 className="h-4 w-4" />
      </button>
    </div>}
    {recording && <span role="status" className="text-xs tabular-nums text-destructive" data-testid={`${testId}-recording-status`}>Recording · {formatDuration(elapsed)}</span>}
    {error && <p role="alert" className="w-full text-xs text-destructive" data-testid={`${testId}-error`}>{error}</p>}
  </div>;
}

export function AudioNotePlayer({
  id,
  label,
  load,
}: {
  id: string;
  label: string;
  load: () => Promise<Blob>;
}) {
  const [url, setUrl] = useState('');
  const [duration, setDuration] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);

  async function loadAudio() {
    setLoading(true);
    setError('');
    try {
      const blob = await load();
      if (!blob.size) throw new Error('This voice note is empty.');
      setUrl(URL.createObjectURL(blob));
    } catch {
      setError('This voice note could not be loaded. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return <div className="mt-2 min-w-0 rounded-xl border border-border bg-background p-2.5" data-testid={`audio-note-${id}`}>
    {url ? <div className="flex min-w-0 items-center gap-2">
      <Volume2 className="h-4 w-4 shrink-0 text-primary" />
      <audio controls preload="metadata" src={url} onLoadedMetadata={(event) => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : null)} aria-label={`Play voice note from ${label}`} className="h-10 min-w-0 flex-1" data-testid={`audio-player-${id}`} />
      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground" data-testid={`audio-duration-${id}`}>{duration === null ? 'Loading duration…' : formatDuration(duration)}</span>
    </div> : <button type="button" onClick={() => void loadAudio()} disabled={loading} className="inline-flex min-h-10 items-center gap-2 rounded-lg px-2 text-xs font-semibold text-primary hover:bg-secondary disabled:opacity-60" data-testid={`button-load-audio-${id}`}>
      <Volume2 className="h-4 w-4" />{loading ? 'Loading voice note…' : 'Load voice note'}
    </button>}
    {loading && <span role="status" className="sr-only" data-testid={`audio-loading-${id}`}>Loading voice note</span>}
    {error && <p role="alert" className="mt-1 text-xs text-destructive" data-testid={`audio-error-${id}`}>{error}</p>}
  </div>;
}
