// Talks to the server's /api/chat endpoint (server-sent events).

/** Split an SSE buffer into complete `data:` payloads and the unconsumed remainder. */
export function parseEvents(buffer) {
  const events = [];
  let cut;
  while ((cut = buffer.indexOf('\n\n')) >= 0) {
    const line = buffer.slice(0, cut).split('\n').find(l => l.startsWith('data:'));
    buffer = buffer.slice(cut + 2);
    if (line) events.push(JSON.parse(line.slice(5)));
  }
  return { events, rest: buffer };
}

async function errorMessage(res) {
  try {
    return (await res.json()).error;
  } catch {
    return res.status === 404 || res.status === 501
      ? 'The AI backend is not running. Start the app with `uv run oxp-agenda serve`.'
      : `Assistant unavailable (HTTP ${res.status}).`;
  }
}

/** Stream an answer; calls onText(chunk) as text arrives. Throws on errors. */
export async function streamChat({ messages, context, signal, onText }) {
  const res = await fetch('api/chat', {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, context }),
  });
  if (!res.ok || !res.body) throw new Error(await errorMessage(res));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    const parsed = parseEvents(buffer + decoder.decode(value, { stream: true }));
    buffer = parsed.rest;
    for (const ev of parsed.events) {
      if (ev.error) throw new Error(ev.error);
      if (ev.t) onText(ev.t);
    }
  }
}

export async function health() {
  try {
    const res = await fetch('api/health');
    return res.ok ? await res.json() : { ai: false };
  } catch {
    return { ai: false };
  }
}
