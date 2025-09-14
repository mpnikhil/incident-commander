#!/bin/bash

# Test Script for Nightrider SRE Agent Endpoints
# This script tests all API endpoints with sample data

API_URL="https://svc-01k535gxp3qq0cqn46y4zbe9ee.01k1v9y078eahcz45grz0g76p0.lmapp.run"

echo "🧪 Testing Nightrider SRE Agent API Endpoints"
echo "API URL: $API_URL"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print test headers
print_test() {
    echo -e "\n${BLUE}📡 Testing: $1${NC}"
    echo "---"
}

# Function to print success
print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

# Function to print error
print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Function to print warning
print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# 1. Test Health Endpoint
print_test "Health Check"
response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET "$API_URL/health")
http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 200 ]; then
    print_success "Health check passed"
    echo "Response: $body"
else
    print_error "Health check failed (HTTP $http_status)"
    echo "Response: $body"
fi

# 2. Create Database Outage Incident (P0)
print_test "Create P0 Database Outage Incident"
DATABASE_INCIDENT='{
  "source": "DataDog",
  "alert_type": "database_outage",
  "severity": "P0",
  "message": "Primary PostgreSQL database cluster is down - all write operations failing",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
  "affected_services": ["user-service", "order-service", "payment-service"],
  "metadata": {
    "cluster_id": "pg-prod-cluster-01",
    "region": "us-west-2",
    "error_rate": "100%",
    "last_successful_connection": "'$(date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ")'",
    "replica_status": "healthy",
    "connection_pool_exhausted": true,
    "alert_id": "DD-'$(date +%s)'"
  }
}'

response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Nightrider-Test/1.0" \
  -d "$DATABASE_INCIDENT" \
  "$API_URL/api/incidents/alert")

http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 200 ] || [ "$http_status" -eq 201 ]; then
    print_success "P0 incident created"
    DB_INCIDENT_ID=$(echo $body | jq -r '.incident_id' 2>/dev/null || echo "ID_NOT_FOUND")
    echo "Incident ID: $DB_INCIDENT_ID"
    echo "Response: $body"
else
    print_error "Failed to create P0 incident (HTTP $http_status)"
    echo "Response: $body"
fi

# 3. Create OOM Crash Incident (P2)
print_test "Create P2 OOM Crash Incident"
OOM_INCIDENT='{
  "source": "Kubernetes",
  "alert_type": "oom_crash",
  "severity": "P2",
  "message": "Pod analytics-worker-7d9f8b6c4d-x2m8n killed due to OOMKilled - memory limit exceeded",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
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

response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Nightrider-Test/1.0" \
  -d "$OOM_INCIDENT" \
  "$API_URL/api/incidents/alert")

http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 200 ] || [ "$http_status" -eq 201 ]; then
    print_success "P2 incident created"
    OOM_INCIDENT_ID=$(echo $body | jq -r '.incident_id' 2>/dev/null || echo "ID_NOT_FOUND")
    echo "Incident ID: $OOM_INCIDENT_ID"
    echo "Response: $body"
else
    print_error "Failed to create P2 incident (HTTP $http_status)"
    echo "Response: $body"
fi

# 4. Create Disk Space Alert (P3)
print_test "Create P3 Disk Space Alert"
DISK_INCIDENT='{
  "source": "Prometheus",
  "alert_type": "disk_space_high",
  "severity": "P3",
  "message": "Disk usage on /var/log partition exceeded 85% threshold",
  "timestamp": "'$(date -u +"%Y-%m-%dT%H:%M:%SZ")'",
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

response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -H "User-Agent: Nightrider-Test/1.0" \
  -d "$DISK_INCIDENT" \
  "$API_URL/api/incidents/alert")

http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 200 ] || [ "$http_status" -eq 201 ]; then
    print_success "P3 incident created"
    DISK_INCIDENT_ID=$(echo $body | jq -r '.incident_id' 2>/dev/null || echo "ID_NOT_FOUND")
    echo "Incident ID: $DISK_INCIDENT_ID"
    echo "Response: $body"
else
    print_error "Failed to create P3 incident (HTTP $http_status)"
    echo "Response: $body"
fi

# Wait a bit for processing
print_test "Waiting 5 seconds for incident processing..."
sleep 5

# 5. Test Get Incident Details (if we have an ID)
if [ "$DB_INCIDENT_ID" != "ID_NOT_FOUND" ] && [ "$DB_INCIDENT_ID" != "" ] && [ "$DB_INCIDENT_ID" != "null" ]; then
    print_test "Get Database Incident Details"
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET \
      -H "Content-Type: application/json" \
      "$API_URL/incidents/$DB_INCIDENT_ID")

    http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
    body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

    if [ "$http_status" -eq 200 ]; then
        print_success "Retrieved incident details"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        print_error "Failed to get incident details (HTTP $http_status)"
        echo "Response: $body"
    fi
else
    print_warning "Skipping incident details test - no valid incident ID"
fi

# 6. Test Get Analysis (if we have an ID)
if [ "$OOM_INCIDENT_ID" != "ID_NOT_FOUND" ] && [ "$OOM_INCIDENT_ID" != "" ] && [ "$OOM_INCIDENT_ID" != "null" ]; then
    print_test "Get OOM Incident Analysis"
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET \
      -H "Content-Type: application/json" \
      "$API_URL/incidents/$OOM_INCIDENT_ID/analysis")

    http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
    body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

    if [ "$http_status" -eq 200 ]; then
        print_success "Retrieved incident analysis"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        print_error "Failed to get incident analysis (HTTP $http_status)"
        echo "Response: $body"
    fi
else
    print_warning "Skipping analysis test - no valid incident ID"
fi

# 7. Test Trigger Remediation (if we have an ID)
if [ "$DISK_INCIDENT_ID" != "ID_NOT_FOUND" ] && [ "$DISK_INCIDENT_ID" != "" ] && [ "$DISK_INCIDENT_ID" != "null" ]; then
    print_test "Trigger Remediation for Disk Alert"
    response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
      -H "Content-Type: application/json" \
      -d '{"approved": true}' \
      "$API_URL/incidents/$DISK_INCIDENT_ID/remediate")

    http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
    body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

    if [ "$http_status" -eq 200 ]; then
        print_success "Remediation triggered successfully"
        echo "Response: $body" | jq '.' 2>/dev/null || echo "Response: $body"
    else
        print_error "Failed to trigger remediation (HTTP $http_status)"
        echo "Response: $body"
    fi
else
    print_warning "Skipping remediation test - no valid incident ID"
fi

# 8. Test Invalid Endpoints
print_test "Test Invalid Endpoint (should return 404)"
response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X GET "$API_URL/api/invalid")
http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 404 ]; then
    print_success "404 endpoint correctly returns 404"
else
    print_warning "Unexpected response for invalid endpoint (HTTP $http_status)"
fi

# 9. Test Malformed JSON
print_test "Test Malformed JSON (should return 400)"
response=$(curl -s -w "HTTP_STATUS:%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"invalid": json}' \
  "$API_URL/api/incidents/alert")

http_status=$(echo $response | grep -o "HTTP_STATUS:[0-9]*" | cut -d':' -f2)
body=$(echo $response | sed -E 's/HTTP_STATUS:[0-9]*$//')

if [ "$http_status" -eq 400 ]; then
    print_success "Malformed JSON correctly returns 400"
else
    print_warning "Unexpected response for malformed JSON (HTTP $http_status)"
    echo "Response: $body"
fi

# Summary
echo -e "\n${BLUE}=================================================="
echo "🏁 Testing Complete!"
echo -e "==================================================${NC}"

echo -e "\n📋 Summary:"
echo "- Health Check: Tested"
echo "- P0 Database Incident: Created (ID: $DB_INCIDENT_ID)"
echo "- P2 OOM Incident: Created (ID: $OOM_INCIDENT_ID)"
echo "- P3 Disk Alert: Created (ID: $DISK_INCIDENT_ID)"
echo "- Incident Details: Tested"
echo "- Analysis: Tested"
echo "- Remediation: Tested"
echo "- Error Handling: Tested"

echo -e "\n💡 Next Steps:"
echo "1. Check the UI at ui/index.html to see these incidents"
echo "2. Monitor the agent's analysis and remediation actions"
echo "3. Test the demo buttons in the UI for additional incidents"

echo -e "\n🔗 API URL: $API_URL"
echo -e "📊 Dashboard: Open ui/index.html in your browser\n"
