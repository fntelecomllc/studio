# Integration Testing with Production Data

This directory contains sample data and resources for conducting comprehensive integration tests with production-like data.

## Overview

The integration testing framework is designed to validate the end-to-end behavior of the DomainFlow system outside of controlled unit testing environments. It uses real or production-like data to ensure that all components interact correctly in real-world scenarios.

## Files

- `prod_domains_sample.txt`: A sample list of production-like domains used for integration testing.

## Integration Test Script

The main integration test script is located at `../scripts/test_integration_with_production_data.sh`. This script:

1. Uses real production personas and keyword sets (or fetches them if not provided)
2. Creates a domain generation campaign with production-like parameters
3. Creates a DNS validation campaign using the production DNS persona
4. Creates an HTTP validation campaign using the production HTTP persona and keyword set
5. Creates a keyword validation campaign using the production HTTP persona and keyword set
6. Monitors and documents all interactions between components
7. Verifies data consistency between different stages
8. Captures any unexpected behaviors
9. Generates a comprehensive HTML report

## Running the Integration Test

To run the integration test:

```bash
cd backend
./scripts/test_integration_with_production_data.sh
```

### Prerequisites

- The DomainFlow server must be running (use `./scripts/run_enhanced.sh`)
- The `.env` file must contain a valid API key
- The `jq` executable must be available (included in the scripts directory)

### Configuration

You can configure the test by editing the following variables at the top of the script:

- `PROD_DNS_PERSONA_ID`: ID of a production DNS persona (optional, will be fetched if not provided)
- `PROD_HTTP_PERSONA_ID`: ID of a production HTTP persona (optional, will be fetched if not provided)
- `PROD_KEYWORD_SET_ID`: ID of a production keyword set (optional, will be fetched if not provided)
- `DETAILED_LOGGING`: Set to true for more detailed logs
- `CAPTURE_NETWORK_TRAFFIC`: Set to true to capture network traffic
- `VERIFY_DATA_INTEGRITY`: Set to true to verify data integrity
- `MONITOR_PERFORMANCE`: Set to true to monitor performance
- `TRACK_RESOURCE_USAGE`: Set to true to track resource usage

## Output

The integration test generates the following output:

- **Log File**: Detailed log of all operations
- **Metrics File**: CSV file with performance metrics
- **Interaction Log**: Log of all component interactions
- **Data Flow Log**: Log of all data flows between components
- **HTML Report**: Comprehensive report with all test results

These files are stored in the `integration_test_logs` and `integration_test_reports` directories.