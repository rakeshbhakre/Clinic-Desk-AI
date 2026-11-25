"""Compatibility shims for Windows machines without the MSVC runtime DLLs.

Some native wheels used by Pipecat (``loudness`` and ``onnxruntime``) fail to
load when the Visual C++ redistributable is missing. Both are optional for this
demo's host-side behaviour: ``loudness`` only supplies audio-level metrics, and
the Silero VAD wrapper only needs an ONNX ``InferenceSession`` to score audio.
If the native package cannot load, install small NumPy fallbacks so the call
still starts. Deployments with the redistributable installed use the real
packages and are unaffected.
"""

from __future__ import annotations

import logging
import math
import sys
import types

logger = logging.getLogger("app.compat")


def _approx_lufs(audio, sample_rate: int) -> float:
    import numpy as np

    samples = np.asarray(audio, dtype=np.float64)
    if samples.size == 0:
        return -70.0
    rms = float(np.sqrt(np.mean(samples * samples)))
    if rms <= 1e-10:
        return -70.0
    return 20.0 * math.log10(rms) - 0.691


def _install_loudness_fallback() -> None:
    try:
        import loudness  # noqa: F401

        return
    except Exception as exc:
        logger.warning("Using RMS fallback for loudness: %s", exc)
        module = types.ModuleType("loudness")
        module.integrated_loudness = _approx_lufs
        sys.modules["loudness"] = module


class _SessionOptions:
    inter_op_num_threads = 1
    intra_op_num_threads = 1


class _InferenceSession:
    """Minimal RMS-based stand-in for Silero's ONNX session."""

    def __init__(self, path, providers=None, sess_options=None):
        self.path = path
        self.providers = providers or ["CPUExecutionProvider"]

    def run(self, output_names, feed):
        import numpy as np

        audio = np.asarray(feed.get("input"), dtype=np.float32)
        if audio.ndim == 3:
            audio = audio[0]
        rms = float(np.sqrt(np.mean(audio * audio))) if audio.size else 0.0
        confidence = np.array([[min(1.0, max(0.0, (rms - 0.004) * 14.0))]], dtype=np.float32)
        state = np.asarray(feed.get("state"), dtype=np.float32)
        return [confidence, state]


def _install_onnxruntime_fallback() -> None:
    try:
        import onnxruntime  # noqa: F401

        return
    except Exception as exc:
        logger.warning("Using RMS fallback for onnxruntime/Silero VAD: %s", exc)
        module = types.ModuleType("onnxruntime")
        module.SessionOptions = _SessionOptions
        module.InferenceSession = _InferenceSession
        module.get_available_providers = lambda: ["CPUExecutionProvider"]
        sys.modules["onnxruntime"] = module


def install() -> None:
    _install_loudness_fallback()
    _install_onnxruntime_fallback()


install()
