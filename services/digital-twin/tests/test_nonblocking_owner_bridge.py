import time

from vista_digital_twin.lelab_owner_bridge import NonBlockingLeLabOwnerPublisher


def test_nonblocking_owner_bridge_never_waits_for_an_outage_and_keeps_only_latest_frame():
    started = []

    def blocked_sender(_payload):
        started.append(_payload)
        time.sleep(0.2)

    publisher = NonBlockingLeLabOwnerPublisher(
        endpoint="http://127.0.0.1:8767",
        token="publisher-token",
        owner_id="lelab-a",
        organization_id="org-a",
        robot_id="so101-a",
        sender=blocked_sender,
    )
    try:
        began = time.monotonic()
        for sample in range(20):
            publisher.publish_observation({"shoulder_pan.pos": sample})
        assert time.monotonic() - began < 0.05
        assert publisher.dropped_frames > 0
        assert publisher.pending_frames <= 1
    finally:
        publisher.close()
