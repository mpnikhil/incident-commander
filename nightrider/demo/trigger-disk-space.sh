#!/bin/bash

# Demo Script: High Disk Usage Alert (P3)
# This simulates a P3 disk space warning with preventive actions

API_URL="https://svc-01k52w6389xbj4hxwt4zgpckc7.01k1v9y078eahcz45grz0g76p0.lmapp.run"

echo "💾 Triggering Disk Space Demo Incident..."
echo "This will create a P3 severity incident for disk space monitoring"
echo ""

INCIDENT_DATA='{
  "source": "Prometheus",
  "alert_type": "disk_space_high",
  "severity": "P3",
  "message": "Disk usage on /var/log partition exceeded 85% threshold",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "affected_services": ["logging-service", "metrics-collector"],
  "metadata": {
    "hostname": "app-server-03.prod",
    "partition": "/var/log",
    "current_usage": "87%",
    "available_space": "2.1GB",
    "threshold": "85%",
    "trend": "increasing",
    "growth_rate": "0.5% per hour",
    "largest_files": ["/var/log/app.log (1.2GB)", "/var/log/nginx/access.log (800MB)"],
    "alert_id": "PROM-'$(date +%s)'"
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
echo "✅ Disk space incident created!"
echo "🔧 This is a P3 incident suitable for preventive maintenance"
echo "🔗 Check the UI for recommended cleanup actions"