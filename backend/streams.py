from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional

from flask import Blueprint, abort, jsonify, request

VALID_STREAMS = {"gas", "water"}


@dataclass
class SelectionRect:
    x: float
    y: float
    width: float
    height: float


_stream_selections: Dict[str, Optional[SelectionRect]] = {stream: None for stream in VALID_STREAMS}

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
    """Placeholder for downstream analytics on a selected region."""
    # TODO: Implement domain-specific analysis for the provided frame region.
    _ = (stream_name, frame, selection)


__all__ = [
    "streams_bp",
    "update_selection",
    "get_stream_selection",
    "analyze_frame",
]
