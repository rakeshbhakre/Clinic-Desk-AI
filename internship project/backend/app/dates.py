from __future__ import annotations

from datetime import date, timedelta


WEEKDAYS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def resolve_date(value: str | None, today: date | None = None) -> str | None:
    """Turn a spoken date into YYYY-MM-DD, or None when no date was given."""
    today = today or date.today()
    text = (value or "").strip().lower()
    if not text or text in {"any", "any day", "whatever", "all"}:
        return None
    if text == "today":
        return today.isoformat()
    if text == "tomorrow":
        return (today + timedelta(days=1)).isoformat()
    if text == "day after tomorrow":
        return (today + timedelta(days=2)).isoformat()

    for name, weekday in WEEKDAYS.items():
        if text in {name, f"next {name}"}:
            delta = (weekday - today.weekday()) % 7
            if delta == 0 or text.startswith("next "):
                delta += 7
            return (today + timedelta(days=delta)).isoformat()

    try:
        return date.fromisoformat(text).isoformat()
    except ValueError:
        return None
