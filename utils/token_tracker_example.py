"""Example usage of TokenTracker."""

from token_tracker import TokenTracker, get_tracker, track_api_call


def example_basic_usage():
    """Basic usage example."""
    tracker = TokenTracker()

    # Log some API calls
    tracker.log_call(
        task_name="field_matching",
        model="claude-3-haiku-20240307",
        input_tokens=1500,
        output_tokens=300,
        metadata={"form_fields": 12}
    )

    tracker.log_call(
        task_name="cover_letter",
        model="claude-3-5-sonnet-20241022",
        input_tokens=3000,
        output_tokens=800,
        metadata={"company": "Anthropic"}
    )

    tracker.log_call(
        task_name="field_matching",
        model="claude-3-haiku-20240307",
        input_tokens=1200,
        output_tokens=250
    )

    # Print summary
    tracker.print_summary()

    # Get session total
    total = tracker.get_session_total()
    print(f"Total cost: ${total['total_cost']:.4f}")

    # Export to JSON
    tracker.export_log("logs/token_export.json")


def example_global_tracker():
    """Using the global tracker instance."""
    tracker = get_tracker()

    tracker.log_call("company_research", "sonnet", 2000, 500)
    tracker.log_call("freeform_answer", "haiku", 800, 200)

    tracker.print_summary()


def example_with_api_response():
    """Using track_api_call helper with Anthropic API response."""
    # Simulated Anthropic response object
    class MockUsage:
        def __init__(self):
            self.input_tokens = 1500
            self.output_tokens = 400

    class MockResponse:
        def __init__(self):
            self.model = "claude-3-haiku-20240307"
            self.usage = MockUsage()

    tracker = TokenTracker()
    response = MockResponse()

    # Use helper function to automatically extract and log
    track_api_call(tracker, "field_matching", response.model, response)

    tracker.print_summary()


if __name__ == "__main__":
    print("=== Basic Usage ===")
    example_basic_usage()

    print("\n=== Global Tracker ===")
    example_global_tracker()

    print("\n=== API Response Helper ===")
    example_with_api_response()
