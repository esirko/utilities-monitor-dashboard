from __future__ import annotations

import math
import random
import threading
import time
from typing import Dict, List

from flask import Blueprint, jsonify, request

from backend.config import HISTORY_RANGE_MAP

DEVICE_CONFIGS = [
    {"name": "HVAC System", "base_watts": 3200, "variance": 800, "category": "Climate"},
    {"name": "Refrigerator", "base_watts": 150, "variance": 50, "category": "Kitchen"},
    {"name": "Water Heater", "base_watts": 4500, "variance": 500, "category": "Utility", "duty_cycle": 0.3},
    {"name": "Washer/Dryer", "base_watts": 2800, "variance": 400, "category": "Laundry", "duty_cycle": 0.2},
    {"name": "Kitchen Appliances", "base_watts": 800, "variance": 600, "category": "Kitchen", "duty_cycle": 0.4},
    {"name": "Lighting", "base_watts": 400, "variance": 200, "category": "Lighting"},
    {"name": "Entertainment", "base_watts": 250, "variance": 150, "category": "Electronics"},
    {"name": "Home Office", "base_watts": 180, "variance": 80, "category": "Electronics"},
    {"name": "Garage", "base_watts": 120, "variance": 100, "category": "Utility", "duty_cycle": 0.15},
]


class DemoEnergySimulator:
    def __init__(self) -> None:
        self.devices: Dict[str, Dict[str, float | str]] = {}
        self.phase_offsets: Dict[str, float] = {}
        self.duty_cycle_states: Dict[str, bool] = {}
        self.duty_cycle_timers: Dict[str, int] = {}
        self.config_map: Dict[str, Dict[str, float | str]] = {}
        self.lock = threading.Lock()

        for index, config in enumerate(DEVICE_CONFIGS):
            device_id = f"device-{index + 1}"
            device = {
                "id": device_id,
                "name": config["name"],
                "category": config["category"],
                "status": "active",
                "watts": config["base_watts"],
            }
            self.devices[device_id] = device
            self.phase_offsets[device_id] = random.random() * math.pi * 2
            self.config_map[device_id] = config

            if "duty_cycle" in config:
                self.duty_cycle_states[device_id] = random.random() > 0.5
                self.duty_cycle_timers[device_id] = 0

    def _update_device_locked(self, device_id: str, timestamp: int) -> float:
        device = self.devices.get(device_id)
        config = self.config_map.get(device_id)

        if not device or not config:
            return 0.0

        phase_offset = self.phase_offsets.get(device_id, 0.0)
        duty_cycle = config.get("duty_cycle")
        if duty_cycle is not None:
            timer = self.duty_cycle_timers.get(device_id, 0) + 1
            self.duty_cycle_timers[device_id] = timer

            if timer > 30 and random.random() < 0.1:
                current_state = self.duty_cycle_states.get(device_id, True)
                self.duty_cycle_states[device_id] = not current_state
                self.duty_cycle_timers[device_id] = 0

            if not self.duty_cycle_states.get(device_id, True):
                watts = random.random() * 5
                device["watts"] = watts
                device["status"] = "idle"
                return watts

        time_factor = timestamp / 1000.0
        slow_wave = math.sin(time_factor * 0.1 + phase_offset) * 0.3
        fast_wave = math.sin(time_factor * 0.5 + phase_offset) * 0.15
        noise = (random.random() - 0.5) * 0.1
        variation = slow_wave + fast_wave + noise

        base_watts = config["base_watts"]
        variance = config["variance"]
        watts = base_watts + (variance * variation)
        watts = max(0.0, watts)

        device["watts"] = watts
        device["status"] = "active" if watts > base_watts * 0.1 else "idle"
        return watts

    def _generate_point_locked(self, timestamp: int) -> Dict[str, object]:
        device_watts: Dict[str, float] = {}
        total = 0.0

        for device_id in self.devices.keys():
            watts = self._update_device_locked(device_id, timestamp)
            device_watts[device_id] = round(float(watts), 3)
            total += watts

        return {
            "timestamp": timestamp,
            "devices": device_watts,
            "total": round(float(total), 3)
        }

    def generate_point(self, timestamp: int | None = None) -> Dict[str, object]:
        with self.lock:
            ts = timestamp or int(time.time() * 1000)
            return self._generate_point_locked(ts)

    def generate_history(self, seconds: int) -> List[Dict[str, object]]:
        if seconds <= 0:
            return []

        with self.lock:
            now_ms = int(time.time() * 1000)
            start_ms = now_ms - (seconds - 1) * 1000
            history: List[Dict[str, object]] = []
            for i in range(seconds):
                ts = start_ms + (i * 1000)
                history.append(self._generate_point_locked(ts))
            return history

    def get_devices(self) -> List[Dict[str, object]]:
        with self.lock:
            return [
                {
                    "id": device_id,
                    "name": device["name"],
                    "category": device["category"],
                    "status": device.get("status", "active")
                }
                for device_id, device in self.devices.items()
            ]


demo_simulator = DemoEnergySimulator()


demo_bp = Blueprint("demo", __name__, url_prefix="/api/demo")


@demo_bp.get("/devices")
def get_demo_devices():
    return jsonify({"devices": demo_simulator.get_devices()})


@demo_bp.get("/realtime")
def get_demo_realtime():
    return jsonify(demo_simulator.generate_point())


@demo_bp.get("/history")
def get_demo_history():
    time_range = request.args.get("range", "1 Min")
    seconds = HISTORY_RANGE_MAP.get(time_range, 60)
    history = demo_simulator.generate_history(seconds)
    return jsonify({"dataPoints": history})


__all__ = [
    "DemoEnergySimulator",
    "demo_simulator",
    "demo_bp",
]
