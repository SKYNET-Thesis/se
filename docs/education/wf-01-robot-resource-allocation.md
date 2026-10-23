# WF-01 Robot Resource Allocation

School Admins may allocate only a Robot Resource entitled to their classroom's organization. The allocation is a standing authorization, not runtime execution, booking, or reservation. A classroom has one allocation; allocating another eligible robot atomically replaces it. The current implementation does not create runtime sessions, command CHECKIK, or move hardware.

See `wf-01-robot-resource-allocation.puml` for the implemented flow.
