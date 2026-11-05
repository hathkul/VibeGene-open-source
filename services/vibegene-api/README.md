# VibeGene telemetry / bug-report API
#
# Local:
#   export VIBEGENE_ADMIN_PASSWORD='…'
#   pip install -r requirements.txt
#   uvicorn main:app --reload --port 8080
#

VibeGene admin UI: /admin (HTTP Basic auth)
Public endpoints:
  POST /api/v1/heartbeat
  POST /api/v1/reports
  POST /api/v1/ncbi/blast (same-origin relay for NCBI BLAST requests)
  GET  /api/v1/health
