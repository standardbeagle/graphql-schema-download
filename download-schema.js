#!/usr/bin/env node

const { program } = require('commander');
const fetch = require('node-fetch');
const { buildClientSchema, printSchema } = require('graphql');

const INTROSPECTION_QUERY = `query IntrospectionQuery {
  __schema {
    queryType {
      name
    }
    mutationType {
      name
    }
    subscriptionType {
      name
    }
    types {
      ...FullType
    }
    directives {
      name
      description
      locations
      args {
        ...InputValue
      }
    }
  }
}

fragment FullType on __Type {
  kind
  name
  description
  fields(includeDeprecated: true) {
    name
    description
    args {
      ...InputValue
    }
    type {
      ...TypeRef
    }
    isDeprecated
    deprecationReason
  }
  inputFields {
    ...InputValue
  }
  interfaces {
    ...TypeRef
  }
  enumValues(includeDeprecated: true) {
    name
    description
    isDeprecated
    deprecationReason
  }
  possibleTypes {
    ...TypeRef
  }
}

fragment InputValue on __InputValue {
  name
  description
  type {
    ...TypeRef
  }
  defaultValue
}

fragment TypeRef on __Type {
  kind
  name
  ofType {
    kind
    name
    ofType {
      kind
      name
      ofType {
        kind
        name
        ofType {
          kind
          name
          ofType {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
              }
            }
          }
        }
      }
    }
  }
}`;
const https = require('https');
const fs = require('fs');
const path = require('path');

// Set up command line interface
program
  .name('graphql-schema-dl')
  .description('Downloads a GraphQL schema from a given URL')
  .argument('<url>', 'URL of the GraphQL endpoint')
  .option('-H, --header <headers...>', 'HTTP headers to include (format: "key=value")')
  .option('-o, --output <file>', 'Output file (if not specified, prints to stdout)')
  .option('-a, --auth-file <file>', 'JSON file containing authorization headers')
  .option('--auth-env-prefix <prefix>', 'Environment variable prefix for auth headers (default: "GRAPHQL_HEADER_")')
  .option('--force-tls-validation', 'Force TLS certificate validation')
  .version('1.0.0');

program.parse();

const url = program.args[0];
const headerArgs = program.opts().header || [];
const outputFile = program.opts().output;
const authFile = program.opts().authFile;
const authEnvPrefix = program.opts().authEnvPrefix || 'GRAPHQL_HEADER_';
const forceTlsValidation = program.opts().forceTlsValidation || false;

// Get headers from environment variables
function getEnvHeaders(prefix) {
  const headers = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith(prefix) && typeof value === 'string') {
      const headerName = key.slice(prefix.length).split('_').map(
        (part, index) => index === 0 ? part.toLowerCase() : 
          part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
      ).join('-');
      headers[headerName] = value;
    }
  }
  return headers;
}

// Get headers from auth file
function getFileHeaders(filePath) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    let errorMsg = 'Warning: Failed to read auth file\n';
    if (error.code === 'ENOENT') {
      errorMsg += `File not found: ${filePath}\nPossible fixes:\n` +
        '- Check if the file path is correct\n' +
        '- Ensure the file exists in the specified location\n' +
        `- Use absolute path: ${path.resolve(process.cwd(), filePath)}`;
    } else if (error.code === 'EACCES') {
      errorMsg += 'Permission denied\nPossible fixes:\n' +
        '- Check file permissions\n' +
        `- Run: chmod 644 ${filePath}`;
    } else if (error instanceof SyntaxError) {
      errorMsg += 'Invalid JSON format\nPossible fixes:\n' +
        '- Verify the JSON syntax is correct\n' +
        '- Use a JSON validator to check the file\n' +
        '- Ensure the file contains a valid headers object';
    }
    console.error(errorMsg);
    return {};
  }
}

// Combine headers from all sources, with priority:
// 1. Auth file (most secure)
// 2. Environment variables
// 3. Command line arguments (least secure)
const headers = {
  'Content-Type': 'application/json',
  ...headerArgs.reduce((acc, header) => {
    const [key, ...valueParts] = header.split('=');
    const value = valueParts.join('='); // Handle values that might contain = signs
    if (key && value) {
      acc[key.trim()] = value.trim();
    } else {
      console.error(`Warning: Skipping invalid header format: ${header}`);
    }
    return acc;
  }, {}),
  ...getEnvHeaders(authEnvPrefix),
  ...(authFile ? getFileHeaders(authFile) : {})
};

async function makeSchemaRequest(url, headers, validateTLS = true) {
  const httpsAgent = validateTLS ? undefined : new https.Agent({
    rejectUnauthorized: false,
    requestCert: false,
    agent: false
  });

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query: INTROSPECTION_QUERY
      }),
      agent: url.startsWith('https:') ? httpsAgent : null,
      timeout: 30000,
      compress: true,
      follow: 5
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      switch (response.status) {
        case 401:
          errorMsg += '\nUnauthorized: Authentication failed\nPossible fixes:\n' +
            '- Check if authorization headers are correct\n' +
            '- Ensure your token has not expired\n' +
            `- Verify headers using: curl -v -X POST ${url} -H "Authorization: <your-token>"`;
          break;
        case 403:
          errorMsg += '\nForbidden: Insufficient permissions\nPossible fixes:\n' +
            '- Verify your token has the required scopes\n' +
            '- Check if your IP is allowlisted\n' +
            '- Contact the API administrator for access';
          break;
        case 404:
          errorMsg += '\nNot Found: GraphQL endpoint not found\nPossible fixes:\n' +
            '- Verify the URL is correct\n' +
            '- Check if /graphql needs to be appended to the URL\n' +
            '- Ensure the API server is running';
          break;
        case 500:
          errorMsg += '\nServer Error: API server error\nDiagnostic steps:\n' +
            '- Check server status/health endpoint\n' +
            '- View server logs if accessible\n' +
            '- Try again in a few minutes';
          break;
        default:
          errorMsg += '\nUnexpected response\nDiagnostic steps:\n' +
            '- Check network connectivity\n' +
            '- Verify the API is accepting POST requests\n' +
            `- Test endpoint: curl -X POST ${url}`;
      }
      throw new Error(errorMsg);
    }

    return response;
  } catch (error) {
    // Enhance network error messages with more context
    const baseError = error.message || 'Unknown error';
    const enhancedError = `Network request failed: ${baseError}\nPossible fixes:\n` +
      '- Check if the server is running and accessible\n' +
      '- Verify the URL is correct\n' +
      '- Ensure your network connection is stable\n' +
      '- Try using http:// instead of https:// for local development servers\n' +
      '- Check if the server requires specific headers or authentication';
    throw new Error(enhancedError);
  }
}

async function downloadSchema(url, headers) {
  try {
    let response;
    try {
      // First attempt with TLS validation
      response = await makeSchemaRequest(url, headers, true);
    } catch (error) {
      // If force validation is enabled, don't retry
      if (forceTlsValidation) {
        throw error;
      }
      
      // Check if the error is TLS-related or specifically about self-signed certificates
      if (error.message.includes('self-signed certificate') ||
          error.message.includes('self signed certificate') ||
          error.code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
          error.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
          error.code === 'CERT_UNTRUSTED' ||
          error.code === 'SELF_SIGNED_CERT_IN_CHAIN' ||
          error.code === 'ERR_TLS_CERT_ALTNAME_INVALID') {
        console.error('Warning: Self-signed or invalid TLS certificate detected.\nRetrying request with certificate validation disabled...');
        // Retry without TLS validation
        response = await makeSchemaRequest(url, headers, false);
      } else {
        // If it's not a TLS error, rethrow
        throw error;
      }
    }

    const result = await response.json();

    if (result.errors) {
      const errors = result.errors;
      let errorMsg = 'GraphQL Error:\n';
      
      errors.forEach(error => {
        errorMsg += `\n${error.message}\n`;
        
        // Add specific suggestions based on common error patterns
        if (error.message.includes('introspection')) {
          errorMsg += '\nPossible causes:\n' +
            '- Introspection may be disabled on this server\n' +
            '- The server may require specific permissions for introspection\n' +
            'Suggested fixes:\n' +
            '- Contact API administrator to enable introspection\n' +
            '- Add required authorization headers\n' +
            '- Use --header "X-Introspection-Auth=<token>" if required';
        } else if (error.message.includes('permission') || error.message.includes('authorized')) {
          errorMsg += '\nPossible fixes:\n' +
            '- Check if your token has introspection permissions\n' +
            '- Verify you are using the correct authentication method\n' +
            '- Request elevated permissions from API administrator';
        } else if (error.message.includes('timeout')) {
          errorMsg += '\nDiagnostic steps:\n' +
            '- Check network connectivity\n' +
            '- Try increasing timeout using HTTP_TIMEOUT environment variable\n' +
            '- Contact API administrator if issues persist';
        }
      });
      
      throw new Error(errorMsg);
    }

    // Build and print the schema
    const schema = buildClientSchema(result.data);
    const schemaString = printSchema(schema);

    if (outputFile) {
      try {
        fs.writeFileSync(outputFile, schemaString);
        console.error(`Schema written to ${outputFile}`);
      } catch (err) {
        let errorMsg = `Failed to write schema to ${outputFile}\n`;
        if (err.code === 'ENOENT') {
          errorMsg += '\nDirectory does not exist\nPossible fixes:\n' +
            `- Create directory: mkdir -p ${path.dirname(outputFile)}\n` +
            '- Specify a different output location\n' +
            '- Use current directory: ./' + path.basename(outputFile);
        } else if (err.code === 'EACCES') {
          errorMsg += '\nPermission denied\nPossible fixes:\n' +
            `- Check file permissions: ls -l ${outputFile}\n` +
            `- Change permissions: chmod 644 ${outputFile}\n` +
            '- Try a different directory with write permissions';
        } else if (err.code === 'EISDIR') {
          errorMsg += '\nOutput path is a directory\nPossible fixes:\n' +
            '- Specify a file path instead of directory\n' +
            `- Use: ${path.join(outputFile, 'schema.graphql')}`;
        } else {
          errorMsg += '\nUnexpected error\nDiagnostic steps:\n' +
            '- Check disk space: df -h\n' +
            '- Verify write permissions in parent directory\n' +
            '- Try using an absolute path';
        }
        throw new Error(errorMsg);
      }
    } else {
      console.log(schemaString);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Execute the download
downloadSchema(url, headers);