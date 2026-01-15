#!/bin/bash
# Log viewer helper - quick access to log files

LOGS_DIR="$(dirname "$0")/../logs"
cd "$LOGS_DIR" || exit 1

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

show_help() {
    echo "Usage: logs.sh [command]"
    echo ""
    echo "Commands:"
    echo "  (none)     List all logs with stats"
    echo "  server     Tail server.log"
    echo "  tokens     Tail token_usage.log"
    echo "  watch      Watch both logs (split view)"
    echo "  converted  View historical token logs"
    echo "  summary    Show token usage summary"
    echo "  costs      Show all API costs"
    echo "  tasks      Show breakdown by task type"
    echo "  clear      Clear active logs (server.log, token_usage.log)"
    echo "  help       Show this help"
    echo ""
    echo "Examples:"
    echo "  ./scripts/logs.sh          # List logs"
    echo "  ./scripts/logs.sh server   # Follow server log"
    echo "  ./scripts/logs.sh tokens   # Follow token log"
    echo "  ./scripts/logs.sh summary  # Show token usage stats"
    echo "  ./scripts/logs.sh costs    # View all costs"
}

list_logs() {
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}📋 Available Logs${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    printf "\n"

    for log in *.log; do
        if [ -f "$log" ]; then
            size=$(du -h "$log" | cut -f1)
            lines=$(wc -l < "$log" | tr -d ' ')

            # Show different icon based on log type
            if [[ $log == *"server"* ]]; then
                icon="🌐"
            elif [[ $log == *"token"* ]]; then
                icon="🎟️"
            else
                icon="📄"
            fi

            printf "${GREEN}${icon} %-40s${NC} %8s  %10s lines\n" "$log" "$size" "$lines"

            # Show last entry timestamp if possible
            last_time=$(grep -E "⏱.*│" "$log" | tail -1 | sed -n 's/.*⏱  \([0-9:]*\).*/\1/p')
            if [ -n "$last_time" ]; then
                printf "   ${YELLOW}Last entry: %s${NC}\n" "$last_time"
            fi
            printf "\n"
        fi
    done

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo "Quick commands:"
    echo "  cat logs/server.log                  # View server log"
    echo "  tail -f logs/token_usage.log         # Follow token log"
    echo "  grep -A 10 'REQUEST' logs/server.log # Search requests"
    echo ""
    echo "Run './scripts/logs.sh help' for more options"
    echo "See logs/README.md for full reference"
}

case "${1:-list}" in
    list)
        list_logs
        ;;
    server)
        echo "Following server.log (Ctrl+C to exit)..."
        tail -f server.log
        ;;
    tokens)
        echo "Following token_usage.log (Ctrl+C to exit)..."
        tail -f token_usage.log
        ;;
    converted)
        echo "Viewing historical token logs..."
        if [ -f "token_usage_converted.log" ]; then
            less +G token_usage_converted.log
        else
            echo "No converted logs found"
        fi
        ;;
    summary)
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}🎟️  Token Usage Summary${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""

        # Show session summaries
        echo -e "${GREEN}Session Summaries:${NC}"
        /usr/bin/grep -A 7 "SESSION_SUMMARY" *.log 2>/dev/null | /usr/bin/grep "SESSION_SUMMARY\|call_count\|total_tokens\|total_cost" | tail -20
        echo ""

        # Count API calls
        total_calls=$(grep -c "API_CALL" *.log 2>/dev/null | awk -F: '{sum+=$2} END {print sum}')
        echo -e "${GREEN}Total API Calls:${NC} $total_calls"
        echo ""

        # Show total cost
        echo -e "${GREEN}Total Costs:${NC}"
        grep '• cost:' *.log 2>/dev/null | sed 's/.*\$\([0-9.]*\).*/\1/' | awk '{sum+=$1} END {printf "  All logs: $%.6f\n", sum}'
        echo ""
        ;;
    costs)
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}💰 API Costs${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""

        if [ -f "token_usage_converted.log" ]; then
            echo -e "${GREEN}Recent API Call Costs:${NC}"
            /usr/bin/grep -B 4 '• cost:' token_usage_converted.log | /usr/bin/grep '• task:\|• model:\|• cost:' | tail -30
            echo ""
            echo -e "${GREEN}Total Cost:${NC}"
            /usr/bin/grep '• cost:' token_usage_converted.log | sed 's/.*\$\([0-9.]*\).*/\1/' | awk '{sum+=$1} END {printf "  $%.6f\n", sum}'
        else
            echo "No cost data found"
        fi
        echo ""
        ;;
    tasks)
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo -e "${BLUE}📊 Tasks Breakdown${NC}"
        echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
        echo ""

        if [ -f "token_usage_converted.log" ]; then
            echo -e "${GREEN}API Calls by Task:${NC}"
            grep "• task:" token_usage_converted.log | awk '{print $3}' | sort | uniq -c | sort -rn
            echo ""

            echo -e "${GREEN}API Calls by Model:${NC}"
            grep "• model:" token_usage_converted.log | awk '{print $3}' | sort | uniq -c | sort -rn
            echo ""

            echo -e "${GREEN}Most Expensive Calls (Top 10):${NC}"
            /usr/bin/grep -B 5 '• cost:' token_usage_converted.log | /usr/bin/grep '• task:\|• cost:' | paste - - | sed 's/• task: \([^[:space:]]*\).*• cost: \$\([0-9.]*\).*/  \$\2  \1/' | sort -rn | head -10
        else
            echo "No task data found"
        fi
        echo ""
        ;;
    watch)
        if command -v tmux &> /dev/null; then
            tmux new-session -d -s logs "tail -f $(pwd)/server.log"
            tmux split-window -h "tail -f $(pwd)/token_usage.log"
            tmux attach-session -t logs
        else
            echo "tmux not installed. Opening server log..."
            tail -f server.log
        fi
        ;;
    clear)
        read -p "Clear server.log and token_usage.log? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            > server.log
            > token_usage.log
            echo "✓ Logs cleared"
        else
            echo "Cancelled"
        fi
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo "Unknown command: $1"
        echo "Run './scripts/logs.sh help' for usage"
        exit 1
        ;;
esac
