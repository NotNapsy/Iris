// api.ts - Using Deno KV (Built-in database)
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

async function readScriptFromFile(): Promise<string> {
  try {
    // Read the script from a local file in the same directory
    const scriptContent = await Deno.readTextFile("./script.lua");
    return scriptContent;
  } catch (error) {
    console.error('Failed to read script file:', error);
    throw new Error('Could not read script file');
  }
}

function generateToken(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Api-Key',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Open Deno KV database (built-in, persistent storage)
  const kv = await Deno.openKv();

  try {
    // Clean up expired tokens
    const entries = kv.list({ prefix: ["token"] });
    const now = Date.now();
    
    for await (const entry of entries) {
      if (entry.value.expires_at < now) {
        await kv.delete(entry.key);
      }
    }

    // POST /publishScript
    if (url.pathname === '/publishScript' && req.method === 'POST') {
      const apiKey = req.headers.get('X-Admin-Api-Key');
      
      if (!apiKey || apiKey !== ADMIN_API_KEY) {
        return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
      }

      const body = await req.json();
      
      if (!body?.discord_userid) {
        return Response.json({ error: 'discord_userid required' }, { status: 400, headers: corsHeaders });
      }

      const token = generateToken();
      const expiresAt = Date.now() + TOKEN_TTL_MS;

      // Store only metadata in Deno KV (no script content)
      await kv.set(["token", token], {
        user_id: body.discord_userid,
        expires_at: expiresAt,
        created_at: Date.now()
      });

      const scriptUrl = `https://api.napsy.dev/scripts/${token}`;
      const loadstringStr = `loadstring(game:HttpGet("${scriptUrl}"))()`;

      return Response.json({
        success: true,
        script_url: scriptUrl,
        loadstring: loadstringStr,
        expires_at: new Date(expiresAt).toISOString(),
      }, { headers: corsHeaders });
    }

    // GET /scripts/:token
    if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
      const token = url.pathname.split('/')[2];
      
      if (!token) {
        return new Response('Token required', { status: 400 });
      }

      // Get token metadata from Deno KV
      const entry = await kv.get(["token", token]);
      
      if (!entry.value) {
        return new Response('Token not found', { status: 404 });
      }

      const data = entry.value as any;
      
      if (data.expires_at < Date.now()) {
        await kv.delete(["token", token]);
        return new Response('Token expired', { status: 410 });
      }

      // Read the script from local file when requested
      try {
        const scriptContent = await readScriptFromFile();
        return new Response(scriptContent, {
          headers: { 'Content-Type': 'text/plain', ...corsHeaders },
        });
      } catch (error) {
        return new Response('Failed to read script file', { status: 500 });
      }
    }

    // Root endpoint
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ 
        message: 'NapsyScript API',
        status: 'running',
        storage: 'deno-kv-persistent',
        script_source: 'local-file'
      }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  } finally {
    kv.close();
  }
});
