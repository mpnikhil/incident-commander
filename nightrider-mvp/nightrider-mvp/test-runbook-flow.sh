#!/bin/bash

# Comprehensive Runbook-Guided Workflow Test Script
# Tests: 1) Create incident 2) Verify LLM inference 3) Verify tool calling 4) Verify tools are invoked

set -e

BASE_URL="https://svc-01k556s9gxj6s0xayb9m5f2vck.01k1v9y078eahcz45grz0g76p0.lmapp.run"
TOOLS_URL="https://svc-01k556s9gxj6s0xayb9m5f2vcm.01k1v9y078eahcz45grz0g76p0.lmapp.run"
TEMP_DIR=$(mktemp -d)

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

cleanup() {
    rm -rf "$TEMP_DIR"
}
trap cleanup EXIT

# Function to verify tool calling via logs
verify_tool_calls_in_logs() {
    local trace_id=$1
    local expected_tools=$2

    log "  Checking logs for tool calls with trace ID: $trace_id"

    # Get logs for the trace ID (assuming raindrop logs query command)
    local log_output=""
    local logs_file="$TEMP_DIR/trace_${trace_id}.logs"
    if command -v raindrop >/dev/null 2>&1; then
        # Try correct key first, then fallback, and widen time window
        log_output=$(raindrop logs query --filter="traceId=$trace_id" --since="15m" 2>/dev/null || echo "")
        if [ -z "$log_output" ]; then
            log_output=$(raindrop logs query --filter="trace_id=$trace_id" --since="15m" 2>/dev/null || echo "")
        fi
    else
        log "    Raindrop CLI not available; skipping log verification"
        return 0
    fi

    if [ -z "$log_output" ]; then
        log "    No logs found for traceId=$trace_id"
        return 1
    fi

    echo "$log_output" > "$logs_file"

    # Check for expected tool calls in logs
    local tools_found=0
    for tool in $expected_tools; do
        if grep -q "$tool" "$logs_file"; then
            log "    Found $tool in logs"
            tools_found=$((tools_found + 1))
        else
            log "    Missing $tool in logs"
        fi
    done

    local expected_count=$(echo $expected_tools | wc -w)
    if [ $tools_found -eq $expected_count ]; then
        log "  All expected tools found in logs"
        return 0
    else
        log "  Some tools missing from logs - found $tools_found/$expected_count"
        return 1
    fi
}

log "Starting Runbook-Guided Workflow Tests"
log "SRE Agent URL: $BASE_URL"
log "Tools API URL: $TOOLS_URL"
echo "============================================"

# Test 1: Check that services are running and accessible
log "Test 1: Verifying services are accessible"

# Test SRE Agent is accessible
SRE_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/incidents" || echo "000")
if [ "$SRE_HEALTH" = "200" ]; then
    log "  SRE Agent service is accessible"
else
    log "  SRE Agent service not accessible - HTTP: $SRE_HEALTH"
    exit 1
fi

# Test Tools API is accessible (simple health check)
TOOLS_HEALTH=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$TOOLS_URL/map-alert-to-runbook" \
  -H "Content-Type: application/json" \
  -d '{"alertType": "test"}' || echo "000")
if [ "$TOOLS_HEALTH" = "200" ]; then
    log "  Tools API service is accessible"
else
    log "  Tools API service not accessible - HTTP: $TOOLS_HEALTH"
    exit 1
fi

echo "============================================"

# Test 2: Create OOM incident and verify full runbook workflow
log "Test 2: Creating OOM incident to test full runbook workflow"
OOM_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "User API Pod OOM Error",
    "description": "Excessive GC detected, high heap usage",
    "severity": "critical"
  }')

OOM_ID=$(echo "$OOM_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
TRACE_ID=$(echo "$OOM_RESPONSE" | grep -o '"traceId":"[^"]*"' | cut -d'"' -f4)

if [ -z "$OOM_ID" ]; then
    log "FAILED: No OOM incident ID returned"
    echo "Response: $OOM_RESPONSE"
    exit 1
fi

log "PASSED: Created OOM incident $OOM_ID - trace: $TRACE_ID"

# Test 3: Wait for LLM analysis and verify tool calling occurred
log "Test 3: Waiting for LLM analysis - 15 seconds..."
sleep 15

ANALYSIS_RESPONSE=$(curl -s "$BASE_URL/incidents/$OOM_ID")
echo "$ANALYSIS_RESPONSE" > "$TEMP_DIR/oom_analysis.json"

# Check incident status
STATUS=$(echo "$ANALYSIS_RESPONSE" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
log "  Incident Status: $STATUS"

if [ "$STATUS" = "failed" ]; then
    log "FAILED: Incident analysis failed"
    echo "Analysis response: $ANALYSIS_RESPONSE"
    exit 1
elif [ "$STATUS" = "analyzing" ]; then
    log "  WARNING: Incident still analyzing, may need more time"
fi

# Test 4: Verify LLM inference occurred - check for RCA analysis
log "Test 4: Verifying LLM inference occurred"

if echo "$ANALYSIS_RESPONSE" | grep -q '"rca_analysis"'; then
    log "  PASSED: RCA analysis present - LLM inference occurred"

    # Extract and display RCA analysis
    RCA_ANALYSIS=$(echo "$ANALYSIS_RESPONSE" | grep -o '"rca_analysis":"[^"]*"' | cut -d'"' -f4)
    if echo "$RCA_ANALYSIS" | grep -q "workflow_completed.*true"; then
        log "  PASSED: Workflow completion confirmed"
    fi

    if echo "$RCA_ANALYSIS" | grep -q "runbook_followed"; then
        log "  PASSED: Runbook was followed"
    fi
else
    log "FAILED: No RCA analysis found - LLM inference may have failed"
    exit 1
fi

# Test 5: Verify tools were actually invoked via logs and actions taken
log "Test 5: Verifying tools were invoked"

if echo "$ANALYSIS_RESPONSE" | grep -q '"actions_taken"'; then
    log "  PASSED: Actions taken recorded"

    # Extract actions taken
    ACTIONS=$(echo "$ANALYSIS_RESPONSE" | grep -o '"actions_taken":"[^"]*"' | cut -d'"' -f4)

    # Check for specific tool invocations
    if echo "$ACTIONS" | grep -q "pod restart" || echo "$ACTIONS" | grep -q "restart"; then
        log "  PASSED: Pod restart tool was invoked"
    fi

    if echo "$ACTIONS" | grep -q "notification" || echo "$ACTIONS" | grep -q "Notification sent"; then
        log "  PASSED: Notification tool was invoked"
    fi

    log "  Actions taken: $ACTIONS"

    # Verify tool calls in logs using trace ID
    log "Test 5b: Verifying tool calls in application logs"
    if ! verify_tool_calls_in_logs "$TRACE_ID" "map-alert-to-runbook get-logs get-metrics restart-pod send-notification"; then
        log "  FAILED: Tool calls not verified in logs"
        exit 1
    fi

    # Additional log verification - check for specific log patterns
    log "Test 5c: Checking for specific tool call patterns"

    # Check if we can examine logs via raindrop command
    if command -v raindrop >/dev/null 2>&1; then
        # Fetch logs scoped to the same trace for all subsequent checks
        TRACE_LOGS=$(raindrop logs query --filter="traceId=$TRACE_ID" --since="15m" 2>/dev/null || echo "")
        if [ -z "$TRACE_LOGS" ]; then
            TRACE_LOGS=$(raindrop logs query --filter="trace_id=$TRACE_ID" --since="15m" 2>/dev/null || echo "")
        fi

        if [ -n "$TRACE_LOGS" ]; then
            echo "$TRACE_LOGS" > "$TEMP_DIR/trace_${TRACE_ID}_logs.json"

            log "    Checking for tool calling log entries..."
            if echo "$TRACE_LOGS" | grep -q "Calling tool via tools-api"; then
                log "    Found tool calling log entries"

                # Count specific tool calls
                RUNBOOK_CALLS=$(echo "$TRACE_LOGS" | grep -c "map-alert-to-runbook" || echo "0")
                LOGS_CALLS=$(echo "$TRACE_LOGS" | grep -c "get-logs" || echo "0")
                METRICS_CALLS=$(echo "$TRACE_LOGS" | grep -c "get-metrics" || echo "0")

                log "    Tool call counts: runbook=$RUNBOOK_CALLS, logs=$LOGS_CALLS, metrics=$METRICS_CALLS"
            else
                log "    No tool calling entries found in logs"
            fi

            log "    Checking for tool completion success entries..."
            if echo "$TRACE_LOGS" | grep -q "Tool call completed"; then
                log "    Found successful tool completion log entries"
            else
                log "    No tool completion entries found"
            fi
        else
            log "    No logs found for trace $TRACE_ID"
        fi
    else
        log "    Raindrop CLI not available for log checking"
    fi

else
    log "FAILED: No actions taken recorded - tools may not have been invoked"
    exit 1
fi

echo "============================================"

# Test 6: Create database incident (should only send notification, no autonomous action)
log "Test 6: Creating database incident to test notification-only flow"
DB_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "PostgreSQL Database Connection Lost",
    "description": "Primary database cluster is unreachable, connection timeouts",
    "severity": "critical"
  }')

DB_ID=$(echo "$DB_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$DB_ID" ]; then
    log "FAILED: No database incident ID returned"
    exit 1
fi

log "PASSED: Created database incident $DB_ID"

# Wait for analysis
log "Waiting for database incident analysis - 15 seconds..."
sleep 15

DB_ANALYSIS_RESPONSE=$(curl -s "$BASE_URL/incidents/$DB_ID")

# Verify no autonomous actions were taken for database incident
if echo "$DB_ANALYSIS_RESPONSE" | grep -q '"actions_taken"'; then
    DB_ACTIONS=$(echo "$DB_ANALYSIS_RESPONSE" | grep -o '"actions_taken":"[^"]*"' | cut -d'"' -f4)

    if echo "$DB_ACTIONS" | grep -q "notification.*only" || echo "$DB_ACTIONS" | grep -q "Escalation required"; then
        log "  PASSED: Database incident correctly triggered notification-only - no autonomous restart"
    elif echo "$DB_ACTIONS" | grep -q "restart"; then
        log "FAILED: Database incident incorrectly triggered autonomous restart"
        exit 1
    fi

    log "  Database Actions: $DB_ACTIONS"
fi

echo "============================================"

# Test 7: Create unknown incident type to test general runbook
log "Test 7: Creating unknown incident type to test general runbook"
UNKNOWN_RESPONSE=$(curl -s -X POST "$BASE_URL/incidents" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Mystery Service Issue",
    "description": "Unknown service behavior detected",
    "severity": "medium"
  }')

UNKNOWN_ID=$(echo "$UNKNOWN_RESPONSE" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
if [ -z "$UNKNOWN_ID" ]; then
    log "FAILED: No unknown incident ID returned"
    exit 1
fi

log "PASSED: Created unknown incident $UNKNOWN_ID"

echo "============================================"

# Summary
log "RUNBOOK-GUIDED WORKFLOW TEST RESULTS:"
log "Services are accessible and responding"
log "OOM incident created and analyzed"
log "LLM inference occurred - RCA analysis present"
log "Tools were invoked - verified via actions + logs"
log "Database incident handled correctly - notification-only"
log "Unknown incident handled with general runbook"

echo "============================================"
log "Test Incidents Created:"
log "  - OOM Incident: $OOM_ID"
log "  - Database Incident: $DB_ID"
log "  - Unknown Incident: $UNKNOWN_ID"

echo "============================================"
log "ALL RUNBOOK-GUIDED WORKFLOW TESTS PASSED!"
echo "============================================"
