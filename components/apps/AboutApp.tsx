"use client";

import { User, MapPin, Briefcase, GraduationCap, Download } from 'lucide-react';

export default function AboutApp() {
    return (
        <div className="h-full bg-white text-black p-6 overflow-y-auto font-sans">

            {/* Header Profile Section */}
            <div className="flex flex-col md:flex-row gap-6 items-center md:items-start border-b border-gray-200 pb-6 mb-6">
                <div className="w-32 h-32 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full border-4 border-white shadow-lg flex items-center justify-center shrink-0">
                    <User size={64} className="text-white" />
                </div>

                <div className="flex-1 text-center md:text-left">
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 mb-2">
                        Alex Developer
                    </h1>
                    <h2 className="text-xl text-gray-600 mb-4">Frontend Architect & Creative Designer</h2>

                    <div className="flex flex-wrap gap-4 justify-center md:justify-start text-sm text-gray-500">
                        <span className="flex items-center gap-1"><MapPin size={16} /> San Francisco, CA</span>
                        <span className="flex items-center gap-1"><Briefcase size={16} /> Open for Opportunities</span>
                    </div>

                    <p className="mt-4 text-gray-700 leading-relaxed max-w-2xl">
                        I craft digital experiences with a focus on nostalgia, interactivity, and pixel-perfect design.
                        Specializing in React, Next.js, and creative coding, I turn complex problems into intuitive,
                        beautiful interfaces.
                    </p>
                </div>
            </div>

            {/* Main Content Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

                {/* Experience Column */}
                <div>
                    <h3 className="text-lg font-bold border-b-2 border-blue-500 inline-block mb-4 text-blue-800">
                        Experience
                    </h3>
                    <div className="space-y-6 relative border-l-2 border-gray-200 ml-3 pl-6">

                        <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-blue-500 border-2 border-white" />
                            <h4 className="font-bold">Senior Frontend Engineer</h4>
                            <p className="text-sm text-gray-500">Tech Corp • 2021 - Present</p>
                            <p className="text-sm text-gray-600 mt-1">Leading the core product team, migrating legacy systems to Next.js, and establishing a new design system.</p>
                        </div>

                        <div className="relative">
                            <div className="absolute -left-[31px] top-1 w-4 h-4 rounded-full bg-gray-400 border-2 border-white" />
                            <h4 className="font-bold">Web Developer</h4>
                            <p className="text-sm text-gray-500">Creative Agency • 2018 - 2021</p>
                            <p className="text-sm text-gray-600 mt-1">Built award-winning promotional sites for major brands using WebGL and GSAP.</p>
                        </div>

                    </div>
                </div>

                {/* Education & Fun Facts */}
                <div className="space-y-8">

                    <div>
                        <h3 className="text-lg font-bold border-b-2 border-blue-500 inline-block mb-4 text-blue-800">
                            Education
                        </h3>
                        <div className="flex items-start gap-3">
                            <GraduationCap className="text-blue-500 mt-1" />
                            <div>
                                <h4 className="font-bold">BS Computer Science</h4>
                                <p className="text-sm text-gray-500">University of Technology • 2018</p>
                            </div>
                        </div>
                    </div>

                    <div className="bg-blue-50 p-4 rounded border border-blue-100">
                        <h4 className="font-bold text-blue-700 mb-2 text-sm">SUMMARY.TXT</h4>
                        <p className="font-mono text-xs text-blue-900">
                            &gt; 5+ years of experience<br />
                            &gt; 50+ projects delivered<br />
                            &gt; TypeScript enthusiast<br />
                            &gt; Pixel perfectionist
                        </p>
                    </div>

                    <button className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded shadow transition-all active:scale-95 w-full md:w-auto justify-center">
                        <Download size={18} />
                        Download Resume (PDF)
                    </button>

                </div>

            </div>
        </div>
    );
}
