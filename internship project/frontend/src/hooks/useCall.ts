import { useCallback, useEffect, useRef, useState } from "react";
import { RTVIEvent } from "@pipecat-ai/client-js";

import type {
  AgentActivityItem,
  AgentActivityState,
  Appointment,
  AudioLevels,
  CallStatus,
  ServerEvent,
  TranscriptLine,
} from "../lib/types";

type Options = { onEvent?: (event: ServerEvent) => void };
type PipecatClientInstance = ReturnType<typeof import("../lib/client").createClient>;

function errorMessage(value: unknown): string {
  let message = "The call could not connect. Check the connection and try again.";
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
  if (/not supported or suppressed|secure context|mediagroup|mediaDevices|permission denied|notallowederror/i.test(message)) {
    return "Microphone access was blocked. Allow it in your browser settings, then try again.";
  }
  return message;
}

function activityFromEvent(event: ServerEvent): Omit<AgentActivityItem, "id" | "at"> | null {
  if (event.type === "caller_confirmed") {
    return { label: "Phone confirmed", detail: "Verbal confirmation received", kind: "success" };
  }
  if (event.type === "booking_names_collected") {
    if (!event.callerName && !event.patientName) return null;
    return { label: "Booking names recorded", detail: "Optional details saved", kind: "neutral" };
  }
  if (event.type === "availability_checked") {
    const count = event.totalAvailable ?? 0;
    const date = event.date ? new Date(`${event.date}T12:00:00`).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : null;
    return {
      label: "Availability checked",
      detail: `${count} ${count === 1 ? "open slot" : "open slots"}${date ? ` · ${date}` : ""}`,
      kind: "neutral",
    };
  }
  if (event.type === "appointment_created" && event.appointment) {
    return {
      label: "Appointment confirmed",
      detail: `${event.appointment.doctorName} · ${event.appointment.date} · ${event.appointment.time}`,
      kind: "success",
    };
  }
  if (event.type === "appointment_cancelled" && event.appointment) {
    return {
      label: "Appointment cancelled",
      detail: `${event.appointment.doctorName} · ${event.appointment.date} · ${event.appointment.time}`,
      kind: "warning",
    };
  }
  return null;
}

export function useCall({ onEvent }: Options = {}) {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [activityState, setActivityState] = useState<AgentActivityState>("listening");
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);
  const [callerName, setCallerName] = useState<string | null>(null);
  const [patientName, setPatientName] = useState<string | null>(null);
  const [requestedDoctor, setRequestedDoctor] = useState<string | null>(null);
  const [requestedDate, setRequestedDate] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptLine[]>([]);
  const [activity, setActivity] = useState<AgentActivityItem[]>([]);
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<AudioLevels>({ local: 0, remote: 0 });
  const [muted, setMuted] = useState(false);
  const [confirmation, setConfirmation] = useState<Appointment | null>(null);
  const [cancellation, setCancellation] = useState<Appointment | null>(null);
  const [bookedCount, setBookedCount] = useState(0);
  const [cancelledCount, setCancelledCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clientRef = useRef<PipecatClientInstance | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const pendingRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const endingTimeoutRef = useRef<number | null>(null);
  const startIdRef = useRef(0);
  const statusRef = useRef<CallStatus>("idle");
  const onEventRef = useRef(onEvent);
  const currentUserLineRef = useRef<string | null>(null);
  const currentBotLineRef = useRef<string | null>(null);
  const seenActivityRef = useRef<Set<string>>(new Set());
  const seenServerEventsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const updateStatus = useCallback((next: CallStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

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

  const upsertTranscriptLine = useCallback(
    (role: TranscriptLine["role"], text: string, final: boolean, suppliedId?: string) => {
      const clean = text.trim();
      if (!clean) return;
      const currentRef = role === "user" ? currentUserLineRef : currentBotLineRef;
      const id = suppliedId ?? currentRef.current ?? `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      if (!final) currentRef.current = id;
      else if (currentRef.current === id) currentRef.current = null;
      setTranscript((previous) => {
        const index = previous.findIndex((line) => line.id === id);
        if (index < 0) return [...previous, { id, role, text: clean, at: Date.now(), final }];
        const next = [...previous];
        next[index] = { ...next[index], text: clean, final };
        return next;
      });
    },
    [],
  );

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
    timerRef.current = window.setInterval(() => setSeconds((value) => value + 1), 1000);
  }, [stopTimer]);

  const addActivity = useCallback((event: ServerEvent) => {
    const item = activityFromEvent(event);
    if (!item) return;
    const uniquePart = event.appointment?.id ?? `${event.date ?? ""}:${event.totalAvailable ?? ""}:${Math.floor(Date.now() / 1000)}`;
    const key = `${event.type}:${uniquePart}`;
    if (seenActivityRef.current.has(key)) return;
    seenActivityRef.current.add(key);
    setActivity((previous) => [...previous, { ...item, id: key, at: Date.now() }].slice(-20));
  }, []);

  const handleServerMessage = useCallback((message: unknown) => {
    const wrapper = message as { data?: unknown };
    const payload = (wrapper?.data && typeof wrapper.data === "object" ? wrapper.data : wrapper) as ServerEvent;
    if (!payload?.type) return;
    if ((payload.type === "appointment_created" || payload.type === "appointment_cancelled") && payload.appointment) {
      const eventKey = `${payload.type}:${payload.appointment.id}`;
      if (seenServerEventsRef.current.has(eventKey)) return;
      seenServerEventsRef.current.add(eventKey);
    }
    if (payload.type === "caller_confirmed") {
      setVerifiedPhone(payload.formattedPhone ?? payload.phone ?? null);
    }
    if (payload.type === "booking_names_collected") {
      setCallerName(payload.callerName ?? null);
      setPatientName(payload.patientName ?? null);
    }
    if (payload.type === "patient_name_confirmed") setPatientName(payload.patientName ?? null);
    if (payload.type === "caller_details") setPatientName(payload.name ?? null);
    if (payload.type === "availability_checked") {
      setRequestedDoctor(payload.doctor?.trim() || null);
      setRequestedDate(payload.date ?? null);
    }
    if (payload.type === "appointment_created" && payload.appointment) {
      setConfirmation(payload.appointment);
      setCancellation(null);
      setBookedCount((value) => value + 1);
    }
    if (payload.type === "appointment_cancelled" && payload.appointment) {
      setCancellation(payload.appointment);
      setConfirmation(null);
      setCancelledCount((value) => value + 1);
    }
    addActivity(payload);
    onEventRef.current?.(payload);
  }, [addActivity]);

  const start = useCallback(
    () => {
      if (["requesting_permission", "connecting", "connected", "ending"].includes(statusRef.current)) return;
      const startId = ++startIdRef.current;

      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      clearConnectTimeout();
      if (endingTimeoutRef.current !== null) window.clearTimeout(endingTimeoutRef.current);
      if (clientRef.current) void clientRef.current.disconnect();
      if (audioRef.current) audioRef.current.srcObject = null;
      stopTimer();

      currentUserLineRef.current = null;
      currentBotLineRef.current = null;
      seenActivityRef.current.clear();
      seenServerEventsRef.current.clear();
      setVerifiedPhone(null);
      setCallerName(null);
      setPatientName(null);
      setRequestedDoctor(null);
      setRequestedDate(null);
      setTranscript([]);
      setActivity([]);
      setConfirmation(null);
      setCancellation(null);
      setSeconds(0);
      setLevels({ local: 0, remote: 0 });
      setMuted(false);
      setError(null);
      setActivityState("listening");
      updateStatus("requesting_permission");

      pendingRef.current = window.setTimeout(async () => {
        pendingRef.current = null;
        if (startId !== startIdRef.current) return;

        connectTimeoutRef.current = window.setTimeout(() => {
          connectTimeoutRef.current = null;
          if (startId !== startIdRef.current) return;
          setError("Connection timed out. Check that the backend and network are available, then try again.");
          updateStatus("error");
          stopTimer();
          void clientRef.current?.disconnect();
        }, 25000);

        try {
          const { createClient } = await import("../lib/client");
          if (startId !== startIdRef.current) return;
          const client = createClient({
            onBotReady: () => {
              if (startId !== startIdRef.current || !["requesting_permission", "connecting"].includes(statusRef.current)) return;
              clearConnectTimeout();
              updateStatus("connected");
              setActivityState("listening");
              startTimer();
            },
            onDisconnected: () => {
              if (startId !== startIdRef.current) return;
              clearConnectTimeout();
              if (endingTimeoutRef.current !== null) window.clearTimeout(endingTimeoutRef.current);
              endingTimeoutRef.current = null;
              stopTimer();
              if (audioRef.current) audioRef.current.srcObject = null;
              setLevels({ local: 0, remote: 0 });
              if (statusRef.current !== "error") updateStatus("ended");
            },
            onError: (message) => {
              if (startId !== startIdRef.current) return;
              clearConnectTimeout();
              setError(errorMessage(message));
              stopTimer();
              updateStatus("error");
            },
          });
          clientRef.current = client;

          client.on(RTVIEvent.BotStarted, () => {
            if (startId === startIdRef.current && statusRef.current === "requesting_permission") {
              updateStatus("connecting");
            }
          });
          client.on(RTVIEvent.UserInput, (data) => {
            if (startId !== startIdRef.current || !data.text.trim()) return;
            upsertTranscriptLine("user", data.text, data.final);
          });
          client.on(RTVIEvent.BotOutput, (data) => {
            if (startId !== startIdRef.current || data.output_type === "token" || data.output_type === "word") return;
            const final = data.spoken_status === "completed" || !data.spoken_status;
            const text = data.spoken_progress?.accumulated_text || data.text;
            const segmentId = data.segment_id === undefined ? undefined : `bot-${data.segment_id}`;
            upsertTranscriptLine("agent", text, final, segmentId);
          });
          client.on(RTVIEvent.BotLlmStarted, () => {
            if (startId === startIdRef.current) setActivityState("thinking");
          });
          client.on(RTVIEvent.LLMFunctionCallStarted, () => {
            if (startId === startIdRef.current) setActivityState("executing_tool");
          });
          client.on(RTVIEvent.LLMFunctionCallInProgress, () => {
            if (startId === startIdRef.current) setActivityState("executing_tool");
          });
          client.on(RTVIEvent.LLMFunctionCallStopped, () => {
            if (startId === startIdRef.current) setActivityState("thinking");
          });
          client.on(RTVIEvent.BotStartedSpeaking, () => {
            if (startId === startIdRef.current) setActivityState("speaking");
          });
          client.on(RTVIEvent.BotStoppedSpeaking, () => {
            if (startId === startIdRef.current) setActivityState("listening");
          });
          client.on(RTVIEvent.UserStartedSpeaking, () => {
            if (startId === startIdRef.current) setActivityState("listening");
          });
          client.on(RTVIEvent.UserStoppedSpeaking, () => {
            if (startId === startIdRef.current) setActivityState("thinking");
          });
          client.on(RTVIEvent.TrackStarted, (track, participant) => {
            if (startId !== startIdRef.current || participant?.local || track.kind !== "audio") return;
            const audio = audioRef.current;
            if (!audio) return;
            audio.srcObject = new MediaStream([track]);
            void audio.play().catch(() => undefined);
          });
          client.on(RTVIEvent.ServerMessage, (message) => {
            if (startId === startIdRef.current) handleServerMessage(message);
          });
          client.on(RTVIEvent.LocalAudioLevel, (level) => {
            if (startId === startIdRef.current) setLevels((current) => ({ ...current, local: level }));
          });
          client.on(RTVIEvent.RemoteAudioLevel, (level) => {
            if (startId === startIdRef.current) setLevels((current) => ({ ...current, remote: level }));
          });

          await client.startBotAndConnect({
            endpoint: "/start",
            requestData: {
              transport: "webrtc",
              enableDefaultIceServers: true,
              body: {},
            },
          });
        } catch (cause) {
          if (startId !== startIdRef.current) return;
          clearConnectTimeout();
          setError(errorMessage(cause));
          stopTimer();
          updateStatus("error");
        }
      }, 120);
    },
    [clearConnectTimeout, handleServerMessage, startTimer, stopTimer, updateStatus, upsertTranscriptLine],
  );

  const end = useCallback(() => {
    if (["idle", "ended", "ending"].includes(statusRef.current)) return;
    if (pendingRef.current !== null) {
      window.clearTimeout(pendingRef.current);
      pendingRef.current = null;
    }
    clearConnectTimeout();
    stopTimer();
    updateStatus("ending");
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.disconnect();
    if (audioRef.current) audioRef.current.srcObject = null;
    endingTimeoutRef.current = window.setTimeout(() => {
      if (statusRef.current === "ending") updateStatus("ended");
    }, 1200);
  }, [clearConnectTimeout, stopTimer, updateStatus]);

  const reset = useCallback(() => {
    startIdRef.current += 1;
    if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
    if (endingTimeoutRef.current !== null) window.clearTimeout(endingTimeoutRef.current);
    clearConnectTimeout();
    const client = clientRef.current;
    clientRef.current = null;
    if (client) void client.disconnect();
    if (audioRef.current) audioRef.current.srcObject = null;
    stopTimer();
    updateStatus("idle");
    setActivityState("listening");
    setError(null);
    setVerifiedPhone(null);
    setCallerName(null);
    setPatientName(null);
    setRequestedDoctor(null);
    setRequestedDate(null);
    setTranscript([]);
    setActivity([]);
    setConfirmation(null);
    setCancellation(null);
    setSeconds(0);
    setLevels({ local: 0, remote: 0 });
    setMuted(false);
    setBookedCount(0);
    setCancelledCount(0);
    currentUserLineRef.current = null;
    currentBotLineRef.current = null;
    seenActivityRef.current.clear();
    seenServerEventsRef.current.clear();
  }, [clearConnectTimeout, stopTimer, updateStatus]);

  const toggleMute = useCallback(() => {
    const client = clientRef.current;
    if (!client || statusRef.current !== "connected") return;
    const nextMuted = !muted;
    client.enableMic(!nextMuted);
    setMuted(nextMuted);
  }, [muted]);

  useEffect(() => {
    return () => {
      if (pendingRef.current !== null) window.clearTimeout(pendingRef.current);
      if (connectTimeoutRef.current !== null) window.clearTimeout(connectTimeoutRef.current);
      if (endingTimeoutRef.current !== null) window.clearTimeout(endingTimeoutRef.current);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      if (clientRef.current) void clientRef.current.disconnect();
    };
  }, []);

  return {
    status,
    activityState,
    verifiedPhone,
    callerName,
    patientName,
    requestedDoctor,
    requestedDate,
    transcript,
    activity,
    seconds,
    levels,
    muted,
    confirmation,
    cancellation,
    bookedCount,
    cancelledCount,
    error,
    start,
    end,
    reset,
    toggleMute,
  };
}
