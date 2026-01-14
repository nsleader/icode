import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { XcodeProject } from '../utils/xcode';
import { Simulator, Device, getSimulators, getDevices } from '../utils/simulator';

/**
 * Target can be either a simulator or a physical device.
 */
export interface BuildTarget {
    type: 'simulator' | 'device';
    udid: string;
    name: string;
    runtime?: string;
}

/**
 * Build configuration name (e.g., 'Debug', 'Release', or custom configurations).
 */
export type BuildConfiguration = string;

/**
 * Current project state stored in workspace context.
 */
interface StoredState {
    projectPath?: string;
    schemeName?: string;
    targetUdid?: string;
    targetType?: 'simulator' | 'device';
    targetName?: string;
    targetRuntime?: string;
    configuration?: BuildConfiguration;
}

/**
 * Manages the current project state (selected scheme, simulator, etc.)
 * State is persisted in workspace storage.
 */
export class ProjectState {
    private static instance: ProjectState;
    private context: vscode.ExtensionContext;
    
    // Current in-memory state
    private _project?: XcodeProject;
    private _scheme?: string;
    private _target?: BuildTarget;
    private _configuration: string = 'Debug';
    
    // Event emitters for state changes
    private _onDidChangeScheme = new vscode.EventEmitter<string | undefined>();
    private _onDidChangeTarget = new vscode.EventEmitter<BuildTarget | undefined>();
    private _onDidChangeProject = new vscode.EventEmitter<XcodeProject | undefined>();
    private _onDidChangeConfiguration = new vscode.EventEmitter<string>();
    
    readonly onDidChangeScheme = this._onDidChangeScheme.event;
    readonly onDidChangeTarget = this._onDidChangeTarget.event;
    readonly onDidChangeProject = this._onDidChangeProject.event;
    readonly onDidChangeConfiguration = this._onDidChangeConfiguration.event;

    private constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadState();
    }

    static initialize(context: vscode.ExtensionContext): ProjectState {
        if (!ProjectState.instance) {
            ProjectState.instance = new ProjectState(context);
        }
        return ProjectState.instance;
    }

    static getInstance(): ProjectState {
        if (!ProjectState.instance) {
            throw new Error('ProjectState not initialized. Call initialize() first.');
        }
        return ProjectState.instance;
    }

    // Getters
    get project(): XcodeProject | undefined {
        return this._project;
    }

    get scheme(): string | undefined {
        return this._scheme;
    }

    get target(): BuildTarget | undefined {
        return this._target;
    }

    get configuration(): string {
        return this._configuration;
    }

    // Setters with persistence
    setProject(project: XcodeProject | undefined): void {
        this._project = project;
        this.saveState();
        this._onDidChangeProject.fire(project);
    }

    setScheme(scheme: string | undefined): void {
        this._scheme = scheme;
        this.saveState();
        this._onDidChangeScheme.fire(scheme);
    }

    setTarget(target: BuildTarget | undefined): void {
        this._target = target;
        this.saveState();
        this._onDidChangeTarget.fire(target);
    }

    setConfiguration(configuration: string): void {
        this._configuration = configuration;
        this.saveState();
        this._onDidChangeConfiguration.fire(configuration);
    }

    setTargetFromSimulator(simulator: Simulator): void {
        this.setTarget({
            type: 'simulator',
            udid: simulator.udid,
            name: simulator.name,
            runtime: simulator.runtime,
        });
    }

    setTargetFromDevice(device: Device): void {
        this.setTarget({
            type: 'device',
            udid: device.udid,
            name: device.name,
        });
    }

    /**
     * Restores target name from saved UDID by loading simulators/devices.
     * Should be called after extension activation to update "Unknown" names.
     */
    async restoreTargetName(): Promise<void> {
        if (!this._target || this._target.name !== 'Unknown') {
            return; // No target or already has a name
        }

        try {
            if (this._target.type === 'simulator') {
                const simulators = await getSimulators();
                const simulator = simulators.find(s => s.udid === this._target!.udid);
                if (simulator) {
                    this.setTarget({
                        type: 'simulator',
                        udid: simulator.udid,
                        name: simulator.name,
                        runtime: simulator.runtime,
                    });
                }
            } else if (this._target.type === 'device') {
                const devices = await getDevices();
                const device = devices.find(d => d.udid === this._target!.udid);
                if (device) {
                    this.setTarget({
                        type: 'device',
                        udid: device.udid,
                        name: device.name,
                    });
                }
            }
        } catch (error) {
            console.error('Failed to restore target name:', error);
        }
    }

    // Persistence
    private loadState(): void {
        const stored = this.context.workspaceState.get<StoredState>('icode.state');
        if (stored) {
            if (stored.projectPath) {
                // We'll restore the full project object when schemes are loaded
                this._project = {
                    path: stored.projectPath,
                    name: stored.projectPath.split('/').pop()?.replace(/\.(xcworkspace|xcodeproj)$/, '') || '',
                    isWorkspace: stored.projectPath.endsWith('.xcworkspace'),
                };
            }
            this._scheme = stored.schemeName;
            if (stored.targetUdid && stored.targetType) {
                this._target = {
                    type: stored.targetType,
                    udid: stored.targetUdid,
                    name: stored.targetName || 'Unknown', // Will be updated when simulators are loaded
                    runtime: stored.targetRuntime,
                };
            }
            this._configuration = stored.configuration || 'Debug';
        }
    }

    private saveState(): void {
        const state: StoredState = {
            projectPath: this._project?.path,
            schemeName: this._scheme,
            targetUdid: this._target?.udid,
            targetType: this._target?.type,
            targetName: this._target?.name,
            targetRuntime: this._target?.runtime,
            configuration: this._configuration,
        };
        this.context.workspaceState.update('icode.state', state);
        
        // Also export state to file for MCP server access
        this.exportStateToFile();
    }

    /**
     * Export state to a JSON file for MCP server access
     */
    private exportStateToFile(): void {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                return; // No workspace open
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const icodeDir = path.join(workspaceRoot, '.icode');
            const stateFile = path.join(icodeDir, 'state.json');

            // Create .icode directory if it doesn't exist
            if (!fs.existsSync(icodeDir)) {
                fs.mkdirSync(icodeDir, { recursive: true });
            }

            // Export current state
            const exportState = {
                project: this._project ? {
                    path: this._project.path,
                    name: this._project.name,
                    isWorkspace: this._project.isWorkspace
                } : null,
                scheme: this._scheme || null,
                target: this._target ? {
                    type: this._target.type,
                    udid: this._target.udid,
                    name: this._target.name,
                    runtime: this._target.runtime
                } : null,
                configuration: this._configuration,
                lastUpdated: new Date().toISOString()
            };

            fs.writeFileSync(stateFile, JSON.stringify(exportState, null, 2), 'utf8');
        } catch (error) {
            console.error('Failed to export state to file:', error);
            // Don't throw - this is a non-critical operation
        }
    }

    dispose(): void {
        this._onDidChangeScheme.dispose();
        this._onDidChangeTarget.dispose();
        this._onDidChangeProject.dispose();
        this._onDidChangeConfiguration.dispose();
    }
}
