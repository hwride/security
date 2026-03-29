import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);

export type OpenSSLResult = {
  command: string;
  args: string[];
  stdout: string;
  stderr: string;
  /** This is just for nice logging. */
  commandText: string;
};

export async function openssl(
  command: string,
  args: string[],
): Promise<OpenSSLResult> {
  const fullArgs = [command, ...args];
  const { stdout, stderr } = await execFile("openssl", fullArgs);

  return {
    command,
    args,
    stdout,
    stderr,
    commandText: ["openssl", ...fullArgs].join(" "),
  };
}
