/**
 * MODEL for simulation-mcp MCP Service
 *
 * PRD REQUIREMENTS:
 * VIEW (interface handling):
 * - Protected MCP server for incident simulation
 * - TOOLS: trigger-db-outage, trigger-oom-crash, reset-simulation
 * - INPUT VALIDATION: Simulation parameters, scenario types
 * - RESPONSE FORMAT: Simulation status and configuration
 *
 * MUST IMPLEMENT:
 * 1. Simulation scenario definition and validation
 * 2. Test incident data structure templates
 * 3. Simulation state management and tracking
 * 4. Scenario parameter validation logic
 * 5. Reset and cleanup procedures
 *
 * INTERFACES TO EXPORT:
 * - validateSimulationScenario(scenario: string, params: any): ValidationResult
 * - generateDBOutageData(params: DBOutageParams): IncidentAlert
 * - generateOOMCrashData(params: OOMCrashParams): IncidentAlert
 * - validateSimulationState(): SimulationStatus
 * - formatSimulationResponse(result: any): SimulationResult
 *
 * IMPORTS NEEDED:
 * - From shared types: IncidentAlert, ValidationError
 * - From env: (none - model layer doesn't access external resources)
 * - From other layers: (none - model is independent)
 *
 * BUSINESS RULES:
 * - Only one simulation can be active at a time
 * - DB outage simulation includes realistic connection error patterns
 * - OOM crash simulation includes memory usage spike data
 * - All simulations must be resettable to clean state
 * - Simulation data must be realistic enough for agent testing
 *
 * ERROR HANDLING:
 * - ValidationError for invalid simulation parameters
 * - SimulationError for conflicting simulation states
 *
 * INTEGRATION POINTS:
 * - Used by simulation-mcp controller for scenario validation
 */