"use client";

import { Download, FileText, Printer, Search } from 'lucide-react';

export default function ResumeApp() {
    return (
        <div className="h-full flex flex-col bg-gray-500 font-sans">
            {/* Toolbar */}
            <div className="bg-gray-100 border-b border-gray-300 p-2 flex items-center gap-4 text-gray-700 shadow-sm z-10">
                <button className="p-1 hover:bg-gray-200 rounded" title="Print">
                    <Printer size={18} />
                </button>
                <button className="p-1 hover:bg-gray-200 rounded" title="Download">
                    <Download size={18} />
                </button>
                <div className="h-4 w-[1px] bg-gray-300" />
                <div className="flex items-center bg-white border border-gray-300 rounded px-2 py-0.5 w-32">
                    <span className="text-xs text-gray-400">1 / 1</span>
                </div>
                <div className="flex items-center gap-1 ml-auto">
                    <Search size={16} />
                    <input type="text" placeholder="Find..." className="bg-transparent text-sm w-24 outline-none" />
                </div>
            </div>

            {/* PDF Preview Area */}
            <div className="flex-1 overflow-auto p-8 flex justify-center">
                <div className="bg-white w-full max-w-[800px] shadow-lg min-h-[1000px] p-12 text-black relative">

                    {/* Header */}
                    <div className="border-b-2 border-black pb-4 mb-8 flex justify-between items-baseline">
                        <div>
                            <h1 className="text-4xl font-bold uppercase tracking-wider">Alex Developer</h1>
                            <p className="text-gray-600 mt-1">Senior Frontend Engineer</p>
                        </div>
                        <div className="text-right text-sm text-gray-600">
                            <p>alex@example.com</p>
                            <p>+1 (555) 123-4567</p>
                            <p>San Francisco, CA</p>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="grid grid-cols-[1fr_2fr] gap-8">

                        {/* Left Column */}
                        <div className="space-y-6">
                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Education</h3>
                                <div className="mb-2">
                                    <h4 className="font-bold text-sm">BS Computer Science</h4>
                                    <p className="text-xs text-gray-600">Uni of Tech • 2018</p>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Skills</h3>
                                <ul className="text-sm list-disc pl-4 space-y-1">
                                    <li>React / Next.js</li>
                                    <li>TypeScript</li>
                                    <li>Node.js</li>
                                    <li>GraphQL</li>
                                    <li>Tailwind CSS</li>
                                    <li>AWS / Docker</li>
                                </ul>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Awards</h3>
                                <div className="text-sm">
                                    <p className="font-bold">Best UI Design</p>
                                    <p className="text-xs text-gray-600">Web Awards 2022</p>
                                </div>
                            </section>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-6">
                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Professional Experience</h3>

                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h4 className="font-bold">Senior Frontend Engineer</h4>
                                        <span className="text-xs text-gray-500 font-mono">2021 - Present</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-2">Tech Corp Inc.</p>
                                    <ul className="text-sm list-disc pl-4 space-y-1 text-gray-700">
                                        <li>Architected the new customer dashboard reducing load times by 40%.</li>
                                        <li>Led a team of 5 developers in migrating the codebase to TypeScript.</li>
                                        <li>Implemented a comprehensive design system used across 3 products.</li>
                                    </ul>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h4 className="font-bold">Web Developer</h4>
                                        <span className="text-xs text-gray-500 font-mono">2018 - 2021</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-2">Creative Agency</p>
                                    <ul className="text-sm list-disc pl-4 space-y-1 text-gray-700">
                                        <li>Developed award-winning promotional websites for Fortune 500 clients.</li>
                                        <li>Specialized in WebGL interactions and GSAP animations.</li>
                                    </ul>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Projects</h3>
                                <div className="mb-2">
                                    <h4 className="font-bold text-sm">Portfolio OS</h4>
                                    <p className="text-sm text-gray-700">A web-based operating system simulation built with React and Framer Motion.</p>
                                </div>
                            </section>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
}
