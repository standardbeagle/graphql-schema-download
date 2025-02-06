# graphql-schema-download

A command line utility that downloads a GraphQL schema from a URL and writes it to stdout or a file.

## Installation

Install globally from npm:

```bash
npm install -g graphql-schema-download
```

Or use with npx:

```bash
npx graphql-schema-download https://api.example.com/graphql
```

## Usage

Basic usage (prints to stdout):
```bash
graphql-schema-download https://api.example.com/graphql
```

Save to file using output option:
```bash
graphql-schema-download https://api.example.com/graphql -o schema.graphql
```

### Options

- `-o, --output <file>` - Write the schema to a file instead of stdout
- `-H, --header <headers...>` - HTTP headers to include (format: "key=value")
- `-a, --auth-file <file>` - JSON file containing authorization headers
- `--auth-env-prefix <prefix>` - Environment variable prefix for auth headers (default: "GRAPHQL_HEADER_")
- `-V, --version` - Output the version number
- `-h, --help` - Display help for command

### Secure Authorization

The utility provides three ways to set authorization headers, in order of security preference:

1. Auth File (Most Secure):
```bash
# Create auth.json
echo '{"authorization": "Bearer your-token"}' > auth.json

# Use auth file
graphql-schema-download https://api.example.com/graphql -a auth.json
```

2. Environment Variables:
```bash
# Headers are read from env vars starting with GRAPHQL_HEADER_
export GRAPHQL_HEADER_AUTHORIZATION="Bearer your-token"
export GRAPHQL_HEADER_X_API_KEY="your-api-key"

# Use environment variables
graphql-schema-download https://api.example.com/graphql
```

3. Command Line (Least Secure, visible in shell history):
```bash
graphql-schema-download https://api.example.com/graphql -H "Authorization=Bearer token"
```

Custom environment variable prefix:
```bash
export MY_PREFIX_AUTHORIZATION="Bearer your-token"
graphql-schema-download https://api.example.com/graphql --auth-env-prefix MY_PREFIX_
```

### Auth File Format

Create a JSON file with your headers:

```json
{
  "authorization": "Bearer your-token",
  "x-api-key": "your-api-key",
  "custom-header": "custom-value"
}
```

### Security Features

The utility is configured for maximum compatibility with various GraphQL endpoints:

- Accepts self-signed certificates by default
- Allows all SSL/TLS certificates
- Handles HTTP and HTTPS protocols
- Supports up to 5 redirects
- 30-second timeout for requests
- Accepts compressed responses
- Secure handling of authorization headers

### Examples

Basic schema download:
```bash
graphql-schema-download https://api.example.com/graphql > schema.graphql
```

Using auth file and output file:
```bash
graphql-schema-download https://api.example.com/graphql -a auth.json -o schema.graphql
```

Using environment variables with custom prefix:
```bash
export API_AUTH="Bearer token"
graphql-schema-download https://api.example.com/graphql --auth-env-prefix API_ -o schema.graphql
```

### Using with Self-Signed Certificates

The utility is configured to work with self-signed certificates out of the box. No additional configuration is needed for:
- Development environments
- Internal company servers
- Test environments
- Local development setups

## Error Handling

The utility will:
- Exit with code 1 if there are any errors
- Display meaningful error messages for:
  - Network errors
  - Invalid URLs
  - GraphQL errors
  - HTTP errors
  - File system errors
  - Invalid auth file format

## Dependencies

- commander - Command-line interface
- node-fetch - HTTP client
- graphql - GraphQL schema utilities