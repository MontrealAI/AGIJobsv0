import { createLogger } from '../utils/telemetry.js';

const logger = createLogger('agent-registry');

export interface AgentDescriptor {
  id: string;
  capability: string;
  description: string;
  handler: (input: unknown) => Promise<unknown>;
}

export class AgentRegistry {
  private readonly agents = new Map<string, AgentDescriptor>();

  register(agent: AgentDescriptor): void {
    if (this.agents.has(agent.id)) {
      throw new Error(`Agent ${agent.id} already registered`);
    }
    this.agents.set(agent.id, agent);
    logger.info({ agent: agent.id, capability: agent.capability }, 'Registered agent');
  }

  list(): AgentDescriptor[] {
    return [...this.agents.values()];
  }

  getByCapability(capability: string): AgentDescriptor[] {
    return this.list().filter((agent) => agent.capability.includes(capability));
  }

  async executeAgent(agentId: string, payload: unknown): Promise<unknown> {
    const agent = this.agents.get(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found`);
    }
    logger.info({ agent: agent.id }, 'Executing agent');
    return agent.handler(payload);
  }
}
