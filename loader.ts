// Simple script content - replace with your actual script
const SCRIPT_CONTENT = `print("Hello from Script Service!")

-- Your main script logic here
local Players = game:GetService("Players")
local LocalPlayer = Players.LocalPlayer

if LocalPlayer then
    print("Script executed for player:", LocalPlayer.Name)
end

return "Script loaded successfully"`;

export function getScript(): string {
  return SCRIPT_CONTENT;
}
