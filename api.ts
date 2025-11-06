// api.ts - Production Ready Lunith Key System with WorkInk Integration
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const KEY_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours for unactivated keys
const ADMIN_API_KEY = "mR8q7zKp4VxT1bS9nYf3Lh6Gd0Uw2Qe5Zj7Rc4Pv8Nk1Ba6Mf0Xs3Qp9Lr2Tz";

// WorkInk API Configuration
const WORKINK_API_BASE = "https://work.ink";
const WORKINK_TOKEN_ENDPOINT = "https://work.ink/token";
const WORKINK_VALIDATION_ENDPOINT = "https://work.ink/_api/v2/token/isValid";

// Rate limiting configuration
const RATE_LIMIT = {
  MAX_REQUESTS: 10,
  WINDOW_MS: 60000, // 1 minute
  MAX_WORKINK_REQUESTS: 3, // Stricter limit for key generation
  WORKINK_WINDOW_MS: 300000 // 5 minutes
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Admin-Api-Key",
};

// Rate limiting storage
const rateLimit = new Map<string, { count: number; resetTime: number; workinkCount: number; workinkReset: number }>();

// System metrics
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
  workinkValidations: 0,
  workinkFailures: 0
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
  workink_tokens?: string[];
  checkpoints_completed?: string[];
}

interface WorkInkToken {
  token: string;
  created_at: number;
  validated: boolean;
  validation_data?: any;
  expires_after?: number;
}

// Lunith Script Content
const SCRIPT_CONTENT = `print("Lunith Loader Initialized")

-- Main script logic
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Lunith loaded for:", LocalPlayer.Name)
end

return "Lunith loaded successfully"`;

// Parse duration string (1Y, 1W, 1D, 1H, 1M, 1S)
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

// Get all identifiers from a request/key data
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

// Enhanced blacklist check with admin bypass
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

// Add to blacklist with all identifiers
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

// Remove from blacklist (whitelist)
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

// Get all blacklist entries
async function getBlacklistEntries(kv: Deno.Kv): Promise<BlacklistEntry[]> {
  const entries: BlacklistEntry[] = [];
  
  for await (const entry of kv.list({ prefix: ["blacklist", "entries"] })) {
    entries.push(entry.value as BlacklistEntry);
  }
  
  return entries;
}

// Find blacklist entry by Discord ID
async function getBlacklistEntry(kv: Deno.Kv, discordId: string): Promise<BlacklistEntry | null> {
  const entry = await kv.get(["blacklist", "entries", discordId]);
  return entry.value as BlacklistEntry || null;
}

// Enhanced session management
async function getUserSession(kv: Deno.Kv, ip: string, userAgent: string): Promise<UserSession> {
  const sessionId = `session:${ip}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`;
  const entry = await kv.get(["sessions", sessionId]);
  
  if (entry.value) {
    const session = entry.value as UserSession;
    
    if (!session.linked_discord_ids) session.linked_discord_ids = [];
    if (!session.keys_generated) session.keys_generated = [];
    if (!session.privacy_agreed) session.privacy_agreed = false;
    if (!session.age_verified) session.age_verified = false;
    if (!session.workink_tokens) session.workink_tokens = [];
    if (!session.checkpoints_completed) session.checkpoints_completed = [];
    
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
    age_verified: false,
    workink_tokens: [],
    checkpoints_completed: []
  };
  
  await kv.set(["sessions", sessionId], newSession);
  return newSession;
}

// Enhanced session update with Discord ID tracking
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

// Check if current key is expired and can be renewed
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

// WorkInk API Integration
async function generateWorkInkToken(clientIP: string, userAgent: string): Promise<{ success: boolean; token?: string; error?: string }> {
  try {
    // Generate a unique token for WorkInk
    const token = `lunith_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Store the token in our database
    const kv = await Deno.openKv();
    await kv.set(["workink_tokens", token], {
      token,
      created_at: Date.now(),
      ip: clientIP,
      user_agent: userAgent,
      validated: false
    });
    kv.close();
    
    return { success: true, token };
  } catch (error) {
    console.error('WorkInk token generation error:', error);
    return { success: false, error: 'Failed to generate WorkInk token' };
  }
}

async function validateWorkInkToken(token: string): Promise<{ valid: boolean; data?: any; error?: string }> {
  try {
    metrics.workinkValidations++;
    
    const response = await fetch(`${WORKINK_VALIDATION_ENDPOINT}/${token}?forbiddenOnFail=1`, {
      method: 'GET',
      headers: {
        'User-Agent': 'Lunith Key System/1.0'
      }
    });
    
    if (!response.ok) {
      metrics.workinkFailures++;
      return { valid: false, error: `WorkInk validation failed: ${response.status}` };
    }
    
    const data = await response.json();
    
    // Update token validation status in database
    const kv = await Deno.openKv();
    const tokenEntry = await kv.get(["workink_tokens", token]);
    if (tokenEntry.value) {
      const tokenData = tokenEntry.value as WorkInkToken;
      tokenData.validated = data.valid;
      tokenData.validation_data = data;
      await kv.set(["workink_tokens", token], tokenData);
    }
    kv.close();
    
    return { valid: data.valid, data };
  } catch (error) {
    metrics.workinkFailures++;
    console.error('WorkInk validation error:', error);
    return { valid: false, error: 'WorkInk validation service unavailable' };
  }
}

// Enhanced HTML with WorkInk Checkpoint System
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
        .hidden { display: none; }
        .info-text { color: #aaa; font-size: 14px; line-height: 1.5; margin: 12px 0; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.1) 50%, transparent 100%); margin: 25px 0; }
        .step { display: flex; align-items: center; margin: 15px 0; padding: 12px; background: rgba(255,255,255,0.03); border-radius: 8px; }
        .step-number { background: #7289da; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; margin-right: 12px; flex-shrink: 0; }
        @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
        .loading { animation: pulse 1.5s ease-in-out infinite; }
        .expiry-notice { background: rgba(250, 166, 26, 0.1); border: 1px solid rgba(250, 166, 26, 0.3); border-radius: 8px; padding: 12px 16px; margin: 15px 0; font-size: 13px; }
        .rate-limit-message { background: rgba(240, 71, 71, 0.1); border: 1px solid rgba(240, 71, 71, 0.3); border-radius: 8px; padding: 12px 16px; margin: 15px 0; font-size: 13px; }
        .privacy-section { background: rgba(30, 30, 30, 0.8); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255, 255, 255, 0.1); }
        .privacy-content { max-height: 200px; overflow-y: auto; background: rgba(15, 15, 15, 0.8); padding: 15px; border-radius: 8px; margin: 15px 0; font-size: 13px; line-height: 1.4; }
        .checkbox-group { display: flex; flex-direction: column; gap: 15px; margin: 20px 0; }
        .checkbox-item { display: flex; align-items: flex-start; gap: 12px; padding: 12px; background: rgba(255, 255, 255, 0.03); border-radius: 8px; }
        .checkbox-item input[type="checkbox"] { margin-top: 2px; transform: scale(1.2); }
        .checkbox-label { font-size: 14px; line-height: 1.4; }
        .panel-section { background: rgba(30, 30, 30, 0.8); border-radius: 12px; padding: 20px; margin: 20px 0; border: 1px solid rgba(255, 255, 255, 0.1); }
        .panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
        .panel-title { color: #7289da; font-size: 1.2rem; font-weight: 600; }
        .key-status { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin: 15px 0; }
        .status-item { background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 8px; border-left: 4px solid #7289da; }
        .status-label { font-size: 0.9rem; color: #888; margin-bottom: 5px; }
        .status-value { font-size: 1.1rem; font-weight: 600; color: #e8e8e8; }
        .action-buttons { display: grid; grid-template-columns: 1fr; gap: 10px; margin: 20px 0; }
        .btn-secondary { background: linear-gradient(135deg, #43b581 0%, #369a6d 100%) !important; }
        .btn-secondary:hover { background: linear-gradient(135deg, #369a6d 0%, #2d8a5c 100%) !important; }
        
        /* Left-aligned tabs */
        .tab-container { display: flex; margin: 20px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.1); justify-content: flex-start; }
        .tab { padding: 12px 20px; cursor: pointer; border-bottom: 3px solid transparent; transition: all 0.2s ease; }
        .tab.active { border-bottom-color: #7289da; color: #7289da; }
        .tab-content { display: none; }
        .tab-content.active { display: block; }
        
        /* Checkpoint system styles */
        .checkpoint-container { text-align: center; margin: 30px 0; }
        .checkpoint-title { font-size: 1.4rem; font-weight: 600; margin-bottom: 25px; color: #7289da; }
        .checkpoint-buttons { display: flex; gap: 20px; justify-content: center; margin: 30px 0; }
        .checkpoint-btn { 
            flex: 1; max-width: 200px; padding: 20px; border-radius: 12px;
            background: linear-gradient(135deg, #7289da 0%, #5b73c4 100%);
            color: white; cursor: pointer; font-weight: 600; font-size: 16px;
            transition: all 0.3s ease; border: none; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 10px;
        }
        .checkpoint-btn:hover { 
            transform: translateY(-3px); 
            box-shadow: 0 8px 25px rgba(114, 137, 218, 0.4);
        }
        .checkpoint-btn:disabled { 
            background: #444; cursor: not-allowed; transform: none; 
            box-shadow: none; opacity: 0.6;
        }
        .checkpoint-icon { font-size: 2rem; margin-bottom: 5px; }
        .checkpoint-progress { margin: 25px 0; }
        .progress-bar { 
            height: 8px; background: rgba(255, 255, 255, 0.1); border-radius: 4px;
            overflow: hidden; margin: 15px 0;
        }
        .progress-fill { 
            height: 100%; background: linear-gradient(90deg, #43b581 0%, #7289da 100%);
            border-radius: 4px; transition: width 0.5s ease;
        }
        .progress-text { 
            display: flex; justify-content: space-between; font-size: 0.9rem;
            color: #aaa; margin-top: 8px;
        }
        .checkpoint-animation { 
            text-align: center; margin: 30px 0; padding: 20px;
            background: rgba(255, 255, 255, 0.05); border-radius: 12px;
        }
        .animation-icon { font-size: 3rem; margin-bottom: 15px; color: #7289da; }
        .checkpoint-complete { 
            background: rgba(67, 181, 129, 0.1); border: 1px solid rgba(67, 181, 129, 0.3);
            border-radius: 12px; padding: 20px; margin: 20px 0; text-align: center;
        }
        .workink-frame { 
            width: 100%; height: 400px; border: 1px solid rgba(255,255,255,0.1); 
            border-radius: 12px; margin: 20px 0; background: white;
        }
        .checkpoint-description { 
            background: rgba(255,255,255,0.05); padding: 15px; border-radius: 8px;
            margin: 15px 0; text-align: left; font-size: 14px;
        }
        .workink-success { 
            background: rgba(67, 181, 129, 0.1); border: 1px solid rgba(67, 181, 129, 0.3);
            border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center;
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
        
        <!-- Left-aligned tabs -->
        <div class="tab-container">
            <div class="tab active" onclick="switchTab('generate')">Generate Key</div>
            <div class="tab" onclick="switchTab('panel')">My Panel</div>
        </div>
        
        <div id="generateTab" class="tab-content active">
            <div class="section">
                <p>Generate your unique activation key to access Lunith services.</p>
            </div>
            
            <div class="expiry-notice">
                <strong>Important:</strong> Generated keys expire in 24 hours if not activated. Activated tokens are valid for 24 hours.
            </div>
            
            <div id="rateLimitMessage" class="rate-limit-message hidden">
                <strong>Rate Limit Exceeded:</strong> Please wait a few minutes before generating another key.
            </div>
            
            <div id="privacySection" class="privacy-section">
                <div class="step">
                    <div class="step-number">1</div>
                    <div>
                        <strong>Privacy Policy & Age Verification</strong>
                        <div class="info-text">You must agree to continue</div>
                    </div>
                </div>
                
                <div class="privacy-content">
                    <h4>Data Collection Notice</h4>
                    <p>By using this service, you agree that we may collect and store the following information:</p>
                    <ul>
                        <li>Your IP Address</li>
                        <li>Hardware ID (HWID)</li>
                        <li>Virtual MAC Address (VMAC)</li>
                        <li>Discord User ID</li>
                        <li>Browser User Agent</li>
                        <li>Session information</li>
                    </ul>
                    <p><strong>Purpose:</strong> This data is collected for security, anti-fraud, and service improvement purposes.</p>
                    <p><strong>Storage:</strong> Data is stored securely and may be retained for up to 30 days after account termination.</p>
                    <p><strong>Age Requirement:</strong> You must be 16 years or older to use this service.</p>
                    <p>By checking the boxes below, you confirm your understanding and agreement to these terms.</p>
                </div>
                
                <div class="checkbox-group">
                    <div class="checkbox-item">
                        <input type="checkbox" id="privacyAgree">
                        <label for="privacyAgree" class="checkbox-label">
                            I have read and agree to the Privacy Policy and consent to the collection of my IP address, HWID, VMAC, Discord User ID, and other technical information as described above.
                        </label>
                    </div>
                    <div class="checkbox-item">
                        <input type="checkbox" id="ageVerify">
                        <label for="ageVerify" class="checkbox-label">
                            I confirm that I am 16 years of age or older.
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
                        <strong>Start Verification</strong>
                        <div class="info-text">Complete security checkpoints to generate your key</div>
                    </div>
                </div>
                
                <button onclick="startWorkInk()" id="workinkBtn">
                    Begin Verification Process
                </button>
            </div>
            
            <!-- Checkpoint System -->
            <div id="checkpointSection" class="hidden">
                <div class="checkpoint-container">
                    <div class="checkpoint-title" id="checkpointTitle">Security Verification Checkpoint 1/3</div>
                    
                    <div class="checkpoint-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" id="progressFill" style="width: 0%"></div>
                        </div>
                        <div class="progress-text">
                            <span>Verification Progress</span>
                            <span id="progressText">0% Complete</span>
                        </div>
                    </div>
                    
                    <div class="checkpoint-animation" id="checkpointAnimation">
                        <div class="animation-icon">🔒</div>
                        <p>Complete security verification checkpoints to generate your key</p>
                        <div class="info-text">Each checkpoint verifies different aspects of your system security</div>
                    </div>
                    
                    <!-- WorkInk Checkpoint -->
                    <div id="workinkCheckpoint" class="hidden">
                        <div class="checkpoint-description">
                            <h4>🛡️ WorkInk Security Verification</h4>
                            <p>WorkInk analyzes your system fingerprint and connection security to ensure a safe environment.</p>
                            <ul>
                                <li>Browser fingerprint analysis</li>
                                <li>Connection security check</li>
                                <li>Bot detection verification</li>
                            </ul>
                        </div>
                        
                        <div id="workinkFrameContainer" class="hidden">
                            <iframe id="workinkFrame" class="workink-frame" sandbox="allow-scripts allow-forms allow-same-origin"></iframe>
                            <div class="info-text">Complete the verification on the WorkInk page, then return here</div>
                        </div>
                        
                        <div id="workinkSuccess" class="workink-success hidden">
                            <div class="animation-icon">✅</div>
                            <h4>WorkInk Verification Complete!</h4>
                            <p>Security checkpoint passed successfully</p>
                        </div>
                        
                        <button onclick="startWorkInkVerification()" id="startWorkInkBtn">
                            Start WorkInk Verification
                        </button>
                    </div>
                    
                    <div class="checkpoint-buttons" id="checkpointSelection">
                        <button class="checkpoint-btn" onclick="selectCheckpoint('workink')" id="workinkCheckpointBtn">
                            <div class="checkpoint-icon">🛡️</div>
                            <div>WorkInk</div>
                            <div class="info-text">Security Verification</div>
                        </button>
                    </div>
                    
                    <div id="checkpointComplete" class="checkpoint-complete hidden">
                        <div class="animation-icon">✅</div>
                        <h3>All Checkpoints Complete!</h3>
                        <p>Your key is being generated...</p>
                    </div>
                </div>
            </div>
            
            <div id="keySection" class="hidden">
                <div class="success">
                    <strong>Verification Complete</strong>
                    <div>Your activation key has been generated successfully.</div>
                </div>
                
                <div class="step">
                    <div class="step-number">3</div>
                    <div>
                        <strong>Your Activation Key</strong>
                        <div class="info-text">Copy this key and activate it within 24 hours.</div>
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
                        <div class="info-text">Use the !activate command in our Discord server with this key to receive your loader.</div>
                    </div>
                </div>
                
                <div class="warning">
                    <strong>Key Expires:</strong> This key will expire <span id="expiryTime">in 24 hours</span> if not activated.
                </div>
            </div>
        </div>
        
        <div id="panelTab" class="tab-content">
            <div class="panel-section">
                <div class="panel-header">
                    <div class="panel-title">Session Overview</div>
                </div>
                
                <div id="panelContent">
                    <div class="key-status">
                        <div class="status-item">
                            <div class="status-label">Your IP</div>
                            <div class="status-value" id="panelIp">Loading...</div>
                        </div>
                        <div class="status-item">
                            <div class="status-label">Current Key</div>
                            <div class="status-value" id="panelKeyStatus">Loading...</div>
                        </div>
                    </div>
                    
                    <div id="currentKeyInfo" class="hidden">
                        <div class="step">
                            <div class="step-number">★</div>
                            <div>
                                <strong>Current Active Key</strong>
                                <div class="info-text">Your current activation key</div>
                            </div>
                        </div>
                        
                        <div class="key-display" id="panelCurrentKey">Loading...</div>
                        
                        <div class="action-buttons">
                            <button onclick="copyPanelKey()" class="btn-secondary">
                                Copy Key
                            </button>
                            <button onclick="renewKey()" id="renewBtn">
                                Renew Key
                            </button>
                        </div>
                        
                        <div class="warning">
                            <strong>Status:</strong> <span id="keyStatus">Loading...</span><br>
                            <strong>Expires:</strong> <span id="keyExpiry">Loading...</span>
                        </div>
                    </div>
                    
                    <div id="noKeyInfo">
                        <div class="info-text">
                            No active key found. Generate a new key to get started.
                        </div>
                        <button onclick="switchTab('generate')" style="margin-top: 15px;">
                            Generate New Key
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        let currentCheckpoint = 0;
        const totalCheckpoints = 3;
        let completedCheckpoints = [];
        let workinkToken = '';
        
        function switchTab(tabName) {
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
            document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
            document.getElementById(tabName + 'Tab').classList.add('active');
            event.target.classList.add('active');
            if (tabName === 'panel') loadUserPanel();
        }
        
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
        
        function verifyPrivacy() {
            document.getElementById('privacySection').classList.add('hidden');
            document.getElementById('workinkSection').classList.remove('hidden');
            localStorage.setItem('privacyAgreed', 'true');
            localStorage.setItem('ageVerified', 'true');
        }
        
        async function startWorkInk() {
            const btn = document.getElementById('workinkBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Starting Verification...';
            btn.classList.add('loading');
            
            try {
                // Show checkpoint system instead of immediately generating key
                document.getElementById('workinkSection').classList.add('hidden');
                document.getElementById('checkpointSection').classList.remove('hidden');
                resetButton(btn, originalText);
                startCheckpointSystem();
            } catch (error) {
                alert('Failed to start verification: ' + error.message);
                resetButton(btn, originalText);
            }
        }
        
        function startCheckpointSystem() {
            currentCheckpoint = 0;
            completedCheckpoints = [];
            updateProgress();
            resetCheckpointButtons();
        }
        
        function updateProgress() {
            const progress = (currentCheckpoint / totalCheckpoints) * 100;
            document.getElementById('progressFill').style.width = progress + '%';
            document.getElementById('progressText').textContent = \`\${currentCheckpoint}/\${totalCheckpoints} Complete\`;
            
            // Update checkpoint title based on progress
            const titles = [
                "Security Verification Checkpoint 1/3",
                "Security Verification Checkpoint 2/3", 
                "Security Verification Checkpoint 3/3"
            ];
            const titleIndex = Math.min(currentCheckpoint, titles.length - 1);
            document.getElementById('checkpointTitle').textContent = titles[titleIndex];
        }
        
        function resetCheckpointButtons() {
            document.getElementById('workinkCheckpointBtn').disabled = false;
            document.getElementById('checkpointComplete').classList.add('hidden');
            document.getElementById('checkpointAnimation').classList.remove('hidden');
            document.getElementById('workinkCheckpoint').classList.add('hidden');
        }
        
        function selectCheckpoint(type) {
            if (type === 'workink') {
                document.getElementById('checkpointSelection').classList.add('hidden');
                document.getElementById('checkpointAnimation').classList.add('hidden');
                document.getElementById('workinkCheckpoint').classList.remove('hidden');
                startWorkInkVerification();
            }
        }
        
        async function startWorkInkVerification() {
            const btn = document.getElementById('startWorkInkBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Generating WorkInk Token...';
            
            try {
                // Generate WorkInk token
                const response = await fetch('/workink/generate-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                });
                
                const result = await response.json();
                
                if (result.success) {
                    workinkToken = result.token;
                    btn.textContent = 'Opening WorkInk Verification...';
                    
                    // Show WorkInk iframe
                    document.getElementById('workinkFrameContainer').classList.remove('hidden');
                    const iframe = document.getElementById('workinkFrame');
                    iframe.src = \`https://work.ink/token?token=\${workinkToken}\`;
                    
                    // Start polling for verification
                    pollWorkInkVerification();
                } else {
                    throw new Error(result.error || 'Failed to generate WorkInk token');
                }
            } catch (error) {
                alert('WorkInk verification failed: ' + error.message);
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
        
        async function pollWorkInkVerification() {
            try {
                const response = await fetch(\`/workink/validate-token?token=\${workinkToken}\`);
                const result = await response.json();
                
                if (result.valid) {
                    // WorkInk verification successful
                    document.getElementById('workinkFrameContainer').classList.add('hidden');
                    document.getElementById('workinkSuccess').classList.remove('hidden');
                    document.getElementById('startWorkInkBtn').classList.add('hidden');
                    
                    // Mark checkpoint as completed
                    completedCheckpoints.push('workink');
                    currentCheckpoint++;
                    updateProgress();
                    
                    // Wait a moment then proceed to next checkpoint or finish
                    setTimeout(() => {
                        if (currentCheckpoint >= totalCheckpoints) {
                            // All checkpoints completed
                            document.getElementById('checkpointComplete').classList.remove('hidden');
                            generateFinalKey();
                        } else {
                            // Reset for next checkpoint
                            document.getElementById('workinkCheckpoint').classList.add('hidden');
                            document.getElementById('checkpointSelection').classList.remove('hidden');
                            document.getElementById('checkpointAnimation').classList.remove('hidden');
                        }
                    }, 2000);
                } else {
                    // Continue polling
                    setTimeout(() => pollWorkInkVerification(), 2000);
                }
            } catch (error) {
                console.error('WorkInk polling error:', error);
                setTimeout(() => pollWorkInkVerification(), 2000);
            }
        }
        
        async function generateFinalKey() {
            try {
                // Call the final key generation endpoint
                const response = await fetch('/workink/generate-key', { 
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        privacy_agreed: true, 
                        age_verified: true,
                        workink_token: workinkToken,
                        checkpoints_completed: completedCheckpoints
                    })
                });
                
                const result = await response.json();
                
                if (result.success) {
                    // Show the key section
                    setTimeout(() => {
                        document.getElementById('checkpointSection').classList.add('hidden');
                        document.getElementById('keySection').classList.remove('hidden');
                        document.getElementById('generatedKey').textContent = result.key;
                        updateExpiryTime();
                    }, 1000);
                } else {
                    throw new Error(result.error || 'Key generation failed');
                }
            } catch (error) {
                alert('Final key generation failed: ' + error.message);
                // Reset to checkpoint system
                document.getElementById('checkpointComplete').classList.add('hidden');
                document.getElementById('checkpointAnimation').classList.remove('hidden');
                resetCheckpointButtons();
            }
        }
        
        async function loadUserPanel() {
            try {
                const response = await fetch('/user-panel');
                const result = await response.json();
                if (result.success) {
                    document.getElementById('panelIp').textContent = result.session.ip;
                    if (result.current_key) {
                        const keyExpiry = new Date(result.current_key.expires_at);
                        const now = new Date();
                        const isExpired = keyExpiry < now;
                        document.getElementById('panelCurrentKey').textContent = result.current_key.key;
                        document.getElementById('keyStatus').textContent = result.current_key.activated ? 'Activated' : 'Not Activated';
                        document.getElementById('keyExpiry').textContent = isExpired ? 'EXPIRED' : keyExpiry.toLocaleString();
                        document.getElementById('panelKeyStatus').textContent = isExpired ? 'Expired' : 'Active';
                        document.getElementById('currentKeyInfo').classList.remove('hidden');
                        document.getElementById('noKeyInfo').classList.add('hidden');
                        document.getElementById('renewBtn').disabled = !isExpired;
                        if (!isExpired) document.getElementById('renewBtn').textContent = 'Key Still Valid';
                    } else {
                        document.getElementById('currentKeyInfo').classList.add('hidden');
                        document.getElementById('noKeyInfo').classList.remove('hidden');
                        document.getElementById('panelKeyStatus').textContent = 'None';
                    }
                }
            } catch (error) {
                console.error('Failed to load panel:', error);
            }
        }
        
        async function renewKey() {
            const btn = document.getElementById('renewBtn');
            const originalText = btn.textContent;
            btn.disabled = true;
            btn.textContent = 'Renewing...';
            try {
                const response = await fetch('/renew', { method: 'POST' });
                const result = await response.json();
                if (result.success) {
                    const newExpiry = new Date(result.expires_at);
                    document.getElementById('keyExpiry').textContent = newExpiry.toLocaleString();
                    document.getElementById('panelKeyStatus').textContent = 'Active';
                    if (result.renewal_count) {
                        document.getElementById('keyStatus').textContent = 'Activated • Renewed ' + result.renewal_count + ' times';
                    }
                    navigator.clipboard.writeText(result.key).then(() => {
                        btn.textContent = '✓ Renewed & Copied';
                        setTimeout(() => {
                            btn.textContent = 'Renew Key';
                            btn.disabled = true;
                        }, 2000);
                    });
                } else {
                    alert('Renew failed: ' + result.error);
                    btn.disabled = false;
                    btn.textContent = originalText;
                }
            } catch (error) {
                alert('Network error: ' + error.message);
                btn.disabled = false;
                btn.textContent = originalText;
            }
        }
        
        function copyPanelKey() {
            const key = document.getElementById('panelCurrentKey').textContent;
            navigator.clipboard.writeText(key).then(() => alert('Key copied to clipboard!'));
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
        
        function resetButton(btn, text) {
            btn.disabled = false;
            btn.textContent = text;
            btn.classList.remove('loading');
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            setupPrivacyCheckboxes();
            const privacyAgreed = localStorage.getItem('privacyAgreed');
            const ageVerified = localStorage.getItem('ageVerified');
            if (privacyAgreed === 'true' && ageVerified === 'true') {
                document.getElementById('privacySection').classList.add('hidden');
                document.getElementById('workinkSection').classList.remove('hidden');
            }
        });
    </script>
</body>
</html>`;

// API site HTML (unchanged)
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

// Utility functions
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

// Enhanced rate limiting
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

// Input validation
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

// Error logging
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

// Cleanup expired keys and tokens
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

    // Clean up old WorkInk tokens (7 days)
    const workinkEntries = [];
    for await (const entry of kv.list({ prefix: ["workink_tokens"] })) {
      const tokenData = entry.value as WorkInkToken;
      if (tokenData && now - tokenData.created_at > 7 * 24 * 60 * 60 * 1000) {
        workinkEntries.push(entry);
      }
    }
    
    for (const entry of workinkEntries) {
      await kv.delete(entry.key);
      cleaned++;
    }

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

// Backup system
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

// Performance monitoring
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

// WorkInk Token Generation
async function handleWorkInkTokenGeneration(kv: Deno.Kv, clientIP: string, userAgent: string): Promise<Response> {
  const tokenResult = await generateWorkInkToken(clientIP, userAgent);
  
  if (tokenResult.success) {
    // Update session with WorkInk token
    const session = await getUserSession(kv, clientIP, userAgent);
    if (!session.workink_tokens) session.workink_tokens = [];
    session.workink_tokens.push(tokenResult.token!);
    await updateUserSession(kv, clientIP, userAgent);
    
    return jsonResponse({ success: true, token: tokenResult.token });
  } else {
    return jsonResponse({ success: false, error: tokenResult.error }, 500);
  }
}

// WorkInk Token Validation
async function handleWorkInkTokenValidation(kv: Deno.Kv, token: string): Promise<Response> {
  const validationResult = await validateWorkInkToken(token);
  
  if (validationResult.valid) {
    return jsonResponse({ valid: true, data: validationResult.data });
  } else {
    return jsonResponse({ valid: false, error: validationResult.error }, 400);
  }
}

// Enhanced WorkInk endpoint with checkpoint system
async function handleWorkInkKeyGeneration(kv: Deno.Kv, clientIP: string, userAgent: string, req: Request): Promise<Response> {
  // Check blacklist for IP and User Agent first
  const blacklistCheck = await isBlacklisted(kv, 'unknown', clientIP, userAgent);
  if (blacklistCheck.blacklisted) {
    await logError(kv, `Blacklisted connection attempted key generation: ${clientIP}`, req, '/workink/generate-key');
    return jsonResponse({ 
      error: "Access denied. Your connection is blacklisted.",
      reason: blacklistCheck.entry?.reason,
      severity: blacklistCheck.severity,
      expires: blacklistCheck.entry?.expires_at ? new Date(blacklistCheck.entry.expires_at).toISOString() : 'Permanent',
      matched_identifier: blacklistCheck.matchedIdentifier
    }, 403);
  }
  
  const session = await getUserSession(kv, clientIP, userAgent);
  
  // Check if user has agreed to privacy policy and age verification
  let body;
  try {
    body = await req.json();
  } catch (error) {
    return jsonResponse({ error: "Invalid JSON in request body" }, 400);
  }

  const { privacy_agreed, age_verified, workink_token, checkpoints_completed } = body;
  
  if (!privacy_agreed || !age_verified) {
    return jsonResponse({ 
      error: "You must agree to the privacy policy and age verification to generate a key." 
    }, 403);
  }
  
  // Validate WorkInk token
  if (!workink_token) {
    return jsonResponse({ error: "WorkInk token is required" }, 400);
  }
  
  const validationResult = await validateWorkInkToken(workink_token);
  if (!validationResult.valid) {
    return jsonResponse({ error: "WorkInk verification failed", details: validationResult.error }, 401);
  }
  
  // Check if all checkpoints are completed
  if (!checkpoints_completed || checkpoints_completed.length < 3) {
    return jsonResponse({ 
      error: "All verification checkpoints must be completed before generating a key." 
    }, 403);
  }
  
  // Update session with privacy agreement and checkpoint completion
  await updateUserSession(kv, clientIP, userAgent, undefined, undefined, true, true);
  
  // Check if user already has a valid key
  if (session.current_key) {
    const keyEntry = await kv.get(["keys", session.current_key]);
    if (keyEntry.value && keyEntry.value.expires_at > Date.now()) {
      return jsonResponse({ 
        error: "You already have an active key. Please wait until it expires to generate a new one.",
        current_key: session.current_key,
        expires_at: keyEntry.value.expires_at
      }, 409);
    }
  }
  
  const key = generateFormattedKey();
  const expiresAt = Date.now() + KEY_EXPIRY_MS;
  
  const keyData = {
    key,
    created_at: Date.now(),
    expires_at: expiresAt,
    activated: false,
    workink_completed: true,
    workink_data: {
      ip: clientIP,
      user_agent: userAgent,
      completed_at: Date.now(),
      session_id: `session:${clientIP}:${Buffer.from(userAgent).toString('base64').slice(0, 16)}`,
      privacy_agreed: true,
      age_verified: true,
      workink_token: workink_token,
      workink_validated: true,
      checkpoints_completed: checkpoints_completed
    }
  };
  
  await kv.set(["keys", key], keyData);
  await updateUserSession(kv, clientIP, userAgent, key);
  
  return jsonResponse({
    success: true,
    key: key,
    expires_at: new Date(expiresAt).toISOString(),
    existing_session: session.keys_generated.length > 0,
    workink_validated: true,
    checkpoints_completed: checkpoints_completed.length,
    message: "Verification completed successfully"
  });
}

// Renew key system - reset expiration dates for existing key
async function handleRenew(kv: Deno.Kv, clientIP: string, userAgent: string, req: Request) {
  const blacklistCheck = await isBlacklisted(kv, 'unknown', clientIP, userAgent);
  if (blacklistCheck.blacklisted) {
    return jsonResponse({ error: "Access denied. Your connection is blacklisted.", reason: blacklistCheck.entry?.reason }, 403);
  }
  
  const session = await getUserSession(kv, clientIP, userAgent);
  
  if (!session.current_key) {
    return jsonResponse({ error: "No existing key found. Please generate a new key first." }, 400);
  }
  
  const renewCheck = await canRenewKey(kv, session);
  if (!renewCheck.canRenew) {
    return jsonResponse({ error: renewCheck.reason || "Cannot renew key at this time.", current_key: session.current_key }, 400);
  }
  
  const currentKey = session.current_key;
  const keyEntry = await kv.get(["keys", currentKey]);
  const keyData = keyEntry.value;
  
  if (!keyData) {
    return jsonResponse({ error: "Key data not found. Please generate a new key." }, 404);
  }
  
  // Reset expiration dates
  const newExpiresAt = Date.now() + KEY_EXPIRY_MS;
  keyData.expires_at = newExpiresAt;
  
  // If key was activated, also reset the token expiration
  if (keyData.activated && keyData.script_token) {
    const tokenExpiresAt = Date.now() + TOKEN_TTL_MS;
    const tokenEntry = await kv.get(["token", keyData.script_token]);
    if (tokenEntry.value) {
      const tokenData = tokenEntry.value;
      tokenData.expires_at = tokenExpiresAt;
      await kv.set(["token", keyData.script_token], tokenData);
    }
    keyData.activation_data.token_reset_at = Date.now();
    keyData.activation_data.new_token_expires_at = tokenExpiresAt;
  }
  
  // Update key data with renewal info
  keyData.renewed_at = Date.now();
  keyData.renewal_count = (keyData.renewal_count || 0) + 1;
  keyData.workink_data.last_renewal = { ip: clientIP, user_agent: userAgent, renewed_at: Date.now() };
  
  await kv.set(["keys", currentKey], keyData);
  metrics.refills++;
  
  return jsonResponse({
    success: true, key: currentKey, expires_at: new Date(newExpiresAt).toISOString(),
    is_renewal: true, renewal_count: keyData.renewal_count, message: "Key renewed successfully - expiration reset to 24 hours"
  });
}

// User panel endpoint
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

// Main handler with all enhancements
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
      if (url.pathname === '/workink/generate-token' && req.method === 'POST') return await handleWorkInkTokenGeneration(kv, clientIP, userAgent);
      if (url.pathname === '/workink/validate-token' && req.method === 'GET') {
        const token = url.searchParams.get('token');
        if (!token) return jsonResponse({ error: 'Token parameter required' }, 400);
        return await handleWorkInkTokenValidation(kv, token);
      }
      if (url.pathname === '/workink/generate-key' && req.method === 'POST') return await handleWorkInkKeyGeneration(kv, clientIP, userAgent, req);
      if (url.pathname === '/renew' && req.method === 'POST') return await handleRenew(kv, clientIP, userAgent, req);
      if (url.pathname === '/user-panel' && req.method === 'GET') return await handleUserPanel(kv, clientIP, userAgent);
      if (url.pathname === '/health' && req.method === 'GET') return jsonResponse({ status: 'online', service: 'key-system', domain: 'key.napsy.dev', metrics, rate_limit: rateLimitResult });
      if (url.pathname === '/metrics' && req.method === 'GET') {
        monitorPerformance();
        return jsonResponse({ metrics, rate_limits: Array.from(rateLimit.entries()).slice(0, 10), timestamp: new Date().toISOString() });
      }
      return new Response("Not found", { status: 404 });
    }

    // API.NAPSY.DEV - Script API (unchanged functionality)
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
        return new Response(SCRIPT_CONTENT, { headers: { "Content-Type": "text/plain; charset=utf-8", ...corsHeaders } });
      }

      // ... rest of API endpoints remain unchanged ...

      return new Response("Not found", { status: 404 });
    }

    return new Response("Lunith Service", { headers: corsHeaders });

  } catch (err) {
    console.error("Server error:", err);
    await logError(kv, "Server error: " + err.message, req, url.pathname);
    metrics.failedActivations++;
    return jsonResponse({ error: "Internal server error" }, 500);
  } finally {
    kv.close();
    monitorPerformance();
  }
}

// For local development
if (import.meta.main) {
  console.log("Lunith Key System with WorkInk Integration starting locally on port 8000...");
  Deno.serve(handler, { port: 8000 });
}
