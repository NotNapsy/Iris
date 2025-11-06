const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; 
const KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for unactivated keys
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60000,
  MAX_WORKINK_REQUESTS: 3,
  WORKINK_WINDOW_MS: 300000
};

// Workink Configuration
const WORKINK_CONFIG = {
  CHECKPOINTS_REQUIRED: 2,
  WORKINK_LINKS: [
    "https://work.ink/27LB/uytkj9n6",
    "https://work.ink/27LB/ogsv775a"
  ],
  VALIDATION_ENDPOINT: "https://work.ink/_api/v2/token/isValid/",
  TOKEN_PARAM: "token"
};

const AUTO_BLACKLIST_CONFIG = {
  MULTI_IP_THRESHOLD: 2, // number of unique IPs allowed per token
  ESCALATION_BASE_DAYS: 1, // start with 1 day ban
  ESCALATION_MULTIPLIER: 2, // double each time
  MAX_ESCALATION_DAYS: 365, // cap at 1 year
  BAN_REASON: "Multi-IP token sharing detected",
  SEVERITY: "HIGH" as const
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// rate limiting storage
const rateLimit = new Map<string, { count: number; resetTime: number; workinkCount: number; workinkReset: number }>();

// system metrics
let metrics = {
  totalRequests: 0,
  successfulActivations: 0,
  failedActivations: 0,
  expiredCleanups: 0,
  lastCleanup: Date.now(),
  rateLimitHits: 0,
  errors: 0,
  blacklistChecks: 0,
  refills: 0,
  multiIPDetections: 0,
  autoBlacklists: 0,
  escalationBans: 0
};

interface BlacklistEntry {
  discord_id: string;
  ip: string;
  hwid?: string;
  vmac?: string;
  user_agent?: string;
  session_id?: string;
  cookies_hash?: string; 
  canvas_fingerprint?: string;
  webgl_fingerprint?: string; 
  fonts_fingerprint?: string;
  reason: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'PERMANENT'; 
  created_at: number;
  expires_at?: number;
  created_by: string;
  identifiers: string[];
  notes?: string;
}

const DATA_RETENTION = {
  NORMAL_KEYS: 24 * 60 * 60 * 1000, // 24 hours for normal keys
  BLACKLIST_TEMPORARY: 30 * 24 * 60 * 60 * 1000, // 30 days for temp blacklist
  BLACKLIST_PERMANENT: 365 * 24 * 60 * 60 * 1000 * 10, // 10 years (effectively permanent)
  SESSIONS: 7 * 24 * 60 * 60 * 1000, // 7 days for sessions
  ERROR_LOGS: 30 * 24 * 60 * 60 * 1000, // 30 days for error logs
};

interface UserSession {
  ip: string;
  user_agent: string;
  last_active: number;
  current_key?: string;
  keys_generated: string[];
  linked_discord_ids: string[];
  privacy_agreed: boolean;
  age_verified: boolean;
  workink_progress?: {
    completed: number;
    tokens: string[];
    current_checkpoint: number;
  };
}

// lunith Script Content
const SCRIPT_CONTENT_BASE = `print("Lunith Loader Initialized")

-- Services
local Players = game:GetService("Players")

-- Main script logic
local LocalPlayer = Players.LocalPlayer
if not LocalPlayer then
    Players:GetPropertyChangedSignal("LocalPlayer"):Wait()
    LocalPlayer = Players.LocalPlayer
end

-- Token is dynamically injected by the server
local TOKEN = "{{TOKEN}}"

-- Get Executor name using Wave's identifyexecutor
local function getExecutor()
    if identifyexecutor then
        local success, executor = pcall(identifyexecutor)
        if success and executor then
            return tostring(executor)
        end
    end
    return "Unknown"
end

-- Get HWID using Wave's gethwid
local function getHWID()
    if gethwid then
        local success, hwid = pcall(gethwid)
        if success and hwid then
            return tostring(hwid)
        end
    end
    return "Unknown"
end

-- Get running scripts to prevent reverse engineering
local function checkRunningScripts()
    if getrunningscripts then
        local success, scripts = pcall(getrunningscripts)
        if success and scripts then
            -- Count how many scripts are running besides this one
            local otherScripts = 0
            for _, scriptInstance in pairs(scripts) do
                if scriptInstance ~= script then
                    otherScripts = otherScripts + 1
                end
            end
            return otherScripts
        end
    end
    return 0
end

-- Validate token and send identification data
local function validateTokenAndIdentify()
    local executor = getExecutor()
    local hwid = getHWID()
    local otherScriptsCount = checkRunningScripts()
    
    local identificationData = {
        token = TOKEN,
        executor = executor,
        hwid = hwid,
        player_name = LocalPlayer.Name,
        player_userid = tostring(LocalPlayer.UserId),
        other_scripts_running = otherScriptsCount,
        timestamp = tostring(os.time())
    }
    
    -- Simple JSON encoding
    local jsonParts = {}
    for k, v in pairs(identificationData) do
        if type(v) == "string" then
            table.insert(jsonParts, '"' .. k .. '":"' .. v .. '"')
        else
            table.insert(jsonParts, '"' .. k .. '":' .. tostring(v))
        end
    end
    local jsonData = "{" .. table.concat(jsonParts, ",") .. "}"
    
    -- Send identification data to server
    if request then
        local success, response = pcall(function()
            return request({
                Url = "https://api.napsy.dev/validate-token",
                Method = "POST",
                Headers = {
                    ["Content-Type"] = "application/json"
                },
                Body = jsonData
            })
        end)
        
        if success and response then
            if response.Success then
                local body = response.Body
                if body:find('"success":true') then
                    return {success = true}
                else
                    local errorMsg = body:match('"error":"([^"]+)"') or "Unknown error"
                    return {success = false, error = errorMsg}
                end
            else
                return {success = false, error = "HTTP " .. tostring(response.StatusCode)}
            end
        else
            return {success = false, error = "Request failed"}
        end
    else
        return {success = false, error = "Request function not available"}
    end
end

-- Main execution
local function main()
    print("Starting Lunith verification...")
    
    -- Get Executor and HWID first
    local executor = getExecutor()
    local hwid = getHWID()
    
    print("Executor:", executor)
    print("HWID:", hwid)
    print("Token:", TOKEN)
    print("Player:", LocalPlayer.Name, "(ID:", LocalPlayer.UserId, ")")
    
    -- Check for other scripts running
    local otherScripts = checkRunningScripts()
    if otherScripts > 0 then
        print("Warning: " .. otherScripts .. " other scripts detected")
    end
    
    -- Validate token
    print("Validating token and sending identification data...")
    local validationResult = validateTokenAndIdentify()
    
    if validationResult.success then
        print("Token validation successful!")
        print("Executor and HWID have been linked to your key")
        return "Lunith loaded successfully for " .. LocalPlayer.Name
    else
        warn("❌ Token validation failed:", validationResult.error)
        return "Lunith validation failed: " .. validationResult.error
    end
end

-- Safe execution with error handling
local success, result = pcall(main)
if success then
    print(result or "Lunith execution completed")
else
    warn("Lunith execution error:", result)
    print("Please contact support if this error persists")
end

return "Lunith loader process completed"`;

// ==================== UTILITY FUNCTIONS ====================

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

function generateToken(length = 20): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const randomBytes = crypto.getRandomValues(new Uint8Array(length));
  let token = "";
  for (let i = 0; i < length; i++) {
    token += chars[randomBytes[i] % chars.length];
  }
  return token;
}

function generateFormattedKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let key = '';
  for (let i = 0; i < 16; i++) {
    key += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${key.slice(0, 4)}-${key.slice(4, 8)}-${key.slice(8, 12)}-${key.slice(12)}`;
}

function getClientIP(req: Request): string {
  const cfConnectingIP = req.headers.get('cf-connecting-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  return cfConnectingIP || xForwardedFor?.split(',')[0] || 'unknown';
}

function checkRateLimit(ip: string, endpoint: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  let userLimit = rateLimit.get(ip);

  if (!userLimit) {
    userLimit = { count: 1, resetTime: now + RATE_LIMIT.WINDOW_MS, workinkCount: 0, workinkReset: now + RATE_LIMIT.WORKINK_WINDOW_MS };
    rateLimit.set(ip, userLimit);
    return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - 1 };
  }

  if (now > userLimit.resetTime) {
    userLimit.count = 1;
    userLimit.resetTime = now + RATE_LIMIT.WINDOW_MS;
  } else if (userLimit.count >= RATE_LIMIT.MAX_REQUESTS) {
    metrics.rateLimitHits++;
    return { allowed: false, remaining: 0 };
  } else {
    userLimit.count++;
  }

  if (endpoint === '/workink') {
    if (now > userLimit.workinkReset) {
      userLimit.workinkCount = 1;
      userLimit.workinkReset = now + RATE_LIMIT.WORKINK_WINDOW_MS;
    } else if (userLimit.workinkCount >= RATE_LIMIT.MAX_WORKINK_REQUESTS) {
      metrics.rateLimitHits++;
      return { allowed: false, remaining: 0 };
    } else {
      userLimit.workinkCount++;
    }
  }

  rateLimit.set(ip, userLimit);
  return { allowed: true, remaining: RATE_LIMIT.MAX_REQUESTS - userLimit.count };
}

function sanitizeInput(input: string): string {
  return input.replace(/[<>]/g, '').substring(0, 100);
}

function isValidKeyFormat(key: string): boolean {
  const keyRegex = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
  return keyRegex.test(key);
}

function isValidDiscordId(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

function parseDuration(durationStr: string): number | null {
  const regex = /(\d+)([YWMDS])/gi;
  let totalMs = 0;
  let match;

  while ((match = regex.exec(durationStr)) !== null) {
    const value = parseInt(match[1]);
    const unit = match[2].toUpperCase();
    
    switch (unit) {
      case 'Y': totalMs += value * 365 * 24 * 60 * 60 * 1000; break;
      case 'W': totalMs += value * 7 * 24 * 60 * 60 * 1000; break;
      case 'D': totalMs += value * 24 * 60 * 60 * 1000; break;
      case 'H': totalMs += value * 60 * 60 * 1000; break;
      case 'M': totalMs += value * 60 * 1000; break;
      case 'S': totalMs += value * 1000; break;
      default: return null;
    }
  }

  return totalMs > 0 ? totalMs : null;
}

// ==================== KEY MANAGEMENT ENDPOINTS ====================

// Revoke/delete a key
async function handleRevokeKey(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const key = url.searchParams.get('key');
  
  if (!key) return jsonResponse({ error: 'key parameter required' }, 400);
  if (!isValidKeyFormat(key)) return jsonResponse({ error: 'Invalid key format' }, 400);

  try {
    const keyEntry = await kv.get(['keys', key]);
    if (!keyEntry.value) {
      return jsonResponse({ error: 'Key not found' }, 404);
    }

    const keyData = keyEntry.value;
    
    // Delete associated token if exists
    if (keyData.script_token) {
      await kv.delete(['token', keyData.script_token]);
    }
    
    // Delete the key
    await kv.delete(['keys', key]);
    
    // Log the action
    const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
    await kv.set(["admin_actions", Date.now()], {
      action: 'KEY_REVOKE',
      admin: adminUser,
      key: key,
      discord_id: keyData.activation_data?.discord_id,
      timestamp: Date.now()
    });

    return jsonResponse({
      success: true,
      message: `Key ${key} revoked successfully`,
      key_data: keyData
    });
  } catch (error) {
    console.error('Key revocation error:', error);
    await logError(kv, `Key revocation error: ${error.message}`, req, '/revoke-key');
    return jsonResponse({ error: 'Failed to revoke key' }, 500);
  }
}

// Bulk key operations
async function handleBulkKeyOps(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
  }

  const { action, keys } = body;
  
  if (!action || !keys || !Array.isArray(keys)) {
    return jsonResponse({ error: 'action and keys array required' }, 400);
  }

  if (keys.length > 50) {
    return jsonResponse({ error: 'Maximum 50 keys per bulk operation' }, 400);
  }

  const results = [];
  const errors = [];

  for (const key of keys) {
    if (!isValidKeyFormat(key)) {
      errors.push({ key, error: 'Invalid key format' });
      continue;
    }

    try {
      const keyEntry = await kv.get(['keys', key]);
      if (!keyEntry.value) {
        errors.push({ key, error: 'Key not found' });
        continue;
      }

      if (action === 'revoke') {
        const keyData = keyEntry.value;
        
        // Delete associated token
        if (keyData.script_token) {
          await kv.delete(['token', keyData.script_token]);
        }
        
        // Delete the key
        await kv.delete(['keys', key]);
        
        results.push({
          key,
          success: true,
          action: 'revoked'
        });
      } else if (action === 'extend') {
        // Extend key expiration
        const keyData = keyEntry.value;
        const newExpiresAt = Date.now() + KEY_EXPIRY_MS;
        keyData.expires_at = newExpiresAt;
        keyData.extended_at = Date.now();
        keyData.extended_by = req.headers.get('X-Admin-User') || 'Unknown';
        
        await kv.set(['keys', key], keyData);
        
        results.push({
          key,
          success: true,
          action: 'extended',
          new_expires_at: newExpiresAt
        });
      } else {
        errors.push({ key, error: 'Invalid action' });
      }
    } catch (error) {
      errors.push({ key, error: error.message });
    }
  }

  // Log bulk action
  const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
  await kv.set(["admin_actions", `bulk_keys_${Date.now()}`], {
    action: `BULK_KEY_${action.toUpperCase()}`,
    admin: adminUser,
    keys_processed: results.length,
    keys_failed: errors.length,
    timestamp: Date.now()
  });

  return jsonResponse({
    success: true,
    summary: {
      total: keys.length,
      successful: results.length,
      failed: errors.length
    },
    results,
    errors
  });
}

// ==================== SESSION MANAGEMENT ENDPOINTS ====================

// Get all sessions for a user
async function handleUserSessions(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const discordId = url.searchParams.get('user_id');
  
  if (!discordId) return jsonResponse({ error: 'user_id parameter required' }, 400);

  try {
    const sessions = await findUserSessions(kv, discordId);
    
    return jsonResponse({
      success: true,
      user_id: discordId,
      sessions: sessions.map(session => ({
        ip: session.ip,
        user_agent: session.user_agent,
        last_active: session.last_active,
        current_key: session.current_key,
        keys_generated_count: session.keys_generated.length,
        privacy_agreed: session.privacy_agreed,
        age_verified: session.age_verified
      })),
      total_sessions: sessions.length
    });
  } catch (error) {
    console.error('User sessions error:', error);
    await logError(kv, `User sessions error: ${error.message}`, req, '/user-sessions');
    return jsonResponse({ error: 'Failed to get user sessions' }, 500);
  }
}

// Clear user sessions
async function handleClearSessions(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const discordId = url.searchParams.get('user_id');
  
  if (!discordId) return jsonResponse({ error: 'user_id parameter required' }, 400);

  try {
    const sessions = await findUserSessions(kv, discordId);
    let cleared = 0;

    for (const session of sessions) {
      const sessionId = `session:${session.ip}:${Buffer.from(session.user_agent).toString('base64').slice(0, 16)}`;
      await kv.delete(['sessions', sessionId]);
      cleared++;
    }

    // Log the action
    const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
    await kv.set(["admin_actions", Date.now()], {
      action: 'CLEAR_SESSIONS',
      admin: adminUser,
      target: discordId,
      sessions_cleared: cleared,
      timestamp: Date.now()
    });

    return jsonResponse({
      success: true,
      message: `Cleared ${cleared} sessions for user ${discordId}`,
      sessions_cleared: cleared
    });
  } catch (error) {
    console.error('Clear sessions error:', error);
    await logError(kv, `Clear sessions error: ${error.message}`, req, '/clear-sessions');
    return jsonResponse({ error: 'Failed to clear sessions' }, 500);
  }
}

// ==================== SYSTEM MAINTENANCE ENDPOINTS ====================

// Force cleanup of expired entries
async function handleForceCleanup(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    const beforeCount = metrics.expiredCleanups;
    await cleanupExpired(kv);
    const cleaned = metrics.expiredCleanups - beforeCount;

    return jsonResponse({
      success: true,
      message: `Cleanup completed. Removed ${cleaned} expired entries.`,
      cleaned_entries: cleaned
    });
  } catch (error) {
    console.error('Force cleanup error:', error);
    await logError(kv, `Force cleanup error: ${error.message}`, req, '/force-cleanup');
    return jsonResponse({ error: 'Failed to perform cleanup' }, 500);
  }
}

// Create backup
async function handleCreateBackup(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    await backupKeys(kv);
    
    const backupEntry = await kv.get(["backup", "latest"]);
    
    return jsonResponse({
      success: true,
      message: 'Backup created successfully',
      backup: backupEntry.value
    });
  } catch (error) {
    console.error('Backup creation error:', error);
    await logError(kv, `Backup creation error: ${error.message}`, req, '/create-backup');
    return jsonResponse({ error: 'Failed to create backup' }, 500);
  }
}

// Get system status
async function handleSystemStatus(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  try {
    // Count various entities
    let keysCount = 0;
    let tokensCount = 0;
    let sessionsCount = 0;
    let blacklistCount = 0;

    for await (const entry of kv.list({ prefix: ["keys"] })) keysCount++;
    for await (const entry of kv.list({ prefix: ["token"] })) tokensCount++;
    for await (const entry of kv.list({ prefix: ["sessions"] })) sessionsCount++;
    for await (const entry of kv.list({ prefix: ["blacklist", "entries"] })) blacklistCount++;

    const memoryUsage = Deno.memoryUsage();
    
    return jsonResponse({
      success: true,
      status: 'online',
      timestamp: new Date().toISOString(),
      database_stats: {
        keys: keysCount,
        tokens: tokensCount,
        sessions: sessionsCount,
        blacklist_entries: blacklistCount
      },
      system_metrics: {
        ...metrics,
        memory_usage: {
          heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
          heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
          external: Math.round(memoryUsage.external / 1024 / 1024) + "MB"
        },
        rate_limit_entries: rateLimit.size
      },
      uptime: {
        last_cleanup: new Date(metrics.lastCleanup).toISOString(),
        total_requests: metrics.totalRequests
      }
    });
  } catch (error) {
    console.error('System status error:', error);
    await logError(kv, `System status error: ${error.message}`, req, '/system-status');
    return jsonResponse({ error: 'Failed to get system status' }, 500);
  }
}

// ==================== RATE LIMIT MANAGEMENT ====================

// Get rate limit status
async function handleRateLimitStatus(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const ip = url.searchParams.get('ip');

  if (ip) {
    const userLimit = rateLimit.get(ip);
    return jsonResponse({
      ip,
      rate_limit: userLimit ? {
        requests: userLimit.count,
        reset_time: new Date(userLimit.resetTime).toISOString(),
        workink_requests: userLimit.workinkCount,
        workink_reset: new Date(userLimit.workinkReset).toISOString()
      } : null
    });
  }

  // Return all rate limits
  const allLimits = Array.from(rateLimit.entries()).slice(0, 100).map(([ip, data]) => ({
    ip,
    requests: data.count,
    reset_time: new Date(data.resetTime).toISOString(),
    workink_requests: data.workinkCount,
    workink_reset: new Date(data.workinkReset).toISOString()
  }));

  return jsonResponse({
    total_tracked_ips: rateLimit.size,
    rate_limits: allLimits,
    configuration: RATE_LIMIT
  });
}

// Clear rate limit for IP
async function handleClearRateLimit(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const ip = url.searchParams.get('ip');

  if (!ip) return jsonResponse({ error: 'ip parameter required' }, 400);

  const deleted = rateLimit.delete(ip);

  return jsonResponse({
    success: true,
    message: deleted ? `Rate limit cleared for IP ${ip}` : `No rate limit found for IP ${ip}`,
    ip,
    cleared: deleted
  });
}


// ==================== IDENTIFIER MANAGEMENT ====================

function getAllIdentifiers(discordId: string, ip: string, userAgent: string, keyData?: any, fingerprintData?: any): string[] {
  const identifiers: string[] = [];
  
  // Core identifiers
  if (discordId && discordId !== 'unknown') identifiers.push(`discord:${discordId}`);
  if (ip && ip !== 'unknown') identifiers.push(`ip:${ip}`);
  if (userAgent && userAgent !== 'unknown') identifiers.push(`user_agent:${userAgent}`);
  
  // Hardware identifiers from activated keys
  if (keyData?.activation_data?.hwid) {
    identifiers.push(`hwid:${keyData.activation_data.hwid}`);
  }
  if (keyData?.activation_data?.vmac) {
    identifiers.push(`vmac:${keyData.activation_data.vmac}`);
  }
  
  // Session identifiers
  if (keyData?.workink_data?.session_id) {
    identifiers.push(`session:${keyData.workink_data.session_id}`);
  }
  
  // Browser fingerprinting (if available)
  if (fingerprintData) {
    if (fingerprintData.cookies_hash) {
      identifiers.push(`cookies:${fingerprintData.cookies_hash}`);
    }
    if (fingerprintData.canvas_fingerprint) {
      identifiers.push(`canvas:${fingerprintData.canvas_fingerprint}`);
    }
    if (fingerprintData.webgl_fingerprint) {
      identifiers.push(`webgl:${fingerprintData.webgl_fingerprint}`);
    }
    if (fingerprintData.fonts_fingerprint) {
      identifiers.push(`fonts:${fingerprintData.fonts_fingerprint}`);
    }
    
    // Combined fingerprint for stronger identification
    if (fingerprintData.composite_fingerprint) {
      identifiers.push(`composite:${fingerprintData.composite_fingerprint}`);
    }
  }
  
  return [...new Set(identifiers)]; // Remove duplicates
}

// ==================== SESSION MANAGEMENT ====================

async function getUserSession(kv: Deno.Kv, ip: string, userAgent: string): Promise<UserSession> {
  const sessionId = `session:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  const entry = await kv.get(["sessions", sessionId]);
  
  if (entry.value) {
    const session = entry.value as UserSession;
    
    if (!session.linked_discord_ids) session.linked_discord_ids = [];
    if (!session.keys_generated) session.keys_generated = [];
    if (!session.privacy_agreed) session.privacy_agreed = false;
    if (!session.age_verified) session.age_verified = false;
    
    session.last_active = Date.now();
    await kv.set(["sessions", sessionId], session);
    return session;
  }
  
  const newSession: UserSession = {
    ip,
    user_agent: userAgent,
    last_active: Date.now(),
    keys_generated: [],
    linked_discord_ids: [],
    privacy_agreed: false,
    age_verified: false
  };
  
  await kv.set(["sessions", sessionId], newSession);
  return newSession;
}

async function updateUserSession(kv: Deno.Kv, ip: string, userAgent: string, newKey?: string, discordId?: string, privacyAgreed?: boolean, ageVerified?: boolean): Promise<UserSession> {
  const session = await getUserSession(kv, ip, userAgent);
  
  if (newKey) {
    session.current_key = newKey;
    session.keys_generated = [newKey];
  }
  
  if (discordId && !session.linked_discord_ids.includes(discordId)) {
    session.linked_discord_ids.push(discordId);
    if (session.linked_discord_ids.length > 1) {
      session.linked_discord_ids = session.linked_discord_ids.slice(-1);
    }
  }
  
  if (privacyAgreed !== undefined) session.privacy_agreed = privacyAgreed;
  if (ageVerified !== undefined) session.age_verified = ageVerified;
  
  const sessionId = `session:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  await kv.set(["sessions", sessionId], session);
  
  return session;
}

async function findUserSessions(kv: Deno.Kv, discordId: string): Promise<UserSession[]> {
  const sessions: UserSession[] = [];
  
  try {
    for await (const entry of kv.list({ prefix: ["sessions"] })) {
      if (!entry.value) continue;
      
      const session = entry.value as UserSession;
      
      if (!session.linked_discord_ids || !Array.isArray(session.linked_discord_ids)) continue;
      
      if (session.linked_discord_ids.includes(discordId)) {
        sessions.push(session);
      }
    }
  } catch (error) {
    console.error('Error finding user sessions:', error);
  }
  
  return sessions;
}

// ==================== BLACKLIST MANAGEMENT ====================

async function isBlacklisted(kv: Deno.Kv, discordId: string, ip: string, userAgent: string, keyData?: any): Promise<{ 
  blacklisted: boolean; 
  entry?: BlacklistEntry;
  matchedIdentifier?: string;
  severity?: string;
}> {
  metrics.blacklistChecks++;
  
  // Admin bypass
  const SUPER_ADMINS: string[] = ['YOUR_DISCORD_ID_HERE'];
  if (discordId !== 'unknown' && SUPER_ADMINS.includes(discordId)) {
    return { blacklisted: false };
  }
  
  const identifiers = getAllIdentifiers(discordId, ip, userAgent, keyData);
  
  for (const identifier of identifiers) {
    const entry = await kv.get(["blacklist", "identifiers", identifier]);
    if (entry.value) {
      const blacklistEntry = entry.value as BlacklistEntry;
      
      // Check if temporary entry has expired
      if (blacklistEntry.expires_at && Date.now() > blacklistEntry.expires_at) {
        await kv.delete(["blacklist", "identifiers", identifier]);
        await cleanupExpiredBlacklistEntries(kv);
        continue;
      }
      
      return { 
        blacklisted: true, 
        entry: blacklistEntry,
        matchedIdentifier: identifier,
        severity: blacklistEntry.severity
      };
    }
  }
  
  return { blacklisted: false };
}

async function addToBlacklist(
  kv: Deno.Kv, 
  discordId: string, 
  ip: string, 
  userAgent: string,
  reason: string, 
  createdBy: string, 
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'PERMANENT' = 'MEDIUM',
  durationMs?: number,
  keyData?: any,
  fingerprintData?: any,
  notes?: string
): Promise<{ success: boolean; identifiers: string[]; linked_sessions: number; duration: string }> {
  const now = Date.now();
  
  // Set expiration based on severity
  let expires_at: number | undefined;
  let durationText = 'Permanent';
  
  switch (severity) {
    case 'LOW':
      expires_at = now + (durationMs || 7 * 24 * 60 * 60 * 1000); // 7 days default
      durationText = `${durationMs ? durationMs / (24 * 60 * 60 * 1000) : 7} days`;
      break;
    case 'MEDIUM':
      expires_at = now + (durationMs || DATA_RETENTION.BLACKLIST_TEMPORARY); // 30 days default
      durationText = `${durationMs ? durationMs / (24 * 60 * 60 * 1000) : 30} days`;
      break;
    case 'HIGH':
      expires_at = now + (durationMs || 90 * 24 * 60 * 60 * 1000); // 90 days default
      durationText = `${durationMs ? durationMs / (24 * 60 * 60 * 1000) : 90} days`;
      break;
    case 'PERMANENT':
      expires_at = now + DATA_RETENTION.BLACKLIST_PERMANENT; // 10 years
      durationText = 'Permanent';
      break;
  }

  let identifiers = getAllIdentifiers(discordId, ip, userAgent, keyData, fingerprintData);
  
  // Find and link all related sessions
  let sessionCount = 0;
  try {
    const linkedSessions = await findUserSessions(kv, discordId);
    
    for (const session of linkedSessions) {
      if (session.ip && session.ip !== 'unknown') {
        identifiers.push(`ip:${session.ip}`);
      }
      const sessionId = `session:${session.ip}:${Buffer.from(session.user_agent).toString('base64').slice(0, 16)}`;
      identifiers.push(`session:${sessionId}`);
      sessionCount++;
      
      // Also blacklist all keys from these sessions
      for (const key of session.keys_generated) {
        identifiers.push(`key:${key}`);
      }
    }
  } catch (error) {
    console.error('Error processing linked sessions for blacklist:', error);
  }
  
  identifiers = [...new Set(identifiers)];
  
  const entry: BlacklistEntry = {
    discord_id: discordId,
    ip: ip,
    user_agent: userAgent,
    reason,
    severity,
    created_at: now,
    expires_at,
    created_by: createdBy,
    identifiers,
    notes
  };

  // Add fingerprint data if available
  if (fingerprintData) {
    entry.cookies_hash = fingerprintData.cookies_hash;
    entry.canvas_fingerprint = fingerprintData.canvas_fingerprint;
    entry.webgl_fingerprint = fingerprintData.webgl_fingerprint;
    entry.fonts_fingerprint = fingerprintData.fonts_fingerprint;
  }

  // Store under each identifier for quick lookup
  for (const identifier of identifiers) {
    await kv.set(["blacklist", "identifiers", identifier], entry);
  }

  // Also store main entry for management
  await kv.set(["blacklist", "entries", discordId], entry);
  
  // Log the blacklist action
  await kv.set(["blacklist", "logs", now], {
    action: 'ADD',
    target: discordId,
    by: createdBy,
    reason,
    severity,
    duration: durationText,
    identifiers_count: identifiers.length,
    linked_sessions: sessionCount
  });

  return { 
    success: true, 
    identifiers,
    linked_sessions: sessionCount,
    duration: durationText
  };
}

async function removeFromBlacklist(kv: Deno.Kv, discordId: string): Promise<{ success: boolean; removed: number }> {
  let removed = 0;
  
  const mainEntry = await kv.get(["blacklist", "entries", discordId]);
  if (mainEntry.value) {
    const entry = mainEntry.value as BlacklistEntry;
    
    for (const identifier of entry.identifiers) {
      await kv.delete(["blacklist", "identifiers", identifier]);
      removed++;
    }
    
    await kv.delete(["blacklist", "entries", discordId]);
    removed++;
  }
  
  return { success: true, removed };
}

async function getBlacklistEntries(kv: Deno.Kv): Promise<BlacklistEntry[]> {
  const entries: BlacklistEntry[] = [];
  
  for await (const entry of kv.list({ prefix: ["blacklist", "entries"] })) {
    entries.push(entry.value as BlacklistEntry);
  }
  
  return entries;
}

async function getBlacklistEntry(kv: Deno.Kv, discordId: string): Promise<BlacklistEntry | null> {
  const entry = await kv.get(["blacklist", "entries", discordId]);
  return entry.value as BlacklistEntry || null;
}

// ==================== AUTO-BLACKLISTING SYSTEM ====================

async function getEscalationLevel(kv: Deno.Kv, discordId: string): Promise<number> {
  const escalationEntry = await kv.get(["escalation", discordId]);
  return escalationEntry.value?.level || 0;
}

async function calculateEscalationBanDuration(kv: Deno.Kv, discordId: string, uniqueIPs: number): Promise<number> {
  const escalationLevel = await getEscalationLevel(kv, discordId);
  const newEscalationLevel = escalationLevel + 1;
  
  // Store new escalation level
  await kv.set(["escalation", discordId], {
    level: newEscalationLevel,
    last_escalation: Date.now(),
    reason: "Multi-IP token sharing",
    unique_ips: uniqueIPs
  });
  
  // Calculate duration with exponential growth
  let durationDays = AUTO_BLACKLIST_CONFIG.ESCALATION_BASE_DAYS * 
                     Math.pow(AUTO_BLACKLIST_CONFIG.ESCALATION_MULTIPLIER, newEscalationLevel - 1);
  
  // Cap at maximum
  durationDays = Math.min(durationDays, AUTO_BLACKLIST_CONFIG.MAX_ESCALATION_DAYS);
  
  metrics.escalationBans++;
  
  return Math.ceil(durationDays);
}

async function collectAllUserIdentifiers(kv: Deno.Kv, discordId: string): Promise<string[]> {
  const identifiers: string[] = [];
  
  // Add Discord ID
  identifiers.push(`discord:${discordId}`);
  
  // Find all keys associated with this user
  for await (const entry of kv.list({ prefix: ["keys"] })) {
    const keyData = entry.value;
    if (keyData.activation_data?.discord_id === discordId) {
      // Add key-specific identifiers
      identifiers.push(`key:${keyData.key}`);
      
      if (keyData.workink_data?.ip) {
        identifiers.push(`ip:${keyData.workink_data.ip}`);
      }
      if (keyData.workink_data?.user_agent) {
        identifiers.push(`user_agent:${keyData.workink_data.user_agent}`);
      }
      if (keyData.activation_data?.hwid && keyData.activation_data.hwid !== 'pending') {
        identifiers.push(`hwid:${keyData.activation_data.hwid}`);
      }
      if (keyData.activation_data?.executor && keyData.activation_data.executor !== 'pending') {
        identifiers.push(`executor:${keyData.activation_data.executor}`);
      }
    }
  }
  
  // Find all sessions for this user
  const userSessions = await findUserSessions(kv, discordId);
  for (const session of userSessions) {
    if (session.ip) identifiers.push(`ip:${session.ip}`);
    if (session.user_agent) identifiers.push(`user_agent:${session.user_agent}`);
    for (const key of session.keys_generated) {
      identifiers.push(`session_key:${key}`);
    }
  }
  
  // Find all tokens for this user
  for await (const entry of kv.list({ prefix: ["token"] })) {
    const tokenData = entry.value;
    if (tokenData.user_id === discordId) {
      identifiers.push(`token:${entry.key[1]}`);
    }
  }
  
  return [...new Set(identifiers)]; // Remove duplicates
}

async function revokeAllUserAssets(kv: Deno.Kv, discordId: string): Promise<void> {
  let revokedCount = 0;
  
  // Revoke all keys
  for await (const entry of kv.list({ prefix: ["keys"] })) {
    const keyData = entry.value;
    if (keyData.activation_data?.discord_id === discordId) {
      // Mark key as revoked
      keyData.revoked = true;
      keyData.revoked_at = Date.now();
      keyData.revoked_reason = "Auto-blacklist: Multi-IP token sharing";
      await kv.set(entry.key, keyData);
      revokedCount++;
    }
  }
  
  // Revoke all tokens
  for await (const entry of kv.list({ prefix: ["token"] })) {
    const tokenData = entry.value;
    if (tokenData.user_id === discordId) {
      await kv.delete(entry.key);
      revokedCount++;
    }
  }
  
  // Log revocation
  await kv.set(["auto_revocation", Date.now()], {
    discord_id: discordId,
    revoked_count: revokedCount,
    timestamp: Date.now()
  });
}

async function autoBlacklistForMultiIP(
  kv: Deno.Kv, 
  tokenData: any, 
  keyData: any, 
  uniqueIPs: number,
  triggerIP: string
): Promise<{ success: boolean; banDurationDays: number; severity: string }> {
  
  // Calculate escalation ban duration
  const banDurationDays = await calculateEscalationBanDuration(kv, tokenData.user_id, uniqueIPs);
  const banDurationMs = banDurationDays * 24 * 60 * 60 * 1000;
  
  // Get all relevant identifiers for comprehensive blacklisting
  const discordId = tokenData.user_id;
  const originalIP = keyData.workink_data?.ip;
  const userAgent = keyData.workink_data?.user_agent;
  
  // Collect ALL identifiers from this user's activities
  const allIdentifiers = await collectAllUserIdentifiers(kv, discordId);
  
  // Add the trigger IP and token to identifiers
  allIdentifiers.push(`ip:${triggerIP}`);
  allIdentifiers.push(`token:${tokenData.key}`);
  if (originalIP) allIdentifiers.push(`ip:${originalIP}`);
  
  // Remove duplicates
  const uniqueIdentifiers = [...new Set(allIdentifiers)];
  
  // Create comprehensive blacklist entry
  const blacklistEntry: BlacklistEntry = {
    discord_id: discordId,
    ip: triggerIP,
    user_agent: userAgent,
    reason: `${AUTO_BLACKLIST_CONFIG.BAN_REASON} - ${uniqueIPs} unique IPs detected`,
    severity: AUTO_BLACKLIST_CONFIG.SEVERITY,
    created_at: Date.now(),
    expires_at: Date.now() + banDurationMs,
    created_by: "AUTO_BLACKLIST_SYSTEM",
    identifiers: uniqueIdentifiers,
    notes: `Auto-blacklisted for token sharing. Unique IPs: ${uniqueIPs}, Duration: ${banDurationDays} days, Escalation level: ${await getEscalationLevel(kv, discordId)}`
  };
  
  // Store under each identifier
  for (const identifier of uniqueIdentifiers) {
    await kv.set(["blacklist", "identifiers", identifier], blacklistEntry);
  }
  
  // Store main entry
  await kv.set(["blacklist", "entries", discordId], blacklistEntry);
  
  // Revoke all active tokens and keys for this user
  await revokeAllUserAssets(kv, discordId);
  
  // Log the auto-blacklist action
  await kv.set(["auto_blacklist", "logs", Date.now()], {
    discord_id: discordId,
    trigger_ip: triggerIP,
    unique_ips: uniqueIPs,
    ban_duration_days: banDurationDays,
    identifiers_count: uniqueIdentifiers.length,
    revoked_assets: true,
    escalation_level: await getEscalationLevel(kv, discordId)
  });
  
  metrics.autoBlacklists++;
  
  return {
    success: true,
    banDurationDays,
    severity: AUTO_BLACKLIST_CONFIG.SEVERITY
  };
}

// ==================== WHITELIST MANAGEMENT ====================

// Remove from blacklist (whitelist) endpoint
async function handleWhitelist(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const discordId = url.searchParams.get('user_id');
  
  if (!discordId) {
    return jsonResponse({ error: 'user_id parameter required' }, 400);
  }

  if (!isValidDiscordId(discordId)) {
    return jsonResponse({ error: 'Invalid Discord ID format' }, 400);
  }

  try {
    const result = await removeFromBlacklist(kv, discordId);
    
    // Log the whitelist action
    const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
    await kv.set(["admin_actions", Date.now()], {
      action: 'WHITELIST',
      admin: adminUser,
      target: discordId,
      timestamp: Date.now(),
      removed_identifiers: result.removed
    });

    return jsonResponse({
      success: true,
      message: `User ${discordId} has been whitelisted successfully`,
      removed_entries: result.removed
    });
  } catch (error) {
    console.error('Whitelist error:', error);
    await logError(kv, `Whitelist error: ${error.message}`, req, '/whitelist');
    return jsonResponse({ error: 'Failed to whitelist user' }, 500);
  }
}

// Check if user is blacklisted endpoint
async function handleCheckBlacklist(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const discordId = url.searchParams.get('user_id');
  
  if (!discordId) {
    return jsonResponse({ error: 'user_id parameter required' }, 400);
  }

  try {
    const blacklistEntry = await getBlacklistEntry(kv, discordId);
    
    if (blacklistEntry) {
      // Get additional user info
      const userKeys = [];
      for await (const entry of kv.list({ prefix: ["keys"] })) {
        const keyData = entry.value;
        if (keyData.activation_data?.discord_id === discordId) {
          userKeys.push({
            key: keyData.key,
            activated_at: keyData.activation_data.activated_at,
            expires_at: keyData.expires_at
          });
        }
      }

      return jsonResponse({
        blacklisted: true,
        entry: blacklistEntry,
        user_info: {
          total_activations: userKeys.length,
          activated_keys: userKeys,
          escalation_level: await getEscalationLevel(kv, discordId)
        }
      });
    } else {
      return jsonResponse({
        blacklisted: false,
        message: `User ${discordId} is not blacklisted`
      });
    }
  } catch (error) {
    console.error('Check blacklist error:', error);
    await logError(kv, `Check blacklist error: ${error.message}`, req, '/check-blacklist');
    return jsonResponse({ error: 'Failed to check blacklist status' }, 500);
  }
}

// Bulk whitelist endpoint
async function handleBulkWhitelist(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  let body;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
  }

  const { user_ids, reason } = body;
  
  if (!user_ids || !Array.isArray(user_ids)) {
    return jsonResponse({ error: 'user_ids array required' }, 400);
  }

  if (user_ids.length > 100) {
    return jsonResponse({ error: 'Maximum 100 users per bulk operation' }, 400);
  }

  const results = [];
  const errors = [];

  for (const discordId of user_ids) {
    if (!isValidDiscordId(discordId)) {
      errors.push({ user_id: discordId, error: 'Invalid Discord ID format' });
      continue;
    }

    try {
      const result = await removeFromBlacklist(kv, discordId);
      results.push({
        user_id: discordId,
        success: true,
        removed_entries: result.removed
      });

      // Log individual whitelist action
      const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
      await kv.set(["admin_actions", `bulk_${Date.now()}_${discordId}`], {
        action: 'BULK_WHITELIST',
        admin: adminUser,
        target: discordId,
        reason: reason || 'Bulk whitelist operation',
        timestamp: Date.now()
      });

    } catch (error) {
      errors.push({
        user_id: discordId,
        error: error.message
      });
    }
  }

  return jsonResponse({
    success: true,
    summary: {
      total: user_ids.length,
      successful: results.length,
      failed: errors.length
    },
    results: results,
    errors: errors
  });
}

// Get blacklist statistics endpoint
async function handleBlacklistStats(kv: Deno.Kv, req: Request): Promise<Response> {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const entries = await getBlacklistEntries(kv);
    const now = Date.now();

    // Calculate statistics
    const stats = {
      total: entries.length,
      permanent: entries.filter(e => e.severity === 'PERMANENT').length,
      high: entries.filter(e => e.severity === 'HIGH').length,
      medium: entries.filter(e => e.severity === 'MEDIUM').length,
      low: entries.filter(e => e.severity === 'LOW').length,
      expired: entries.filter(e => e.expires_at && e.expires_at < now).length,
      active: entries.filter(e => !e.expires_at || e.expires_at >= now).length,
      auto_blacklisted: entries.filter(e => e.created_by === 'AUTO_BLACKLIST_SYSTEM').length,
      admin_blacklisted: entries.filter(e => e.created_by !== 'AUTO_BLACKLIST_SYSTEM').length
    };

    // Recent auto-blacklist actions (last 24 hours)
    const recentAutoBlacklists = [];
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    for await (const entry of kv.list({ prefix: ["auto_blacklist", "logs"] })) {
      if (entry.value && entry.value.timestamp > twentyFourHoursAgo) {
        recentAutoBlacklists.push(entry.value);
      }
    }

    // Escalation statistics
    const escalationStats = {
      total_users_with_escalation: 0,
      level_breakdown: {} as Record<number, number>
    };

    for await (const entry of kv.list({ prefix: ["escalation"] })) {
      if (entry.value) {
        escalationStats.total_users_with_escalation++;
        const level = entry.value.level || 0;
        escalationStats.level_breakdown[level] = (escalationStats.level_breakdown[level] || 0) + 1;
      }
    }

    return jsonResponse({
      statistics: stats,
      recent_auto_blacklists: {
        count: recentAutoBlacklists.length,
        actions: recentAutoBlacklists.slice(0, 10) // Last 10 actions
      },
      escalation: escalationStats,
      system_metrics: {
        multiIPDetections: metrics.multiIPDetections,
        autoBlacklists: metrics.autoBlacklists,
        escalationBans: metrics.escalationBans
      }
    });
  } catch (error) {
    console.error('Blacklist stats error:', error);
    await logError(kv, `Blacklist stats error: ${error.message}`, req, '/blacklist-stats');
    return jsonResponse({ error: 'Failed to get blacklist statistics' }, 500);
  }
}


// ==================== TOKEN IP TRACKING ====================

async function trackTokenIPUsage(kv: Deno.Kv, token: string, executorIP: string, tokenData: any, keyData: any): Promise<{
  multiIPDetected: boolean;
  uniqueIPs: number;
}> {
  const ipTrackingKey = ["token_ips", token];
  const ipEntry = await kv.get(ipTrackingKey);
  
  let ipData: { ips: string[]; firstSeen: number; lastSeen: number } = ipEntry.value || {
    ips: [],
    firstSeen: Date.now(),
    lastSeen: Date.now()
  };
  
  // Add new IP if not already tracked
  if (!ipData.ips.includes(executorIP)) {
    ipData.ips.push(executorIP);
    ipData.lastSeen = Date.now();
    
    await kv.set(ipTrackingKey, ipData);
  }
  
  const uniqueIPs = ipData.ips.length;
  const multiIPDetected = uniqueIPs >= AUTO_BLACKLIST_CONFIG.MULTI_IP_THRESHOLD;
  
  return { multiIPDetected, uniqueIPs };
}

async function checkTokenIPUsage(kv: Deno.Kv, token: string, currentIP?: string): Promise<{
  uniqueIPs: number;
  ips: string[];
  firstSeen: number;
}> {
  const ipEntry = await kv.get(["token_ips", token]);
  
  if (!ipEntry.value) {
    return { uniqueIPs: 0, ips: [], firstSeen: Date.now() };
  }
  
  const ipData = ipEntry.value;
  let uniqueIPs = ipData.ips.length;
  
  // If checking with a new IP, include it in count
  if (currentIP && !ipData.ips.includes(currentIP)) {
    uniqueIPs++;
  }
  
  return {
    uniqueIPs,
    ips: ipData.ips,
    firstSeen: ipData.firstSeen
  };
}

// ==================== KEY MANAGEMENT ====================

async function canRenewKey(kv: Deno.Kv, session: UserSession): Promise<{ canRenew: boolean; reason?: string; currentKeyData?: any }> {
  if (!session.current_key) {
    return { canRenew: false, reason: "No existing key found" };
  }
  
  const keyEntry = await kv.get(["keys", session.current_key]);
  if (!keyEntry.value) {
    return { canRenew: false, reason: "Key not found in database" };
  }
  
  const keyData = keyEntry.value;
  
  if (keyData.expires_at > Date.now()) {
    return { 
      canRenew: false, 
      reason: "Current key is still valid",
      currentKeyData: keyData
    };
  }
  
  return { canRenew: true, currentKeyData: keyData };
}

// ==================== ERROR LOGGING ====================

interface ErrorLog {
  timestamp: number;
  error: string;
  endpoint: string;
  ip: string;
  userAgent: string;
}

async function logError(kv: Deno.Kv, error: string, req: Request, endpoint: string) {
  try {
    const errorLog: ErrorLog = {
      timestamp: Date.now(), error, endpoint,
      ip: getClientIP(req), userAgent: req.headers.get('user-agent') || 'unknown'
    };
    await kv.set(["errors", Date.now()], errorLog);
    metrics.errors++;
  } catch (logError) {
    console.error("Failed to log error:", logError);
  }
}

// ==================== CLEANUP & MAINTENANCE ====================

async function cleanupExpired(kv: Deno.Kv) {
  const now = Date.now();
  let cleaned = 0;

  try {
    // Clean up expired tokens (24 hours)
    const tokenEntries = kv.list({ prefix: ["token"] });
    for await (const entry of tokenEntries) {
      if (entry.value && entry.value.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up expired unactivated keys (24 hours)
    const keyEntries = kv.list({ prefix: ["keys"] });
    for await (const entry of keyEntries) {
      const keyData = entry.value;
      if (keyData && !keyData.activated && keyData.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up old sessions (7 days)
    const sessionEntries = kv.list({ prefix: ["sessions"] });
    for await (const entry of sessionEntries) {
      const session = entry.value as UserSession;
      if (session && now - session.last_active > DATA_RETENTION.SESSIONS) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up old error logs (30 days)
    const errorEntries = [];
    for await (const entry of kv.list({ prefix: ["errors"] })) {
      const errorLog = entry.value as any;
      if (errorLog && now - errorLog.timestamp > DATA_RETENTION.ERROR_LOGS) {
        errorEntries.push(entry);
      }
    }
    
    for (const entry of errorEntries) {
      await kv.delete(entry.key);
      cleaned++;
    }

    // Clean up expired blacklist entries
    await cleanupExpiredBlacklistEntries(kv);

    if (cleaned > 0) {
      metrics.expiredCleanups += cleaned;
      metrics.lastCleanup = now;
      console.log(`Cleaned up ${cleaned} expired entries`);
    }
  } catch (error) {
    console.error("Cleanup error:", error);
  }
}

async function cleanupExpiredBlacklistEntries(kv: Deno.Kv): Promise<number> {
  const now = Date.now();
  let cleaned = 0;

  try {
    // Clean up expired blacklist identifier entries
    const blacklistEntries = kv.list({ prefix: ["blacklist", "identifiers"] });
    for await (const entry of blacklistEntries) {
      const blacklistEntry = entry.value as BlacklistEntry;
      if (blacklistEntry && blacklistEntry.expires_at && blacklistEntry.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up expired main blacklist entries
    const mainBlacklistEntries = kv.list({ prefix: ["blacklist", "entries"] });
    for await (const entry of mainBlacklistEntries) {
      const blacklistEntry = entry.value as BlacklistEntry;
      if (blacklistEntry && blacklistEntry.expires_at && blacklistEntry.expires_at < now) {
        await kv.delete(entry.key);
        cleaned++;
      }
    }

    // Clean up old blacklist logs (keep 90 days)
    const blacklistLogs = [];
    for await (const entry of kv.list({ prefix: ["blacklist", "logs"] })) {
      const log = entry.value as any;
      if (log && now - entry.key[2] > 90 * 24 * 60 * 60 * 1000) {
        blacklistLogs.push(entry);
      }
    }
    
    for (const entry of blacklistLogs) {
      await kv.delete(entry.key);
      cleaned++;
    }

    return cleaned;
  } catch (error) {
    console.error("Blacklist cleanup error:", error);
    return 0;
  }
}

async function backupKeys(kv: Deno.Kv) {
  try {
    const entries = [];
    for await (const entry of kv.list({ prefix: [] })) {
      entries.push({ key: entry.key, value: entry.value, versionstamp: entry.versionstamp });
    }
    
    await kv.set(["backup", "latest"], {
      timestamp: Date.now(), entries: entries.slice(0, 1000), totalEntries: entries.length
    });
    
    console.log(`Backup created with ${entries.length} entries`);
  } catch (error) {
    console.error("Backup failed:", error);
  }
}

function monitorPerformance() {
  const memoryUsage = Deno.memoryUsage();
  console.log("Memory usage:", {
    heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024) + "MB",
    heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024) + "MB",
    external: Math.round(memoryUsage.external / 1024 / 1024) + "MB"
  });

  if (metrics.totalRequests % 100 === 0 || Date.now() - metrics.lastCleanup > 300000) {
    console.log("System Metrics:", JSON.stringify(metrics, null, 2));
  }
}

// ==================== WORKINK VALIDATION ====================

async function validateWorkinkToken(token: string): Promise<{ valid: boolean; deleted?: boolean; info?: any }> {
  try {
    const response = await fetch(`${WORKINK_CONFIG.VALIDATION_ENDPOINT}${token}`);
    
    if (!response.ok) {
      console.error(`Workink API error: ${response.status}`);
      return { valid: false };
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Workink validation error:', error);
    return { valid: false };
  }
}

async function completeWorkinkCheckpoint(kv: Deno.Kv, session: UserSession, token: string): Promise<{ success: boolean; checkpoint: number; completed: number }> {
  const sessionId = `session:${session.ip}:${Buffer.from(session.user_agent).toString('base64').slice(0, 16)}`;
  
  // Initialize workink progress if not exists
  if (!session.workink_progress) {
    session.workink_progress = {
      completed: 0,
      tokens: [],
      current_checkpoint: 0
    };
  }
  
  // Validate the workink token
  const validation = await validateWorkinkToken(token);
  
  if (!validation.valid) {
    return { success: false, checkpoint: session.workink_progress.current_checkpoint, completed: session.workink_progress.completed };
  }
  
  // Mark checkpoint as completed
  session.workink_progress.completed++;
  session.workink_progress.tokens.push(token);
  session.workink_progress.current_checkpoint = session.workink_progress.completed;
  
  // Update session in KV
  await kv.set(["sessions", sessionId], session);
  
  return { 
    success: true, 
    checkpoint: session.workink_progress.current_checkpoint, 
    completed: session.workink_progress.completed 
  };
}

function getNextWorkinkLink(session: UserSession): string | null {
  if (!session.workink_progress) {
    return WORKINK_CONFIG.WORKINK_LINKS[0];
  }
  
  const nextCheckpoint = session.workink_progress.completed;
  
  if (nextCheckpoint >= WORKINK_CONFIG.CHECKPOINTS_REQUIRED) {
    return null; // All checkpoints completed
  }
  
  return WORKINK_CONFIG.WORKINK_LINKS[nextCheckpoint];
}

function areAllWorkinksCompleted(session: UserSession): boolean {
  return session.workink_progress?.completed >= WORKINK_CONFIG.CHECKPOINTS_REQUIRED;
}


// ==================== ENDPOINT HANDLERS ====================

async function handleWorkInk(kv: Deno.Kv, clientIP: string, userAgent: string, req: Request) {
  // Check blacklist for IP and User Agent first
  const blacklistCheck = await isBlacklisted(kv, 'unknown', clientIP, userAgent);
  if (blacklistCheck.blacklisted) {
    await logError(kv, `Blacklisted connection attempted key generation: ${clientIP}`, req, '/workink');
    return jsonResponse({ 
      error: "Access denied. Your connection is blacklisted.",
      reason: blacklistCheck.entry?.reason,
      severity: blacklistCheck.severity,
      expires: blacklistCheck.entry?.expires_at ? new Date(blacklistCheck.entry.expires_at).toISOString() : 'Permanent',
      matched_identifier: blacklistCheck.matchedIdentifier
    }, 403);
  }
  
  const session = await getUserSession(kv, clientIP, userAgent);
  
  let body;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  const { privacy_agreed, age_verified, workink_token } = body;
  
  // Handle workink token validation (for checkpoint completion)
  if (workink_token) {
    const result = await completeWorkinkCheckpoint(kv, session, workink_token);
    
    if (!result.success) {
      return jsonResponse({ 
        error: "Invalid workink token. Please complete the verification properly.",
        checkpoint: result.checkpoint,
        completed: result.completed
      }, 400);
    }
    
    // Check if all workinks are completed
    if (areAllWorkinksCompleted(session)) {
      // Generate the key since all checkpoints are done
      const key = generateFormattedKey();
      const expiresAt = Date.now() + KEY_EXPIRY_MS;
      
      const keyData = {
        key,
        created_at: Date.now(),
        expires_at: expiresAt,
        activated: false,
        workink_completed: true,
        workink_checkpoints_completed: WORKINK_CONFIG.CHECKPOINTS_REQUIRED,
        workink_data: {
          ip: clientIP,
          user_agent: userAgent,
          completed_at: Date.now(),
          session_id: `session:${clientIP}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`,
          privacy_agreed: session.privacy_agreed,
          age_verified: session.age_verified,
          checkpoint_tokens: session.workink_progress?.tokens || []
        }
      };
      
      await kv.set(["keys", key], keyData);
      await updateUserSession(kv, clientIP, userAgent, key);
      
      return jsonResponse({
        success: true,
        key: key,
        expires_at: new Date(expiresAt).toISOString(),
        checkpoints_completed: WORKINK_CONFIG.CHECKPOINTS_REQUIRED,
        message: "All verifications completed successfully! Your key has been generated."
      });
    } else {
      // More checkpoints needed
      const nextLink = getNextWorkinkLink(session);
      return jsonResponse({
        success: true,
        checkpoint_completed: true,
        current_checkpoint: session.workink_progress?.completed || 0,
        total_checkpoints: WORKINK_CONFIG.CHECKPOINTS_REQUIRED,
        next_checkpoint_link: nextLink,
        message: `Checkpoint ${session.workink_progress?.completed || 0}/${WORKINK_CONFIG.CHECKPOINTS_REQUIRED} completed!`
      });
    }
  }
  
  // Initial workink request - check privacy agreement first
  if (!privacy_agreed || !age_verified) {
    return jsonResponse({ 
      error: "You must agree to the privacy policy and age verification to generate a key." 
    }, 403);
  }
  
  // Update session with privacy agreement
  await updateUserSession(kv, clientIP, userAgent, undefined, undefined, true, true);
  
  // Start the first workink checkpoint
  const firstLink = getNextWorkinkLink(session);
  
  return jsonResponse({
    success: true,
    checkpoint_required: true,
    current_checkpoint: 0,
    total_checkpoints: WORKINK_CONFIG.CHECKPOINTS_REQUIRED,
    workink_link: firstLink,
    message: "Please complete the first verification step."
  });
}

async function handleUserPanel(kv: Deno.Kv, clientIP: string, userAgent: string) {
  const session = await getUserSession(kv, clientIP, userAgent);
  const currentKey = session.current_key;
  
  let keyInfo = null;
  if (currentKey) {
    const keyEntry = await kv.get(["keys", currentKey]);
    if (keyEntry.value) keyInfo = keyEntry.value;
  }
  
  return jsonResponse({
    success: true,
    session: { ip: session.ip, keys_generated: session.keys_generated.length, last_active: session.last_active,
      current_key: session.current_key, privacy_agreed: session.privacy_agreed, age_verified: session.age_verified },
    current_key: keyInfo ? { key: keyInfo.key, activated: keyInfo.activated, created_at: keyInfo.created_at,
      expires_at: keyInfo.expires_at, renewed_at: keyInfo.renewed_at, renewal_count: keyInfo.renewal_count || 0 } : null,
    can_renew: keyInfo ? keyInfo.expires_at < Date.now() : false
  });
}

async function handleWorkinkProgress(kv: Deno.Kv, clientIP: string, userAgent: string): Promise<Response> {
  const session = await getUserSession(kv, clientIP, userAgent);
  
  const nextLink = getNextWorkinkLink(session);
  const completed = session.workink_progress?.completed || 0;
  
  return jsonResponse({
    success: true,
    progress: {
      completed: completed,
      required: WORKINK_CONFIG.CHECKPOINTS_REQUIRED,
      percentage: Math.round((completed / WORKINK_CONFIG.CHECKPOINTS_REQUIRED) * 100)
    },
    next_checkpoint_link: nextLink,
    all_completed: areAllWorkinksCompleted(session)
  });
}



async function handleTokenValidation(kv: Deno.Kv, req: Request, body: any): Promise<Response> {
  const { 
    token, 
    executor, 
    hwid, 
    player_name, 
    player_userid, 
    other_scripts_running,
    timestamp 
  } = body;
  
  if (!token || token === 'unknown') {
    return jsonResponse({ error: "Invalid token" }, 400);
  }

  const executorIP = getClientIP(req);
  
  // Verify the token exists and is valid
  const tokenEntry = await kv.get(["token", token]);
  if (!tokenEntry.value) {
    return jsonResponse({ error: "Token not found" }, 404);
  }

  const tokenData = tokenEntry.value;
  
  // Check if token is expired
  if (tokenData.expires_at < Date.now()) {
    await kv.delete(["token", token]);
    return jsonResponse({ error: "Token expired" }, 410);
  }

  // Find the key associated with this token
  const keyEntry = await kv.get(["keys", tokenData.key]);
  if (!keyEntry.value) {
    return jsonResponse({ error: "Associated key not found" }, 404);
  }

  const keyData = keyEntry.value;
  
  // Track IP usage for this token
  const ipTrackingResult = await trackTokenIPUsage(kv, token, executorIP, tokenData, keyData);
  
  // If multi-IP detected, auto-blacklist and return error
  if (ipTrackingResult.multiIPDetected) {
    metrics.multiIPDetections++;
    
    // Perform auto-blacklisting with escalation
    const blacklistResult = await autoBlacklistForMultiIP(
      kv, 
      tokenData, 
      keyData, 
      ipTrackingResult.uniqueIPs,
      executorIP
    );
    
    return jsonResponse({ 
      success: false, 
      error: "Token sharing detected. Access permanently revoked.",
      details: {
        reason: AUTO_BLACKLIST_CONFIG.BAN_REASON,
        unique_ips_detected: ipTrackingResult.uniqueIPs,
        ban_duration_days: blacklistResult.banDurationDays,
        severity: blacklistResult.severity
      }
    }, 403);
  }

  // Continue with normal validation if no multi-IP detected...
  const now = Date.now();
  
  // IP VERIFICATION: Compare executor IP with original verification IP
  const originalIP = keyData.workink_data?.ip;
  const ipMatches = originalIP && executorIP === originalIP;
  
  if (!ipMatches) {
    // Log the IP mismatch
    await kv.set(["security", "ip_mismatch", Date.now()], {
      key: tokenData.key,
      token: token,
      discord_id: tokenData.user_id,
      original_ip: originalIP,
      executor_ip: executorIP,
      executor: executor,
      timestamp: now
    });
    
    // Check if this should trigger multi-IP detection
    const ipCheck = await checkTokenIPUsage(kv, token, executorIP);
    if (ipCheck.uniqueIPs >= AUTO_BLACKLIST_CONFIG.MULTI_IP_THRESHOLD) {
      metrics.multiIPDetections++;
      
      const blacklistResult = await autoBlacklistForMultiIP(
        kv, 
        tokenData, 
        keyData, 
        ipCheck.uniqueIPs,
        executorIP
      );
      
      return jsonResponse({ 
        success: false, 
        error: "Token sharing detected. Multiple IPs using same token.",
        details: {
          reason: AUTO_BLACKLIST_CONFIG.BAN_REASON,
          unique_ips_detected: ipCheck.uniqueIPs,
          ban_duration_days: blacklistResult.banDurationDays,
          severity: blacklistResult.severity
        }
      }, 403);
    }
    
    return jsonResponse({ 
      success: false, 
      error: "IP address verification failed.",
      details: {
        expected_ip: originalIP,
        received_ip: executorIP,
        ip_match: false
      }
    }, 403);
  }

  // Rest of normal validation logic...
  if (!keyData.activation_data) {
    keyData.activation_data = {
      discord_id: tokenData.user_id,
      discord_username: tokenData.username,
      activated_at: now,
      executor: executor,
      hwid: hwid,
      player_name: player_name,
      player_userid: player_userid,
      first_validation: now,
      validations: [{
        timestamp: now,
        executor: executor,
        hwid: hwid,
        player_name: player_name,
        player_userid: player_userid,
        other_scripts: other_scripts_running,
        ip: executorIP,
        ip_match: true
      }]
    };
  } else {
    // Update existing activation data...
    keyData.activation_data.executor = executor || keyData.activation_data.executor;
    keyData.activation_data.hwid = hwid || keyData.activation_data.hwid;
    keyData.activation_data.player_name = player_name || keyData.activation_data.player_name;
    keyData.activation_data.player_userid = player_userid || keyData.activation_data.player_userid;
    keyData.activation_data.last_validation = now;
    keyData.activation_data.validation_count = (keyData.activation_data.validation_count || 0) + 1;
    keyData.activation_data.last_ip = executorIP;
    
    if (!keyData.activation_data.validations) {
      keyData.activation_data.validations = [];
    }
    keyData.activation_data.validations.push({
      timestamp: now,
      executor: executor,
      hwid: hwid,
      player_name: player_name,
      player_userid: player_userid,
      other_scripts: other_scripts_running,
      ip: executorIP,
      ip_match: true
    });
    
    if (keyData.activation_data.validations.length > 10) {
      keyData.activation_data.validations = keyData.activation_data.validations.slice(-10);
    }
  }
  
  await kv.set(["keys", tokenData.key], keyData);

  // Enhanced blacklist checking...
  const blacklistCheck = await isBlacklisted(
    kv, 
    tokenData.user_id, 
    executorIP,
    `Executor/${executor}`,
    keyData,
    { 
      hwid: hwid,
      executor: executor,
      player_userid: player_userid
    }
  );

  if (blacklistCheck.blacklisted) {
    await kv.set(["security", "blocked_attempts", now], {
      key: tokenData.key,
      token: token,
      discord_id: tokenData.user_id,
      executor: executor,
      hwid: hwid,
      executor_ip: executorIP,
      reason: blacklistCheck.entry?.reason,
      severity: blacklistCheck.severity,
      timestamp: now
    });
    
    return jsonResponse({ 
      success: false, 
      error: "Access denied. Your account or device is blacklisted.",
      reason: blacklistCheck.entry?.reason,
      severity: blacklistCheck.severity,
      matched_identifier: blacklistCheck.matchedIdentifier
    }, 403);
  }

  // Log successful validation
  await kv.set(["security", "validations", now], {
    key: tokenData.key,
    token: token,
    discord_id: tokenData.user_id,
    executor: executor,
    hwid: hwid,
    executor_ip: executorIP,
    player_name: player_name,
    player_userid: player_userid,
    other_scripts: other_scripts_running,
    ip_match: true,
    timestamp: now
  });

  return jsonResponse({
    success: true,
    validated: true,
    ip_verified: true,
    key: tokenData.key,
    discord_user: tokenData.username,
    activation_data: {
      discord_id: keyData.activation_data.discord_id,
      discord_username: keyData.activation_data.discord_username,
      activated_at: keyData.activation_data.activated_at,
      executor: keyData.activation_data.executor,
      hwid: keyData.activation_data.hwid,
      player_name: keyData.activation_data.player_name,
      validation_count: keyData.activation_data.validation_count || 1,
      last_validation: keyData.activation_data.last_validation,
      last_ip: executorIP
    },
    script_url: `https://api.napsy.dev/scripts/${token}`,
    loadstring: `loadstring(game:HttpGet("https://api.napsy.dev/scripts/${token}"))()`,
    message: "Token validated successfully"
  });
}

// ==================== ADMIN ENDPOINTS ====================

async function handleAdminBlacklist(kv: Deno.Kv, req: Request) {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);

  if (req.method === 'POST') {
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
    }

    const { discord_id, reason, created_by, severity, duration_ms, user_data, notes } = body;
    
    if (!discord_id || !reason || !created_by) {
      return jsonResponse({ 
        error: 'Missing required fields: discord_id, reason, created_by' 
      }, 400);
    }

    // Validate severity
    const validSeverities = ['LOW', 'MEDIUM', 'HIGH', 'PERMANENT'];
    if (severity && !validSeverities.includes(severity)) {
      return jsonResponse({ 
        error: 'Invalid severity. Must be one of: LOW, MEDIUM, HIGH, PERMANENT' 
      }, 400);
    }

    try {
      const result = await addToBlacklist(
        kv, 
        discord_id, 
        user_data?.ip || 'unknown', 
        user_data?.user_agent || 'unknown',
        reason, 
        created_by, 
        severity || 'MEDIUM',
        duration_ms,
        user_data,
        user_data?.fingerprint_data,
        notes
      );

      // Log the admin action
      await kv.set(["admin_actions", Date.now()], {
        action: 'BLACKLIST_ADD',
        admin: created_by,
        target: discord_id,
        reason: reason,
        severity: severity || 'MEDIUM',
        duration_ms: duration_ms,
        timestamp: Date.now()
      });

      return jsonResponse(result);
    } catch (error) {
      console.error('Blacklist creation error:', error);
      return jsonResponse({ error: 'Failed to create blacklist entry' }, 500);
    }
  }

  if (req.method === 'DELETE') {
    const discordId = url.searchParams.get('discord_id');
    if (!discordId) {
      return jsonResponse({ error: 'discord_id parameter required' }, 400);
    }

    try {
      const result = await removeFromBlacklist(kv, discordId);
      
      // Log the admin action
      const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
      await kv.set(["admin_actions", Date.now()], {
        action: 'BLACKLIST_REMOVE',
        admin: adminUser,
        target: discordId,
        timestamp: Date.now()
      });

      return jsonResponse(result);
    } catch (error) {
      console.error('Blacklist removal error:', error);
      return jsonResponse({ error: 'Failed to remove blacklist entry' }, 500);
    }
  }

  if (req.method === 'GET') {
    try {
      if (url.searchParams.get('discord_id')) {
        const discordId = url.searchParams.get('discord_id')!;
        const entry = await getBlacklistEntry(kv, discordId);
        
        if (entry) {
          // Get additional info about the user
          const userKeys = [];
          for await (const keyEntry of kv.list({ prefix: ["keys"] })) {
            const keyData = keyEntry.value;
            if (keyData.activated && keyData.activation_data?.discord_id === discordId) {
              userKeys.push({
                key: keyData.key,
                activated_at: keyData.activation_data.activated_at,
                ip: keyData.activation_data.ip
              });
            }
          }
          
          // Get linked sessions
          const linkedSessions = await findUserSessions(kv, discordId);
          
          return jsonResponse({ 
            entry,
            user_info: {
              total_activations: userKeys.length,
              activated_keys: userKeys,
              linked_sessions: linkedSessions.length,
              sessions: linkedSessions.map(s => ({
                ip: s.ip,
                last_active: s.last_active,
                keys_generated: s.keys_generated.length
              }))
            }
          });
        } else {
          return jsonResponse({ entry: null });
        }
      } else {
        // Get all blacklist entries with pagination
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const skip = (page - 1) * limit;
        
        const entries = await getBlacklistEntries(kv);
        const total = entries.length;
        const paginatedEntries = entries.slice(skip, skip + limit);
        
        // Get statistics
        const stats = {
          total: total,
          permanent: entries.filter(e => e.severity === 'PERMANENT').length,
          high: entries.filter(e => e.severity === 'HIGH').length,
          medium: entries.filter(e => e.severity === 'MEDIUM').length,
          low: entries.filter(e => e.severity === 'LOW').length,
          expired: entries.filter(e => e.expires_at && e.expires_at < Date.now()).length
        };

        return jsonResponse({ 
          entries: paginatedEntries,
          pagination: {
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
          },
          statistics: stats
        });
      }
    } catch (error) {
      console.error('Blacklist query error:', error);
      return jsonResponse({ error: 'Failed to query blacklist' }, 500);
    }
  }

  if (req.method === 'PUT') {
    // Update blacklist entry
    let body;
    try {
      body = await req.json();
    } catch (error) {
      return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
    }

    const { discord_id, reason, severity, duration_ms, notes } = body;
    
    if (!discord_id) {
      return jsonResponse({ error: 'discord_id required' }, 400);
    }

    try {
      const existingEntry = await getBlacklistEntry(kv, discord_id);
      if (!existingEntry) {
        return jsonResponse({ error: 'Blacklist entry not found' }, 404);
      }

      // Update the entry
      if (reason) existingEntry.reason = reason;
      if (severity) existingEntry.severity = severity;
      if (notes !== undefined) existingEntry.notes = notes;
      
      // Update expiration if duration is provided
      if (duration_ms) {
        existingEntry.expires_at = Date.now() + duration_ms;
      }

      // Save updated entry to all identifiers
      for (const identifier of existingEntry.identifiers) {
        await kv.set(["blacklist", "identifiers", identifier], existingEntry);
      }
      
      // Update main entry
      await kv.set(["blacklist", "entries", discord_id], existingEntry);

      // Log the update
      const adminUser = req.headers.get('X-Admin-User') || 'Unknown';
      await kv.set(["admin_actions", Date.now()], {
        action: 'BLACKLIST_UPDATE',
        admin: adminUser,
        target: discord_id,
        updates: { reason, severity, duration_ms, notes },
        timestamp: Date.now()
      });

      return jsonResponse({ 
        success: true, 
        message: 'Blacklist entry updated successfully',
        entry: existingEntry 
      });
    } catch (error) {
      console.error('Blacklist update error:', error);
      return jsonResponse({ error: 'Failed to update blacklist entry' }, 500);
    }
  }

  return jsonResponse({ error: 'Method not allowed' }, 405);
}

async function handleAdminUserInfo(kv: Deno.Kv, req: Request) {
  const apiKey = req.headers.get('X-Admin-Api-Key');
  if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

  const url = new URL(req.url);
  const discordId = url.searchParams.get('discord_id');
  if (!discordId) return jsonResponse({ error: 'discord_id parameter required' }, 400);

  const userKeys = [];
  for await (const entry of kv.list({ prefix: ["keys"] })) {
    const keyData = entry.value;
    if (keyData.activated && keyData.activation_data?.discord_id === discordId) {
      userKeys.push(keyData);
    }
  }

  return jsonResponse({ success: true, user_id: discordId, activated_keys: userKeys,
    total_activations: userKeys.length, found: userKeys.length > 0 });
}

// ==================== HTML CONTENT ====================

const keySiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith - Key System</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; 
            max-width: 600px; margin: 0 auto; padding: 20px;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8; line-height: 1.6; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
        }
        .container { 
            background: rgba(25, 25, 25, 0.95); padding: 40px 35px;
            border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px); width: 100%;
        }
        .logo { text-align: center; margin-bottom: 30px; }
        .logo h1 { color: #7289da; font-size: 2.2rem; font-weight: 700; margin-bottom: 8px; }
        .logo p { color: #888; font-size: 1.1rem; }
        .section { margin: 30px 0; }
        button { 
            padding: 16px 24px; margin: 20px 0 10px; border: none; border-radius: 12px;
            width: 100%; background: linear-gradient(135deg, #7289da 0%, #5b73c4 100%);
            color: white; cursor: pointer; font-weight: 600; font-size: 16px;
            transition: all 0.2s ease; position: relative; overflow: hidden;
        }
        button:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(114, 137, 218, 0.3); }
        button:active { transform: translateY(0); }
        button:disabled { background: #444; cursor: not-allowed; transform: none; box-shadow: none; }
        .key-display { 
            background: rgba(15, 15, 15, 0.8); padding: 20px; border-radius: 12px;
            margin: 20px 0; font-family: 'JetBrains Mono', 'Fira Code', monospace;
            word-break: break-all; border: 1px solid rgba(255, 255, 255, 0.1);
            font-size: 15px; text-align: center; font-weight: 600; letter-spacing: 1px;
            color: #7289da;
        }
        .success { color: #43b581; padding: 16px; background: rgba(67, 181, 129, 0.1);
            border-radius: 10px; margin: 20px 0; border-left: 4px solid #43b581; font-weight: 500; }
        .error { color: #f04747; padding: 16px; background: rgba(240, 71, 71, 0.1);
            border-radius: 10px; margin: 20px 0; border-left: 4px solid #f04747; font-weight: 500; }
        .warning { color: #faa61a; padding: 16px; background: rgba(250, 166, 26, 0.1);
            border-radius: 10px; margin: 20px 0; border-left: 4px solid #faa61a; font-weight: 500; }
        .info { color: #7289da; padding: 16px; background: rgba(114, 137, 218, 0.1);
            border-radius: 10px; margin: 20px 0; border-left: 4px solid #7289da; font-weight: 500; }
        .hidden { display: none; }
        .info-text { color: #aaa; font-size: 14px; line-height: 1.5; margin: 12px 0; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%); margin: 25px 0; }
        .step { display: flex; align-items: center; margin: 15px 0; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; }
        .step-number { background: #7289da; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; margin-right: 12px; flex-shrink: 0; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .loading { animation: pulse 1.5s ease-in-out infinite; }
        .progress-bar { width: 100%; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; margin: 15px 0; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #43b581 0%, #7289da 100%); border-radius: 4px; transition: width 0.3s ease; }
        .checkpoint-item { background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px; margin: 10px 0; border-left: 4px solid #7289da; }
        .checkpoint-completed { border-left-color: #43b581; }
        .checkpoint-current { border-left-color: #faa61a; }
        .checkpoint-status { font-size: 12px; font-weight: 600; margin-top: 5px; }
        .status-pending { color: #faa61a; }
        .status-completed { color: #43b581; }
        .workink-link { 
            display: inline-block; 
            padding: 12px 20px; 
            background: linear-gradient(135deg, #43b581 0%, #369a6d 100%);
            color: white; 
            text-decoration: none; 
            border-radius: 8px; 
            font-weight: 600;
            margin: 10px 0;
            transition: all 0.2s ease;
        }
        .workink-link:hover { 
            transform: translateY(-2px); 
            box-shadow: 0 6px 20px rgba(67, 181, 129, 0.3);
        }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <div class="logo">
            <h1>Lunith</h1>
            <p>Key Management System</p>
        </div>
        
        <div id="privacySection">
            <div class="step">
                <div class="step-number">1</div>
                <div>
                    <strong>Privacy Policy & Age Verification</strong>
                    <div class="info-text">You must agree to continue</div>
                </div>
            </div>
            
            <div class="info-text">
                <p>By using this service, you agree that we may collect and store the following information for security purposes:</p>
                <ul>
                    <li>Your IP Address</li>
                    <li>Hardware identifiers</li>
                    <li>Discord User ID</li>
                    <li>Session information</li>
                </ul>
                <p>You must be 16 years or older to use this service.</p>
            </div>
            
            <div class="checkbox-group">
                <div class="checkbox-item">
                    <input type="checkbox" id="privacyAgree">
                    <label for="privacyAgree" class="checkbox-label">
                        I agree to the privacy policy and data collection
                    </label>
                </div>
                <div class="checkbox-item">
                    <input type="checkbox" id="ageVerify">
                    <label for="ageVerify" class="checkbox-label">
                        I confirm that I am 16 years of age or older
                    </label>
                </div>
            </div>
            
            <button onclick="verifyPrivacy()" id="privacyBtn" disabled>
                Continue to Verification
            </button>
        </div>
        
        <div id="workinkSection" class="hidden">
            <div class="step">
                <div class="step-number">2</div>
                <div>
                    <strong>Complete Verification Steps</strong>
                    <div class="info-text">Complete 2 verification steps to generate your key</div>
                </div>
            </div>
            
            <div class="progress-bar">
                <div class="progress-fill" id="progressFill" style="width: 0%"></div>
            </div>
            
            <div id="checkpointsContainer">
                <!-- Checkpoints will be dynamically added here -->
            </div>
            
            <div id="currentCheckpoint" class="hidden">
                <div class="checkpoint-item checkpoint-current">
                    <strong>Current Verification Step</strong>
                    <div class="info-text" id="currentStepDesc">Loading...</div>
                    <a href="#" id="workinkLink" class="workink-link" target="_blank">
                        Start Verification
                    </a>
                    <div class="info-text">
                        After completing the verification, you will be redirected back with a token. 
                        The system will automatically detect your completion.
                    </div>
                </div>
                
                <div class="info">
                    <strong>How it works:</strong>
                    <ol style="margin-left: 20px; margin-top: 10px;">
                        <li>Click the verification link above</li>
                        <li>Complete the verification on the Workink page</li>
                        <li>You'll be redirected back with a token</li>
                        <li>The system will automatically proceed to the next step</li>
                    </ol>
                </div>
                
                <button onclick="checkProgress()" id="checkProgressBtn">
                    Check Verification Status
                </button>
            </div>
            
            <div id="allCheckpointsCompleted" class="hidden">
                <div class="success">
                    <strong>All Verifications Completed!</strong>
                    <div>Generating your activation key...</div>
                </div>
            </div>
        </div>
        
        <div id="keySection" class="hidden">
            <div class="success">
                <strong>Key Generated Successfully!</strong>
                <div>Your activation key is ready</div>
            </div>
            
            <div class="step">
                <div class="step-number">3</div>
                <div>
                    <strong>Your Activation Key</strong>
                    <div class="info-text">Copy this key and activate it within 24 hours</div>
                </div>
            </div>
            
            <div class="key-display" id="generatedKey">Generating your key...</div>
            
            <button onclick="copyKey()" id="copyBtn">
                Copy Key to Clipboard
            </button>
            
            <div class="step">
                <div class="step-number">4</div>
                <div>
                    <strong>Activate in Discord</strong>
                    <div class="info-text">Use the !activate command in our Discord server with this key</div>
                </div>
            </div>
            
            <div class="warning">
                <strong>Key Expires:</strong> This key will expire <span id="expiryTime">in 24 hours</span> if not activated.
            </div>
        </div>
        
        <div id="errorSection" class="hidden">
            <div class="error">
                <strong id="errorTitle">Error</strong>
                <div id="errorMessage"></div>
            </div>
            <button onclick="resetProcess()">Start Over</button>
        </div>
    </div>

    <script>
        const TOTAL_CHECKPOINTS = 2;
        let currentProgress = 0;
        let progressCheckInterval = null;

        function setupPrivacyCheckboxes() {
            const privacyCheckbox = document.getElementById('privacyAgree');
            const ageCheckbox = document.getElementById('ageVerify');
            const privacyBtn = document.getElementById('privacyBtn');
            
            function validateCheckboxes() {
                privacyBtn.disabled = !(privacyCheckbox.checked && ageCheckbox.checked);
            }
            
            privacyCheckbox.addEventListener('change', validateCheckboxes);
            ageCheckbox.addEventListener('change', validateCheckboxes);
        }

        async function verifyPrivacy() {
            const btn = document.getElementById('privacyBtn');
            btn.disabled = true;
            btn.textContent = 'Starting...';
            
            try {
                const response = await fetch('/workink', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        privacy_agreed: true, 
                        age_verified: true 
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    document.getElementById('privacySection').classList.add('hidden');
                    document.getElementById('workinkSection').classList.remove('hidden');
                    
                    if (result.checkpoint_required) {
                        initializeWorkinkFlow(result);
                    } else if (result.key) {
                        // Direct key generation (fallback)
                        showKey(result);
                    }
                } else {
                    showError('Verification failed', result.error);
                }
            } catch (error) {
                showError('Network error', error.message);
            }
        }

        function initializeWorkinkFlow(data) {
            updateProgress(data.current_checkpoint);
            renderCheckpoints(data.current_checkpoint);
            
            if (data.workink_link) {
                showCurrentCheckpoint(data.workink_link, data.current_checkpoint + 1);
            }
            
            // Start checking progress periodically
            progressCheckInterval = setInterval(checkProgress, 3000);
        }

        function updateProgress(completed) {
            currentProgress = completed;
            const percentage = (completed / TOTAL_CHECKPOINTS) * 100;
            document.getElementById('progressFill').style.width = `${percentage}%`; // This should be inside the function
          }

        function renderCheckpoints(completed) {
            const container = document.getElementById('checkpointsContainer');
            container.innerHTML = '';
            
            for (let i = 0; i < TOTAL_CHECKPOINTS; i++) {
                const checkpoint = document.createElement('div');
                checkpoint.className = `checkpoint-item ${i < completed ? 'checkpoint-completed' : ''}`;
                
                checkpoint.innerHTML = `
                    <strong>Verification Step ${i + 1}</strong>
                    <div class="checkpoint-status ${i < completed ? 'status-completed' : 'status-pending'}">
                        ${i < completed ? '✓ Completed' : '⏳ Pending'}
                    </div>
                `;
                
                container.appendChild(checkpoint);
            }
        }

        function showCurrentCheckpoint(link, stepNumber) {
            document.getElementById('currentStepDesc').textContent = `Step ${stepNumber} of ${TOTAL_CHECKPOINTS}`;
            document.getElementById('workinkLink').href = link;
            document.getElementById('currentCheckpoint').classList.remove('hidden');
        }

        async function checkProgress() {
            try {
                const response = await fetch('/workink-progress');
                const result = await response.json();
                
                if (result.success) {
                    updateProgress(result.progress.completed);
                    renderCheckpoints(result.progress.completed);
                    
                    if (result.all_completed) {
                        // All checkpoints completed, generate key
                        completeKeyGeneration();
                    } else if (result.next_checkpoint_link) {
                        showCurrentCheckpoint(result.next_checkpoint_link, result.progress.completed + 1);
                    }
                }
            } catch (error) {
                console.error('Progress check failed:', error);
            }
        }

        async function completeKeyGeneration() {
            clearInterval(progressCheckInterval);
            
            document.getElementById('currentCheckpoint').classList.add('hidden');
            document.getElementById('allCheckpointsCompleted').classList.remove('hidden');
            
            // Finalize key generation
            try {
                const response = await fetch('/workink', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        privacy_agreed: true, 
                        age_verified: true,
                        workink_token: 'finalize' // Special token to trigger key generation
                    })
                });
                
                const result = await response.json();
                
                if (result.success && result.key) {
                    showKey(result);
                } else {
                    showError('Key generation failed', result.error);
                }
            } catch (error) {
                showError('Network error', error.message);
            }
        }

        function showKey(result) {
            document.getElementById('workinkSection').classList.add('hidden');
            document.getElementById('keySection').classList.remove('hidden');
            document.getElementById('generatedKey').textContent = result.key;
            updateExpiryTime();
            
            // Auto-copy to clipboard
            copyKey();
        }

        function updateExpiryTime() {
            const expiryTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
            document.getElementById('expiryTime').textContent = expiryTime.toLocaleString();
        }

        function copyKey() {
            const key = document.getElementById('generatedKey').textContent;
            const btn = document.getElementById('copyBtn');
            
            navigator.clipboard.writeText(key).then(() => {
                btn.textContent = '✓ Copied Successfully';
                btn.style.background = 'linear-gradient(135deg, #43b581 0%, #369a6d 100%)';
                
                setTimeout(() => {
                    btn.textContent = 'Copy Key to Clipboard';
                    btn.style.background = 'linear-gradient(135deg, #7289da 0%, #5b73c4 100%)';
                }, 2000);
            });
        }

        function showError(title, message) {
            document.getElementById('errorTitle').textContent = title;
            document.getElementById('errorMessage').textContent = message;
            document.getElementById('errorSection').classList.remove('hidden');
            document.getElementById('privacySection').classList.add('hidden');
            document.getElementById('workinkSection').classList.add('hidden');
            document.getElementById('keySection').classList.add('hidden');
            
            if (progressCheckInterval) {
                clearInterval(progressCheckInterval);
            }
        }

        function resetProcess() {
            document.getElementById('errorSection').classList.add('hidden');
            document.getElementById('privacySection').classList.remove('hidden');
            document.getElementById('privacyBtn').disabled = false;
            document.getElementById('privacyBtn').textContent = 'Continue to Verification';
            
            if (progressCheckInterval) {
                clearInterval(progressCheckInterval);
            }
        }

        // Extract workink token from URL if present (for redirect back from workink)
        function checkForWorkinkToken() {
            const urlParams = new URLSearchParams(window.location.search);
            const token = urlParams.get('token');
            
            if (token) {
                // Automatically submit the token to complete the checkpoint
                completeWorkinkCheckpoint(token);
                
                // Clean up URL
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        }

        async function completeWorkinkCheckpoint(token) {
            try {
                const response = await fetch('/workink', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        privacy_agreed: true, 
                        age_verified: true,
                        workink_token: token
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    if (result.checkpoint_completed) {
                        // Check progress will be handled by the interval
                        console.log(`Checkpoint completed: ${result.current_checkpoint}/${result.total_checkpoints}`);
                    } else if (result.key) {
                        showKey(result);
                    }
                } else {
                    showError('Verification failed', result.error);
                }
            } catch (error) {
                showError('Network error', error.message);
            }
        }

        document.addEventListener('DOMContentLoaded', function() {
            setupPrivacyCheckboxes();
            checkForWorkinkToken();
        });
    </script>
</body>
</html>`;

const apiSiteHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Lunith API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: 'Inter', 'Segoe UI', system-ui, sans-serif;
            max-width: 800px; margin: 0 auto; padding: 40px 20px;
            background: linear-gradient(135deg, #0c0c0c 0%, #1a1a1a 100%);
            color: #e8e8e8; min-height: 100vh;
            display: flex; align-items: center; justify-content: center;
        }
        .container { 
            background: rgba(25, 25, 25, 0.95); padding: 50px 40px;
            border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.1);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(10px); text-align: center; width: 100%;
        }
        h1 { color: #7289da; font-size: 3rem; font-weight: 700; margin-bottom: 16px; }
        .status { 
            color: #43b581; font-weight: 600; font-size: 1.2rem;
            margin: 25px 0; padding: 12px 24px;
            background: rgba(67, 181, 129, 0.1); border-radius: 10px;
            display: inline-block;
        }
        .description { color: #aaa; font-size: 1.1rem; line-height: 1.6; margin: 25px 0; max-width: 500px; margin-left: auto; margin-right: auto; }
        a { color: #7289da; text-decoration: none; font-weight: 600; transition: color 0.2s ease; border-bottom: 2px solid transparent; padding-bottom: 2px; }
        a:hover { color: #8ba1e8; border-bottom-color: #7289da; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%); margin: 30px auto; width: 200px; }
    </style>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
    <div class="container">
        <h1>Lunith</h1>
        <div class="status">API Status: Online</div>
        <div class="description">
            Secure script delivery and key management system serving Lunith services.
        </div>
        <div class="divider"></div>
        <p><a href="https://key.napsy.dev">Get your activation key</a></p>
    </div>
</body>
</html>`;

// ==================== MAIN HANDLER ====================

let isWarm = false;

export async function handler(req: Request): Promise<Response> {
  metrics.totalRequests++;
  const url = new URL(req.url);
  const hostname = url.hostname;
  const clientIP = getClientIP(req);
  const userAgent = req.headers.get('user-agent') || 'unknown';
  
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!isWarm) {
    console.log("Cold start detected, warming up...");
    isWarm = true;
  }

  const kv = await Deno.openKv();

  try {
    await cleanupExpired(kv);

    if (metrics.totalRequests % 1000 === 0) await backupKeys(kv);

    const rateLimitResult = checkRateLimit(clientIP, url.pathname);
    if (!rateLimitResult.allowed) {
      await logError(kv, "Rate limit exceeded", req, url.pathname);
      return jsonResponse({ error: "Rate limit exceeded. Please try again later.", remaining: rateLimitResult.remaining }, 429);
    }

    // KEY.NAPSY.DEV - Key System
    if (hostname === 'key.napsy.dev') {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(keySiteHtml, { headers: { 'Content-Type': 'text/html; charset=utf-8', ...corsHeaders } });
      }
      if (url.pathname === '/workink' && req.method === 'POST') return await handleWorkInk(kv, clientIP, userAgent, req);
      if (url.pathname === '/renew' && req.method === 'POST') return await handleRenew(kv, clientIP, userAgent, req);
      if (url.pathname === '/user-panel' && req.method === 'GET') return await handleUserPanel(kv, clientIP, userAgent);
      if (url.pathname === '/health' && req.method === 'GET') return jsonResponse({ status: 'online', service: 'key-system', domain: 'key.napsy.dev', metrics, rate_limit: rateLimitResult });
      if (url.pathname === '/metrics' && req.method === 'GET') {
        monitorPerformance();
        return jsonResponse({ metrics, rate_limits: Array.from(rateLimit.entries()).slice(0, 10), timestamp: new Date().toISOString() });
      }
      return new Response("Not found", { status: 404 });
    }

    // API.NAPSY.DEV - Script API
    if (hostname === 'api.napsy.dev') {
      if (url.pathname === '/' && req.method === 'GET') {
        return new Response(apiSiteHtml, { headers: { "Content-Type": "text/html; charset=utf-8", ...corsHeaders } });
      }
      if (url.pathname === '/health' && req.method === 'GET') return jsonResponse({ status: 'online', service: 'script-api', domain: 'api.napsy.dev', timestamp: new Date().toISOString(), metrics });
      
      if (url.pathname.startsWith('/scripts/') && req.method === 'GET') {
        const token = url.pathname.split('/')[2];
        if (!token) return new Response("Token required", { status: 400 });
        
        const data = await kv.get(["token", token]);
        if (!data.value) return new Response("Token not found", { status: 404 });
        
        if (data.value.expires_at < Date.now()) {
          await kv.delete(["token", token]);
          return new Response("Token expired", { status: 410 });
        }
        
        // Inject the actual token into the script content
        const scriptContent = SCRIPT_CONTENT_BASE.replace('"{{TOKEN}}"', `"${token}"`);
        
        return new Response(scriptContent, { 
          headers: { 
            "Content-Type": "text/plain; charset=utf-8", 
            ...corsHeaders 
          } 
        });
      }

      // Add this to your main handler in the key.napsy.dev section:
      if (url.pathname === '/workink-progress' && req.method === 'GET') {
        return await handleWorkinkProgress(kv, clientIP, userAgent);
      }

      // Generate multiple keys endpoint
      if (url.pathname === '/generate-keys' && req.method === 'POST') {
        const apiKey = req.headers.get('X-Admin-Api-Key');
        if (apiKey !== ADMIN_API_KEY) return jsonResponse({ error: 'Unauthorized' }, 401);

        let body;
        try {
          body = await req.json();
        } catch (error) {
          return jsonResponse({ error: 'Invalid JSON in request body' }, 400);
        }

        const { amount, expire_time } = body;
        if (!amount || amount < 1 || amount > 50) {
          return jsonResponse({ error: 'Amount must be between 1 and 50' }, 400);
        }

        try {
          // Parse custom expiration time or use default
          let customExpiryMs = KEY_EXPIRY_MS; // Default 24 hours
          if (expire_time) {
            const parsedDuration = parseDuration(expire_time);
            if (parsedDuration) {
              customExpiryMs = parsedDuration;
            }
            // If parsing fails, fall back to default without error
          }

          const keys = [];
          
          for (let i = 0; i < amount; i++) {
            const key = generateFormattedKey();
            const expiresAt = Date.now() + customExpiryMs;
            
            const keyData = {
              key,
              created_at: Date.now(),
              expires_at: expiresAt,
              activated: false,
              workink_completed: true,
              admin_generated: true,
              custom_expiration: expire_time || null
            };
            
            await kv.set(["keys", key], keyData);
            keys.push(key);
          }

          return jsonResponse({
            success: true,
            keys: keys,
            message: `Generated ${amount} keys successfully`,
            expires_at: new Date(Date.now() + customExpiryMs).toISOString(),
            custom_expiration: expire_time || null,
            duration_ms: customExpiryMs
          });
        } catch (error) {
          console.error('Generate keys error:', error);
          return jsonResponse({ error: 'Failed to generate keys' }, 500);
        }
      }

      // Enhanced validation endpoint
      if (url.pathname === '/validate-token' && req.method === 'POST') {
        try {
          let body;
          try {
            body = await req.json();
          } catch (error) {
            return jsonResponse({ error: "Invalid JSON in request body" }, 400);
          }

          return await handleTokenValidation(kv, req, body);
        } catch (error) {
          console.error("Token validation error:", error);
          await logError(kv, `Token validation error: ${error.message}`, req, '/validate-token');
          return jsonResponse({ error: "Internal server error during validation" }, 500);
        }
      }

      if (url.pathname === '/whitelist' && req.method === 'GET') {
        return await handleWhitelist(kv, req);
      }

      if (url.pathname === '/check-blacklist' && req.method === 'GET') {
        return await handleCheckBlacklist(kv, req);
      }

      if (url.pathname === '/bulk-whitelist' && req.method === 'POST') {
        return await handleBulkWhitelist(kv, req);
      }

      if (url.pathname === '/blacklist-stats' && req.method === 'GET') {
        return await handleBlacklistStats(kv, req);
      }

      if (url.pathname === '/revoke-key' && req.method === 'DELETE') {
        return await handleRevokeKey(kv, req);
      }

      if (url.pathname === '/bulk-key-ops' && req.method === 'POST') {
        return await handleBulkKeyOps(kv, req);
      }

      // Session management endpoints
      if (url.pathname === '/user-sessions' && req.method === 'GET') {
        return await handleUserSessions(kv, req);
      }

      if (url.pathname === '/clear-sessions' && req.method === 'DELETE') {
        return await handleClearSessions(kv, req);
      }

      // System maintenance endpoints
      if (url.pathname === '/force-cleanup' && req.method === 'POST') {
        return await handleForceCleanup(kv, req);
      }

      if (url.pathname === '/create-backup' && req.method === 'POST') {
        return await handleCreateBackup(kv, req);
      }

      if (url.pathname === '/system-status' && req.method === 'GET') {
        return await handleSystemStatus(kv, req);
      }

      // Rate limit management
      if (url.pathname === '/rate-limit-status' && req.method === 'GET') {
        return await handleRateLimitStatus(kv, req);
      }

      if (url.pathname === '/clear-rate-limit' && req.method === 'DELETE') {
        return await handleClearRateLimit(kv, req);
      }

      // Enhanced activation endpoint
      if (url.pathname === '/activate' && req.method === 'POST') {
        let body;
        try { 
          body = await req.json(); 
        } catch (error) {
          await logError(kv, "Invalid JSON in activation request", req, '/activate');
          return jsonResponse({ error: "Invalid JSON" }, 400);
        }

        const { key, discord_id, discord_username } = body;
        if (!key || !discord_id) return jsonResponse({ error: 'Key and discord_id required' }, 400);
        if (!isValidKeyFormat(key)) {
          await logError(kv, "Invalid key format", req, '/activate');
          return jsonResponse({ error: 'Invalid key format' }, 400);
        }
        if (!isValidDiscordId(discord_id)) {
          await logError(kv, "Invalid Discord ID", req, '/activate');
          return jsonResponse({ error: 'Invalid Discord ID' }, 400);
        }

        const sanitizedUsername = sanitizeInput(discord_username || 'Unknown');
        
        // Enhanced blacklist check
        const blacklistCheck = await isBlacklisted(kv, discord_id, 'unknown', 'unknown');
        if (blacklistCheck.blacklisted) {
          await logError(kv, `Blacklisted user attempted activation: ${discord_id}`, req, '/activate');
          return jsonResponse({ 
            error: "Activation denied. Your account is blacklisted.", 
            reason: blacklistCheck.entry?.reason, 
            expires: blacklistCheck.entry?.expires_at 
          }, 403);
        }

        const entry = await kv.get(['keys', key]);
        if (!entry.value) {
          await logError(kv, "Key not found", req, '/activate');
          return jsonResponse({ error: 'Invalid key' }, 404);
        }

        const keyData = entry.value;
        
        // Check if key is expired (unactivated)
        if (!keyData.activated && keyData.expires_at < Date.now()) {
          await kv.delete(['keys', key]);
          await logError(kv, "Expired key activation attempt", req, '/activate');
          return jsonResponse({ error: 'Key has expired' }, 410);
        }
        
        if (!keyData.workink_completed) {
          await logError(kv, "Unverified key activation attempt", req, '/activate');
          return jsonResponse({ error: 'Key not verified' }, 401);
        }

        // Handle renewal of activated key
        if (keyData.activated) {
          if (keyData.expires_at < Date.now()) {
            const tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
            
            // Renew existing token
            if (keyData.script_token) {
              const tokenEntry = await kv.get(["token", keyData.script_token]);
              if (tokenEntry.value) {
                const tokenData = tokenEntry.value;
                tokenData.expires_at = tokenExpiresAt;
                tokenData.renewed_at = Date.now();
                tokenData.renewal_count = (tokenData.renewal_count || 0) + 1;
                await kv.set(["token", keyData.script_token], tokenData);
              }
            }
            
            keyData.expires_at = Date.now() + KEY_EXPIRY_MS;
            keyData.renewed_at = Date.now();
            keyData.renewal_count = (keyData.renewal_count || 0) + 1;
            
            // Update activation data
            if (keyData.activation_data) {
              keyData.activation_data.last_renewal = Date.now();
              keyData.activation_data.renewal_count = keyData.renewal_count;
            }
            
            await kv.set(['keys', key], keyData);
            
            // Log renewal
            await kv.set(["activations", "renewals", Date.now()], {
              key: key,
              discord_id: discord_id,
              renewed_at: Date.now(),
              renewal_count: keyData.renewal_count
            });
            
            return jsonResponse({
              success: true, 
              key: key, 
              script_token: keyData.script_token,
              script_url: `https://api.napsy.dev/scripts/${keyData.script_token}`,
              token_expires_at: new Date(tokenExpiresAt).toISOString(),
              activation_data: keyData.activation_data, 
              is_renewal: true,
              renewal_count: keyData.renewal_count,
              message: 'Key renewed and token reactivated successfully'
            });
          } else {
            return jsonResponse({ 
              error: 'Key already activated', 
              activation_data: keyData.activation_data,
              expires_at: keyData.expires_at 
            }, 409);
          }
        }

        // New activation
        const scriptToken = generateToken();
        const tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
        const now = Date.now();
        
        // Create token entry
        await kv.set(['token', scriptToken], {
          user_id: discord_id, 
          username: sanitizedUsername, 
          expires_at: tokenExpiresAt,
          created_at: now, 
          key: key,
          activation_ip: keyData.workink_data?.ip || 'unknown'
        });

        // Enhanced activation data with all identifiers
        keyData.activated = true;
        keyData.script_token = scriptToken;
        keyData.activation_data = {
          discord_id: discord_id,
          discord_username: sanitizedUsername,
          activated_at: now,
          ip: keyData.workink_data?.ip || 'unknown',
          user_agent: keyData.workink_data?.user_agent || 'unknown',
          // These will be populated when loader validates
          executor: 'pending',
          hwid: 'pending',
          player_name: 'pending',
          player_userid: 'pending',
          first_validation: null,
          validation_count: 0
        };
        
        await kv.set(['keys', key], keyData);
        
        // Update user session
        if (keyData.workink_data?.ip && keyData.workink_data?.user_agent) {
          await updateUserSession(
            kv, 
            keyData.workink_data.ip, 
            keyData.workink_data.user_agent, 
            undefined, 
            discord_id
          );
        }
        
        metrics.successfulActivations++;
        
        // Log activation
        await kv.set(["activations", "logs", now], {
          key: key,
          discord_id: discord_id,
          discord_username: sanitizedUsername,
          token: scriptToken,
          activated_at: now,
          ip: keyData.workink_data?.ip || 'unknown'
        });

        return jsonResponse({
          success: true, 
          key: key, 
          script_token: scriptToken,
          script_url: `https://api.napsy.dev/scripts/${scriptToken}`,
          token_expires_at: new Date(tokenExpiresAt).toISOString(),
          activation_data: keyData.activation_data, 
          message: 'Key activated successfully. Use the script URL in your executor.'
        });
      }

      // Enhanced check-key endpoint to show all linked data
      if (url.pathname === '/check-key' && req.method === 'GET') {
        const apiKey = req.headers.get('X-Admin-Api-Key');
        if (apiKey !== ADMIN_API_KEY) {
          await logError(kv, "Unauthorized key check attempt", req, '/check-key');
          return jsonResponse({ error: 'Unauthorized' }, 401);
        }
        
        const key = url.searchParams.get('key');
        if (!key) return jsonResponse({ error: 'Key parameter required' }, 400);
        if (!isValidKeyFormat(key)) return jsonResponse({ error: 'Invalid key format' }, 400);
        
        const entry = await kv.get(['keys', key]);
        if (!entry.value) return jsonResponse({ error: 'Key not found' }, 404);
        
        const keyData = entry.value;
        
        // Check if key is expired but not activated
        if (!keyData.activated && keyData.expires_at < Date.now()) {
          await kv.delete(['keys', key]);
          return jsonResponse({ error: 'Key has expired' }, 410);
        }
        
        // Enhanced response with all linked data
        const response = {
          // Basic key info
          key: keyData.key,
          created_at: keyData.created_at,
          expires_at: keyData.expires_at,
          activated: keyData.activated,
          workink_completed: keyData.workink_completed,
          admin_generated: keyData.admin_generated || false,
          
          // Token info
          script_token: keyData.script_token,
          
          // Workink data (verification)
          workink_data: keyData.workink_data ? {
            ip: keyData.workink_data.ip,
            user_agent: keyData.workink_data.user_agent,
            completed_at: keyData.workink_data.completed_at,
            privacy_agreed: keyData.workink_data.privacy_agreed,
            age_verified: keyData.workink_data.age_verified
          } : null,
          
          // Activation data (what you're looking for)
          activation_data: keyData.activation_data ? {
            discord_id: keyData.activation_data.discord_id,
            discord_username: keyData.activation_data.discord_username,
            activated_at: keyData.activation_data.activated_at,
            
            // Linked identifiers from loader
            executor: keyData.activation_data.executor,
            hwid: keyData.activation_data.hwid,
            player_name: keyData.activation_data.player_name,
            player_userid: keyData.activation_data.player_userid,
            
            // Validation tracking
            first_validation: keyData.activation_data.first_validation,
            last_validation: keyData.activation_data.last_validation,
            validation_count: keyData.activation_data.validation_count || 0,
            validations: keyData.activation_data.validations || [],
            
            // Additional info
            ip: keyData.activation_data.ip,
            user_agent: keyData.activation_data.user_agent
          } : null,
          
          // Renewal info
          renewed_at: keyData.renewed_at,
          renewal_count: keyData.renewal_count || 0,
          
          // Status info
          is_expired: keyData.expires_at < Date.now(),
          is_active: keyData.activated && keyData.expires_at > Date.now(),
          days_until_expiry: Math.ceil((keyData.expires_at - Date.now()) / (24 * 60 * 60 * 1000))
        };
        
        return jsonResponse(response);
      }

      // Admin endpoints
      if (url.pathname === '/admin/blacklist' && req.method === 'GET') {
        return await handleAdminBlacklist(kv, req);
      }
      
      if (url.pathname === '/admin/user-info' && req.method === 'GET') {
        return await handleAdminUserInfo(kv, req);
      }

      return new Response("Not found", { status: 404 });
    }

    // Default response for unknown domains
    return new Response("Domain not configured", { status: 404 });
  } catch (error) {
    console.error("Handler error:", error);
    await logError(kv, `Handler error: ${error.message}`, req, url.pathname);
    return jsonResponse({ error: "Internal server error" }, 500);
  } finally {
    kv.close();
  }
}

// For local development
if (import.meta.main) {
  console.log("Lunith Key System starting locally on port 8000...");
  Deno.serve({ port: 8000 }, handler);
}
