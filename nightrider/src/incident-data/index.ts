import { Actor, ActorState } from '@liquidmetal-ai/raindrop-framework';
import { Env } from './raindrop.gen.js';
// Import MVC components
import * as Model from './model';
import * as Controller from './controller';

/**
 * MODEL LAYER - Incident Data Actor (Application Visibility)
 * Manages incident state, history, and business rules
 * Persistent storage for all incident-related data
 */
export class IncidentData extends Actor<Env> {
  constructor(state: ActorState, env: Env) {
    super(state, env);
  }

  async createIncident(incident: any): Promise<any> {
    const storage = this.state.storage as any;
    const storedIncident = {
      ...incident,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    storage[incident.id] = storedIncident;
    return storedIncident;
  }

  async storeIncident(incident: any): Promise<void> {
    const storage = this.state.storage as any;
    storage[incident.id] = {
      ...incident,
      stored_at: new Date().toISOString()
    };
  }

  async getIncident(id: string): Promise<any | null> {
    if (!id) {
      return null;
    }

    const storage = this.state.storage as any;
    const incident = storage[id] || null;

    if (incident) {
      // Ensure the incident has required fields
      return {
        ...incident,
        id: id // Ensure ID is always present
      };
    }

    return null;
  }

  async listIncidents(): Promise<any[]> {
    const storage = this.state.storage as any;
    return Object.values(storage || {});
  }

  async updateIncident(id: string, updates: any): Promise<any> {
    const storage = this.state.storage as any;
    if (storage[id]) {
      storage[id] = {
        ...storage[id],
        ...updates,
        updated_at: new Date().toISOString()
      };
      return storage[id];
    }
    return null;
  }

  async updateIncidentStatus(id: string, status: string): Promise<void> {
    const storage = this.state.storage as any;
    if (storage[id]) {
      storage[id].status = status;
      storage[id].updated_at = new Date().toISOString();
    }
  }
}

// Export the IncidentData class as the default export for RPC bindings
export default IncidentData;
