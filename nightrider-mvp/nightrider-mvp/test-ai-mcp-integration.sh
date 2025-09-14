#!/bin/bash

# Test script for AI-powered MCP integration
# This script tests the AI models integrated into MCP services

set -e

echo "🤖 Testing AI-Powered MCP Integration for SRE Agent"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_ai() {
    echo -e "${PURPLE}[AI]${NC} $1"
}

# Check if the service is running
check_service() {
    print_status "Checking if SRE Agent service is running..."
    
    # Try to get the service URL (this would be provided by Raindrop)
    SERVICE_URL=${SERVICE_URL:-"https://svc-01k54wrxm9x8f2rv85b1g0x9zm.01k1w6px5t36veb8ypc1hvwahk.lmapp.run"}
    
    if curl -s -f "$SERVICE_URL/incidents" > /dev/null 2>&1; then
        print_success "SRE Agent service is running at $SERVICE_URL"
        return 0
    else
        print_error "SRE Agent service is not running at $SERVICE_URL"
        print_status "Please start the service first with: raindrop dev"
        return 1
    fi
}

# Test AI-powered OOM incident scenario
test_ai_oom_scenario() {
    print_ai "Testing AI-powered OOM incident scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "OutOfMemoryError in user-api deployment",
        "description": "Java heap space exceeded in user-api pods. Multiple pods experiencing OOMKilled status. Memory usage consistently above 90% of allocated limits.",
        "severity": "high"
    }'
    
    print_ai "Creating OOM incident with AI analysis - trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "AI-powered OOM incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for AI processing
        print_ai "Waiting for AI analysis and autonomous actions..."
        sleep 5
        
        # Check incident status
        print_ai "Checking AI analysis results..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
        # Check AI-powered MCP integration
        local rca_analysis=$(echo "$status_response" | jq -r '.incident.rca_analysis')
        
        # Check for AI-generated service mapping
        if echo "$rca_analysis" | jq -e '.serviceInfo.confidence' > /dev/null 2>&1; then
            print_success "AI service mapping detected with confidence score"
            echo "$rca_analysis" | jq '.serviceInfo'
        else
            print_warning "No AI service mapping confidence found"
        fi
        
        # Check for AI-generated runbook
        if echo "$rca_analysis" | jq -e '.runbookContent' > /dev/null 2>&1; then
            print_success "AI-generated runbook content detected"
        else
            print_warning "No AI-generated runbook found"
        fi
        
        # Check for AI log analysis
        if echo "$rca_analysis" | jq -e '.logData.analysis' > /dev/null 2>&1; then
            print_success "AI log analysis detected"
            echo "$rca_analysis" | jq '.logData.analysis'
        else
            print_warning "No AI log analysis found"
        fi
        
        # Check for AI metrics analysis
        if echo "$rca_analysis" | jq -e '.metricData.analysis' > /dev/null 2>&1; then
            print_success "AI metrics analysis detected"
            echo "$rca_analysis" | jq '.metricData.analysis'
        else
            print_warning "No AI metrics analysis found"
        fi
        
        # Check for AI-powered autonomous actions
        local actions_taken=$(echo "$status_response" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[] | select(contains("AI") or contains("autonomous"))' > /dev/null 2>&1; then
            print_success "AI-powered autonomous actions detected"
        else
            print_warning "No AI-powered autonomous actions found"
        fi
        
    else
        print_error "Failed to create AI-powered OOM incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# Test AI-powered Database outage scenario
test_ai_database_scenario() {
    print_ai "Testing AI-powered Database outage scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "PostgreSQL primary database connection failure",
        "description": "Primary database is unreachable. All application connections are timing out. Disk space at 98% capacity. Database logs show connection refused errors.",
        "severity": "critical"
    }'
    
    print_ai "Creating Database outage incident with AI analysis - trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "AI-powered Database outage incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for AI processing
        print_ai "Waiting for AI analysis..."
        sleep 5
        
        # Check incident status
        print_ai "Checking AI analysis results..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
        # Check AI-powered analysis
        local rca_analysis=$(echo "$status_response" | jq -r '.incident.rca_analysis')
        
        # Check for AI safety analysis
        if echo "$rca_analysis" | jq -e '.serviceInfo.reasoning' > /dev/null 2>&1; then
            print_success "AI safety reasoning detected"
            echo "$rca_analysis" | jq '.serviceInfo.reasoning'
        else
            print_warning "No AI safety reasoning found"
        fi
        
        # Check for AI notification enhancement
        local actions_taken=$(echo "$status_response" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[] | select(contains("enhanced") or contains("AI"))' > /dev/null 2>&1; then
            print_success "AI-enhanced notifications detected"
        else
            print_warning "No AI-enhanced notifications found"
        fi
        
        # Verify no autonomous actions for database
        if echo "$actions_taken" | jq -e '.[] | select(contains("restart"))' > /dev/null 2>&1; then
            print_error "Unexpected autonomous action found for database outage!"
        else
            print_success "No autonomous actions taken (correct for database outage)"
        fi
        
    else
        print_error "Failed to create AI-powered Database outage incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# Test AI-powered general incident scenario
test_ai_general_scenario() {
    print_ai "Testing AI-powered general incident scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "High CPU usage on analytics-worker pods",
        "description": "CPU usage consistently above 95% for the past 2 hours. Queue depth increasing rapidly. Worker threads appear to be stuck in processing loops.",
        "severity": "medium"
    }'
    
    print_ai "Creating general incident with AI analysis - trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "AI-powered general incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for AI processing
        print_ai "Waiting for AI analysis..."
        sleep 5
        
        # Check incident status
        print_ai "Checking AI analysis results..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
        # Check AI-powered analysis
        local rca_analysis=$(echo "$status_response" | jq -r '.incident.rca_analysis')
        
        # Check for AI confidence scores
        if echo "$rca_analysis" | jq -e '.confidence_score' > /dev/null 2>&1; then
            print_success "AI confidence score detected"
            echo "$rca_analysis" | jq '.confidence_score'
        else
            print_warning "No AI confidence score found"
        fi
        
        # Check for AI reasoning
        if echo "$rca_analysis" | jq -e '.reasoning' > /dev/null 2>&1; then
            print_success "AI reasoning detected"
            echo "$rca_analysis" | jq '.reasoning'
        else
            print_warning "No AI reasoning found"
        fi
        
    else
        print_error "Failed to create AI-powered general incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# List all incidents with AI analysis
list_ai_incidents() {
    print_ai "Listing all incidents with AI analysis..."
    
    local response=$(curl -s "$SERVICE_URL/incidents")
    echo "$response" | jq '.'
    
    # Check for AI integration indicators
    local incidents=$(echo "$response" | jq -r '.incidents[]?')
    if [ -n "$incidents" ]; then
        print_ai "Analyzing AI integration across incidents..."
        
        local ai_incidents=0
        local total_incidents=0
        
        while IFS= read -r incident; do
            total_incidents=$((total_incidents + 1))
            local rca=$(echo "$incident" | jq -r '.rca_analysis')
            
            if echo "$rca" | jq -e '.mcpDataGathered' > /dev/null 2>&1; then
                ai_incidents=$((ai_incidents + 1))
            fi
        done <<< "$incidents"
        
        print_ai "AI Integration Summary:"
        print_ai "  Total incidents: $total_incidents"
        print_ai "  Incidents with AI data: $ai_incidents"
        print_ai "  AI integration rate: $((ai_incidents * 100 / total_incidents))%"
    fi
}

# Main test execution
main() {
    echo
    print_ai "Starting AI-Powered MCP Integration Tests"
    echo
    
    # Check if service is running
    if ! check_service; then
        exit 1
    fi
    
    echo
    print_ai "Running AI-powered test scenarios..."
    echo
    
    # Test AI-powered OOM scenario
    echo "1️⃣  Testing AI-Powered OOM Scenario"
    echo "-----------------------------------"
    if test_ai_oom_scenario; then
        print_success "AI-powered OOM scenario test passed"
    else
        print_error "AI-powered OOM scenario test failed"
    fi
    
    echo
    echo "2️⃣  Testing AI-Powered Database Outage Scenario"
    echo "----------------------------------------------"
    if test_ai_database_scenario; then
        print_success "AI-powered Database outage scenario test passed"
    else
        print_error "AI-powered Database outage scenario test failed"
    fi
    
    echo
    echo "3️⃣  Testing AI-Powered General Incident Scenario"
    echo "------------------------------------------------"
    if test_ai_general_scenario; then
        print_success "AI-powered general incident scenario test passed"
    else
        print_error "AI-powered general incident scenario test failed"
    fi
    
    echo
    echo "4️⃣  Listing All Incidents with AI Analysis"
    echo "------------------------------------------"
    list_ai_incidents
    
    echo
    print_success "AI-Powered MCP Integration Tests Completed!"
    echo
    print_ai "Check the incident details above to verify:"
    print_ai "✅ AI service mapping with confidence scores"
    print_ai "✅ AI-generated runbooks and analysis"
    print_ai "✅ AI-powered log and metrics analysis"
    print_ai "✅ AI safety decisions for autonomous actions"
    print_ai "✅ AI-enhanced notifications and communications"
    print_ai "✅ Comprehensive AI reasoning and confidence metrics"
}

# Run the tests
main "$@"
