# MCP Integration Documentation

This document describes the Model Context Protocol (MCP) integration in the SRE Agent MVP.

## Overview

The SRE Agent uses 3 MCP servers to provide specialized tooling for incident response:

1. **mapping-mcp**: Maps alerts to services and retrieves runbooks
2. **observability-mcp**: Gathers logs, metrics, and health data
3. **remediation-mcp**: Performs remediation actions (pod restarts, notifications, scaling)

## Architecture

```
SRE Agent (sre-agent)
    ↓
McpClientManager
    ↓
┌─────────────────┬─────────────────┬─────────────────┐
│   mapping-mcp   │ observability-mcp│ remediation-mcp │
│                 │                 │                 │
│ • map-alert-to- │ • get-logs      │ • restart-pod   │
│   service       │ • get-metrics   │ • send-         │
│ • get-runbook   │ • get-service-  │   notification  │
│                 │   health        │ • scale-service │
└─────────────────┴─────────────────┴─────────────────┘
```

## MCP Client Implementation

### McpClientManager Class

Located in `src/common/mcp-client.ts`, this class provides:

- **Connection Management**: Handles connections to all 3 MCP servers
- **Tool Calling**: Provides typed methods for each MCP tool
- **Error Handling**: Graceful fallback when MCP services are unavailable
- **Logging**: Comprehensive logging with trace IDs

### Key Methods

#### Mapping MCP
- `mapAlertToService(alertType: string, traceId: string): Promise<ServiceInfo>`
- `getRunbook(serviceName: string, traceId: string): Promise<RunbookContent>`

#### Observability MCP
- `getLogs(serviceName: string, timeRange: string, traceId: string): Promise<LogData>`
- `getMetrics(serviceName: string, traceId: string): Promise<MetricData>`
- `getServiceHealth(serviceName: string, traceId: string): Promise<HealthStatus>`

#### Remediation MCP
- `restartPod(podName: string, namespace: string, traceId: string): Promise<ActionResult>`
- `sendNotification(message: string, severity: string, traceId: string): Promise<NotificationResult>`
- `scaleService(serviceName: string, replicas: number, traceId: string): Promise<ActionResult>`

## Integration Workflow

The MCP integration follows this workflow in the `analyzeIncident` method:

1. **Service Mapping**: Use `mapping-mcp` to identify the affected service and retrieve runbook
2. **Data Gathering**: Use `observability-mcp` to collect logs and metrics
3. **AI Analysis**: Send all gathered data to GPT for intelligent analysis
4. **Action Execution**: Use `remediation-mcp` to execute autonomous actions based on analysis
5. **Notification**: Send notifications about actions taken

## Incident Types and Actions

### OOM (Out of Memory) Incidents
- **Autonomous Actions**: Pod restart via `remediation-mcp`
- **Notifications**: Success/failure notifications
- **Safety**: Considered safe for autonomous action

### Database Outage Incidents
- **Actions**: Notification only (no autonomous actions)
- **Reasoning**: Database operations require human oversight
- **Notifications**: Critical severity notifications

### General Incidents
- **Actions**: Investigation notifications
- **Severity**: Based on incident severity level
- **Next Steps**: Human investigation required

## Error Handling

The MCP integration includes comprehensive error handling:

- **Graceful Degradation**: If MCP services fail, the system continues with basic analysis
- **Logging**: All MCP calls are logged with trace IDs for debugging
- **Fallback**: System works even if MCP services are unavailable
- **Retry Logic**: Built-in retry mechanisms for transient failures

## Testing

Use the provided test script to verify MCP integration:

```bash
./test-mcp-integration.sh
```

This script tests:
- OOM incident scenario (autonomous pod restart)
- Database outage scenario (notification only)
- General incident scenario (investigation notification)
- MCP data gathering verification

## Configuration

MCP services are configured in the Raindrop manifest:

```hcl
mcp_service "mapping-mcp" {
  visibility = "protected"
  authorization_server = "https://authkit.liquidmetal.run"
}

mcp_service "observability-mcp" {
  visibility = "protected"
  authorization_server = "https://authkit.liquidmetal.run"
}

mcp_service "remediation-mcp" {
  visibility = "protected"
  authorization_server = "https://authkit.liquidmetal.run"
}
```

## Data Flow

```
Incident Created
    ↓
Service Mapping (mapping-mcp)
    ↓
Data Gathering (observability-mcp)
    ↓
AI Analysis (GPT with MCP data)
    ↓
Action Execution (remediation-mcp)
    ↓
Notification (remediation-mcp)
    ↓
Database Update (RCA + Actions)
```

## Monitoring

The integration provides detailed monitoring through:

- **Trace IDs**: End-to-end request tracking
- **MCP Data Tracking**: Verification that MCP data was gathered
- **Action Logging**: All autonomous actions are logged
- **Performance Metrics**: Duration tracking for each MCP call

## Future Enhancements

Potential improvements to the MCP integration:

1. **Caching**: Cache MCP responses for better performance
2. **Circuit Breaker**: Implement circuit breaker pattern for MCP services
3. **Metrics**: Add Prometheus metrics for MCP service health
4. **Retry Policies**: Configurable retry policies per MCP service
5. **Load Balancing**: Distribute load across multiple MCP service instances
