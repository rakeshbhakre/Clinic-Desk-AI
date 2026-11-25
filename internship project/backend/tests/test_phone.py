from app.phone import format_phone, normalize_phone, speakable_phone


def test_normalize_typed_phone():
    assert normalize_phone("+1 (415) 555-0132") == "14155550132"


def test_normalize_spoken_phone():
    assert normalize_phone("four one five, five five five, oh one three two") == "4155550132"


def test_normalize_double_digit():
    assert normalize_phone("double one 415 oh five") == "1141505"


def test_format_phone():
    assert format_phone("14155550132") == "+1 (415) 555-0132"
    assert format_phone("4155550132") == "+1 (415) 555-0132"


def test_speakable_phone():
    assert speakable_phone("4155550132") == "four one five, five five five, zero one three two"
