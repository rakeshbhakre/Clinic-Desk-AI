# Nexov-AI Clinic — Voice Appointment Workspace

Nexov-AI Clinic is a browser-based clinic workspace for live voice-assisted booking, doctor availability, and appointment management. Ava is the clinic's voice receptionist. The interface keeps the existing platform and assistant names.

## Workspace

- **Workspace:** Start one Pipecat WebRTC call, follow the live transcript and session details, and use the desktop phone preview. The mobile-view toggle only shows or hides the preview; it never creates another call. On a physical phone, the preview frame disappears and the call interface uses the available screen directly.
- **Doctors:** Search and filter the real doctor schedule, choose a date in the supported range, and edit doctor details or availability. Booked times are protected by the backend.
- **Appointments:** Search and filter real records, reveal masked contact details when needed, inspect appointment details, and copy references. Caller and patient names remain separate when provided.

The workspace uses Newsreader, Geist, and Geist Mono, bundled locally. Its light operational surface and dark voice console use the clinic's green and eucalyptus palette. The voice orb and waveform respond to Pipecat's actual microphone and assistant audio-level events; idle and connection states use restrained state-driven motion.

## Voice and data flow

The browser sends microphone audio over WebRTC to the Pipecat runner using `SmallWebRTCTransport` and `@pipecat-ai/client-js`. Pipecat uses ElevenLabs realtime STT, Silero VAD, OpenRouter through `OpenAILLMService`, and ElevenLabs TTS. Availability and booking tools use the same SQLite database as the dashboard.

Ava does not use login, OTP, caller ID, or a number entered in the browser. She asks for a phone number verbally when booking or cancellation requires it, reads it back, and only uses it after explicit confirmation. For booking, she can collect caller and patient names separately. Names are optional metadata; declining to provide a name does not block a phone-confirmed booking. Ava does not ask for names during simple availability questions.

Confirmed phone and voluntarily provided names arrive at the interface through real Pipecat server events. `appointment_created` and `appointment_cancelled` only appear after the backend succeeds. Those events refetch the schedule and appointment list and highlight the affected row. The dashboard also polls for updates every 12 seconds.

The database migrates existing appointment records to add optional caller and patient name fields without changing existing records. Appointment metadata editing and rescheduling are not exposed in the dashboard because there is no safe appointment-write endpoint; appointment actions are limited to viewing details and copying the reference. Doctor and schedule editing use the existing backend routes.

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

From PowerShell, change into the folder containing `backend` and `frontend`. Quote the full path when it contains spaces:

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

Install frontend dependencies:

```powershell
cd frontend
npm install
cd ..
```

## Environment variables

The backend reads `.env` from the repository root and `backend/.env`; `backend/.env` takes precedence. Set the two required API keys:

```env
ELEVENLABS_API_KEY=
OPENROUTER_API_KEY=
```

Optional settings and defaults:

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

Never commit `.env` files or API keys.

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

### Provider network access on Windows

Live calls need outbound HTTPS/WebSocket access to `api.elevenlabs.io:443` and `openrouter.ai:443`. If the backend reports `WinError 5: Access is denied` while opening the ElevenLabs WebSocket, the Python process cannot open an outbound connection; Pipecat's reconnect retries cannot override that OS or sandbox restriction. Run the backend from a PowerShell process with network access, or grant that process outbound access. Do not rotate API keys based on `WinError 5` alone. Check basic host reachability with:

```powershell
Test-NetConnection api.elevenlabs.io -Port 443
Test-NetConnection openrouter.ai -Port 443
```

These checks confirm network reachability, not API-key authentication. A `401` or `403` from a fresh call points to provider credentials or account access instead.

**Terminal 2 — frontend:**

```powershell
cd frontend
npm run dev
```

Open the URL printed by Vite, usually `http://localhost:5173` or `https://localhost:5173` when local certificates exist. Vite proxies `/api`, `/start`, and `/sessions` to port `7860`.

For HTTPS, generate a local certificate from `frontend` with `npm run certs`. A phone or other device on the LAN must use the HTTPS network URL to access the microphone.

## Demo flow

1. Select **Workspace** and start a call.
2. Allow microphone access; Ava greets the caller and asks how to help.
3. For availability, ask for a doctor, specialty, date, or open time. Names and phone are not needed for this step.
4. For booking, optionally provide the caller and patient names. Say the contact phone number aloud, confirm it after Ava reads it back, choose an available slot, and confirm the booking details.
5. Confirm the appointment appears in **Appointments** and the doctor's availability updates.
6. For cancellation, provide and verbally confirm the contact number, then select the appointment to cancel.
7. Toggle the phone preview or switch tabs during the call; neither action restarts the voice session.

## API routes

- `GET /api/health`
- `GET /api/doctors`
- `GET /api/appointments`
- `GET /api/bootstrap`
- `GET /api/doctors/{doctor_id}/availability?date=YYYY-MM-DD`
- `PUT /api/doctors/{doctor_id}`
- `PUT /api/doctors/{doctor_id}/availability?date=YYYY-MM-DD`
- `POST /start`

The browser starts `/start` without a phone number. Phone identity is supplied verbally during the call.

## Tests and build

Run backend tests:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
```

The tests cover phone normalization and confirmation, optional caller and patient names, booking, schedule changes, and cancellation.

Build and type-check the frontend:

```powershell
cd frontend
npm run build
```
