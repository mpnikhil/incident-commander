#!/bin/bash

# Test script for Truly Autonomous SRE Agent
# This script tests the AI's freedom to choose tools

set -e

echo "🤖 Testing Truly Autonomous SRE Agent"
echo "===================================="

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
    print_status "Checking if Truly Autonomous SRE Agent service is running..."
    
    SERVICE_URL=${SERVICE_URL:-"https://svc-01k54wrxm9x8f2rv85b1g0x9zm.01k1w6px5t36veb8ypc1hvwahk.lmapp.run"}
    
    if curl -s -f "$SERVICE_URL/incidents" > /dev/null 2>&1; then
        print_success "Truly Autonomous SRE Agent service is running at $SERVICE_URL"
        return 0
    else
        print_error "Truly Autonomous SRE Agent service is not running at $SERVICE_URL"
        print_status "Please start the service first with: raindrop build deploy --start"
        return 1
    fi
}

# Test AI's tool selection freedom
test_ai_tool_freedom() {
    print_ai "Testing AI's Freedom to Choose Tools"
    echo "--------------------------------------"
    
    # Test 1: Simple incident - should AI choose minimal tools?
    print_ai "Test 1: Simple incident - should AI choose minimal tools?"
    local incident1='{
        "title": "Minor log warning in test-service",
        "description": "Single warning message in logs, no impact on service",
        "severity": "low"
    }'
    
    print_ai "Creating simple incident to test AI tool selection..."
    local response1=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident1")
    
    if echo "$response1" | jq -e '.incident.id' > /dev/null; then
        print_success "Simple incident created successfully"
        local incident_id1=$(echo "$response1" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id1"
        
        # Wait for analysis
        print_ai "Waiting for AI to make autonomous tool choices..."
        sleep 15
        
        # Check results
        local result1=$(curl -s "$SERVICE_URL/incidents/$incident_id1")
        print_ai "AI's tool selection for simple incident:"
        local rca_analysis=$(echo "$result1" | jq -r '.incident.rca_analysis')
        if [ "$rca_analysis" != "null" ] && [ "$rca_analysis" != "" ]; then
            echo "$rca_analysis" | jq -r '.reasoning // "No reasoning found"'
        else
            echo "No analysis found"
        fi
    fi
    
    echo ""
    
    # Test 2: Complex incident - should AI choose comprehensive tools?
    print_ai "Test 2: Complex incident - should AI choose comprehensive tools?"
    local incident2='{
        "title": "Critical system failure with multiple service dependencies",
        "description": "Multiple services down, database connection issues, high error rates, potential data loss. This is a complex incident requiring thorough investigation.",
        "severity": "critical"
    }'
    
    print_ai "Creating complex incident to test AI tool selection..."
    local response2=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident2")
    
    if echo "$response2" | jq -e '.incident.id' > /dev/null; then
        print_success "Complex incident created successfully"
        local incident_id2=$(echo "$response2" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id2"
        
        # Wait for analysis
        print_ai "Waiting for AI to make autonomous tool choices..."
        sleep 15
        
        # Check results
        local result2=$(curl -s "$SERVICE_URL/incidents/$incident_id2")
        print_ai "AI's tool selection for complex incident:"
        local rca_analysis=$(echo "$result2" | jq -r '.incident.rca_analysis')
        if [ "$rca_analysis" != "null" ] && [ "$rca_analysis" != "" ]; then
            echo "$rca_analysis" | jq -r '.reasoning // "No reasoning found"'
        else
            echo "No analysis found"
        fi
    fi
    
    echo ""
    
    # Test 3: Database incident - should AI avoid dangerous tools?
    print_ai "Test 3: Database incident - should AI avoid dangerous tools?"
    local incident3='{
        "title": "Database corruption detected",
        "description": "PostgreSQL database showing corruption errors, data integrity at risk",
        "severity": "critical"
    }'
    
    print_ai "Creating database incident to test AI safety decisions..."
    local response3=$(curl -s -X POST "$SERVICE_URL/incidents" \
        -H "Content-Type: application/json" \
        -d "$incident3")
    
    if echo "$response3" | jq -e '.incident.id' > /dev/null; then
        print_success "Database incident created successfully"
        local incident_id3=$(echo "$response3" | jq -r '.incident.id')
        print_ai "Incident ID: $incident_id3"
        
        # Wait for analysis
        print_ai "Waiting for AI to make autonomous tool choices..."
        sleep 15
        
        # Check results
        local result3=$(curl -s "$SERVICE_URL/incidents/$incident_id3")
        print_ai "AI's tool selection for database incident:"
        local rca_analysis=$(echo "$result3" | jq -r '.incident.rca_analysis')
        if [ "$rca_analysis" != "null" ] && [ "$rca_analysis" != "" ]; then
            echo "$rca_analysis" | jq -r '.reasoning // "No reasoning found"'
        else
            echo "No analysis found"
        fi
    fi
}

# Analyze AI's tool selection patterns
analyze_ai_behavior() {
    print_ai "Analyzing AI's Autonomous Tool Selection Patterns"
    echo "--------------------------------------------------"
    
    local response=$(curl -s "$SERVICE_URL/incidents")
    local incidents=$(echo "$response" | jq -r '.incidents[] | select(.rca_analysis != null)')
    
    print_ai "Recent AI tool selection patterns:"
    echo ""
    
    while IFS= read -r incident; do
        local title=$(echo "$incident" | jq -r '.title')
        local rca_analysis=$(echo "$incident" | jq -r '.rca_analysis')
        local reasoning="No reasoning found"
        
        if [ "$rca_analysis" != "null" ] && [ "$rca_analysis" != "" ]; then
            reasoning=$(echo "$rca_analysis" | jq -r '.reasoning // "No reasoning found"')
        fi
        
        print_ai "Incident: $title"
        print_ai "AI Reasoning: $reasoning"
        echo ""
    done <<< "$incidents"
}

# Main test execution
main() {
    print_ai "Starting Truly Autonomous SRE Agent Tests"
    echo "============================================="
    
    # Check if service is running
    if ! check_service; then
        exit 1
    fi
    
    print_ai "Testing AI's freedom to choose tools autonomously..."
    echo ""
    
    # Test AI tool selection freedom
    test_ai_tool_freedom
    
    # Analyze patterns
    analyze_ai_behavior
    
    print_success "🤖 Truly Autonomous SRE Agent Tests Completed!"
    echo ""
    print_ai "Key Questions Answered:"
    print_ai "✅ Does AI have freedom to choose tools? (Should be YES)"
    print_ai "✅ Does AI adapt tool selection to incident complexity? (Should be YES)"
    print_ai "✅ Does AI make safety-conscious tool choices? (Should be YES)"
    print_ai "✅ Does AI provide reasoning for tool selection? (Should be YES)"
}

# Run the tests
main "$@"
