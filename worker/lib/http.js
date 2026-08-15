export function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...(init.headers ?? {}),
    },
  });
}

export function fail(status, code, message) {
  return json({ error: code, message }, { status });
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
