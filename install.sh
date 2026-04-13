#!/bin/bash
# ─────────────────────────────────────────────────────────
# wall402 — one-line installer for the MCP server
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/user/wall402/main/install.sh | bash
#
# What it does:
#   1. Clones the repo to ~/.wall402
#   2. Installs dependencies (pnpm)
#   3. Builds the MCP server
#   4. Prints the config snippet you paste into Claude/Cursor
# ─────────────────────────────────────────────────────────
set -euo pipefail

INSTALL_DIR="${WALL402_DIR:-$HOME/.wall402}"
REPO="${WALL402_REPO:-https://github.com/user/wall402.git}"
BRANCH="${WALL402_BRANCH:-main}"

GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

info()  { printf "${CYAN}▸${NC} %s\n" "$1"; }
ok()    { printf "${GREEN}✓${NC} %s\n" "$1"; }
dim()   { printf "${DIM}  %s${NC}\n" "$1"; }

echo ""
printf "${BOLD}  wall${GREEN}402${NC}${BOLD} MCP server installer${NC}\n"
echo ""

# ── 1. Clone ─────────────────────────────────────────────
if [ -d "$INSTALL_DIR/.git" ]; then
  info "updating existing install at $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only origin "$BRANCH" 2>/dev/null || true
else
  info "cloning wall402 → $INSTALL_DIR"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"

# ── 2. Dependencies ──────────────────────────────────────
info "installing dependencies"

if ! command -v pnpm &>/dev/null; then
  dim "pnpm not found, installing via corepack..."
  corepack enable 2>/dev/null || npm install -g pnpm@9
fi

pnpm install --frozen-lockfile 2>/dev/null || pnpm install

# ── 3. Build ─────────────────────────────────────────────
info "building MCP server"
pnpm --filter @wall402/mcp-server build

ok "wall402 MCP server installed"
echo ""

# ── 4. Config ────────────────────────────────────────────
MCP_BIN="$INSTALL_DIR/apps/mcp-server/dist/index.js"

printf "${BOLD}Add this to your MCP client config:${NC}\n\n"

echo "┌─ Claude Desktop (~/Library/Application Support/Claude/claude_desktop_config.json)"
echo "│  or Cursor (~/.cursor/mcp.json)"
echo "│"
cat <<MCPJSON
│  {
│    "mcpServers": {
│      "wall402": {
│        "command": "node",
│        "args": ["$MCP_BIN"],
│        "env": {
│          "WALL402_GATEWAY_URL": "http://localhost:3402",
│          "ONCHAINOS_CLI": "onchainos"
│        }
│      }
│    }
│  }
MCPJSON
echo "└─"
echo ""

printf "${DIM}Or run directly:${NC}\n"
echo "  node $MCP_BIN"
echo ""

printf "${BOLD}Available MCP tools:${NC}\n"
echo "  • list_endpoints        — discover paywalled APIs"
echo "  • call_paid_endpoint    — full x402 payment handshake (with auto-swap)"
echo "  • get_wallet_status     — wallet info + X Layer balance"
echo "  • swap_tokens           — swap any token via Uniswap on X Layer"
echo "  • get_swap_quote        — read-only swap price estimate"
echo "  • check_token_security  — honeypot / risk scan before payment"
echo ""

printf "${DIM}Prerequisites:${NC}\n"
echo "  1. onchainos CLI: https://web3.okx.com/build/onchain-os"
echo "  2. Login: onchainos wallet login <email>"
echo "  3. (Optional) Start the gateway: cd $INSTALL_DIR && pnpm dev:gateway"
echo ""

ok "done — wall402 is ready to power your agent payments"
echo ""
