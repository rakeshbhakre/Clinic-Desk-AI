import { useCallback, useEffect, useRef, useState } from "react";
import { RTVIEvent } from "@pipecat-ai/client-js";

import { createClient } from "../lib/client";
import { formatPhone, normalizePhone } from "../lib/phone";
import { playTone, startRing, stopRing } from "../lib/sounds";
import type {
  Appointment,
  AudioLevels,
  CallStatus,
  ServerEvent,
  TranscriptLine,
} from "../lib/types";

type Options = {
  onEvent?: (event: ServerEvent) => void;
};

function errorMessage(value: unknown): string {
  let message = "Could not start the call. Check the backend and try again.";

  if (value && typeof value === "object") {
    const data = "data" in value ? (value as { data?: unknown }).data : value;
    if (data && typeof data === "object" && "error" in data) {
      message = String((data as { error: unknown }).error);
    } else if ("message" in value) {
      message = String((value as { message: unknown }).message);
    }
  } else if (typeof value === "string" && value) {
    message = value;
  }

  if (/not supported or suppressed|secure context|mediagroup|mediaDevices/i.test(message)) {
    return "Microphone access needs HTTPS. On your phone, open the https:// address and accept the certificate warning, then try again.";
  }
  return message;
}

export function useCall({ onEvent }: Options = {}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [proposedPhone, setProposedPhone] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [callerReason, setCallerReason] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<AudioLevels>({ local: 0, remote: 0 });
  const [muted, setMuted] = useState(false);
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
  const [bookedCount, setBookedCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<ReturnType<typeof createClient> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const startIdRef = useRef(0);
  const onEventRef = useRef(onEvent);
  const botOutputSeenRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const audio = document.createElement("audio");
    audio.autoplay = true;
    audio.setAttribute("playsinline", "");
    audio.style.display = "none";
    document.body.appendChild(audio);
    audioRef.current = audio;

    return () => {
      audio.srcObject = null;
      audio.remove();
      audioRef.current = null;
    };
  }, []);

  const appendLine = useCallback((role: "user" | "agent", text: string) => {
    const clean = text.trim();
    if (!clean) return;
    setTranscript((previous) => [
      ...previous,
      { id: `${Date.now()}-${Math.random()}`, role, text: clean, at: Date.now() },
    ]);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const clearConnectTimeout = useCallback(() => {
    if (connectTimeoutRef.current !== null) {
      window.clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    timerRef.current = window.setInterval(() => {
      setSeconds((value) => value + 1);
    }, 1000);
  }, [stopTimer]);

  const handleServerMessage = useCallback((message: unknown) => {
    const wrapper = message as { data?: unknown };
    const payload = (wrapper?.data && typeof wrapper.data === "object"
      ? wrapper.data
      : wrapper) as ServerEvent;

    if (!payload?.type) return;

    if (payload.type === "caller_confirmed") {
      setVerifiedPhone(payload.formattedPhone ?? payload.phone ?? null);
    }
    if (payload.type === "caller_details") {
      setCallerName(payload.name ?? null);
      setCallerReason(payload.reason ?? null);
    }
    if (payload.type === "appointment_created" && payload.appointment) {
      setConfirmation(payload.appointment);
      setBookedCount((value) => value + 1);
    }
    if (payload.type === "appointment_cancelled") {
      setCancelledCount((value) => value + 1);
    }
    onEventRef.current?.(payload);
  }, []);

  const start = useCallback(
    async (rawPhone: string) => {
      const digits = normalizePhone(rawPhone);
      const startId = ++startIdRef.current;

      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      clearConnectTimeout();
      if (clientRef.current) void clientRef.current.disconnect();
      if (audioRef.current) audioRef.current.srcObject = null;
      stopTimer();

      setProposedPhone(formatPhone(digits));
      setVerifiedPhone(null);
      setCallerName(null);
      setCallerReason(null);
      botOutputSeenRef.current.clear();
      setTranscript([]);
      setConfirmation(null);
      setSeconds(0);
      setLevels({ local: 0, remote: 0 });
      setMuted(false);
      setError(null);
      setStatus("ringing");
      startRing();

      pendingRef.current = window.setTimeout(async () => {
        pendingRef.current = null;
        if (startId !== startIdRef.current) return;
        setStatus("connecting");

        connectTimeoutRef.current = window.setTimeout(() => {
          connectTimeoutRef.current = null;
          if (startId !== startIdRef.current) return;
          setError(
            window.location.hostname === "localhost"
              ? "Connection timed out. Check that the backend is running and try again."
              : "Connection timed out. On a phone, open the https:// address and accept the certificate warning.",
          );
          setStatus("error");
          stopTimer();
          void clientRef.current?.disconnect();
        }, 20000);

        try {
          const client = createClient({
            onBotReady: () => {
              if (startId !== startIdRef.current) return;
              clearConnectTimeout();
              stopRing();
              setStatus("connected");
              startTimer();
              playTone("connect");
            },
            onDisconnected: () => {
              if (startId !== startIdRef.current) return;
              clearConnectTimeout();
              stopRing();
              stopTimer();
              if (audioRef.current) audioRef.current.srcObject = null;
              setStatus("ended");
              playTone("end");
            },
            onError: (message) => {
              if (startId !== startIdRef.current) return;
              clearConnectTimeout();
              stopRing();
              setError(errorMessage(message));
              setStatus("error");
              stopTimer();
            },
          });

          clientRef.current = client;

          client.on(RTVIEvent.UserInput, (data) => {
            if (startId !== startIdRef.current) return;
            if (data.final) appendLine("user", data.text);
          });
          client.on(RTVIEvent.BotOutput, (data) => {
            if (startId !== startIdRef.current) return;
            if (data.output_type === "token" || data.output_type === "word") return;
            // RTVI can send the same sentence once as "new" and again as
            // "completed" after synthesis. Show it only once.
            if (data.spoken_status && data.spoken_status !== "completed") return;
            const cleanText = data.text.trim();
            const key =
              data.segment_id !== undefined
                ? `segment:${data.segment_id}:${cleanText}`
                : `text:${cleanText}`;
            if (botOutputSeenRef.current.has(key)) return;
            botOutputSeenRef.current.add(key);
            appendLine("agent", cleanText);
          });
          client.on(RTVIEvent.TrackStarted, (track, participant) => {
            if (startId !== startIdRef.current) return;
            if (participant?.local || track.kind !== "audio") return;
            const audio = audioRef.current;
            if (!audio) return;
            audio.srcObject = new MediaStream([track]);
            void audio.play().catch(() => undefined);
          });
          client.on(RTVIEvent.ServerMessage, (message) => {
            if (startId !== startIdRef.current) return;
            handleServerMessage(message);
          });
          client.on(RTVIEvent.LocalAudioLevel, (level) => {
            if (startId !== startIdRef.current) return;
            setLevels((value) => ({ ...value, local: level }));
          });
          client.on(RTVIEvent.RemoteAudioLevel, (level) => {
            if (startId !== startIdRef.current) return;
            setLevels((value) => ({ ...value, remote: level }));
          });

          await client.startBotAndConnect({
            endpoint: "/start",
            requestData: {
              transport: "webrtc",
              enableDefaultIceServers: true,
              body: { proposed_phone: digits },
            },
          });
        } catch (cause) {
          if (startId !== startIdRef.current) return;
          clearConnectTimeout();
          stopRing();
          setError(errorMessage(cause));
          setStatus("error");
          stopTimer();
        }
      }, 850);
    },
    [appendLine, clearConnectTimeout, handleServerMessage, startTimer, stopTimer],
  );

  const end = useCallback(() => {
    startIdRef.current += 1;
    if (pendingRef.current !== null) {
      window.clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
    clearConnectTimeout();
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.disconnect();
    if (audioRef.current) audioRef.current.srcObject = null;
    stopTimer();
    stopRing();
    setStatus("ended");
    playTone("end");
  }, [clearConnectTimeout, stopTimer]);

  const open = useCallback(() => {
    setStatus("precall");
    setError(null);
  }, []);

  const reset = useCallback(() => {
    end();
    setStatus("idle");
    setError(null);
    setProposedPhone(null);
    setVerifiedPhone(null);
    setCallerName(null);
    setCallerReason(null);
    setTranscript([]);
    setConfirmation(null);
    setSeconds(0);
    setBookedCount(0);
    setCancelledCount(0);
  }, [end]);

  const toggleMute = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    const next = !muted;
    client.enableMic(!next);
    setMuted(next);
  }, [muted]);

  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      if (connectTimeoutRef.current !== null) window.clearTimeout(connectTimeoutRef.current);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      stopRing();
      const client = clientRef.current;
      if (client) void client.disconnect();
    };
  }, []);

  return {
    status,
    proposedPhone,
    verifiedPhone,
    callerName,
    callerReason,
    transcript,
    seconds,
    levels,
    muted,
    confirmation,
    bookedCount,
    cancelledCount,
    error,
    open,
    start,
    end,
    reset,
    toggleMute,
  };
}
