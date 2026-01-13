import { runCommand } from './exec';

export interface Simulator {
    udid: string;
    name: string;
    state: 'Booted' | 'Shutdown' | string;
    isAvailable: boolean;
    deviceTypeIdentifier: string;
    runtime: string;
}

export interface Device {
    udid: string;
    name: string;
    connectionType: string;
}

export interface SimulatorRuntime {
    name: string;
    identifier: string;
    version: string;
}

interface SimctlDevice {
    udid: string;
    name: string;
    state: string;
    isAvailable: boolean;
    deviceTypeIdentifier: string;
}

interface SimctlOutput {
    devices: Record<string, SimctlDevice[]>;
}

/**
 * Get list of available iOS simulators.
 */
export async function getSimulators(): Promise<Simulator[]> {
    try {
        const output = await runCommand('xcrun simctl list devices -j');
        const data: SimctlOutput = JSON.parse(output);
        
        const simulators: Simulator[] = [];
        
        for (const [runtime, devices] of Object.entries(data.devices)) {
            // Filter only iOS simulators
            if (!runtime.includes('iOS')) {
                continue;
            }
            
            // Extract iOS version from runtime identifier
            const versionMatch = runtime.match(/iOS[- ](\d+[.-]\d+)/i);
            const version = versionMatch ? versionMatch[1].replace('-', '.') : 'Unknown';
            
            for (const device of devices) {
                if (device.isAvailable) {
                    simulators.push({
                        udid: device.udid,
                        name: device.name,
                        state: device.state,
                        isAvailable: device.isAvailable,
                        deviceTypeIdentifier: device.deviceTypeIdentifier,
                        runtime: `iOS ${version}`,
                    });
                }
            }
        }
        
        // Sort: booted first, then by name
        return simulators.sort((a, b) => {
            if (a.state === 'Booted' && b.state !== 'Booted') return -1;
            if (a.state !== 'Booted' && b.state === 'Booted') return 1;
            return a.name.localeCompare(b.name);
        });
    } catch (error) {
        console.error('Failed to get simulators:', error);
        return [];
    }
}

/**
 * Get list of connected physical devices.
 */
export async function getDevices(): Promise<Device[]> {
    try {
        const output = await runCommand('xcrun xctrace list devices');
        const lines = output.split('\n');
        
        const devices: Device[] = [];
        let inDevicesSection = false;
        
        for (const line of lines) {
            if (line.includes('== Devices ==')) {
                inDevicesSection = true;
                continue;
            }
            if (line.includes('== Simulators ==')) {
                break;
            }
            
            if (inDevicesSection && line.trim()) {
                // Parse line like: "iPhone (15.0) (00008030-001234567890002E)"
                const match = line.match(/^(.+?)\s+\(([^)]+)\)\s*$/);
                if (match) {
                    devices.push({
                        udid: match[2],
                        name: match[1].trim(),
                        connectionType: 'USB',
                    });
                }
            }
        }
        
        return devices;
    } catch (error) {
        console.error('Failed to get devices:', error);
        return [];
    }
}

/**
 * Boot a simulator.
 */
export async function bootSimulator(udid: string): Promise<void> {
    await runCommand(`xcrun simctl boot "${udid}"`);
}

/**
 * Open Simulator.app
 */
export async function openSimulatorApp(): Promise<void> {
    await runCommand('open -a Simulator');
}

/**
 * Install app on simulator.
 */
export async function installApp(simulatorUdid: string, appPath: string): Promise<void> {
    await runCommand(`xcrun simctl install "${simulatorUdid}" "${appPath}"`);
}

/**
 * Launch app on simulator.
 */
export async function launchApp(simulatorUdid: string, bundleId: string): Promise<void> {
    await runCommand(`xcrun simctl launch "${simulatorUdid}" "${bundleId}"`);
}

/**
 * Get bundle identifier from app.
 * Tries multiple methods to find the bundle ID.
 */
export async function getBundleId(appPath: string): Promise<string | undefined> {
    // Method 1: Try using defaults read (most reliable)
    try {
        const output = await runCommand(`defaults read "${appPath}/Info" CFBundleIdentifier`);
        const bundleId = output.trim();
        if (bundleId) {
            return bundleId;
        }
    } catch {
        // Try next method
    }

    // Method 2: Try PlistBuddy with Info.plist
    try {
        const output = await runCommand(`/usr/libexec/PlistBuddy -c "Print :CFBundleIdentifier" "${appPath}/Info.plist"`);
        const bundleId = output.trim();
        if (bundleId) {
            return bundleId;
        }
    } catch {
        // Try next method
    }

    // Method 3: Try plutil to convert and read
    try {
        const output = await runCommand(`plutil -extract CFBundleIdentifier raw "${appPath}/Info.plist"`);
        const bundleId = output.trim();
        if (bundleId) {
            return bundleId;
        }
    } catch {
        // All methods failed
    }

    return undefined;
}
