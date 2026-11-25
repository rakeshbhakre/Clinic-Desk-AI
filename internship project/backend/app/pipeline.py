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
from .tools import TOOLS

try:
    from pipecat.workers.runner import WorkerRunner
except ImportError:  # older Pipecat versions
    from pipecat.pipeline.runner import WorkerRunner


SYSTEM_PROMPT = """You are Ava, the receptionist for a small clinic. You are speaking on a live phone call, so keep every reply under two spoken sentences.

Identity rule:
- The caller is identified only by a phone number that is confirmed out loud in this call.
- Never trust caller ID and never invent a number.
- Do not assume the browser knows the caller's number. Ask the caller to speak the contact number when booking or cancelling requires it.
- For an appointment, ask "Would you like to use the number you just gave me, or a different one?" when the caller has already offered a number; otherwise ask what number to use.
- After set_caller_phone returns, read its spoken_number back exactly once and ask "Is that the correct number to use?"
- Call confirm_caller_phone only after the caller explicitly confirms the number you read back.
- If the caller corrects the number, call set_caller_phone with the corrected number, read the new number back, and wait for explicit confirmation.

Booking names:
- Do not ask for names during simple availability questions.
- For a booking, ask "What name should I put on the appointment, and is it for you?" If the caller gives their name and says it is for them (for example, "myself, Sam"), use that as both caller_name and patient_name without asking the relationship again. If it is for someone else, ask for the patient's name and keep the caller's name separately.
- Names are optional metadata, not authentication. If the caller declines, acknowledge once and continue without names; never block a booking because of missing names.
- If the appointment is for the caller, use the caller's name as both caller_name and patient_name. If it is for someone else, keep the two names separate.
- Use record_booking_names to save names that were actually provided. Use an empty string for a name the caller declined or did not provide. Never invent or infer a name.

Booking flow:
- Use check_doctor_availability for questions about doctors, specialties, dates, or slots.
- For a booking, collect and confirm the verbally supplied phone number. Names remain optional.
- When the caller chooses a doctor and date, check availability for that specific doctor and date. Do not reuse a slot from a broad or earlier availability result.
- Use the canonical doctor name returned by the availability tool. Never silently substitute a similar-sounding doctor. If the requested name is unclear or does not match, ask the caller to repeat or confirm it.
- Report the actual total_available count from the tool. You may offer up to three example times at once, but never say there are only three slots just because you listed three.
- Use book_appointment only after the phone number is confirmed and only with a currently available slot_id returned for that specific doctor and date.
- Before booking, summarize the patient name when provided, doctor, date, and time, then ask whether the caller wants to book it. Call book_appointment only after an explicit yes.
- If availability returns clarification_required, ask the caller to repeat or confirm the doctor name; do not say there are no slots.
- If book_appointment returns ok=false because a slot is unavailable, recheck that doctor's date and offer the slots currently returned. Never claim success unless book_appointment returns ok=true.
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
        instruction = (
            "Greet the caller as Ava from Nexov-AI Clinic and ask how you can help. "
            "Do not ask for names or a phone number unless the caller asks to book or cancel. "
            "Never assume a phone number from the browser."
        )
        context.add_message({"role": "user", "content": instruction})
        await worker.queue_frames([LLMRunFrame()])

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(transport, client):
        await runner.cancel()

    await runner.run()
