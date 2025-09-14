#!/bin/bash

# Demo Script: Database Outage Incident (Semi-Autonomous)
# This simulates a P0 database outage that requires human approval for remediation

API_URL="https://svc-01k52w6389xbj4hxwt4zgpckc7.01k1v9y078eahcz45grz0g76p0.lmapp.run"

echo "🔥 Triggering Database Outage Demo Incident..."
echo "This will create a P0 severity incident requiring human approval for remediation"
echo ""

INCIDENT_DATA='{
  "source": "DataDog",
  "alert_type": "database_outage",
  "severity": "P0",
  "message": "Primary PostgreSQL database cluster is down - all write operations failing",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
  "affected_services": ["user-service", "order-service", "payment-service"],
  "metadata": {
    "cluster_id": "pg-prod-cluster-01",
    "region": "us-west-2",
    "error_rate": "100%",
    "last_successful_connection": "'$(date -u -d '5 minutes ago' +"%Y-%m-%dT%H:%M:%S.%3NZ")'",
    "replica_status": "healthy",
    "connection_pool_exhausted": true,
    "alert_id": "DD-'$(date +%s)'"
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
echo "✅ Database outage incident created!"
echo "💡 This is a P0 incident requiring human approval before remediation"
echo "🔗 Check the UI to view analysis and approve/deny remediation actions"