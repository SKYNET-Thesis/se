import json
import sys
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.phone_protocol import PhonePose, parse_phone_message, phone_to_controller_packet


class PhoneProtocolTests(unittest.TestCase):
    def test_android_style_pose_becomes_shared_controller_packet(self):
        message = parse_phone_message(json.dumps({
            "type": "phone_pose",
            "protocolVersion": 1,
            "platform": "ios",
            "sessionId": "test-session",
            "sequence": 7,
            "timestampNs": 1_700_000_000_000_000_000,
            "trackingState": "tracking",
            "enabled": True,
            "fineMode": False,
            "position": {"x": 0.1, "y": 0.2, "z": -0.3},
            "quaternion": {"x": 0, "y": 0, "z": 0, "w": 1},
            "gripperVelocity": 0.0,
        }))
        self.assertIsInstance(message, PhonePose)
        packet = phone_to_controller_packet(message, arm="right", trigger=0.4)
        self.assertFalse(packet.left.connected)
        self.assertTrue(packet.right.enabled)
        self.assertEqual(packet.right.position, [-0.2, 0.1, -0.3])
        self.assertEqual(packet.right.trigger, 0.4)


if __name__ == "__main__":
    unittest.main()
