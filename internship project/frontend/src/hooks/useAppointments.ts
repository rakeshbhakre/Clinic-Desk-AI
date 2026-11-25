import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "../lib/api";
import type { Appointment, Doctor } from "../lib/types";

type Flash = { id: string; kind: "booked" | "cancelled" } | null;

export function useAppointments() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash>(null);
  const [revision, setRevision] = useState(0);
  const flashTimer = useRef<number | null>(null);
  const requestRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestId = ++requestRef.current;
    try {
      const data = await api.bootstrap();
      if (requestId !== requestRef.current) return;
      setDoctors(data.doctors);
      setAppointments(data.appointments);
      setError(null);
      setRevision((value) => value + 1);
    } catch {
      if (requestId === requestRef.current) setError("Dashboard data is unavailable. Is the bot server running?");
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, []);

  const highlight = useCallback((id: string, kind: "booked" | "cancelled") => {
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    setFlash({ id, kind });
    flashTimer.current = window.setTimeout(() => setFlash(null), 2600);
  }, []);

  useEffect(() => {
    void refresh();
    const poll = window.setInterval(() => void refresh(), 12000);
    return () => {
      requestRef.current += 1;
      window.clearInterval(poll);
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [refresh]);

  const activeCount = appointments.filter((item) => item.status === "confirmed").length;

  return { doctors, appointments, activeCount, loading, error, flash, revision, refresh, highlight };
}
