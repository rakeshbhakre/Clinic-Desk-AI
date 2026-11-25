from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from . import db

router = APIRouter(prefix="/api", tags=["appointment-desk"])


class DoctorUpdate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    specialty: str = Field(min_length=1, max_length=100)


class ScheduleUpdate(BaseModel):
    times: list[str] = Field(max_length=24)


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "voice-appointment-desk"}


@router.get("/doctors")
async def doctors() -> dict:
    return {"doctors": db.doctors_with_slots()}


@router.put("/doctors/{doctor_id}")
async def update_doctor(doctor_id: str, request: DoctorUpdate) -> dict:
    try:
        doctor = db.update_doctor(doctor_id, request.name, request.specialty)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found.")
    return {"doctor": doctor}


@router.get("/doctors/{doctor_id}/availability")
async def doctor_schedule(
    doctor_id: str, date: str = Query(..., description="Date in YYYY-MM-DD format")
) -> dict:
    try:
        return db.doctor_schedule(doctor_id, date)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.put("/doctors/{doctor_id}/availability")
async def update_doctor_schedule(
    doctor_id: str,
    request: ScheduleUpdate,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
) -> dict:
    try:
        return db.update_doctor_schedule(doctor_id, date, request.times)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/appointments")
async def appointments() -> dict:
    items = db.list_appointments()
    active = [item for item in items if item["status"] == "confirmed"]
    return {"appointments": items, "activeCount": len(active)}


@router.get("/bootstrap")
async def bootstrap() -> dict:
    items = db.list_appointments()
    return {
        "doctors": db.doctors_with_slots(),
        "appointments": items,
        "activeCount": len([item for item in items if item["status"] == "confirmed"]),
    }
