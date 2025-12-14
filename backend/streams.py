from __future__ import annotations

import datetime
import re
from dataclasses import dataclass
from typing import Dict, Optional

import numpy as np

try:  # pragma: no cover - optional dependency
    import cv2  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    cv2 = None

try:  # pragma: no cover - optional dependency
    import pytesseract  # type: ignore[import-not-found]
except ImportError:  # pragma: no cover
    pytesseract = None

from flask import Blueprint, abort, jsonify, request

VALID_STREAMS = {"gas", "water"}


@dataclass
class SelectionRect:
    x: float
    y: float
    width: float
    height: float


_stream_selections: Dict[str, Optional[SelectionRect]] = {stream: None for stream in VALID_STREAMS}
_analysis_results: Dict[str, Dict[str, object]] = {stream: {} for stream in VALID_STREAMS}

streams_bp = Blueprint("streams", __name__, url_prefix="/api/streams")


def _parse_selection(payload: dict | None) -> Optional[SelectionRect]:
    if not payload:
        return None

    required = {"x", "y", "width", "height"}
    if not required.issubset(payload):
        raise ValueError("Selection payload must include x, y, width, and height")

    try:
        x = float(payload["x"])
        y = float(payload["y"])
        width = float(payload["width"])
        height = float(payload["height"])
    except (TypeError, ValueError) as exc:  # pragma: no cover - validation path
        raise ValueError("Selection coordinates must be numeric") from exc

    for value in (x, y, width, height):
        if value < 0 or value > 1:
            raise ValueError("Selection coordinates must be within [0, 1]")

    return SelectionRect(x=x, y=y, width=width, height=height)


@streams_bp.post("/<stream_name>/selection")
def update_selection(stream_name: str):
    stream = stream_name.lower()
    if stream not in VALID_STREAMS:
        abort(404, description="Unknown stream")

    data = request.get_json(silent=True) or {}
    try:
        selection = _parse_selection(data.get("selection"))
    except ValueError as exc:
        abort(400, description=str(exc))

    _stream_selections[stream] = selection

    response = None
    if selection is not None:
        response = {
            "x": selection.x,
            "y": selection.y,
            "width": selection.width,
            "height": selection.height,
        }

    return jsonify({
        "success": True,
        "selection": response,
    })


def get_stream_selection(stream_name: str) -> Optional[SelectionRect]:
    return _stream_selections.get(stream_name)


def analyze_frame(stream_name: str, frame) -> None:  # pragma: no cover - placeholder
    """Stub entry point for future frame analysis.

    When RTSP frames are proxied, this hook receives the current stream name,
    the decoded frame (as a numpy array), and the most recent user-defined
    selection. Replace this stub with real anomaly detection, OCR, or other
    analytics as requirements evolve.
    """

    selection = _stream_selections.get(stream_name)
    if selection is None:
        return

    _analyze_selected_region(stream_name, frame, selection)


def _analyze_selected_region(stream_name: str, frame, selection: SelectionRect) -> None:  # pragma: no cover - placeholder
    """Dispatch region analysis for a stream based on the latest selection."""

    if frame is None:
        return

    cropped = _crop_frame_to_selection(frame, selection)
    if cropped is None:
        return

    # Bypass analysis for now - it apparently runs synchronously and needs some work to be useful
    return

    if stream_name == "gas":
        _analyze_gas_region(cropped, selection)
    elif stream_name == "water":
        _analyze_water_region(cropped, selection)


def _crop_frame_to_selection(frame, selection: SelectionRect):
    if frame is None or selection is None:
        return None

    if not hasattr(frame, "shape"):
        return None
    if cv2 is None:
        # We can still slice raw numpy array even without cv2 installed.
        pass

    height, width = frame.shape[:2]
    if width == 0 or height == 0:
        return None

    x1 = max(int(selection.x * width), 0)
    y1 = max(int(selection.y * height), 0)
    w = max(int(selection.width * width), 1)
    h = max(int(selection.height * height), 1)

    x2 = min(x1 + w, width)
    y2 = min(y1 + h, height)

    if x1 >= x2 or y1 >= y2:
        return None

    return frame[y1:y2, x1:x2]


def _record_analysis(stream_name: str, payload: Dict[str, object]) -> None:
    _analysis_results[stream_name] = {
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat(),
        **payload,
    }


def _analyze_gas_region(cropped, selection: SelectionRect) -> None:  # pragma: no cover - placeholder
    """Placeholder for gas-meter analysis. To be implemented."""

    _record_analysis(
        "gas",
        {
            "selection": selection.__dict__,
            "status": "pending",
            "notes": "Gas meter analysis not yet implemented.",
        },
    )


def _analyze_water_region(cropped, selection: SelectionRect) -> None:  # pragma: no cover - placeholder
    """Perform rudimentary OCR on the selected region to extract four numbers."""

    if pytesseract is None:
        _record_analysis(
            "water",
            {
                "selection": selection.__dict__,
                "status": "pytesseract-missing",
                "values": [],
            },
        )
        return

    flipped = np.flipud(cropped) # should be np.rot90(cropped, 2)?
    processed = _prepare_frame_for_ocr(flipped)

    try:
        ocr_text = pytesseract.image_to_string(processed, config="--psm 6")
    except Exception as exc:  # pragma: no cover - OCR runtime path
        _record_analysis(
            "water",
            {
                "selection": selection.__dict__,
                "status": "ocr-failed",
                "error": str(exc),
                "values": [],
            },
        )
        return

    numbers = re.findall(r"\d+(?:\.\d+)?", ocr_text or "")
    values = numbers[:4]

    _record_analysis(
        "water",
        {
            "selection": selection.__dict__,
            "status": "ok" if values else "no-values",
            "raw_text": ocr_text.strip() if ocr_text else "",
            "values": values,
        },
    )


def _prepare_frame_for_ocr(frame) -> np.ndarray:
    image = frame
    if cv2 is not None:
        if len(frame.shape) == 3:
            image = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        else:
            image = frame
        image = cv2.resize(image, None, fx=2.0, fy=2.0, interpolation=cv2.INTER_CUBIC)
        image = cv2.GaussianBlur(image, (3, 3), 0)
        _, image = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    else:
        # Fall back to numpy operations when cv2 is unavailable.
        if len(frame.shape) == 3:
            image = np.mean(frame, axis=2)
        image = (image - image.min()) / (image.ptp() + 1e-6)
        image = (image * 255).astype(np.uint8)
    return image


__all__ = [
    "streams_bp",
    "update_selection",
    "get_stream_selection",
    "analyze_frame",
]
