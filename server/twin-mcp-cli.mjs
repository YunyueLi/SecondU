#!/usr/bin/env node
import {serveStdio} from '@modelcontextprotocol/server/stdio';
import {createTwinMcpServer} from './twin-mcp.mjs';
import {createTwinDataSource,TwinMcpError} from './twin-mcp-data.mjs';

const args=process.argv.slice(2);
if(args.length!==2||args[0]!=='--config'){
  process.stderr.write('Usage: node server/twin-mcp-cli.mjs --config /absolute/path/to/client-grant.json\n');process.exitCode=2;
}else{
  try{
    createTwinDataSource(args[1])();
    const handle=serveStdio(()=>createTwinMcpServer(args[1]),{onerror:()=>process.stderr.write('SecondU MCP protocol error.\n')});
    const stop=()=>{void handle.close().finally(()=>{process.exitCode=0;});};
    process.once('SIGTERM',stop);process.once('SIGINT',stop);
  }catch(error){process.stderr.write(`SecondU MCP unavailable: ${error instanceof TwinMcpError?error.code:'startup_failed'}.\n`);process.exitCode=1;}
}
