from __future__ import annotations

from fastapi import APIRouter

from . import db

router = APIRouter(prefix="/api", tags=["appointment-desk"])


@router.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "voice-appointment-desk"}


@router.get("/doctors")
async def doctors() -> dict:
    return {"doctors": db.doctors_with_slots()}


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
