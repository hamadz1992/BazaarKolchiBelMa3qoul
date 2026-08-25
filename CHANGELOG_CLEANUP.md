# Cleanup

- Kept automatic desktop API startup and readiness check.
- Kept desktop API listening on 0.0.0.0:8787.
- Set desktop VITE_API_URL to http://127.0.0.1:8787/api.
- Removed experimental UDP LAN discovery (UDP 8788).
- Removed temporary cash-open diagnostic logging.
- Restored cash opening logic to its original transaction flow.
