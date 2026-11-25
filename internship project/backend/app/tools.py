from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import Any

from pipecat.processors.frameworks.rtvi import RTVIServerMessageFrame
from pipecat.services.llm_service import FunctionCallParams

from . import db
from .dates import resolve_date
from .models import AppResources, Appointment
from .phone import format_phone, normalize_phone

_DOCTOR_QUERY_FILLER = {
    "dr", "doctor", "doctors", "which", "who", "what", "is", "are", "the",
    "available", "availability", "open", "for", "on", "tomorrow", "today",
    "any", "all", "slot", "slots", "time", "times", "appointment", "appointments",
    "can", "could", "you", "tell", "me", "please", "uh", "um", "hmm",
}


def _doctor_terms(value: str) -> str:
    terms = re.sub(r"[^a-z0-9 ]+", " ", (value or "").lower()).split()
    return " ".join(term for term in terms if term not in _DOCTOR_QUERY_FILLER)


def _doctor_matches(query: str, doctor: dict[str, str]) -> bool:
    query_terms = _doctor_terms(query)
    if not query_terms:
        return False
    query_tokens = set(query_terms.split())
    name = _doctor_terms(doctor["name"])
    specialty = _doctor_terms(doctor["specialty"])
    searchable = f"{name} {specialty} {_doctor_terms(doctor['id'])}"
    if query_terms in searchable or query_tokens.issubset(set(searchable.split())):
        return True
    # Speech recognition can slightly alter a surname. Only accept a close,
    # multiword match; otherwise ask the caller instead of falsely saying there
    # are no appointments for a doctor we could not identify.
    return len(query_tokens) >= 2 and SequenceMatcher(None, query_terms, name).ratio() >= 0.84


async def _emit(params: FunctionCallParams, message_type: str, **payload: Any) -> None:
    frame = RTVIServerMessageFrame(data={"type": message_type, **payload})
    worker = getattr(params, "pipeline_worker", None)
    if worker is None:
        resources: AppResources | None = getattr(params, "app_resources", None)
        worker = getattr(resources, "worker", None) if resources else None
    if worker is not None:
        await worker.queue_frame(frame)


def _resources(params: FunctionCallParams) -> AppResources:
    resources = getattr(params, "app_resources", None)
    if resources is None:
        raise RuntimeError("Call resources are not configured.")
    return resources


def _appointment_for_assistant(appointment: Appointment) -> dict[str, Any]:
    """Keep caller phone data out of tool results the LLM may speak aloud."""
    payload = appointment.to_dict()
    payload.pop("phone", None)
    payload.pop("formattedPhone", None)
    return payload


async def check_doctor_availability(
    params: FunctionCallParams,
    doctor: str = "",
    date: str = "",
):
    """Check real appointment availability for doctors.

    Args:
        doctor: Optional doctor name, specialty, or id, e.g. "Mehta" or "d1". Leave empty for all doctors.
        date: Optional date as YYYY-MM-DD, "today", or "tomorrow". Leave empty for the next three days.
    """
    doctor_records = db.list_doctors()
    doctor_query = _doctor_terms(doctor)
    matched_doctors = [item for item in doctor_records if _doctor_matches(doctor, item)] if doctor_query else []
    if doctor_query and not matched_doctors:
        await params.result_callback(
            {
                "ok": False,
                "clarification_required": True,
                "error": "The requested doctor name did not match the clinic's doctor list. Ask the caller to repeat or confirm the doctor's name; do not report zero availability.",
                "doctors": [{"name": item["name"], "specialty": item["specialty"]} for item in doctor_records],
                "resolved_date": resolve_date(date),
            }
        )
        return

    doctor_filter = matched_doctors[0]["name"] if len(matched_doctors) == 1 else (doctor if doctor_query else "")
    requested_doctor = matched_doctors[0]["name"] if len(matched_doctors) == 1 else doctor_filter
    slots = db.available_slots(doctor=doctor_filter, day=date)
    await _emit(
        params,
        "availability_checked",
        date=resolve_date(date),
        doctor=requested_doctor,
        totalAvailable=len(slots),
    )
    grouped: dict[str, list[dict]] = {}
    for slot in slots:
        grouped.setdefault(slot.doctor_name, []).append(
            {
                "slot_id": slot.slot_id,
                "time": slot.time,
                "date": slot.date,
            }
        )
    await params.result_callback(
        {
            "ok": True,
            "resolved_date": resolve_date(date),
            "doctors": [
            {"name": name, "available_slots": values[:8]}
                for name, values in grouped.items()
            ],
            "total_available": len(slots),
        }
    )


async def set_caller_phone(params: FunctionCallParams, phone: str):
    """Set or correct the phone number the caller gave.

    Args:
        phone: The phone number the caller spoke, in any format.
    """
    resources = _resources(params)
    try:
        digits = normalize_phone(phone)
    except ValueError as exc:
        await params.result_callback({"ok": False, "error": str(exc)})
        return

    resources.state.proposed_phone = digits
    resources.state.confirmed_phone = None
    await params.result_callback(
        {
            "ok": True,
            "received": True,
            "spoken_number": format_phone(digits),
            "confirmation_prompt": f"You said {format_phone(digits)}. Is that the correct number to use?",
        }
    )


async def confirm_caller_phone(params: FunctionCallParams):
    """Confirm the proposed phone number after reading it back and the caller says yes.

    Call this only after the caller explicitly confirms the number read back to them.
    It takes no arguments.
    """
    resources = _resources(params)
    digits = resources.state.proposed_phone
    if not digits:
        await params.result_callback(
            {"ok": False, "error": "Ask the caller for their phone number first."}
        )
        return

    resources.state.confirmed_phone = digits
    await _emit(params, "caller_confirmed", phone=digits, formattedPhone=format_phone(digits))
    await params.result_callback(
        {"ok": True, "confirmed": True}
    )


async def record_booking_names(
    params: FunctionCallParams, caller_name: str, patient_name: str
):
    """Record names the caller voluntarily provides for a booking.

    Args:
        caller_name: The caller's name, or an empty string if they decline or do not provide it.
        patient_name: The patient's name, or an empty string if they decline or do not provide it.

    Names are optional metadata and must never be used to verify identity.
    """
    resources = _resources(params)
    clean_caller = " ".join((caller_name or "").split())
    clean_patient = " ".join((patient_name or "").split())
    if len(clean_caller) > 120 or len(clean_patient) > 120:
        await params.result_callback(
            {"ok": False, "error": "That name is too long. Ask the caller to repeat it."}
        )
        return

    resources.state.caller_name = clean_caller or None
    resources.state.patient_name = clean_patient or None
    await _emit(
        params,
        "booking_names_collected",
        callerName=clean_caller or None,
        patientName=clean_patient or None,
    )
    await params.result_callback(
        {
            "ok": True,
            "caller_name": clean_caller or None,
            "patient_name": clean_patient or None,
            "optional": True,
        }
    )


async def book_appointment(params: FunctionCallParams, slot_id: str):
    """Book an available appointment slot for the confirmed caller.

    Args:
        slot_id: The slot id returned by check_doctor_availability.
    """
    resources = _resources(params)
    state = resources.state
    phone = state.confirmed_phone
    if not phone:
        await params.result_callback(
            {
                "ok": False,
                "error": "Ask the caller to say and confirm their phone number before booking.",
            }
        )
        return

    patient_name = (state.patient_name or "").strip()
    caller_name = (state.caller_name or "").strip()
    reason = (state.reason or "").strip()

    try:
        appointment = db.create_appointment(
            slot_id,
            phone,
            patient_name=patient_name,
            reason=reason,
            caller_name=caller_name,
        )
    except ValueError as exc:
        await params.result_callback({"ok": False, "error": str(exc)})
        return

    payload = appointment.to_dict()
    await _emit(params, "appointment_created", appointment=payload)
    await params.result_callback(
        {
            "ok": True,
            "appointment": _appointment_for_assistant(appointment),
            "confirmation": db.appointment_summary(appointment),
        }
    )


async def cancel_appointment(params: FunctionCallParams, appointment_id: str = ""):
    """Cancel the confirmed caller's appointment.

    Args:
        appointment_id: Optional appointment id returned by check_caller_appointments. Leave empty when the caller has only one appointment.
    """
    resources = _resources(params)
    phone = resources.state.confirmed_phone
    if not phone:
        await params.result_callback(
            {
                "ok": False,
                "error": "Ask the caller to say and confirm their phone number before cancelling.",
            }
        )
        return

    active = db.active_appointments_for_phone(phone)
    if not active:
        await params.result_callback(
            {"ok": False, "error": "No active appointments were found for that number."}
        )
        return

    if appointment_id:
        target = next((item for item in active if item.id == appointment_id), None)
        if target is None:
            await params.result_callback(
                {"ok": False, "error": "That appointment was not found for this number."}
            )
            return
    elif len(active) > 1:
        await params.result_callback(
            {
                "ok": False,
                "needs_choice": True,
                "appointments": [item.to_dict() for item in active],
                "error": "The caller has more than one appointment. Ask which date and time to cancel, then call this tool with the appointment id.",
            }
        )
        return
    else:
        target = active[0]

    cancelled = db.cancel_appointment(target.id, phone)
    if not cancelled:
        await params.result_callback(
            {"ok": False, "error": "That appointment could not be cancelled."}
        )
        return

    payload = cancelled.to_dict()
    await _emit(params, "appointment_cancelled", appointment=payload)
    await params.result_callback(
        {
            "ok": True,
            "appointment": _appointment_for_assistant(cancelled),
            "confirmation": db.appointment_summary(cancelled),
        }
    )


async def check_caller_appointments(params: FunctionCallParams):
    """List the confirmed caller's active appointments.

    Call this before cancelling when the caller does not give an appointment id.
    It takes no arguments.
    """
    resources = _resources(params)
    phone = resources.state.confirmed_phone
    if not phone:
        await params.result_callback(
            {
                "ok": False,
                "error": "Ask the caller to say and confirm their phone number first.",
            }
        )
        return

    active = db.active_appointments_for_phone(phone)
    await params.result_callback(
        {
            "ok": True,
            "appointments": [_appointment_for_assistant(item) for item in active],
            "count": len(active),
        }
    )


TOOLS = (
    check_doctor_availability,
    set_caller_phone,
    confirm_caller_phone,
    record_booking_names,
    check_caller_appointments,
    book_appointment,
    cancel_appointment,
)
