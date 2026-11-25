# Nexov-AI Clinic — Voice Appointment Desk

A browser-based clinic operations workspace for doctor availability, appointments, and voice-assisted booking or cancellation. The receptionist works through a live WebRTC call; the dashboard shows the real doctor schedule and appointment records.

## What the application does

- **Overview:** Shows doctors, available slots for the selected schedule date, and confirmed appointments from the backend.
- **Doctor availability:** Browse the next three days, filter by specialty, and edit doctor names, specialties, and open slots. Booked slots are protected.
- **Appointments:** View appointment reference, caller, doctor, date, time, and status. Phone numbers are masked until explicitly revealed. Cancelled records remain distinguishable.
- **Voice console:** Start a call, view connection state and duration, mute the microphone, end the call, and read the live transcript.
- **Conversation activity:** Show only events received from the voice service, including confirmed phone numbers, availability checks, successful bookings, and cancellations. Confirmed changes refresh the dashboard and briefly highlight the affected appointment.
- **Responsive interface:** The schedule and appointment list adapt to narrower screens; the call console becomes a full-screen mobile interface.

The visual direction is **Quiet Intelligence**: warm off-white work surfaces, deep green accents, compact schedule rows, and an original sound-inspired SVG brand mark. The interface uses the existing **Nexov-AI Clinic** name. Manrope, Inter, and IBM Plex Mono are bundled locally. The dashboard does not add login, OTP, caller-ID identification, required caller names, or required visit reasons.

## Voice and data flow

The browser sends microphone audio over WebRTC to the Pipecat runner using `SmallWebRTCTransport` and `@pipecat-ai/client-js`. Pipecat uses ElevenLabs realtime STT, Silero VAD for turn handling, OpenRouter through `OpenAILLMService`, and ElevenLabs TTS. Booking and availability tools use the same SQLite database as the dashboard.

The browser starts with a **proposed** phone number. That number cannot authorize a booking or cancellation until the caller says it aloud and confirms it during the call. The agent must ask for confirmation without repeating the digits. A caller name and visit reason are not required.

The call UI consumes Pipecat client events for connection lifecycle, partial and final transcripts, conversation activity, and local/remote audio levels. Its waveform reflects those audio-level events; it does not generate decorative audio motion. Backend RTVI messages report `caller_confirmed`, `availability_checked`, `appointment_created`, and `appointment_cancelled`. Appointment changes trigger a dashboard refetch; the dashboard also polls for updates every 12 seconds.

The timer starts only after the client reports the agent ready. A failed microphone permission request or connection is shown as an error state. The call can be retried or ended from the console.

## Technology

- **Frontend:** React 19, TypeScript, Vite 8, CSS variables, and self-hosted Fontsource fonts.
- **Voice:** Pipecat 1.17, SmallWebRTC, ElevenLabs realtime STT and TTS, OpenRouter, and Silero VAD.
- **Backend:** Python 3.12+, FastAPI, and SQLite.
- **Persistence:** `backend/data/appointments.db`, shared by voice tools and dashboard APIs.

## Requirements

- Python 3.12 or newer
- Node.js 22 or newer
- An ElevenLabs API key
- An OpenRouter API key with access to a tool-calling model

## Setup on Windows

From PowerShell, change into the folder that contains `backend` and `frontend`. Quote the full path when it contains spaces, and replace this example with your repository path:

```powershell
cd "C:\path\to\repository"
```

Create the Python environment and install backend dependencies:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
cd ..
```

Install the frontend dependencies:

```powershell
cd frontend
npm install
cd ..
```

## Environment variables

The backend reads `.env` from the repository root and `backend/.env`; `backend/.env` takes precedence. Create or edit one of those files and set the two required API keys:

```env
ELEVENLABS_API_KEY=
OPENROUTER_API_KEY=
```

Optional settings and their defaults:

```env
ELEVENLABS_VOICE_ID=pNInz6obpgDQGcFmaJgB
ELEVENLABS_STT_MODEL_ID=scribe_v2_realtime
ELEVENLABS_TTS_MODEL_ID=eleven_flash_v2_5

OPENROUTER_MODEL=openai/gpt-4o-mini
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_APP_NAME=Nexov-AI Clinic

DATABASE_PATH=data/appointments.db
```

Never commit `.env` files or API keys. The repository `.gitignore` excludes them.

## Run locally

Open two PowerShell terminals at the repository root.

**Terminal 1 — backend:**

```powershell
cd backend
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"
.\.venv\Scripts\python.exe bot.py -t webrtc
```

The FastAPI and Pipecat service listens on port `7860`.

**Terminal 2 — frontend:**

```powershell
cd frontend
npm run dev
```

Open the local URL printed by Vite, usually `http://localhost:5173` or `https://localhost:5173` when local certificates exist. If port `5173` is occupied, Vite selects another port and prints that URL.

For HTTPS, generate the local certificate once from `frontend`:

```powershell
npm run certs
```

The certificates are stored under `frontend/certs/` and are ignored by Git. On desktop, `http://localhost` is a browser secure context and can request microphone access. For a phone or another device on the LAN, use the HTTPS network URL printed by Vite; browsers require a secure context for microphone and WebRTC access. Allow Node through Windows Firewall if prompted.

Vite proxies `/api`, `/start`, and `/sessions` to the backend on port `7860`.

## Demo flow

1. Click **Try call**, enter a caller number, and continue.
2. Allow microphone access. The agent asks whether to use the proposed number without reading its digits aloud.
3. Confirm the number verbally.
4. Ask for availability, choose one of the returned slots, and ask the agent to book it.
5. Verify that the console shows the confirmation and the dashboard updates the appointment and availability.
6. Ask the agent to cancel the appointment. The dashboard updates after backend confirmation.
7. End the call to see the duration and session booking/cancellation counts.

If the proposed number is wrong, say that it is incorrect and provide the replacement aloud. The agent asks for confirmation of the new number without repeating it.

## API routes

The dashboard and WebRTC signaling use the same FastAPI service:

- `GET /api/health`
- `GET /api/doctors`
- `GET /api/appointments`
- `GET /api/bootstrap`
- `GET /api/doctors/{doctor_id}/availability?date=YYYY-MM-DD`
- `PUT /api/doctors/{doctor_id}`
- `PUT /api/doctors/{doctor_id}/availability?date=YYYY-MM-DD`
- `POST /start`

`POST /start` receives the browser's WebRTC session request. A phone entered before the call is sent as `body.proposed_phone`; it is not treated as confirmed identity.

## Tests and build

Run the backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

The tests cover phone normalization, rejecting unconfirmed numbers, booking with only a confirmed phone number, schedule updates, and cancellation behavior.

Build and type-check the frontend:

```powershell
cd frontend
npm run build
```

There is no frontend lint script configured in `package.json`.

## Windows audio note

If the Visual C++ Redistributable is missing, native `loudness` or `onnxruntime` wheels may fail to import with a DLL error. `backend/app/_compat.py` provides NumPy fallbacks so the service can start; installing the Microsoft Visual C++ Redistributable restores native audio metrics and full Silero model accuracy.

## Submission

Source repository: [northstar-voice-appointment-desk](https://github.com/Omkar-Sonawane-23/northstar-voice-appointment-desk)

Assignment form: [Google Form](https://docs.google.com/forms/d/e/1FAIpQLSdruhcgKFC4LjnlwHfYDRZoGsa0r-qy4k68SJ8RsmxsPbYxpg/viewform?usp=publish-editor)
