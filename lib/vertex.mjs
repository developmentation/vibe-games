import 'dotenv/config';
import { GoogleAuth } from 'google-auth-library';

const SCOPES = ['https://www.googleapis.com/auth/cloud-platform'];

function credentials() {
  const raw = process.env.VERTEX_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('VERTEX_SERVICE_ACCOUNT_JSON not set');
  return JSON.parse(raw);
}

let _auth = null;
function auth() {
  if (_auth) return _auth;
  _auth = new GoogleAuth({ credentials: credentials(), scopes: SCOPES });
  return _auth;
}

export async function getAccessToken() {
  const client = await auth().getClient();
  const t = await client.getAccessToken();
  return t.token;
}

export async function claudeRawPredict({
  model = process.env.VERTEX_CLAUDE_SONNET_MODEL || 'claude-sonnet-4-6',
  messages,
  system,
  tools,
  toolChoice,
  maxTokens = 4096,
  temperature = 0.7,
}) {
  const project = process.env.VERTEX_PROJECT_ID;
  const endpoint = process.env.VERTEX_ENDPOINT || 'aiplatform.googleapis.com';
  const location = process.env.VERTEX_LOCATION_ID || 'global';
  const method = process.env.VERTEX_METHOD || 'rawPredict';
  if (!project) throw new Error('VERTEX_PROJECT_ID not set');

  const host = location === 'global' ? endpoint : `${location}-${endpoint}`;
  const url = `https://${host}/v1/projects/${project}/locations/${location}/publishers/anthropic/models/${model}:${method}`;

  const body = {
    anthropic_version: 'vertex-2023-10-16',
    messages,
    max_tokens: maxTokens,
    temperature,
  };
  if (system) body.system = system;
  if (tools) body.tools = tools;
  if (toolChoice) body.tool_choice = toolChoice;

  const token = await getAccessToken();
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Vertex ${res.status}: ${t.slice(0, 800)}`);
  }
  return res.json();
}

export function extractToolUse(resp, toolName) {
  const blocks = resp.content || [];
  const tu = blocks.find((b) => b.type === 'tool_use' && (!toolName || b.name === toolName));
  if (!tu) {
    const text = blocks.find((b) => b.type === 'text')?.text || '';
    throw new Error(`No tool_use block in response. Text was: ${text.slice(0, 400)}`);
  }
  return tu.input;
}
