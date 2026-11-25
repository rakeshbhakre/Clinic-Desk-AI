from __future__ import annotations

import asyncio

import pytest

from app import db
from app.config import settings
from app.models import AppResources, CallState
from app.tools import (
    book_appointment,
    cancel_appointment,
    confirm_caller_phone,
    set_caller_details,
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


async def _confirm_and_describe(params: FakeParams, name="Jordan Lee", reason="Annual checkup"):
    await confirm_caller_phone(params)
    await set_caller_details(params, name, reason)


def test_typed_number_without_confirmation_cannot_book(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(book_appointment(params, slot_id))

    assert params.results[0]["ok"] is False
    assert db.list_appointments() == []


def test_confirmed_number_can_book_and_slot_disappears(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(_confirm_and_describe(params))
    asyncio.run(book_appointment(params, slot_id))

    assert params.results[0]["ok"] is True
    assert params.results[1]["ok"] is True
    assert params.results[2]["ok"] is True
    appointment = db.list_appointments()[0]
    assert appointment["status"] == "confirmed"
    assert appointment["patientName"] == "Jordan Lee"
    assert appointment["reason"] == "Annual checkup"
    assert slot_id not in {slot.slot_id for slot in db.available_slots()}
    assert len(params.worker.frames) == 3


def test_booking_does_not_require_name_or_reason(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(confirm_caller_phone(params))
    asyncio.run(book_appointment(params, slot_id))
    assert params.results[-1]["ok"] is True
    assert db.list_appointments()[0]["patientName"] == ""
    assert db.list_appointments()[0]["reason"] == ""


def test_corrected_number_requires_a_new_confirmation(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    asyncio.run(_confirm_and_describe(params))
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


def test_cancel_twice_does_not_double_cancel(isolated_db):
    params = FakeParams(CallState(proposed_phone="14155550132"))
    slot_id = db.available_slots()[0].slot_id

    asyncio.run(_confirm_and_describe(params))
    asyncio.run(book_appointment(params, slot_id))
    asyncio.run(cancel_appointment(params))
    asyncio.run(cancel_appointment(params))

    assert params.results[-2]["ok"] is True
    assert params.results[-1]["ok"] is False
    assert db.list_appointments()[0]["status"] == "cancelled"
