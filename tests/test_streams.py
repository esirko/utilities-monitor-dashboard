import numpy as np

from backend import streams


def test_analyze_water_region_flips_before_preprocessing():
    original_prepare = streams._prepare_frame_for_ocr
    original_record = streams._record_analysis
    original_pytesseract = streams.pytesseract

    processed_frames: dict[str, np.ndarray] = {}
    recorded_payloads: list[tuple[str, dict[str, object]]] = []

    class DummyTesseract:
        def image_to_string(self, image, config=None):
            processed_frames["ocr_input"] = image
            return "1 2 3 4"

    def stub_prepare(frame):
        processed_frames["preprocessed"] = frame
        return frame

    def stub_record(stream_name: str, payload: dict[str, object]):
        recorded_payloads.append((stream_name, payload))

    try:
        streams._prepare_frame_for_ocr = stub_prepare
        streams._record_analysis = stub_record
        streams.pytesseract = DummyTesseract()

        selection = streams.SelectionRect(x=0, y=0, width=1, height=1)
        cropped = np.array([[1, 2], [3, 4]], dtype=np.uint8)

        streams._analyze_water_region(cropped, selection)

        assert "preprocessed" in processed_frames
        np.testing.assert_array_equal(
            processed_frames["preprocessed"],
            np.flipud(cropped),
        )

        assert recorded_payloads, "Expected analysis payload to be recorded"
        stream_name, payload = recorded_payloads[0]
        assert stream_name == "water"
        assert payload["status"] == "ok"
        assert payload["values"] == ["1", "2", "3", "4"]
    finally:
        streams._prepare_frame_for_ocr = original_prepare
        streams._record_analysis = original_record
        streams.pytesseract = original_pytesseract
