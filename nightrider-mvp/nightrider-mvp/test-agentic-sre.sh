#!/bin/bash

# Test script for Truly Agentic SRE Agent
# This script tests the autonomous decision-making capabilities

set -e

echo "🤖 Testing Truly Agentic SRE Agent"
echo "=================================="

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
    print_status "Checking if Agentic SRE Agent service is running..."
    
    SERVICE_URL=${SERVICE_URL:-"https://svc-01k54wrxm9x8f2rv85b1g0x9zm.01k1w6px5t36veb8ypc1hvwahk.lmapp.run"}
    
    if curl -s -f "$SERVICE_URL/incidents" > /dev/null 2>&1; then
        print_success "Agentic SRE Agent service is running at $SERVICE_URL"
        return 0
    else
        print_error "Agentic SRE Agent service is not running at $SERVICE_URL"
        print_status "Please start the service first with: raindrop build deploy --start"
        return 1
    fi
}

# Test agentic OOM incident
test_agentic_oom() {
    print_ai "Testing Agentic OOM Incident Response"
    echo "----------------------------------------"
    
    local incident_data='{
        "title": "OutOfMemoryError in user-api deployment",
        "description": "Java heap space exceeded in user-api pods. Multiple pods experiencing OOMKilled status. Memory usage consistently above 90% of allocated limits.",
        "severity": "high"
    }'
    
    print_ai "Creating OOM incident with agentic analysis..."
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data")
    
    if echo "$response" | jq -e '.incident.id' > /dev/null; then
        print_success "Agentic OOM incident created successfully"
        echo "$response" | jq '.'
        
        local incident_id=$(echo "$response" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for agentic analysis
        print_ai "Waiting for agentic analysis and autonomous actions..."
        sleep 10
        
        # Check results
        print_ai "Checking agentic analysis results..."
        local result=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$result" | jq '.'
        
        # Analyze agentic behavior
        local rca_analysis=$(echo "$result" | jq -r '.incident.rca_analysis')
        if echo "$rca_analysis" | jq -e '.reasoning' > /dev/null 2>&1; then
            print_success "AI reasoning detected"
            echo "$rca_analysis" | jq -r '.reasoning'
        else
            print_warning "No AI reasoning found"
        fi
        
        local actions_taken=$(echo "$result" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[]' > /dev/null 2>&1; then
            print_success "Autonomous actions detected"
            echo "$actions_taken" | jq -r '.[]'
        else
            print_warning "No autonomous actions found"
        fi
        
        return 0
    else
        print_error "Failed to create agentic OOM incident"
        echo "$response"
        return 1
    fi
}

# Test agentic database outage
test_agentic_database_outage() {
    print_ai "Testing Agentic Database Outage Response"
    echo "-------------------------------------------"
    
    local incident_data='{
        "title": "PostgreSQL primary database connection failure",
        "description": "Primary database is unreachable. All application connections are timing out. Disk space at 98% capacity. Database logs show connection refused errors.",
        "severity": "critical"
    }'
    
    print_ai "Creating Database outage incident with agentic analysis..."
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data")
    
    if echo "$response" | jq -e '.incident.id' > /dev/null; then
        print_success "Agentic Database outage incident created successfully"
        echo "$response" | jq '.'
        
        local incident_id=$(echo "$response" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for agentic analysis
        print_ai "Waiting for agentic analysis..."
        sleep 10
        
        # Check results
        print_ai "Checking agentic analysis results..."
        local result=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$result" | jq '.'
        
        # Analyze agentic behavior
        local rca_analysis=$(echo "$result" | jq -r '.incident.rca_analysis')
        if echo "$rca_analysis" | jq -e '.reasoning' > /dev/null 2>&1; then
            print_success "AI reasoning detected"
            echo "$rca_analysis" | jq -r '.reasoning'
        else
            print_warning "No AI reasoning found"
        fi
        
        local actions_taken=$(echo "$result" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[]' > /dev/null 2>&1; then
            print_success "Autonomous actions detected"
            echo "$actions_taken" | jq -r '.[]'
        else
            print_warning "No autonomous actions found"
        fi
        
        return 0
    else
        print_error "Failed to create agentic Database outage incident"
        echo "$response"
        return 1
    fi
}

# Test agentic general incident
test_agentic_general() {
    print_ai "Testing Agentic General Incident Response"
    echo "--------------------------------------------"
    
    local incident_data='{
        "title": "High CPU usage on analytics-worker pods",
        "description": "CPU usage consistently above 95% for the past 2 hours. Queue depth increasing rapidly. Worker threads appear to be stuck in processing loops.",
        "severity": "medium"
    }'
    
    print_ai "Creating general incident with agentic analysis..."
    local response=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident_data")
    
    if echo "$response" | jq -e '.incident.id' > /dev/null; then
        print_success "Agentic general incident created successfully"
        echo "$response" | jq '.'
        
        local incident_id=$(echo "$response" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id"
        
        # Wait for agentic analysis
        print_ai "Waiting for agentic analysis..."
        sleep 10
        
        # Check results
        print_ai "Checking agentic analysis results..."
        local result=$(curl -s "$SERVICE_URL/incidents/$incident_id")
        echo "$result" | jq '.'
        
        # Analyze agentic behavior
        local rca_analysis=$(echo "$result" | jq -r '.incident.rca_analysis')
        if echo "$rca_analysis" | jq -e '.reasoning' > /dev/null 2>&1; then
            print_success "AI reasoning detected"
            echo "$rca_analysis" | jq -r '.reasoning'
        else
            print_warning "No AI reasoning found"
        fi
        
        local actions_taken=$(echo "$result" | jq -r '.incident.actions_taken')
        if echo "$actions_taken" | jq -e '.[]' > /dev/null 2>&1; then
            print_success "Autonomous actions detected"
            echo "$actions_taken" | jq -r '.[]'
        else
            print_warning "No autonomous actions found"
        fi
        
        return 0
    else
        print_error "Failed to create agentic general incident"
        echo "$response"
        return 1
    fi
}

# List all incidents with agentic analysis
list_agentic_incidents() {
    print_ai "Listing All Incidents with Agentic Analysis"
    echo "---------------------------------------------"
    
    local response=$(curl -s "$SERVICE_URL/incidents")
    echo "$response" | jq '.'
    
    local count=$(echo "$response" | jq -r '.count')
    print_ai "Total incidents: $count"
    
    # Analyze agentic behavior across incidents
    print_ai "Analyzing agentic behavior across incidents..."
    
    local incidents=$(echo "$response" | jq -r '.incidents[]')
    local agentic_count=0
    local reasoning_count=0
    local actions_count=0
    
    while IFS= read -r incident; do
        local rca_analysis=$(echo "$incident" | jq -r '.rca_analysis')
        local actions_taken=$(echo "$incident" | jq -r '.actions_taken')
        
        if echo "$rca_analysis" | jq -e '.reasoning' > /dev/null 2>&1; then
            reasoning_count=$((reasoning_count + 1))
        fi
        
        if echo "$actions_taken" | jq -e '.[]' > /dev/null 2>&1; then
            actions_count=$((actions_count + 1))
        fi
        
        agentic_count=$((agentic_count + 1))
    done <<< "$incidents"
    
    print_ai "Agentic Analysis Summary:"
    print_ai "  Total incidents: $count"
    print_ai "  Incidents with AI reasoning: $reasoning_count"
    print_ai "  Incidents with autonomous actions: $actions_count"
    print_ai "  Agentic behavior rate: $((reasoning_count * 100 / count))%"
}

# Main test execution
main() {
    print_ai "Starting Agentic SRE Agent Tests"
    echo "===================================="
    
    # Check if service is running
    if ! check_service; then
        exit 1
    fi
    
    print_ai "Running agentic test scenarios..."
    echo ""
    
    # Test 1: Agentic OOM scenario
    print_ai "1️⃣  Testing Agentic OOM Scenario"
    echo "-----------------------------------"
    if test_agentic_oom; then
        print_success "Agentic OOM scenario test passed"
    else
        print_error "Agentic OOM scenario test failed"
    fi
    echo ""
    
    # Test 2: Agentic Database outage scenario
    print_ai "2️⃣  Testing Agentic Database Outage Scenario"
    echo "----------------------------------------------"
    if test_agentic_database_outage; then
        print_success "Agentic Database outage scenario test passed"
    else
        print_error "Agentic Database outage scenario test failed"
    fi
    echo ""
    
    # Test 3: Agentic General incident scenario
    print_ai "3️⃣  Testing Agentic General Incident Scenario"
    echo "------------------------------------------------"
    if test_agentic_general; then
        print_success "Agentic general incident scenario test passed"
    else
        print_error "Agentic general incident scenario test failed"
    fi
    echo ""
    
    # Test 4: List all incidents
    print_ai "4️⃣  Listing All Incidents with Agentic Analysis"
    echo "------------------------------------------------"
    list_agentic_incidents
    echo ""
    
    print_success "🤖 Agentic SRE Agent Tests Completed!"
    echo ""
    print_ai "Check the incident details above to verify:"
    print_ai "✅ AI tool discovery and planning"
    print_ai "✅ Dynamic tool execution based on AI decisions"
    print_ai "✅ Autonomous action selection and execution"
    print_ai "✅ Iterative decision-making process"
    print_ai "✅ Comprehensive AI reasoning and analysis"
}

# Run the tests
main "$@"
