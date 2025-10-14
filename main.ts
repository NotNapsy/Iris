// api.ts - Complete GitHub Gist version
const MASTER_SCRIPT = `
print("Hello from Napsy.dev!")
local player = game.Players.LocalPlayer
if player then
    player.Character.Humanoid.WalkSpeed = 50
    print("Walk speed set to 50 for " .. player.Name)
end
`;

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";
const GITHUB_TOKEN = "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"; // ← Replace with your token

function generateToken(length = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = '';
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

// Store token in GitHub Gist
async function storeToken(token: string, user_id: string, expires_at: number): Promise<string> {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
      'User-Agent': 'NapsyScript-API'
    },
    body: JSON.stringify({
      description: `Script token for user ${user_id}`,
      public: false,
      files: {
        [`token_${token}.json`]: {
          content: JSON.stringify({
            user_id: user_id,
            script: MASTER_SCRIPT,
            expires_at: expires_at,
            created_at: Date.now()
          }, null, 2)
        }
      }
    })
  });
  
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`GitHub API error: ${data.message}`);
  }
  return data.id; // Return gist ID
}

// Get token from GitHub Gists
async function getToken(token: string): Promise<any> {
  const response = await fetch('https://api.github.com/gists', {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'NapsyScript-API'
    }
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch gists');
  }
  
  const gists = await response.json();
  
  // Search for our token file in all gists
  for (const gist of gists) {
    const filename = `token_${token}.json`;
    if (gist.files && gist.files[filename]) {
      const fileUrl = gist.files[filename].raw_url;
      const fileResponse = await fetch(fileUrl);
      if (fileResponse.ok) {
        return await fileResponse.json();
      }
    }
  }
  return null;
}

// Delete expired token
async function deleteToken(gistId: string) {
  await fetch(`https://api.github.com/gists/${gistId}`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'User-Agent': 'NapsyScript-API'
    }
  });
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

  try {
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

      // Store in GitHub Gist (persistent!)
      await storeToken(token, body.discord_userid, expiresAt);

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

      const entry = await getToken(token);
      if (!entry) {
        return new Response('Token not found', { status: 404 });
      }

      if (entry.expires_at < Date.now()) {
        return new Response('Token expired', { status: 410 });
      }

      return new Response(entry.script, {
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    }

    // Root endpoint
    if (url.pathname === '/' && req.method === 'GET') {
      return Response.json({ 
        message: 'NapsyScript API',
        status: 'running', 
        storage: 'github-gists'
      }, { headers: corsHeaders });
    }

    return new Response('Not found', { status: 404 });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ 
      error: 'Internal server error',
      details: error.message 
    }, { status: 500 });
  }
});
