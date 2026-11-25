export type Slot = {
  id: string;
  doctorId: string;
  doctorName: string;
  specialty: string;
  date: string;
  time: string;
  available: boolean;
};

export type Doctor = {
  id: string;
  name: string;
  specialty: string;
  slots: Slot[];
};

export type DoctorScheduleSlot = {
  time: string;
  available: boolean;
  booked: boolean;
};

export type DoctorSchedule = {
  doctorId: string;
  date: string;
  slots: DoctorScheduleSlot[];
};

export type Appointment = {
  id: string;
  doctorId: string;
  doctorName: string;
  slotId: string;
  date: string;
  time: string;
  phone: string;
  formattedPhone: string;
  patientName: string;
  reason: string;
  status: "confirmed" | "cancelled";
  createdAt: string;
};

export type Bootstrap = {
  doctors: Doctor[];
  appointments: Appointment[];
  activeCount: number;
};

export type CallStatus =
  | "idle"
  | "precall"
  | "ringing"
  | "connecting"
  | "connected"
  | "ended"
  | "error";

export type TranscriptLine = {
  id: string;
  role: "user" | "agent";
  text: string;
  at: number;
};

export type ServerEvent = {
  type:
    | "caller_confirmed"
    | "caller_details"
    | "appointment_created"
    | "appointment_cancelled";
  phone?: string;
  formattedPhone?: string;
  name?: string;
  reason?: string;
  appointment?: Appointment;
};

export type AudioLevels = {
  local: number;
  remote: number;
};
