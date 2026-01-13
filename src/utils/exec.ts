import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Execute a shell command and return the result.
 */
export async function runCommand(command: string, cwd?: string): Promise<string> {
    try {
        const { stdout } = await execAsync(command, { 
            cwd, 
            maxBuffer: 10 * 1024 * 1024 // 10MB buffer for large outputs
        });
        return stdout.trim();
    } catch (error) {
        const execError = error as { stderr?: string; message?: string };
        throw new Error(execError.stderr || execError.message || 'Command failed');
    }
}
