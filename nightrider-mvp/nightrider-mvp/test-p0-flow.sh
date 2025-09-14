#!/bin/bash

# P0 Flow Test Script for Nightrider MVP
# Tests creating incidents and querying them

set -e

BASE_URL="https://svc-01k54pk6n30e51rhg5tcaxf49t.01k1v9y078eahcz45grz0g76p0.lmapp.run"
TEMP_DIR=$(mktemp -d)
INCIDENT_IDS=()

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

log "🚀 Starting P0 Flow Tests"
log "Testing against: $BASE_URL"
echo "============================================"

# Test 1: Create basic incident
log "Test 1: Creating basic incident"
INCIDENT_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Test Service Down",
    "description": "Test incident for P0 flow validation",
    "severity": "high"
  }')

INCIDENT_ID=$(echo "$INCIDENT_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$INCIDENT_ID" ]; then
    log "❌ FAILED: No incident ID returned"
    echo "Response: $INCIDENT_RESPONSE"
    exit 1
fi
INCIDENT_IDS+=("$INCIDENT_ID")
log "✅ PASSED: Created incident $INCIDENT_ID"

# Test 2: Create OOM incident (triggers autonomous action)
log "Test 2: Creating OOM incident"
OOM_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Pod OOM Error in production",
    "description": "Out of memory error detected in payment-service pod",
    "severity": "critical"
  }')

OOM_ID=$(echo "$OOM_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$OOM_ID" ]; then
    log "❌ FAILED: No OOM incident ID returned"
    exit 1
fi
INCIDENT_IDS+=("$OOM_ID")
log "✅ PASSED: Created OOM incident $OOM_ID"

# Test 3: Create database incident (notification only)
log "Test 3: Creating database incident"
DB_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Database connection timeout",
    "description": "Unable to connect to primary database cluster",
    "severity": "critical"
  }')

DB_ID=$(echo "$DB_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$DB_ID" ]; then
    log "❌ FAILED: No database incident ID returned"
    exit 1
fi
INCIDENT_IDS+=("$DB_ID")
log "✅ PASSED: Created database incident $DB_ID"

# Test 4: Query specific incident
log "Test 4: Querying specific incident"
QUERY_RESPONSE=$(curl -s "$BASE_URL/incidents/$INCIDENT_ID")
QUERIED_ID=$(echo "$QUERY_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

if [ "$QUERIED_ID" != "$INCIDENT_ID" ]; then
    log "❌ FAILED: Queried incident ID mismatch"
    echo "Expected: $INCIDENT_ID, Got: $QUERIED_ID"
    exit 1
fi
log "✅ PASSED: Successfully queried incident $INCIDENT_ID"

# Test 5: List all incidents
log "Test 5: Listing all incidents"
LIST_RESPONSE=$(curl -s "$BASE_URL/incidents")
INCIDENT_COUNT=$(echo "$LIST_RESPONSE" | grep -o '"count":[0-9]*' | cut -d':' -f2)

if [ -z "$INCIDENT_COUNT" ] || [ "$INCIDENT_COUNT" -eq 0 ]; then
    log "❌ FAILED: No incidents found in list"
    exit 1
fi
log "✅ PASSED: Found $INCIDENT_COUNT incidents in list"

# Test 6: Test validation (missing title)
log "Test 6: Testing validation (missing title)"
VALIDATION_RESPONSE=$(curl -s -w "%{http_code}" -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Test incident without title",
    "severity": "low"
  }')

HTTP_CODE="${VALIDATION_RESPONSE: -3}"
if [ "$HTTP_CODE" != "400" ]; then
    log "❌ FAILED: Expected 400 error for missing title, got $HTTP_CODE"
    exit 1
fi
log "✅ PASSED: Validation correctly rejected missing title"

# Test 7: Wait for GPT analysis and check results
log "Test 7: Waiting for GPT analysis (10 seconds)..."
sleep 10

for id in "${INCIDENT_IDS[@]}"; do
    log "Checking analysis for incident $id"
    ANALYSIS_RESPONSE=$(curl -s "$BASE_URL/incidents/$id")

    STATUS=$(echo "$ANALYSIS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
    log "  Status: $STATUS"

    # Check if RCA analysis exists
    if echo "$ANALYSIS_RESPONSE" | grep -q '"rca_analysis"'; then
        log "  ✅ RCA analysis available"
    fi

    # Check if actions were taken
    if echo "$ANALYSIS_RESPONSE" | grep -q '"actions_taken"'; then
        log "  ✅ Actions taken recorded"
    fi
done

# Test 8: Test 404 for nonexistent incident
log "Test 8: Testing 404 for nonexistent incident"
NOT_FOUND_RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/incidents/00000000-0000-0000-0000-000000000000")
NOT_FOUND_CODE="${NOT_FOUND_RESPONSE: -3}"

if [ "$NOT_FOUND_CODE" != "404" ]; then
    log "❌ FAILED: Expected 404 for nonexistent incident, got $NOT_FOUND_CODE"
    exit 1
fi
log "✅ PASSED: Correctly returned 404 for nonexistent incident"

echo "============================================"
log "🏁 ALL P0 FLOW TESTS PASSED!"
log "Created incidents:"
for id in "${INCIDENT_IDS[@]}"; do
    log "  - $id"
done
echo "============================================"
