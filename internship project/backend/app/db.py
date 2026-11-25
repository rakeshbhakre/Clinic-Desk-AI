from __future__ import annotations

import sqlite3
import threading
import uuid
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .config import settings
from .models import Appointment, Doctor, Slot
from .phone import format_phone

DOCTORS = (
    Doctor("d1", "Dr. Anika Mehta", "General Physician"),
    Doctor("d2", "Dr. Rohan Shah", "Dermatology"),
    Doctor("d3", "Dr. Priya Nair", "Pediatrics"),
    Doctor("d4", "Dr. Vikram Rao", "Cardiology"),
)

SLOT_TIMES = ("09:30", "10:30", "11:30", "14:00", "15:00", "16:00")
DAYS_AHEAD = 3

_lock = threading.RLock()


def _db_path() -> Path:
    path = Path(settings.database_path)
    if not path.is_absolute():
        path = settings.database_path
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_db_path(), timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    return conn


def init_db() -> None:
    with _lock, _connect() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                doctor_id TEXT NOT NULL,
                doctor_name TEXT NOT NULL,
                slot_id TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                phone TEXT NOT NULL,
                status TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        columns = {
            row["name"] for row in conn.execute("PRAGMA table_info(appointments)")
        }
        if "patient_name" not in columns:
            conn.execute(
                "ALTER TABLE appointments ADD COLUMN patient_name TEXT NOT NULL DEFAULT ''"
            )
        if "reason" not in columns:
            conn.execute(
                "ALTER TABLE appointments ADD COLUMN reason TEXT NOT NULL DEFAULT ''"
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(phone, status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_appt_slot ON appointments(slot_id, status)"
        )


init_db()


def list_doctors() -> list[dict]:
    return [doctor.to_dict() for doctor in DOCTORS]


def all_slots() -> list[Slot]:
    today = date.today()
    slots: list[Slot] = []
    for day_offset in range(DAYS_AHEAD):
        day = (today + timedelta(days=day_offset)).isoformat()
        for doctor in DOCTORS:
            for time in SLOT_TIMES:
                slots.append(
                    Slot(
                        slot_id=f"{doctor.id}-{day}-{time}",
                        doctor_id=doctor.id,
                        doctor_name=doctor.name,
                        specialty=doctor.specialty,
                        date=day,
                        time=time,
                    )
                )
    return slots


def get_slot(slot_id: str) -> Slot | None:
    for slot in all_slots():
        if slot.slot_id == slot_id:
            return slot
    return None


def _booked_slot_ids(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT slot_id FROM appointments WHERE status = 'confirmed'"
    ).fetchall()
    return {row["slot_id"] for row in rows}


def available_slots(doctor: str = "", day: str = "") -> list[Slot]:
    from .dates import resolve_date

    resolved_day = resolve_date(day)
    doctor_key = (doctor or "").strip().lower()
    needle = doctor_key.replace("dr.", "").strip()

    with _lock, _connect() as conn:
        booked = _booked_slot_ids(conn)

    results: list[Slot] = []
    for slot in all_slots():
        if resolved_day and slot.date != resolved_day:
            continue
        if needle:
            haystack = f"{slot.doctor_name} {slot.specialty} {slot.doctor_id}".lower()
            if needle not in haystack and needle not in haystack.replace("dr.", ""):
                continue
        available = slot.slot_id not in booked
        if available:
            results.append(replace(slot, available=available))
    return results


def doctors_with_slots() -> list[dict]:
    slots = available_slots()
    grouped: dict[str, list[dict]] = {doctor.id: [] for doctor in DOCTORS}
    for slot in slots:
        grouped[slot.doctor_id].append(slot.to_dict())
    return [
        {**doctor.to_dict(), "slots": grouped[doctor.id][:6]}
        for doctor in DOCTORS
    ]


def _row_to_appointment(row: sqlite3.Row) -> Appointment:
    return Appointment(
        id=row["id"],
        doctor_id=row["doctor_id"],
        doctor_name=row["doctor_name"],
        slot_id=row["slot_id"],
        date=row["date"],
        time=row["time"],
        phone=row["phone"],
        status=row["status"],
        created_at=row["created_at"],
        patient_name=row["patient_name"] or "",
        reason=row["reason"] or "",
    )


def create_appointment(
    slot_id: str,
    phone: str,
    patient_name: str = "",
    reason: str = "",
) -> Appointment:
    slot = get_slot(slot_id)
    if not slot:
        raise ValueError("That slot does not exist.")

    patient_name = " ".join((patient_name or "").split())
    reason = (reason or "").strip()
    if not patient_name:
        raise ValueError("A patient name is required.")
    if not reason:
        raise ValueError("A reason for the visit is required.")

    now = datetime.now(timezone.utc).isoformat()
    appointment = Appointment(
        id=f"ap_{uuid.uuid4().hex[:10]}",
        doctor_id=slot.doctor_id,
        doctor_name=slot.doctor_name,
        slot_id=slot.slot_id,
        date=slot.date,
        time=slot.time,
        phone=phone,
        status="confirmed",
        created_at=now,
        patient_name=patient_name,
        reason=reason,
    )

    with _lock, _connect() as conn:
        taken = conn.execute(
            "SELECT id FROM appointments WHERE slot_id = ? AND status = 'confirmed'",
            (slot_id,),
        ).fetchone()
        if taken:
            raise ValueError("That slot was just taken. Please choose another time.")
        conn.execute(
            """
            INSERT INTO appointments
                (id, doctor_id, doctor_name, slot_id, date, time, phone, status, created_at,
                 patient_name, reason)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                appointment.id,
                appointment.doctor_id,
                appointment.doctor_name,
                appointment.slot_id,
                appointment.date,
                appointment.time,
                appointment.phone,
                appointment.status,
                appointment.created_at,
                appointment.patient_name,
                appointment.reason,
            ),
        )
    return appointment


def active_appointments_for_phone(phone: str) -> list[Appointment]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM appointments
            WHERE phone = ? AND status = 'confirmed'
            ORDER BY date, time
            """,
            (phone,),
        ).fetchall()
    return [_row_to_appointment(row) for row in rows]


def cancel_appointment(appointment_id: str, phone: str) -> Appointment | None:
    with _lock, _connect() as conn:
        cursor = conn.execute(
            """
            UPDATE appointments SET status = 'cancelled'
            WHERE id = ? AND phone = ? AND status = 'confirmed'
            """,
            (appointment_id, phone),
        )
        if cursor.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM appointments WHERE id = ?", (appointment_id,)
        ).fetchone()
    return _row_to_appointment(row) if row else None


def list_appointments(limit: int = 100) -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM appointments
            ORDER BY CASE status WHEN 'confirmed' THEN 0 ELSE 1 END,
                     date DESC, time DESC, created_at DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return [_row_to_appointment(row).to_dict() for row in rows]


def appointment_summary(appointment: Appointment) -> str:
    patient = appointment.patient_name or "the caller"
    reason = f" for {appointment.reason}" if appointment.reason else ""
    return (
        f"{patient} — {appointment.date} at {appointment.time} with "
        f"{appointment.doctor_name}, phone {format_phone(appointment.phone)}{reason}"
    )
