from __future__ import annotations

from pipecat.audio.vad.silero import SileroVADAnalyzer
from pipecat.frames.frames import LLMRunFrame
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.worker import PipelineWorker
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
    LLMUserAggregatorParams,
)
from pipecat.services.elevenlabs.stt import CommitStrategy, ElevenLabsRealtimeSTTService
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy
from pipecat.turns.user_turn_strategies import UserTurnStrategies

from .config import settings
from .models import AppResources, CallState
from .phone import format_phone, speakable_phone
from .tools import TOOLS

try:
    from pipecat.workers.runner import WorkerRunner
except ImportError:  # older Pipecat versions
    from pipecat.pipeline.runner import WorkerRunner


SYSTEM_PROMPT = """You are Ava, the receptionist for a small clinic. You are speaking on a live phone call, so keep every reply under two spoken sentences.

Identity rule:
- The caller is identified only by a phone number that is confirmed out loud in this call.
- Never trust caller ID and never invent a number.
- A number typed before the call is only a proposed number. It is not usable until confirm_caller_phone succeeds.
- Always read the number back in digit groups and ask "Is that correct?"
- Call confirm_caller_phone only after the caller clearly says yes or that is correct.
- If the caller says no or gives another number, call set_caller_phone, read the new number back, and ask once again.

Caller details rule:
- After the phone is confirmed, ask for the caller's full name and what the visit is for.
- Call set_caller_details with both answers before booking. Do not book until it succeeds.
- If either answer is missing, ask one short follow-up question.

Booking flow:
- Use check_doctor_availability for questions about doctors, specialties, dates, or slots.
- Use book_appointment only after the phone is confirmed, set_caller_details has succeeded, and only with a slot_id returned by the availability tool.
- Use check_caller_appointments to find appointments before cancelling.
- Use cancel_appointment to cancel. If there is more than one appointment, ask which date and time, then call cancel_appointment with its appointment id.
- When a tool returns an error, say one short sentence and offer the next step.

Style: warm, direct, and professional. No markdown, no bullets, no emoji, no long lists. Offer at most three slot choices at a time."""


async def run_pipeline(transport, state: CallState, runner_args) -> None:
    settings.require_keys()

    stt = ElevenLabsRealtimeSTTService(
        api_key=settings.elevenlabs_api_key,
        commit_strategy=CommitStrategy.MANUAL,
        settings=ElevenLabsRealtimeSTTService.Settings(
            model=settings.elevenlabs_stt_model,
            language="en",
        ),
    )

    openrouter_headers: dict[str, str] = {}
    if settings.openrouter_site_url:
        openrouter_headers["HTTP-Referer"] = settings.openrouter_site_url
    if settings.openrouter_app_name:
        openrouter_headers["X-Title"] = settings.openrouter_app_name

    llm = OpenAILLMService(
        api_key=settings.openrouter_api_key,
        base_url=settings.openrouter_base_url,
        default_headers=openrouter_headers or None,
        settings=OpenAILLMService.Settings(
            model=settings.openrouter_model,
            system_instruction=SYSTEM_PROMPT,
            temperature=0.4,
            max_tokens=512,
        ),
    )

    tts = ElevenLabsTTSService(
        api_key=settings.elevenlabs_api_key,
        settings=ElevenLabsTTSService.Settings(
            voice=settings.elevenlabs_voice_id,
            model=settings.elevenlabs_tts_model,
        ),
    )

    context = LLMContext(tools=list(TOOLS))
    user_aggregator, assistant_aggregator = LLMContextAggregatorPair(
        context,
        user_params=LLMUserAggregatorParams(
            vad_analyzer=SileroVADAnalyzer(),
            user_turn_strategies=UserTurnStrategies(
                stop=[SpeechTimeoutUserTurnStopStrategy(user_speech_timeout=0.8)]
            ),
        ),
    )

    pipeline = Pipeline(
        [
            transport.input(),
            stt,
            user_aggregator,
            llm,
            tts,
            transport.output(),
            assistant_aggregator,
        ]
    )

    resources = AppResources(state=state)
    worker = PipelineWorker(pipeline, app_resources=resources)
    resources.worker = worker

    runner = WorkerRunner(handle_sigint=getattr(runner_args, "handle_sigint", False))
    await runner.add_workers(worker)

    @worker.rtvi.event_handler("on_client_ready")
    async def on_client_ready(rtvi):
        if state.proposed_phone:
            instruction = (
                f"The number typed before the call is {format_phone(state.proposed_phone)}. "
                f"Start by saying: 'I have your number as {speakable_phone(state.proposed_phone)}. "
                "Is that correct?' Wait for the caller to answer before doing anything else."
            )
        else:
            instruction = (
                "Start by asking the caller to say the phone number they want to use. "
                "Do not mention that this is a pre-call number."
            )
        context.add_message({"role": "user", "content": instruction})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        await runner.cancel()

    await runner.run()
