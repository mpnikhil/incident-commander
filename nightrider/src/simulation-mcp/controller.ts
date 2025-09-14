/**
 * CONTROLLER for simulation-mcp MCP Service
 *
 * PRD REQUIREMENTS:
 * VIEW (interface handling) - MCP server for incident simulation testing
 * - TOOLS: trigger-db-outage, trigger-oom-crash, reset-simulation
 * - Generates realistic test incidents for agent validation
 * - Coordinates with main system for end-to-end testing
 *
 * MUST IMPLEMENT:
 * 1. MCP tool registration for simulation scenarios
 * 2. Test incident generation and injection
 * 3. Simulation state coordination with main system
 * 4. Test data management and cleanup
 * 5. End-to-end workflow validation
 *
 * INTERFACES TO EXPORT:
 * - registerSimulationTools(server: McpServer): void
 * - triggerDBOutageSimulation(params: any): Promise<SimulationResult>
 * - triggerOOMCrashSimulation(params: any): Promise<SimulationResult>
 * - resetAllSimulations(): Promise<void>
 * - getSimulationStatus(): Promise<SimulationStatus>
 *
 * IMPORTS NEEDED:
 * - From shared types: IncidentAlert, SimulationResult
 * - From env: env.SRE_API (to inject test incidents), env.logger
 * - From other layers: model functions for scenario validation
 *
 * BUSINESS RULES:
 * - DB outage simulation triggers via sre-api incident alert endpoint
 * - OOM crash simulation includes container restart scenario
 * - Each simulation waits for agent response before completing
 * - Reset clears all simulation state and test data
 * - Simulations include realistic timing and data patterns
 *
 * ERROR HANDLING:
 * - Try-catch around all simulation operations
 * - Clean up partial simulations on failure
 * - Log all simulation activities for debugging
 * - Validate simulation parameters before execution
 *
 * INTEGRATION POINTS:
 * - Calls sre-api to inject test incidents
 * - Monitors agent response through incident-orchestrator
 * - Provides test scenarios for PRD user stories validation
 */