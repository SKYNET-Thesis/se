from dataclasses import dataclass
from lerobot.teleoperators.config import TeleoperatorConfig

@TeleoperatorConfig.register_subclass("so101_vuer")
@dataclass
class So101VuerTeleopConfig(TeleoperatorConfig):
    urdf_name: str = "so_arm101_description"
    target_link: str = "gripper"
    user_hand: str = "right"  # "left" or "right"
    target_coord_sys: str = "ribs"  # "headset", "floor", "ribs", or "hip"
    user_height: float = 1.40  # meters
    vuer_host: str = "0.0.0.0"
    vuer_cert: str = "./cert.pem"
    vuer_key: str = "./key.pem"
    ik_hz: float = 30.0
    scene_hz: float = 15.0
    stream_camera: bool = False
    position_scale: float = 1.0
    tracking_timeout_s: float = 0.35
