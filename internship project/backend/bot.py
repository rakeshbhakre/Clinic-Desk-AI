from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import _compat  # noqa: F401  (must run before Pipecat imports)

from pipecat.runner.run import app as runner_app, main
from pipecat.runner.types import RunnerArguments, SmallWebRTCRunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from app.models import CallState
from app.pipeline import run_pipeline
from app.routes import router

# Dashboard API lives on the same FastAPI server that owns WebRTC signaling.
runner_app.include_router(router)


async def bot(runner_args: RunnerArguments) -> None:
    if not isinstance(runner_args, SmallWebRTCRunnerArguments):
        logger.error("This bot only supports the WebRTC transport.")
        return

    transport = SmallWebRTCTransport(
        params=TransportParams(audio_in_enabled=True, audio_out_enabled=True),
        webrtc_connection=runner_args.webrtc_connection,
    )

    # A browser cannot identify the caller. The only usable phone number is one
    # the caller speaks and confirms through set_caller_phone/confirm_caller_phone.
    state = CallState()
    await run_pipeline(transport, state, runner_args)


if __name__ == "__main__":
    main()
