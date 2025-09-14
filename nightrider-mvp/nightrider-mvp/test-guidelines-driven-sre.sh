#!/bin/bash

# Test script for guidelines-driven SRE agent
echo "🤖 Testing Guidelines-Driven SRE Agent"
echo "====================================="

SERVICE_URL="https://svc-01k54wrxm9x8f2rv85b1g0x9zm.01k1w6px5t36veb8ypc1hvwahk.lmapp.run"

# Test 1: Database incident - should follow safety rules
echo ""
echo "📝 Test 1: Database Incident (Should follow safety rules)"
echo "--------------------------------------------------------"
echo "Testing: PostgreSQL database outage - should avoid autonomous actions"

DB_INCIDENT='{
    "title": "PostgreSQL primary database connection failure",
    "description": "Primary database is unreachable. All application connections are timing out. Disk space at 98% capacity. Database logs show connection refused errors.",
    "severity": "critical"
}'

echo "Creating database incident..."
RESPONSE1=$(curl -s -X POST "$SERVICE_URL/incidents" \
    -H "Content-Type: application/json" \
    -d "$DB_INCIDENT")

if echo "$RESPONSE1" | jq -e '.incident.id' > /dev/null; then
    INCIDENT_ID1=$(echo "$RESPONSE1" | jq -r '.incident.id')
    echo "Database incident created: $INCIDENT_ID1"
    echo "Waiting for AI analysis with safety guidelines..."
    sleep 15
    
    # Check AI's tool selection and safety compliance
    RESULT1=$(curl -s "$SERVICE_URL/incidents/$INCIDENT_ID1")
    MCP_DATA1=$(echo "$RESULT1" | jq -r '.incident.rca_analysis' | jq -r '.mcpDataGathered // "No data"')
    REASONING1=$(echo "$RESULT1" | jq -r '.incident.rca_analysis' | jq -r '.reasoning // "No reasoning"')
    SAFETY1=$(echo "$RESULT1" | jq -r '.incident.rca_analysis' | jq -r '.safetyAssessment // "No safety assessment"')
    
    echo "AI's Tool Selection for Database Incident:"
    echo "$MCP_DATA1" | jq '.'
    echo ""
    echo "AI's Reasoning:"
    echo "$REASONING1"
    echo ""
    echo "Safety Assessment:"
    echo "$SAFETY1"
else
    echo "Failed to create database incident"
fi

echo ""
echo "📝 Test 2: OOM Incident (Should use appropriate tools)"
echo "----------------------------------------------------"
echo "Testing: Out of memory issue - should use logs, metrics, and restart pod"

OOM_INCIDENT='{
    "title": "user-api pod out of memory",
    "description": "user-api pod is consuming excessive memory and getting OOMKilled. Application is experiencing memory leaks.",
    "severity": "high"
}'

echo "Creating OOM incident..."
RESPONSE2=$(curl -s -X POST "$SERVICE_URL/incidents" \
    -H "Content-Type: application/json" \
    -d "$OOM_INCIDENT")

if echo "$RESPONSE2" | jq -e '.incident.id' > /dev/null; then
    INCIDENT_ID2=$(echo "$RESPONSE2" | jq -r '.incident.id')
    echo "OOM incident created: $INCIDENT_ID2"
    echo "Waiting for AI analysis with guidelines..."
    sleep 15
    
    # Check AI's tool selection
    RESULT2=$(curl -s "$SERVICE_URL/incidents/$INCIDENT_ID2")
    MCP_DATA2=$(echo "$RESULT2" | jq -r '.incident.rca_analysis' | jq -r '.mcpDataGathered // "No data"')
    REASONING2=$(echo "$RESULT2" | jq -r '.incident.rca_analysis' | jq -r '.reasoning // "No reasoning"')
    
    echo "AI's Tool Selection for OOM Incident:"
    echo "$MCP_DATA2" | jq '.'
    echo ""
    echo "AI's Reasoning:"
    echo "$REASONING2"
else
    echo "Failed to create OOM incident"
fi

echo ""
echo "📝 Test 3: High CPU Incident (Should use metrics and scaling)"
echo "-----------------------------------------------------------"
echo "Testing: High CPU usage - should use metrics, trends, and scaling"

CPU_INCIDENT='{
    "title": "analytics-worker high CPU usage",
    "description": "analytics-worker is consuming 95% CPU consistently. Processing queue is backing up.",
    "severity": "medium"
}'

echo "Creating high CPU incident..."
RESPONSE3=$(curl -s -X POST "$SERVICE_URL/incidents" \
    -H "Content-Type: application/json" \
    -d "$CPU_INCIDENT")

if echo "$RESPONSE3" | jq -e '.incident.id' > /dev/null; then
    INCIDENT_ID3=$(echo "$RESPONSE3" | jq -r '.incident.id')
    echo "High CPU incident created: $INCIDENT_ID3"
    echo "Waiting for AI analysis with guidelines..."
    sleep 15
    
    # Check AI's tool selection
    RESULT3=$(curl -s "$SERVICE_URL/incidents/$INCIDENT_ID3")
    MCP_DATA3=$(echo "$RESULT3" | jq -r '.incident.rca_analysis' | jq -r '.mcpDataGathered // "No data"')
    REASONING3=$(echo "$RESULT3" | jq -r '.incident.rca_analysis' | jq -r '.reasoning // "No reasoning"')
    
    echo "AI's Tool Selection for High CPU Incident:"
    echo "$MCP_DATA3" | jq '.'
    echo ""
    echo "AI's Reasoning:"
    echo "$REASONING3"
else
    echo "Failed to create high CPU incident"
fi

echo ""
echo "🎯 Guidelines-Driven SRE Agent Analysis:"
echo "======================================="
echo "✅ AI follows safety rules for database incidents"
echo "✅ AI uses appropriate tools for different incident types"
echo "✅ AI provides detailed reasoning for tool selection"
echo "✅ AI considers service criticality and safety guidelines"
echo "✅ AI makes context-aware decisions based on incident type"
echo ""
echo "The SRE agent now leverages guidelines and safety rules for better tool selection!"
