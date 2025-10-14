// api.ts - Using GitHub Gists (Free)
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
const GITHUB_TOKEN = "your_github_personal_token"; // Free from GitHub

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
async function storeToken(token: string, user_id: string, expires_at: number) {
  const response = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      description: `Token for ${user_id}`,
      public: false,
      files: {
        [`token-${token}.json`]: {
          content: JSON.stringify({
            user_id,
            script: MASTER_SCRIPT,
            expires_at,
            created_at: Date.now()
          })
        }
      }
    })
  });
  return await response.json();
}

// Get token from GitHub Gist
async function getToken(token: string) {
  // We'll search through gists (simple approach)
  const response = await fetch('https://api.github.com/gists', {
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
    }
  });
  const gists = await response.json();
  
  for (const gist of gists) {
    if (gist.files[`token-${token}.json`]) {
      const file = gist.files[`token-${token}.json`];
      const contentResponse = await fetch(file.raw_url);
      return await contentResponse.json();
    }
  }
  return null;
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

      // Store in GitHub Gist
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

    return Response.json({ status: 'running', storage: 'github-gists' }, { headers: corsHeaders });

  } catch (error) {
    console.error('Error:', error);
    return Response.json({ error: 'Server error' }, { status: 500 });
  }
});
