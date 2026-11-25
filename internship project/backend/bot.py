from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import _compat  # noqa: F401  (must run before Pipecat imports)

from pipecat.runner.run import app as runner_app, main
from pipecat.runner.types import RunnerArguments, SmallWebRTCRunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from app.models import CallState
from app.phone import normalize_phone
from app.pipeline import run_pipeline
from app.routes import router

logger = logging.getLogger("bot")

# Dashboard API lives on the same FastAPI server that owns WebRTC signaling.
runner_app.include_router(router)


def _proposed_phone(runner_args: RunnerArguments) -> str | None:
    body = getattr(runner_args, "body", None)
    if isinstance(body, str):
        try:
            body = json.loads(body)
        except json.JSONDecodeError:
            body = None
    if not isinstance(body, dict):
        return None

    raw = body.get("proposed_phone") or body.get("display_phone") or body.get("phone")
    if not raw:
        return None
    try:
        return normalize_phone(str(raw))
    except ValueError:
        logger.warning("Ignoring invalid pre-call phone number")
        return None


async def bot(runner_args: RunnerArguments) -> None:
    if not isinstance(runner_args, SmallWebRTCRunnerArguments):
        logger.error("This bot only supports the WebRTC transport.")
        return

    transport = SmallWebRTCTransport(
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        webrtc_connection=runner_args.webrtc_connection,
    )

    state = CallState(proposed_phone=_proposed_phone(runner_args))
    await run_pipeline(transport, state, runner_args)


if __name__ == "__main__":
    main()
