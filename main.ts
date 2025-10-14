// api.ts - Fixed with working debug endpoint
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Auto-generated script parts
const SCRIPT_PART1 = Deno.env.get("SCRIPT_PART1") || "";
const SCRIPT_PART2 = Deno.env.get("SCRIPT_PART2") || "";
const SCRIPT_PART3 = Deno.env.get("SCRIPT_PART3") || "";
const SCRIPT_PART4 = Deno.env.get("SCRIPT_PART4") || "";
const SCRIPT_PART5 = Deno.env.get("SCRIPT_PART5") || "";
const SCRIPT_PART6 = Deno.env.get("SCRIPT_PART6") || "";
const SCRIPT_PART7 = Deno.env.get("SCRIPT_PART7") || "";
const SCRIPT_PART8 = Deno.env.get("SCRIPT_PART8") || "";

const ORIGINAL_SCRIPT = [
    SCRIPT_PART1,
    SCRIPT_PART2,
    SCRIPT_PART3,
    SCRIPT_PART4,
    SCRIPT_PART5,
    SCRIPT_PART6,
    SCRIPT_PART7,
    SCRIPT_PART8
].join('\n');

console.log("=== SCRIPT DEBUG INFO ===");
console.log("Total characters:", ORIGINAL_SCRIPT.length);
console.log("Part 1 chars:", SCRIPT_PART1.length);
console.log("Part 2 chars:", SCRIPT_PART2.length);
console.log("Part 3 chars:", SCRIPT_PART3.length);
console.log("Part 4 chars:", SCRIPT_PART4.length);
console.log("Part 5 chars:", SCRIPT_PART5.length);
console.log("Part 6 chars:", SCRIPT_PART6.length);
console.log("Part 7 chars:", SCRIPT_PART7.length);
console.log("Part 8 chars:", SCRIPT_PART8.length);

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

    // DEBUG ENDPOINT - Put this FIRST so it's easy to access
    if (url.pathname === '/debug' && req.method === 'GET') {
        const parts = [
            { name: 'SCRIPT_PART1', length: SCRIPT_PART1.length, preview: SCRIPT_PART1.substring(0, 50) },
            { name: 'SCRIPT_PART2', length: SCRIPT_PART2.length, preview: SCRIPT_PART2.substring(0, 50) },
            { name: 'SCRIPT_PART3', length: SCRIPT_PART3.length, preview: SCRIPT_PART3.substring(0, 50) },
            { name: 'SCRIPT_PART4', length: SCRIPT_PART4.length, preview: SCRIPT_PART4.substring(0, 50) },
            { name: 'SCRIPT_PART5', length: SCRIPT_PART5.length, preview: SCRIPT_PART5.substring(0, 50) },
            { name: 'SCRIPT_PART6', length: SCRIPT_PART6.length, preview: SCRIPT_PART6.substring(0, 50) },
            { name: 'SCRIPT_PART7', length: SCRIPT_PART7.length, preview: SCRIPT_PART7.substring(0, 50) },
            { name: 'SCRIPT_PART8', length: SCRIPT_PART8.length, preview: SCRIPT_PART8.substring(0, 50) },
        ];

        return Response.json({
            total_script_length: ORIGINAL_SCRIPT.length,
            script_configured: ORIGINAL_SCRIPT.length > 1000,
            environment_variables: parts,
            issues: parts.filter(p => p.length === 0).map(p => `${p.name} is empty`)
        }, { headers: corsHeaders });
    }

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
                script_configured: ORIGINAL_SCRIPT.length > 1000
            }, { headers: corsHeaders });
        }

        // GET /scripts/:token
        if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
            const token = url.pathname.split('/')[2];
            
            if (!token) {
                return new Response('Token required', { status: 400 });
            }

            const entry = await kv.get(["token", token]);
            
            if (!entry.value) {
                return new Response('Token not found', { status: 404 });
            }

            const data = entry.value as any;
            
            if (data.expires_at < Date.now()) {
                await kv.delete(["token", token]);
                return new Response('Token expired', { status: 410 });
            }

            // Check if script is properly configured
            if (ORIGINAL_SCRIPT.length < 1000) {
                return new Response('-- Error: Script not properly configured in environment variables. Check /debug endpoint for details.', {
                    status: 500,
                    headers: { 'Content-Type': 'text/plain', ...corsHeaders }
                });
            }

            // Simple obfuscation
            let obfuscatedScript = ORIGINAL_SCRIPT;
            // Add your obfuscation logic here
            
            return new Response(obfuscatedScript, {
                headers: { 'Content-Type': 'text/plain', ...corsHeaders },
            });
        }

        // Root endpoint
        if (url.pathname === '/' && req.method === 'GET') {
            return Response.json({ 
                message: 'NapsyScript API',
                status: 'running',
                script_configured: ORIGINAL_SCRIPT.length > 1000,
                script_length: ORIGINAL_SCRIPT.length,
                debug: 'Visit /debug to check environment variables'
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
