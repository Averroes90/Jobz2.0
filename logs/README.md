# Log Files Reference

## Available Logs

- `server.log` - Server requests/responses (REQUEST, RESPONSE)
- `token_usage.log` - Current session API token usage
- `token_usage_converted.log` - Historical token usage (converted from old format)
- `server_token_usage_*.log` - Session snapshots on server shutdown

## Quick Commands

### View Full Logs
```bash
cat logs/server.log
cat logs/token_usage.log
cat logs/token_usage_converted.log
```

### Watch Live (Real-Time)
```bash
tail -f logs/server.log           # Follow server activity
tail -f logs/token_usage.log      # Follow token usage
tail -n 50 -f logs/server.log     # Last 50 lines + follow
```

### Page Through
```bash
less logs/server.log              # Scroll with space/b, quit with q
less +G logs/token_usage.log      # Start at end
```

### Filter/Search
```bash
grep -A 20 "REQUEST" logs/server.log              # Show requests
grep -A 20 "RESPONSE" logs/server.log             # Show responses
grep -A 10 "API_CALL" logs/token_usage.log        # Show API calls
grep -A 10 "SESSION_SUMMARY" logs/*.log           # Show summaries
grep -A 10 "field_matching" logs/token_usage.log  # Specific task
grep -c "API_CALL" logs/token_usage.log           # Count calls
```

### Show Sections
```bash
head -n 100 logs/server.log       # First 100 lines
tail -n 100 logs/server.log       # Last 100 lines
sed -n '200,300p' logs/server.log # Lines 200-300
```

### Token Usage Commands

**View Historical Token Logs:**
```bash
# View all converted token logs
cat logs/token_usage_converted.log

# View most recent session logs
ls -t logs/server_token_usage_*.log | head -1 | xargs cat

# View last 50 API calls
tail -n 200 logs/token_usage_converted.log
```

**Search by Task Type:**
```bash
# Field matching calls
grep -A 10 "task: field_matching" logs/token_usage*.log

# Company research calls
grep -A 10 "task: company_research" logs/token_usage*.log

# Cover letter generation calls
grep -A 10 "task: why_paragraph" logs/token_usage*.log

# Address lookup calls
grep -A 10 "task: address_lookup" logs/token_usage*.log
```

**Search by Model:**
```bash
# All Haiku calls
grep -B 2 -A 8 "model: haiku" logs/token_usage*.log

# All Sonnet calls
grep -B 2 -A 8 "model: sonnet" logs/token_usage*.log
```

**Cost Analysis:**
```bash
# Show all costs
grep '• cost:' logs/token_usage*.log

# Show only costs over $0.10
grep '• cost: \$0\.[1-9]' logs/token_usage*.log
grep '• cost: \$[1-9]' logs/token_usage*.log

# Sum total costs
grep '• cost:' logs/token_usage_converted.log | sed 's/.*\$\([0-9.]*\).*/\1/' | awk '{sum+=$1} END {printf "Total: $%.6f\n", sum}'

# Or use the helper script
./scripts/logs.sh costs
```

**Token Count Analysis:**
```bash
# Show all token counts
grep "total:" logs/token_usage*.log

# Show high token usage (>100k tokens)
grep -B 5 "total: [0-9][0-9][0-9],[0-9]" logs/token_usage*.log

# Count API calls by task
grep "task:" logs/token_usage*.log | sort | uniq -c
```

**Session Summaries:**
```bash
# View all session summaries
grep -A 8 "SESSION_SUMMARY" logs/token_usage*.log

# View most recent session summary
grep -A 8 "SESSION_SUMMARY" logs/token_usage_converted.log | tail -20

# View specific session by timestamp
grep -A 8 "exported_at: 2026-01-14" logs/token_usage*.log
```

### Summary Stats
```bash
grep -c 'REQUEST' logs/server.log                 # Count requests
grep -c 'RESPONSE' logs/server.log                # Count responses
grep -c 'API_CALL' logs/token_usage*.log          # Count all API calls
grep "cost:" logs/token_usage.log                 # Show all costs
grep "task:" logs/token_usage.log | sort | uniq  # List tasks
```

### Clear Logs
```bash
> logs/server.log                 # Clear server log
> logs/token_usage.log            # Clear token log
rm logs/*.log                     # Delete all logs (careful!)
```

## Grep Flags
- `-A N` - Show N lines After match
- `-B N` - Show N lines Before match
- `-C N` - Show N lines of Context (before + after)
- `-c` - Count matches
- `-i` - Ignore case
- `-v` - Invert match (show non-matching lines)
