"""Stateless AprilTag detection on supplied frames; no camera or robot access."""

import math
from time import time
from typing import Callable

import cv2
import numpy as np

from .calibration import TableCalibration
from .config import GesturePickConfig
from .models import DetectedTag


class AprilTagLocalizer:
    def __init__(self, config: GesturePickConfig, calibration: TableCalibration,
                 *, clock: Callable[[], float] = time):
        if calibration.camera_path != config.camera_path:
            raise ValueError("calibration camera does not match configured camera")
        self.config = config
        self.calibration = calibration
        self._clock = clock
        dictionary = cv2.aruco.getPredefinedDictionary(getattr(cv2.aruco, config.tag_dictionary))
        self._detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())

    def detect(self, frame, observed_at: float) -> list[DetectedTag]:
        """Capture timestamp and clock both use Unix seconds.

        Unknown, off-table or expired observations are omitted. Results always
        describe this frame; an absent tag is never retained from a prior frame.
        """
        now = self._clock()
        if (not math.isfinite(observed_at) or not math.isfinite(now)
                or observed_at < 0 or not 0 <= now - observed_at <= self.config.max_tag_age_s):
            return []
        if not isinstance(frame, np.ndarray) or frame.size == 0:
            return []
        if frame.dtype != np.uint8 or frame.ndim not in (2, 3):
            return []
        if frame.ndim == 3:
            if frame.shape[2] not in (3, 4):
                return []
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY if frame.shape[2] == 3 else cv2.COLOR_BGRA2GRAY)
        corners, ids, _ = self._detector.detectMarkers(frame)
        if ids is None:
            return []
        detections = []
        for marker, tag_id in zip(corners, ids.flatten()):
            tag_id = int(tag_id)
            if tag_id not in self.config.tags:
                continue
            centre = marker.reshape(4, 2).mean(axis=0)
            try:
                point = self.calibration.image_to_robot_table(centre)
            except ValueError:
                continue
            detections.append(DetectedTag(
                tag_id=tag_id, kind=self.config.tags[tag_id],
                image_center=tuple(map(float, centre)), robot_point=tuple(map(float, point)),
                observed_at=float(observed_at),
            ))
        # Conversion and detection can consume the frame's remaining lifetime.
        now = self._clock()
        if (not math.isfinite(now)
                or not 0 <= now - observed_at <= self.config.max_tag_age_s):
            return []
        return detections
