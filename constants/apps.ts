import {
    User,
    FolderOpen,
    Cpu,
    FileText,
    Mail,
    TerminalSquare,
    Trash2,
    Gamepad2
} from 'lucide-react';

export interface AppConfig {
    id: string;
    title: string;
    icon: any; // Lucide Icon component
    component?: any; // To be imported later
    width?: number;
    height?: number;
    canMaximize?: boolean;
}

export const APPS: Record<string, AppConfig> = {
    about: {
        id: 'about',
        title: 'About Me',
        icon: User,
        width: 600,
        height: 500,
        canMaximize: true,
    },
    projects: {
        id: 'projects',
        title: 'My Projects',
        icon: FolderOpen,
        width: 800,
        height: 600,
        canMaximize: true,
    },
    skills: {
        id: 'skills',
        title: 'Skills & Tech',
        icon: Cpu,
        width: 700,
        height: 500,
        canMaximize: false,
    },
    resume: {
        id: 'resume',
        title: 'Resume.pdf',
        icon: FileText,
        width: 500,
        height: 700,
        canMaximize: true,
    },
    contact: {
        id: 'contact',
        title: 'Contact Me',
        icon: Mail,
        width: 500,
        height: 400,
        canMaximize: false,
    },
    terminal: {
        id: 'terminal',
        title: 'Terminal',
        icon: TerminalSquare,
        width: 600,
        height: 400,
        canMaximize: true,
    },
    trash: {
        id: 'trash',
        title: 'Recycle Bin',
        icon: Trash2,
        width: 600,
        height: 400,
        canMaximize: false,
    },
};

export const DESKTOP_ICONS = [
    'about',
    'projects',
    'skills',
    'resume',
    'contact',
    'terminal',
    'trash',
];
