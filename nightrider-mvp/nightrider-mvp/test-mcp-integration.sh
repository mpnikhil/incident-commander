#!/bin/bash

# Test script for MCP integration
# This script tests both OOM and Database outage scenarios

set -e

echo "🚀 Testing MCP Integration for SRE Agent"
echo "========================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
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

# Check if the service is running
check_service() {
    print_status "Checking if SRE Agent service is running..."
    
    # Try to get the service URL (this would be provided by Raindrop)
    SERVICE_URL=${SERVICE_URL:-"http://localhost:3000"}
    
    if curl -s -f "$SERVICE_URL/incidents" > /dev/null 2>&1; then
        print_success "SRE Agent service is running at $SERVICE_URL"
        return 0
    else
        print_error "SRE Agent service is not running at $SERVICE_URL"
        print_status "Please start the service first with: raindrop dev"
        return 1
    fi
}

# Test OOM incident scenario
test_oom_scenario() {
    print_status "Testing OOM (Out of Memory) incident scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "OOM Error in user-api pod",
        "description": "Pod user-api-deployment-abc123 is experiencing out of memory errors. Memory usage exceeded 90% and pod was killed by OOMKiller.",
        "severity": "high"
    }'
    
    print_status "Creating OOM incident with trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "OOM incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_status "Incident ID: $incident_id"
        
        # Wait a moment for processing
        print_status "Waiting for incident processing..."
        sleep 3
        
        # Check incident status
        print_status "Checking incident status..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
        # Check if MCP integration worked
        local rca_analysis=$(echo "$status_response" | jq -r '.incident.rca_analysis')
        if echo "$rca_analysis" | jq -e '.mcpDataGathered' > /dev/null 2>&1; then
            print_success "MCP integration data found in RCA analysis"
            echo "$rca_analysis" | jq '.mcpDataGathered'
        else
            print_warning "No MCP integration data found in RCA analysis"
        fi
        
        # Check actions taken
        local actions_taken=$(echo "$status_response" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[] | select(contains("restart"))' > /dev/null 2>&1; then
            print_success "Autonomous pod restart action detected"
        else
            print_warning "No autonomous pod restart action found"
        fi
        
    else
        print_error "Failed to create OOM incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# Test Database outage scenario
test_database_scenario() {
    print_status "Testing Database outage incident scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "Database connection failure",
        "description": "Primary PostgreSQL database is unreachable. All database connections are timing out.",
        "severity": "critical"
    }'
    
    print_status "Creating Database outage incident with trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "Database outage incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_status "Incident ID: $incident_id"
        
        # Wait a moment for processing
        print_status "Waiting for incident processing..."
        sleep 3
        
        # Check incident status
        print_status "Checking incident status..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
        # Check if MCP integration worked
        local rca_analysis=$(echo "$status_response" | jq -r '.incident.rca_analysis')
        if echo "$rca_analysis" | jq -e '.mcpDataGathered' > /dev/null 2>&1; then
            print_success "MCP integration data found in RCA analysis"
            echo "$rca_analysis" | jq '.mcpDataGathered'
        else
            print_warning "No MCP integration data found in RCA analysis"
        fi
        
        # Check actions taken (should be notification only)
        local actions_taken=$(echo "$status_response" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[] | select(contains("notification"))' > /dev/null 2>&1; then
            print_success "Notification action detected (as expected for DB outage)"
        else
            print_warning "No notification action found"
        fi
        
        # Verify no autonomous actions were taken
        if echo "$actions_taken" | jq -e '.[] | select(contains("restart"))' > /dev/null 2>&1; then
            print_error "Unexpected autonomous action found for database outage!"
        else
            print_success "No autonomous actions taken (correct for database outage)"
        fi
        
    else
        print_error "Failed to create Database outage incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# Test general incident scenario
test_general_scenario() {
    print_status "Testing general incident scenario..."
    
    local trace_id=$(uuidgen)
    local incident_data='{
        "title": "High CPU usage on analytics-worker",
        "description": "CPU usage has been consistently above 80% for the past hour on analytics-worker pods.",
        "severity": "medium"
    }'
    
    print_status "Creating general incident with trace ID: $trace_id"
    
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data" \
        -w "HTTP_STATUS:%{http_code}")
    
    local http_status=$(echo "$response" | grep -o "HTTP_STATUS:[0-9]*" | cut -d: -f2)
    local body=$(echo "$response" | sed 's/HTTP_STATUS:[0-9]*$//')
    
    if [ "$http_status" -eq 200 ]; then
        print_success "General incident created successfully"
        echo "$body" | jq '.'
        
        # Extract incident ID for further testing
        local incident_id=$(echo "$body" | jq -r '.incident.id')
        print_status "Incident ID: $incident_id"
        
        # Wait a moment for processing
        print_status "Waiting for incident processing..."
        sleep 3
        
        # Check incident status
        print_status "Checking incident status..."
        local status_response=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$status_response" | jq '.'
        
    else
        print_error "Failed to create general incident. HTTP Status: $http_status"
        echo "$body"
        return 1
    fi
}

# List all incidents
list_incidents() {
    print_status "Listing all incidents..."
    
    local response=$(curl -s "$SERVICE_URL/incidents")
    echo "$response" | jq '.'
}

# Main test execution
main() {
    echo
    print_status "Starting MCP Integration Tests"
    echo
    
    # Check if service is running
    if ! check_service; then
        exit 1
    fi
    
    echo
    print_status "Running test scenarios..."
    echo
    
    # Test OOM scenario
    echo "1️⃣  Testing OOM Scenario"
    echo "------------------------"
    if test_oom_scenario; then
        print_success "OOM scenario test passed"
    else
        print_error "OOM scenario test failed"
    fi
    
    echo
    echo "2️⃣  Testing Database Outage Scenario"
    echo "-----------------------------------"
    if test_database_scenario; then
        print_success "Database outage scenario test passed"
    else
        print_error "Database outage scenario test failed"
    fi
    
    echo
    echo "3️⃣  Testing General Incident Scenario"
    echo "------------------------------------"
    if test_general_scenario; then
        print_success "General incident scenario test passed"
    else
        print_error "General incident scenario test failed"
    fi
    
    echo
    echo "4️⃣  Listing All Incidents"
    echo "------------------------"
    list_incidents
    
    echo
    print_success "MCP Integration Tests Completed!"
    echo
    print_status "Check the incident details above to verify:"
    print_status "✅ MCP data gathering (serviceMapping, observabilityData)"
    print_status "✅ Autonomous actions for OOM incidents (pod restart)"
    print_status "✅ Notification-only actions for database outages"
    print_status "✅ Proper incident status updates and RCA analysis"
}

# Run the tests
main "$@"
