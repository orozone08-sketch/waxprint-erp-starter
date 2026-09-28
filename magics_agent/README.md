# Magics Agent

This local Python agent is the bridge between the cloud/local ERP and the Windows computer running Materialise Magics.

Current starter behavior:
- Authenticates to ERP with a shared agent token.
- Polls jobs in `WAITING_MAGICS`.
- Creates protected local job folder structure.
- Contains a controlled hook to launch Magics.

Next project-specific work:
- Secure per-device credentials instead of shared token.
- Download job file package endpoint.
- Upload processed file/version endpoint.
- Call Magics Workflow Automation / SDK Python scripts if your license supports them.
- Report start/complete/checker status automatically.
