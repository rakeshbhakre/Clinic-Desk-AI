from __future__ import annotations

import re

WORD_DIGITS = {
    "zero": "0",
    "oh": "0",
    "o": "0",
    "one": "1",
    "two": "2",
    "three": "3",
    "four": "4",
    "five": "5",
    "six": "6",
    "seven": "7",
    "eight": "8",
    "nine": "9",
}

MULTIPLIERS = {
    "double": 2,
    "triple": 3,
    "quadruple": 4,
}

SPEAK_DIGITS = {
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
}


def normalize_phone(spoken: str) -> str:
    """Normalize a typed or spoken phone number to 7-15 digits.

    Handles formats such as ``+1 (415) 555-0132`` and spoken forms such as
    ``four one five, five five five, oh one three two`` or ``double one``.
    """
    text = (spoken or "").lower().strip()
    tokens = re.findall(r"[a-z]+|\d+", text)
    out: list[str] = []
    i = 0

    while i < len(tokens):
        token = tokens[i]
        if token in MULTIPLIERS and i + 1 < len(tokens):
            next_token = tokens[i + 1]
            digit = WORD_DIGITS.get(next_token)
            if digit is None and next_token.isdigit() and len(next_token) == 1:
                digit = next_token
            if digit is not None:
                out.append(digit * MULTIPLIERS[token])
                i += 2
                continue

        if token in WORD_DIGITS:
            out.append(WORD_DIGITS[token])
        elif token.isdigit():
            out.extend(token)
        i += 1

    digits = "".join(out)
    if digits.startswith("011"):
        digits = digits[3:]
    if len(digits) > 15:
        digits = digits[-15:]
    if not 7 <= len(digits) <= 15:
        raise ValueError("Phone number must contain 7 to 15 digits.")
    return digits


def format_phone(digits: str) -> str:
    digits = normalize_phone(digits) if not digits.isdigit() else digits
    if len(digits) == 10:
        return f"+1 ({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    if len(digits) == 11 and digits.startswith("1"):
        return f"+1 ({digits[1:4]}) {digits[4:7]}-{digits[7:]}"
    return f"+{digits}"


def speakable_phone(digits: str) -> str:
    digits = normalize_phone(digits) if not digits.isdigit() else digits
    if len(digits) in {10, 11}:
        local = digits[1:] if len(digits) == 11 and digits.startswith("1") else digits
        groups = [local[:3], local[3:6], local[6:]]
        spoken_groups = [" ".join(SPEAK_DIGITS.get(d, d) for d in group) for group in groups]
        prefix = "one, " if len(digits) == 11 else ""
        return prefix + ", ".join(spoken_groups)
    return ", ".join(SPEAK_DIGITS.get(d, d) for d in digits)
