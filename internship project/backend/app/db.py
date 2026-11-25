from __future__ import annotations

import sqlite3
import threading
import uuid
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .config import settings
from .models import Appointment, Doctor, Slot

DEFAULT_DOCTORS = (
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
            CREATE TABLE IF NOT EXISTS doctors (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                specialty TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS doctor_slots (
                slot_id TEXT PRIMARY KEY,
                doctor_id TEXT NOT NULL,
                date TEXT NOT NULL,
                time TEXT NOT NULL,
                available INTEGER NOT NULL DEFAULT 1,
                UNIQUE(doctor_id, date, time)
            )
            """
        )
        for doctor in DEFAULT_DOCTORS:
            conn.execute(
                "INSERT OR IGNORE INTO doctors (id, name, specialty) VALUES (?, ?, ?)",
                (doctor.id, doctor.name, doctor.specialty),
            )
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
        if "caller_name" not in columns:
            conn.execute(
                "ALTER TABLE appointments ADD COLUMN caller_name TEXT NOT NULL DEFAULT ''"
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_appt_phone ON appointments(phone, status)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_appt_slot ON appointments(slot_id, status)"
        )


init_db()


def list_doctors() -> list[dict]:
    with _lock, _connect() as conn:
        rows = conn.execute("SELECT id, name, specialty FROM doctors ORDER BY id").fetchall()
    return [Doctor(row["id"], row["name"], row["specialty"]).to_dict() for row in rows]


def _ensure_default_day(conn: sqlite3.Connection, doctor_id: str, day: str) -> None:
    for time in SLOT_TIMES:
        conn.execute(
            """INSERT OR IGNORE INTO doctor_slots (slot_id, doctor_id, date, time, available)
               VALUES (?, ?, ?, ?, 1)""",
            (f"{doctor_id}-{day}-{time}", doctor_id, day, time),
        )


def _ensure_near_term_schedule(conn: sqlite3.Connection) -> None:
    today = date.today()
    doctor_ids = [row["id"] for row in conn.execute("SELECT id FROM doctors")]
    for offset in range(DAYS_AHEAD):
        day = (today + timedelta(days=offset)).isoformat()
        for doctor_id in doctor_ids:
            has_schedule = conn.execute(
                "SELECT 1 FROM doctor_slots WHERE doctor_id = ? AND date = ? LIMIT 1",
                (doctor_id, day),
            ).fetchone()
            if not has_schedule:
                _ensure_default_day(conn, doctor_id, day)


def all_slots() -> list[Slot]:
    with _lock, _connect() as conn:
        _ensure_near_term_schedule(conn)
        rows = conn.execute(
            """SELECT s.slot_id, s.doctor_id, d.name AS doctor_name, d.specialty,
                      s.date, s.time, s.available
               FROM doctor_slots s JOIN doctors d ON d.id = s.doctor_id
               WHERE s.available = 1 AND s.date BETWEEN ? AND ?
               ORDER BY s.date, s.time, d.id""",
            (date.today().isoformat(), (date.today() + timedelta(days=DAYS_AHEAD - 1)).isoformat()),
        ).fetchall()
    return [
        Slot(
            slot_id=row["slot_id"],
            doctor_id=row["doctor_id"],
            doctor_name=row["doctor_name"],
            specialty=row["specialty"],
            date=row["date"],
            time=row["time"],
            available=bool(row["available"]),
        )
        for row in rows
    ]


def update_doctor(doctor_id: str, name: str, specialty: str) -> dict | None:
    name = " ".join((name or "").split())
    specialty = " ".join((specialty or "").split())
    if not name or not specialty:
        raise ValueError("Doctor name and specialty are required.")
    if len(name) > 100 or len(specialty) > 100:
        raise ValueError("Doctor name and specialty must be 100 characters or fewer.")
    with _lock, _connect() as conn:
        cursor = conn.execute(
            "UPDATE doctors SET name = ?, specialty = ? WHERE id = ?",
            (name, specialty, doctor_id),
        )
        row = conn.execute(
            "SELECT id, name, specialty FROM doctors WHERE id = ?", (doctor_id,)
        ).fetchone()
        if cursor.rowcount and row:
            # Active bookings refer to the same doctor id. Keep their displayed name
            # aligned with the editable doctor profile so the schedule has one name.
            conn.execute(
                "UPDATE appointments SET doctor_name = ? WHERE doctor_id = ? AND status = 'confirmed'",
                (name, doctor_id),
            )
    return Doctor(row["id"], row["name"], row["specialty"]).to_dict() if row else None


def _validated_day(day: str) -> str:
    try:
        parsed = date.fromisoformat(day)
    except (TypeError, ValueError) as exc:
        raise ValueError("Choose a valid date.") from exc
    if parsed < date.today():
        raise ValueError("Availability cannot be changed for a past date.")
    if parsed > date.today() + timedelta(days=DAYS_AHEAD - 1):
        raise ValueError("Availability can be changed for the next three days.")
    return parsed.isoformat()


def doctor_schedule(doctor_id: str, day: str) -> dict:
    day = _validated_day(day)
    with _lock, _connect() as conn:
        doctor = conn.execute("SELECT id FROM doctors WHERE id = ?", (doctor_id,)).fetchone()
        if not doctor:
            raise KeyError("Doctor not found.")
        has_schedule = conn.execute(
            "SELECT 1 FROM doctor_slots WHERE doctor_id = ? AND date = ? LIMIT 1",
            (doctor_id, day),
        ).fetchone()
        if not has_schedule:
            _ensure_default_day(conn, doctor_id, day)
        rows = conn.execute(
            """SELECT s.time, s.available,
                      EXISTS(SELECT 1 FROM appointments a
                             WHERE a.slot_id = s.slot_id AND a.status = 'confirmed') AS booked
               FROM doctor_slots s WHERE s.doctor_id = ? AND s.date = ? ORDER BY s.time""",
            (doctor_id, day),
        ).fetchall()
    return {
        "doctorId": doctor_id,
        "date": day,
        "slots": [
            {"time": row["time"], "available": bool(row["available"]), "booked": bool(row["booked"])}
            for row in rows
        ],
    }


def update_doctor_schedule(doctor_id: str, day: str, times: list[str]) -> dict:
    day = _validated_day(day)
    normalized: set[str] = set()
    for value in times:
        try:
            parsed = datetime.strptime(value, "%H:%M").time()
        except (TypeError, ValueError) as exc:
            raise ValueError("Use valid slot times in HH:MM format.") from exc
        normalized.add(parsed.strftime("%H:%M"))
    if len(normalized) > 24:
        raise ValueError("A doctor can have at most 24 slots per day.")

    with _lock, _connect() as conn:
        if not conn.execute("SELECT 1 FROM doctors WHERE id = ?", (doctor_id,)).fetchone():
            raise KeyError("Doctor not found.")
        current = conn.execute(
            """SELECT s.slot_id, s.time,
                      EXISTS(SELECT 1 FROM appointments a
                             WHERE a.slot_id = s.slot_id AND a.status = 'confirmed') AS booked
               FROM doctor_slots s WHERE s.doctor_id = ? AND s.date = ?""",
            (doctor_id, day),
        ).fetchall()
        current_by_time = {row["time"]: row for row in current}
        for time, row in current_by_time.items():
            if row["booked"] and time not in normalized:
                raise ValueError(f"{time} already has a confirmed appointment and cannot be removed.")
            conn.execute(
                "UPDATE doctor_slots SET available = ? WHERE slot_id = ?",
                (int(time in normalized), row["slot_id"]),
            )
        for time in normalized - current_by_time.keys():
            conn.execute(
                """INSERT INTO doctor_slots (slot_id, doctor_id, date, time, available)
                   VALUES (?, ?, ?, ?, 1)""",
                (f"{doctor_id}-{day}-{time}", doctor_id, day, time),
            )
    return doctor_schedule(doctor_id, day)


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
    doctors = [Doctor(item["id"], item["name"], item["specialty"]) for item in list_doctors()]
    slots = available_slots()
    grouped: dict[str, list[dict]] = {doctor.id: [] for doctor in doctors}
    for slot in slots:
        if slot.doctor_id in grouped:
            grouped[slot.doctor_id].append(slot.to_dict())
    return [
        {**doctor.to_dict(), "slots": grouped[doctor.id][:6]}
        for doctor in doctors
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
        caller_name=row["caller_name"] or "",
    )


def create_appointment(
    slot_id: str,
    phone: str,
    patient_name: str = "",
    reason: str = "",
    caller_name: str = "",
) -> Appointment:
    slot = get_slot(slot_id)
    if not slot:
        raise ValueError("That slot does not exist.")

    patient_name = " ".join((patient_name or "").split())
    caller_name = " ".join((caller_name or "").split())
    reason = (reason or "").strip()

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
        caller_name=caller_name,
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
                 patient_name, reason, caller_name)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                appointment.caller_name,
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
        f"{appointment.doctor_name}{reason}"
    )
