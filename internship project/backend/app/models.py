from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class Doctor:
    id: str
    name: str
    specialty: str

    def to_dict(self) -> dict[str, Any]:
        return {"id": self.id, "name": self.name, "specialty": self.specialty}


@dataclass(frozen=True)
class Slot:
    slot_id: str
    doctor_id: str
    doctor_name: str
    specialty: str
    date: str
    time: str
    available: bool = True

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.slot_id,
            "doctorId": self.doctor_id,
            "doctorName": self.doctor_name,
            "specialty": self.specialty,
            "date": self.date,
            "time": self.time,
            "available": self.available,
        }


@dataclass
class Appointment:
    id: str
    doctor_id: str
    doctor_name: str
    slot_id: str
    date: str
    time: str
    phone: str
    status: str
    created_at: str
    patient_name: str = ""
    reason: str = ""
    caller_name: str = ""

    def to_dict(self) -> dict[str, Any]:
        from .phone import format_phone

        return {
            "id": self.id,
            "doctorId": self.doctor_id,
            "doctorName": self.doctor_name,
            "slotId": self.slot_id,
            "date": self.date,
            "time": self.time,
            "phone": self.phone,
            "formattedPhone": format_phone(self.phone),
            "patientName": self.patient_name,
            "callerName": self.caller_name,
            "reason": self.reason,
            "status": self.status,
            "createdAt": self.created_at,
        }


@dataclass
class CallState:
    proposed_phone: str | None = None
    confirmed_phone: str | None = None
    caller_name: str | None = None
    patient_name: str | None = None
    reason: str | None = None


@dataclass
class AppResources:
    state: CallState
    worker: Any | None = None
