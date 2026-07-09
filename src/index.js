#!/usr/bin/env node
// @ai-native-solutions/fallforce-mcp
// Stdio MCP server wrapping @ai-native-solutions/fallforce-sdk.
// Exposes 6 tools + 3 resources over MCP.

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema, ListToolsRequestSchema,
  ListResourcesRequestSchema, ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import {
  createStore, createDeal, weightedForecast, wonRevenue, winRate,
  avgDealValue, pipelineByStage, pipelineHealth, dealRisk,
  buildContext, runAutopilot, SWARM_ROLES, DEFAULT_STAGES, VERSION,
} from '@ai-native-solutions/fallforce-sdk';

const DEMO = {
  deals: [
    { name: 'Acme rollout',   value: 12000, stage: 'Proposal',    probability: 60, closeDate: '2026-08-15' },
    { name: 'Bright renewal', value:  8000, stage: 'Negotiation', probability: 80, closeDate: '2026-07-20' },
    { name: 'Casa lead',      value:  3000, stage: 'Lead',        probability: 10 },
    { name: 'Delta done',     value:  5000, stage: 'Closed Won',  probability: 100 },
    { name: 'Echo stalled',   value: 20000, stage: 'Qualified',   probability: 20, closeDate: '2026-06-01' },
  ],
  contacts: [
    { name: 'Ada Wilson', email: 'ada@acme.example',   company: 'Acme' },
    { name: 'Ben Diaz',   email: 'ben@bright.example', company: 'Bright' },
  ],
  companies: [{ name: 'Acme' }, { name: 'Bright' }, { name: 'Casa' }],
  activities: [{ type: 'call', subject: 'Follow up Acme', dealId: null, done: false }],
};

const server = new Server(
  { name: 'fallforce-mcp', version: VERSION },
  { capabilities: { tools: {}, resources: {} } }
);

// ---------- Tools ----------

const TOOLS = [
  {
    name: 'ff_forecast',
    description: 'Weighted forecast + won revenue + win rate + average deal value + pipeline health from a deal list.',
    inputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array', description: 'Deals to analyse. Each must include stage, value, probability.' },
        activities: { type: 'array' },
      },
      required: ['deals'],
    },
  },
  {
    name: 'ff_pipeline_by_stage',
    description: 'Group deals by stage with count, total value, and probability-weighted value.',
    inputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array' },
        stages: { type: 'array', items: { type: 'string' }, description: 'Optional custom stage list.' },
      },
      required: ['deals'],
    },
  },
  {
    name: 'ff_detect_risks',
    description: 'Rank deals by risk score (0..1). Signals: stale updates, low probability, past close date, no open activity.',
    inputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array' },
        activities: { type: 'array' },
        staleDays: { type: 'number', default: 14 },
      },
      required: ['deals'],
    },
  },
  {
    name: 'ff_build_context',
    description: 'Compact CRM snapshot (deals + KPIs + stage rollup) for grounding an LLM prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array' },
        contacts: { type: 'array' },
        companies: { type: 'array' },
        activities: { type: 'array' },
        currency: { type: 'string', default: '£' },
      },
    },
  },
  {
    name: 'ff_role_spec',
    description: 'Return the spec (label + description) for one of the 9 swarm roles.',
    inputSchema: {
      type: 'object',
      properties: { role: { type: 'string', enum: SWARM_ROLES.map(r => r.id) } },
      required: ['role'],
    },
  },
  {
    name: 'ff_autopilot_plan',
    description: 'Build the sequenced autopilot plan (roles + grounded context) without calling any LLM. The caller runs the LLM per step.',
    inputSchema: {
      type: 'object',
      properties: {
        deals: { type: 'array' },
        contacts: { type: 'array' },
        companies: { type: 'array' },
        activities: { type: 'array' },
        sequence: { type: 'array', items: { type: 'string' } },
      },
    },
  },
];

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));

function makeStore(args) {
  return createStore({
    deals: args.deals || [],
    contacts: args.contacts || [],
    companies: args.companies || [],
    activities: args.activities || [],
    settings: { currency: args.currency || '£' },
  });
}

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  try {
    let payload;
    switch (name) {
      case 'ff_forecast': {
        const deals = (args.deals || []).map(createDeal);
        payload = {
          forecast: weightedForecast(deals),
          won: wonRevenue(deals),
          winRate: winRate(deals),
          avgDeal: avgDealValue(deals),
          health: pipelineHealth(deals, { activities: args.activities || [] }),
        };
        break;
      }
      case 'ff_pipeline_by_stage': {
        const deals = (args.deals || []).map(createDeal);
        payload = pipelineByStage(deals, args.stages || DEFAULT_STAGES);
        break;
      }
      case 'ff_detect_risks': {
        const deals = (args.deals || []).map(createDeal);
        const acts = args.activities || [];
        payload = deals.map(d => dealRisk(d, { activities: acts, staleDays: args.staleDays ?? 14 }))
                       .sort((a, b) => b.score - a.score);
        break;
      }
      case 'ff_build_context': {
        payload = buildContext(makeStore(args));
        break;
      }
      case 'ff_role_spec': {
        const spec = SWARM_ROLES.find(r => r.id === args.role);
        if (!spec) throw new Error(`unknown role: ${args.role}`);
        payload = spec;
        break;
      }
      case 'ff_autopilot_plan': {
        const store = makeStore(args);
        const plan = await runAutopilot(store,
          async (role, spec) => `[queued for ${role}] ${spec.desc}`,
          args.sequence);
        payload = { sequence: plan.results.map(r => r.role), ctxKpis: plan.ctx.kpis, plannedAt: plan.completedAt };
        break;
      }
      default:
        throw new Error(`unknown tool: ${name}`);
    }
    return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] };
  } catch (err) {
    return { isError: true, content: [{ type: 'text', text: `error: ${err.message}` }] };
  }
});

// ---------- Resources ----------

const RESOURCES = [
  { uri: 'fallforce://swarm/roles',        name: 'Swarm roles',        mimeType: 'application/json', description: 'The 9 public swarm role specs.' },
  { uri: 'fallforce://pipeline/stages',    name: 'Default stages',     mimeType: 'application/json', description: 'Default pipeline stage list.' },
  { uri: 'fallforce://demo/db',            name: 'Demo CRM',           mimeType: 'application/json', description: 'Seeded demo dataset for exploration.' },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => ({ resources: RESOURCES }));

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const { uri } = req.params;
  let text;
  if (uri === 'fallforce://swarm/roles')          text = JSON.stringify(SWARM_ROLES, null, 2);
  else if (uri === 'fallforce://pipeline/stages') text = JSON.stringify(DEFAULT_STAGES, null, 2);
  else if (uri === 'fallforce://demo/db')         text = JSON.stringify(DEMO, null, 2);
  else throw new Error(`unknown resource: ${uri}`);
  return { contents: [{ uri, mimeType: 'application/json', text }] };
});

// ---------- Boot ----------

const transport = new StdioServerTransport();
await server.connect(transport);
