import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
    User,
    FolderOpen,
    Cpu,
    FileText,
    Mail,
    TerminalSquare,
    Trash2,
    Headphones,
    PenTool,
    HardDrive,
    Calculator as CalcIcon,
    StickyNote,
    Bomb,
    Image as ImageIcon,
    Monitor,
    ScrollText,
} from 'lucide-react';
import type { WindowPayload } from '@/store/useSystemStore';

/** Every app window body takes the same two props. See `components/apps/CLAUDE.md`. */
export type AppComponent = ComponentType<{ windowId?: string; payload?: WindowPayload }>;

/**
 * Where an app can be launched from. The Start menu, the desktop and the Run dialog all read
 * this rather than keeping their own hand-written lists, so a new app appears in the right places
 * by declaring where it belongs.
 */
export type AppSurface = 'desktop' | 'start' | 'run';

export interface AppConfig {
    id: string;
    title: string;
    /** Fallback glyph, used when `iconAsset` is absent or fails to load. */
    icon: LucideIcon;
    width?: number;
    height?: number;
    canMaximize?: boolean;
    canResize?: boolean;
    iconAsset?: string;
    /** Groups the app in the Start menu's All Programs flyout. */
    category: 'portfolio' | 'accessory' | 'system' | 'game';
    surfaces: AppSurface[];
    /**
     * The window body, loaded on demand.
     *
     * This is what makes the registry the *single* place an app is declared. It used to live in a
     * second table inside `components/os/Window.tsx`, so forgetting one of the two files failed
     * silently at runtime with "App not found". It also means the fifteen app bundles are no
     * longer all pulled into the first paint.
     */
    load: () => Promise<{ default: AppComponent }>;
    /** Command names the Run dialog accepts, beyond the id itself. XP names where they exist. */
    aliases?: string[];
}

export const APPS: Record<string, AppConfig> = {
    about: {
        id: 'about',
        title: 'About Me',
        icon: User,
        iconAsset: '/icons/User Personalization.ico',
        width: 720,
        height: 540,
        canMaximize: true,
        canResize: true,
        category: 'portfolio',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/AboutApp'),
    },
    projects: {
        id: 'projects',
        title: 'My Projects',
        icon: FolderOpen,
        iconAsset: '/icons/Folder Open.ico',
        width: 820,
        height: 600,
        canMaximize: true,
        canResize: true,
        category: 'portfolio',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/ProjectsApp'),
    },
    skills: {
        id: 'skills',
        title: 'Skills & Tech',
        icon: Cpu,
        iconAsset: '/icons/Skills.ico',
        width: 760,
        height: 560,
        canMaximize: true,
        canResize: true,
        category: 'portfolio',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/SkillsApp'),
    },
    resume: {
        id: 'resume',
        title: 'Resume.pdf',
        icon: FileText,
        iconAsset: '/icons/List File.ico',
        width: 560,
        height: 700,
        canMaximize: true,
        canResize: true,
        category: 'portfolio',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/ResumeApp'),
    },
    contact: {
        id: 'contact',
        title: 'Contact Me',
        icon: Mail,
        iconAsset: '/icons/Phone.ico',
        width: 520,
        height: 440,
        canMaximize: false,
        canResize: true,
        category: 'portfolio',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/ContactApp'),
    },
    terminal: {
        id: 'terminal',
        title: 'Command Prompt',
        icon: TerminalSquare,
        iconAsset: '/icons/278.ico',
        width: 640,
        height: 420,
        canMaximize: true,
        canResize: true,
        category: 'accessory',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['cmd', 'cmd.exe', 'command'],
        load: () => import('@/components/apps/TerminalApp'),
    },
    trash: {
        id: 'trash',
        title: 'Recycle Bin',
        icon: Trash2,
        iconAsset: '/icons/trash.png',
        width: 640,
        height: 460,
        canMaximize: true,
        canResize: true,
        category: 'system',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/RecycleBinApp'),
    },
    music: {
        id: 'music',
        title: 'Windows Media Player',
        icon: Headphones,
        iconAsset: '/icons/media-player.png',
        width: 380,
        height: 480,
        canMaximize: false,
        canResize: false,
        category: 'accessory',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['wmplayer', 'mplayer'],
        load: () => import('@/components/apps/MusicPlayerApp'),
    },
    paint: {
        id: 'paint',
        title: 'Paint',
        icon: PenTool,
        iconAsset: '/icons/paint.png',
        width: 840,
        height: 600,
        canMaximize: true,
        canResize: true,
        category: 'accessory',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['mspaint'],
        load: () => import('@/components/apps/PaintApp'),
    },
    mycomputer: {
        id: 'mycomputer',
        title: 'My Computer',
        icon: HardDrive,
        iconAsset: '/icons/My Computer.ico',
        width: 720,
        height: 500,
        canMaximize: true,
        canResize: true,
        category: 'system',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/MyComputerApp'),
    },
    notepad: {
        id: 'notepad',
        title: 'Untitled - Notepad',
        icon: StickyNote,
        iconAsset: '/icons/List File.ico',
        width: 600,
        height: 460,
        canMaximize: true,
        canResize: true,
        category: 'accessory',
        surfaces: ['desktop', 'start', 'run'],
        load: () => import('@/components/apps/NotepadApp'),
    },
    calculator: {
        id: 'calculator',
        title: 'Calculator',
        icon: CalcIcon,
        iconAsset: '/icons/Display.ico',
        width: 240,
        height: 340,
        canMaximize: false,
        canResize: false,
        category: 'accessory',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['calc'],
        load: () => import('@/components/apps/CalculatorApp'),
    },
    minesweeper: {
        id: 'minesweeper',
        title: 'Minesweeper',
        icon: Bomb,
        iconAsset: '/icons/Minesweeper.ico',
        width: 340,
        height: 420,
        canMaximize: false,
        canResize: false,
        category: 'game',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['winmine'],
        load: () => import('@/components/apps/MinesweeperApp'),
    },
    settings: {
        id: 'settings',
        title: 'Display Properties',
        icon: Monitor,
        iconAsset: '/icons/control-panel.png',
        width: 520,
        height: 540,
        canMaximize: false,
        canResize: false,
        category: 'system',
        surfaces: ['start', 'run'],
        aliases: ['control', 'desk.cpl'],
        load: () => import('@/components/apps/SettingsApp'),
    },
    imageviewer: {
        id: 'imageviewer',
        title: 'Windows Picture and Fax Viewer',
        icon: ImageIcon,
        iconAsset: '/icons/Display.ico',
        width: 640,
        height: 520,
        canMaximize: true,
        canResize: true,
        category: 'accessory',
        surfaces: ['start', 'run'],
        load: () => import('@/components/apps/ImageViewerApp'),
    },
    explorer: {
        id: 'explorer',
        title: 'Windows Explorer',
        icon: FolderOpen,
        iconAsset: '/icons/Folder Closed.ico',
        width: 760,
        height: 520,
        canMaximize: true,
        canResize: true,
        category: 'system',
        surfaces: ['desktop', 'start', 'run'],
        aliases: ['explorer.exe', 'files'],
        load: () => import('@/components/apps/ExplorerApp'),
    },
    taskmgr: {
        id: 'taskmgr',
        title: 'Windows Task Manager',
        icon: Cpu,
        iconAsset: '/icons/control-panel.png',
        width: 460,
        height: 520,
        canMaximize: true,
        canResize: true,
        category: 'system',
        surfaces: ['start', 'run'],
        aliases: ['taskmgr.exe', 'taskman'],
        load: () => import('@/components/apps/TaskManagerApp'),
    },
    eventvwr: {
        id: 'eventvwr',
        title: 'Event Viewer',
        icon: ScrollText,
        // XP kept Event Viewer under Control Panel > Administrative Tools.
        iconAsset: '/icons/control-panel.png',
        width: 720,
        height: 480,
        canMaximize: true,
        canResize: true,
        category: 'system',
        surfaces: ['start', 'run'],
        aliases: ['eventvwr.msc', 'events', 'eventlog'],
        load: () => import('@/components/apps/EventViewerApp'),
    },
};

/** Desktop icon order. Derived from the registry so an app cannot be listed here and nowhere else. */
export const DESKTOP_ICONS: string[] = [
    'mycomputer',
    'explorer',
    'about',
    'projects',
    'skills',
    'resume',
    'contact',
    'music',
    'paint',
    'notepad',
    'calculator',
    'minesweeper',
    'terminal',
    'trash',
].filter((id) => APPS[id]?.surfaces.includes('desktop'));

/** Only ids actually present in the registry. Safe against `constructor` and friends. */
export const isAppId = (id: string): boolean => Object.prototype.hasOwnProperty.call(APPS, id);

export const appList = (): AppConfig[] => Object.values(APPS);

/** Apps grouped for the Start menu's All Programs flyout, in a stable order. */
export const CATEGORY_LABELS: Record<AppConfig['category'], string> = {
    accessory: 'Accessories',
    game: 'Games',
    portfolio: 'Portfolio',
    system: 'System',
};
