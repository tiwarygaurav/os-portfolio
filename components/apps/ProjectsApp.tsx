"use client";

import { Folder, FileCode, Globe, Github, ExternalLink, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const PROJECTS = [
    {
        id: 'os-portfolio',
        title: 'OS Portfolio',
        desc: 'An interactive desktop OS simulation built with Next.js. Features draggable windows, terminal emulator, boot screen, sound effects, and state-managed window system.',
        stack: ['Next.js', 'React', 'Tailwind CSS', 'Zustand', 'Framer Motion'],
        github: 'https://github.com/tiwarygaurav/os-portfolio',
        demo: 'https://os-portfolio.vercel.app', // update if different
        type: 'web'
    },
    {
        id: 'enterprise-dashboard',
        title: 'Enterprise Workforce Dashboard',
        desc: 'Full-stack enterprise-grade workforce and claim management system with REST APIs, pagination, filtering, infinite scroll, and secure role-based access.',
        stack: ['Angular', 'Spring Boot', 'Java', 'SQL', 'REST APIs'],
        github: 'https://github.com/tiwarygaurav', // replace with exact repo if public
        demo: '#',
        type: 'backend'
    },
    {
        id: 'bypass-lane-gnn',
        title: 'Bypass Lane GNN Model',
        desc: 'Graph-based traffic modeling system using heterogeneous graphs. Built custom node/edge features including distance & bearing for lane-level intelligence.',
        stack: ['Python', 'PyTorch Geometric', 'Graph Neural Networks', 'GeoJSON'],
        github: 'https://github.com/tiwarygaurav', // replace if repo exists
        demo: '#',
        type: 'ai'
    }
];


export default function ProjectsApp() {
    const [selectedProject, setSelectedProject] = useState<any>(null);
    const [filter, setFilter] = useState('all');

    const filteredProjects = filter === 'all'
        ? PROJECTS
        : PROJECTS.filter(p => p.type === filter);

    return (
        <div className="flex h-full bg-white text-black font-sans">

            {/* Sidebar */}
            <div className="w-48 bg-gray-100 border-r border-gray-300 p-2 flex flex-col gap-1 text-sm">
                <div className="font-bold text-gray-500 text-xs uppercase mb-2 px-2 mt-2">Favorites</div>
                <button
                    onClick={() => { setFilter('all'); setSelectedProject(null); }}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${filter === 'all' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200'}`}
                >
                    <Folder size={16} className="text-yellow-500" /> All Projects
                </button>
                <button
                    onClick={() => { setFilter('web'); setSelectedProject(null); }}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${filter === 'web' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200'}`}
                >
                    <Folder size={16} className="text-blue-500" /> Web Apps
                </button>
                <button
                    onClick={() => { setFilter('backend'); setSelectedProject(null); }}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${filter === 'backend' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200'}`}
                >
                    <Folder size={16} className="text-gray-500" /> Backend
                </button>
                <button
                    onClick={() => { setFilter('ai'); setSelectedProject(null); }}
                    className={`flex items-center gap-2 px-2 py-1 rounded ${filter === 'ai' ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-200'}`}
                >
                    <Folder size={16} className="text-purple-500" /> AI / ML
                </button>

            </div>

            {/* Main Content */}
            <div className="flex-1 flex flex-col">
                {/* Address Bar */}
                <div className="h-8 border-b border-gray-300 flex items-center px-2 bg-white gap-2 text-sm">
                    <span className="text-gray-400">Address:</span>
                    <div className="flex-1 border border-gray-300 px-2 py-0.5 bg-white text-gray-700 flex items-center gap-1">
                        <Folder size={12} className="text-yellow-500" />
                        <span>C:\My Projects\{filter === 'all' ? '' : filter}</span>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 p-4 overflow-auto">
                    {selectedProject ? (
                        // Detail View
                        <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">
                            <button
                                onClick={() => setSelectedProject(null)}
                                className="text-blue-600 hover:underline text-sm mb-4 flex items-center gap-1"
                            >
                                ← Back to list
                            </button>

                            <div className="bg-gray-50 p-6 rounded-lg border border-gray-200">
                                <h2 className="text-2xl font-bold flex items-center gap-3 mb-2">
                                    <FileCode className="text-blue-600" />
                                    {selectedProject.title}
                                </h2>
                                <p className="text-gray-600 mb-6 border-b pb-4">{selectedProject.desc}</p>

                                <div className="grid grid-cols-2 gap-4 mb-6">
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-500 uppercase mb-2">Tech Stack</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedProject.stack.map((tech: string) => (
                                                <span key={tech} className="px-2 py-1 bg-white border border-gray-300 rounded text-xs">
                                                    {tech}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <h4 className="font-bold text-sm text-gray-500 uppercase mb-2">Links</h4>
                                        <div className="flex gap-4">
                                            <a href={selectedProject.github} target="_blank" className="flex items-center gap-2 text-blue-600 hover:underline">
                                                <Github size={16} /> Source
                                            </a>
                                            <a href={selectedProject.demo} target="_blank" className="flex items-center gap-2 text-green-600 hover:underline">
                                                <Globe size={16} /> Live Demo
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        // Grid View
                        <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-4">
                            {filteredProjects.map((project) => (
                                <button
                                    key={project.id}
                                    onClick={() => setSelectedProject(project)}
                                    className="flex flex-col items-center gap-2 p-4 hover:bg-blue-50 rounded group focus:bg-blue-100 focus:outline-none focus:ring-1 focus:ring-blue-300 transition-colors"
                                >
                                    <div className="w-12 h-12 bg-white border border-gray-200 rounded shadow-sm flex items-center justify-center group-hover:scale-105 transition-transform">
                                        {project.type === 'web' && <Globe className="text-blue-500" />}
                                        {project.type === 'backend' && <FileCode className="text-gray-600" />}
                                        {project.type === 'ai' && <FileCode className="text-purple-500" />}

                                    </div>
                                    <span className="text-sm text-center text-gray-700 font-medium leading-tight group-hover:text-blue-700">
                                        {project.title}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Status Bar */}
                <div className="h-6 bg-gray-100 border-t border-gray-300 px-2 flex items-center text-xs text-gray-500">
                    {filteredProjects.length} object(s)
                </div>
            </div>
        </div>
    );
}
