from __future__ import annotations

import asyncio
from datetime import date, timedelta

import pytest

from app import db
from app.config import settings
from app.models import AppResources, CallState
from app.tools import (
    book_appointment,
    cancel_appointment,
    check_doctor_availability,
    confirm_caller_phone,
    record_booking_names,
    set_caller_phone,
)


class FakeWorker:
    def __init__(self):
        self.frames = []

    async def queue_frame(self, frame):
        self.frames.append(frame)


class FakeParams:
    def __init__(self, state: CallState):
        self.worker = FakeWorker()
        self.pipeline_worker = self.worker
        self.app_resources = AppResources(state=state)
        self.results = []

    async def result_callback(self, result, properties=None):
        self.results.append(result)


@pytest.fixture
def isolated_db(tmp_path):
    old_path = settings.database_path
    object.__setattr__(settings, "database_path", tmp_path / "test.db")
    db.init_db()
    yield
    object.__setattr__(settings, "database_path", old_path)


async def _confirm_phone_and_patient(
    params: FakeParams, caller_name="Avery Doe", patient_name="Jordan Lee"
):
    await confirm_caller_phone(params)
    await record_booking_names(params, caller_name, patient_name)


def test_typed_number_without_confirmation_cannot_book(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(book_appointment(params, slot_id))

    assert params.results[0]["ok"] is False
    assert db.list_appointments() == []


def test_confirmed_number_can_book_and_slot_disappears(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(_confirm_phone_and_patient(params))
    asyncio.run(book_appointment(params, slot_id))

    assert params.results[0]["ok"] is True
    assert params.results[1]["ok"] is True
    assert params.results[2]["ok"] is True
    appointment = db.list_appointments()[0]
    assert appointment["status"] == "confirmed"
    assert appointment["patientName"] == "Jordan Lee"
    assert appointment["reason"] == ""
    assert slot_id not in {slot.slot_id for slot in db.available_slots()}
    assert len(params.worker.frames) == 3


def test_booking_taken_slot_does_not_create_duplicate_appointment(isolated_db):
    day = (date.today() + timedelta(days=1)).isoformat()
    slot_id = f"d2-{day}-09:30"
    db.create_appointment(slot_id, "14155550132", "Existing patient")
    params = FakeParams(CallState(confirmed_phone="14155550132"))

    asyncio.run(book_appointment(params, slot_id))

    assert params.results[-1]["ok"] is False
    assert "just taken" in params.results[-1]["error"]
    assert len(db.list_appointments()) == 1


def test_booking_allows_declined_optional_names(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(confirm_caller_phone(params))
    asyncio.run(record_booking_names(params, "", ""))
    asyncio.run(book_appointment(params, slot_id))
    assert params.results[-1]["ok"] is True
    assert db.list_appointments()[0]["patientName"] == ""
    assert db.list_appointments()[0]["callerName"] == ""
    assert db.list_appointments()[0]["reason"] == ""


def test_corrected_number_requires_a_new_confirmation(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    asyncio.run(_confirm_phone_and_patient(params))
    asyncio.run(set_caller_phone(params, "415 555 0199"))

    assert params.app_resources.state.confirmed_phone is None

    slot_id = db.available_slots()[0].slot_id
    asyncio.run(book_appointment(params, slot_id))
    assert params.results[-1]["ok"] is False
    assert db.list_appointments() == []

    asyncio.run(confirm_caller_phone(params))
    asyncio.run(book_appointment(params, slot_id))
    assert params.results[-1]["ok"] is True
    assert db.list_appointments()[0]["phone"] == "4155550199"


def test_caller_and_patient_names_are_saved_separately(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(_confirm_phone_and_patient(params, "Avery Doe", "Jordan Lee"))
    asyncio.run(book_appointment(params, slot_id))

    appointment = db.list_appointments()[0]
    assert appointment["callerName"] == "Avery Doe"
    assert appointment["patientName"] == "Jordan Lee"


def test_doctor_rename_updates_active_appointment_display_name(isolated_db):
    day = (date.today() + timedelta(days=1)).isoformat()
    slot_id = f"d2-{day}-09:30"
    active = db.create_appointment(slot_id, "14155550132", "Jordan Lee")

    db.update_doctor("d2", "Dr. Sarvesh Mahajan", "Dermatology")

    saved = db.list_appointments()[0]
    assert saved["id"] == active.id
    assert saved["slotId"] == slot_id
    assert saved["doctorName"] == "Dr. Sarvesh Mahajan"
    assert slot_id not in {slot.slot_id for slot in db.available_slots("Dr. Sarvesh Mahajan", day)}


def test_unknown_spoken_doctor_requests_clarification_not_zero_availability(isolated_db):
    db.update_doctor("d2", "Dr. Sarvesh Mahajan", "Dermatology")
    params = FakeParams(CallState())

    asyncio.run(check_doctor_availability(params, doctor="Dr. Zorblax Quinton", date="tomorrow"))

    result = params.results[-1]
    assert result["ok"] is False
    assert result["clarification_required"] is True
    assert any(item["name"] == "Dr. Sarvesh Mahajan" for item in result["doctors"])


def test_slightly_misheard_doctor_name_still_finds_matching_slots(isolated_db):
    db.update_doctor("d2", "Dr. Sarvesh Mahajan", "Dermatology")
    params = FakeParams(CallState())

    asyncio.run(check_doctor_availability(params, doctor="Dr. Sarvesh Mahan", date="tomorrow"))

    result = params.results[-1]
    assert result["ok"] is True
    assert any(item["name"] == "Dr. Sarvesh Mahajan" for item in result["doctors"])


def test_confirmed_doctor_name_returns_real_tomorrow_slots(isolated_db):
    db.update_doctor("d2", "Dr. Sarvesh Mahajan", "Dermatology")
    params = FakeParams(CallState())

    asyncio.run(check_doctor_availability(params, doctor="Dr. Sarvesh Mahajan", date="tomorrow"))

    result = params.results[-1]
    assert result["ok"] is True
    sarvesh = next(item for item in result["doctors"] if item["name"] == "Dr. Sarvesh Mahajan")
    assert [slot["time"] for slot in sarvesh["available_slots"]] == [
        "09:30", "10:30", "11:30", "14:00", "15:00", "16:00"
    ]


def test_generic_which_doctor_question_checks_all_doctors(isolated_db):
    params = FakeParams(CallState())

    asyncio.run(
        check_doctor_availability(
            params,
            doctor="Which doctor, uh, who is available",
            date="tomorrow",
        )
    )

    result = params.results[-1]
    assert result["ok"] is True
    assert result["total_available"] > 0
    assert len(result["doctors"]) == 4


def test_cancel_twice_does_not_double_cancel(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(_confirm_phone_and_patient(params))
    asyncio.run(book_appointment(params, slot_id))
    asyncio.run(cancel_appointment(params))
    asyncio.run(cancel_appointment(params))

    assert params.results[-2]["ok"] is True
    assert params.results[-1]["ok"] is False
    assert db.list_appointments()[0]["status"] == "cancelled"
