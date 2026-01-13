import * as vscode from 'vscode';
import { XcodeProject } from '../utils/xcode';
import { Simulator, Device } from '../utils/simulator';

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
                    name: 'Unknown', // Will be updated when simulators are loaded
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
            configuration: this._configuration,
        };
        this.context.workspaceState.update('icode.state', state);
    }

    dispose(): void {
        this._onDidChangeScheme.dispose();
        this._onDidChangeTarget.dispose();
        this._onDidChangeProject.dispose();
        this._onDidChangeConfiguration.dispose();
    }
}
