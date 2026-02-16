import {
    User,
    FolderOpen,
    Cpu,
    FileText,
    Mail,
    TerminalSquare,
    Trash2,
    Gamepad2,
    Headphones,
    PenTool
} from 'lucide-react';

export interface AppConfig {
    id: string;
    title: string;
    icon: any; // Lucide Icon component
    component?: any; // To be imported later
    width?: number;
    height?: number;
    canMaximize?: boolean;
    iconAsset?: string; // Path to image file (e.g. '/icons/User Personalization.ico')
}

export const APPS: Record<string, AppConfig> = {
    about: {
        id: 'about',
        title: 'About Me',
        icon: User,
        iconAsset: '/icons/User Personalization.ico',
        width: 600,
        height: 500,
        canMaximize: true,
    },
    projects: {
        id: 'projects',
        title: 'My Projects',
        icon: FolderOpen,
        iconAsset: '/icons/Folder Open.ico',
        width: 800,
        height: 600,
        canMaximize: true,
    },
    skills: {
        id: 'skills',
        title: 'Skills & Tech',
        icon: Cpu,
        iconAsset: '/icons/Skills.ico',
        width: 700,
        height: 500,
        canMaximize: false,
    },
    resume: {
        id: 'resume',
        title: 'Resume.pdf',
        icon: FileText,
        iconAsset: '/icons/List File.ico',
        width: 500,
        height: 700,
        canMaximize: true,
    },
    contact: {
        id: 'contact',
        title: 'Contact Me',
        icon: Mail,
        iconAsset: '/icons/Phone.ico',
        width: 500,
        height: 400,
        canMaximize: false,
    },
    terminal: {
        id: 'terminal',
        title: 'Terminal',
        icon: TerminalSquare,
        iconAsset: '/icons/278.ico',
        width: 600,
        height: 400,
        canMaximize: true,
    },
    trash: {
        id: 'trash',
        title: 'Recycle Bin',
        icon: Trash2,
        iconAsset: '/icons/trash.png',
        width: 600,
        height: 400,
        canMaximize: false,
    },
    music: {
        id: 'music',
        title: 'Music Player',
        icon: Headphones,
        iconAsset: '/icons/media-player.png',
        width: 350,
        height: 450,
        canMaximize: false,
    },
    paint: {
        id: 'paint',
        title: 'Paint',
        icon: PenTool,
        iconAsset: '/icons/paint.png',
        width: 800,
        height: 600,
        canMaximize: true,
    },
};

export const DESKTOP_ICONS = [
    'about',
    'projects',
    'skills',
    'resume',
    'contact',
    'music',
    'paint',
    'terminal',
    'trash',
];
