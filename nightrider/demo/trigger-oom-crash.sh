#!/bin/bash

# Demo Script: Out of Memory (OOM) Crash (Autonomous)
# This simulates a P2 OOM crash that can be auto-remediated

API_URL="https://svc-01k52w6389xbj4hxwt4zgpckc7.01k1v9y078eahcz45grz0g76p0.lmapp.run"

echo "⚠️  Triggering OOM Crash Demo Incident..."
echo "This will create a P2 severity incident with autonomous remediation capability"
echo ""

INCIDENT_DATA='{
  "source": "Kubernetes",
  "alert_type": "oom_crash",
  "severity": "P2",
  "message": "Pod analytics-worker-7d9f8b6c4d-x2m8n killed due to OOMKilled - memory limit exceeded",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "affected_services": ["analytics-service"],
  "metadata": {
    "namespace": "production",
    "pod_name": "analytics-worker-7d9f8b6c4d-x2m8n",
    "container": "analytics-processor",
    "memory_limit": "512Mi",
    "memory_usage_at_crash": "498Mi",
    "restart_count": 3,
    "node": "k8s-node-05",
    "deployment": "analytics-worker",
    "alert_id": "K8S-'$(date +%s)'",
    "can_auto_remediate": true
  }
}'

echo "📡 Sending incident alert to API..."
curl -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Nightrider-Demo/1.0" \
  -d "$INCIDENT_DATA" \
  "$API_URL/api/incidents/alert" \
  | jq '.' 2>/dev/null || echo "Response received (install jq for pretty formatting)"

echo ""
echo "✅ OOM crash incident created!"
echo "🤖 This is a P2 incident that may be autonomously remediated"
echo "🔗 Check the UI to see the agent's analysis and automatic actions"