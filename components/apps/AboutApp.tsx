import ExplorerLayout from '../os/ExplorerLayout';
import { User, MapPin, Briefcase, GraduationCap, Mail, Code, Star, Heart, Globe, Linkedin, Twitter } from 'lucide-react';

interface AboutAppProps {
    windowId?: string;
}

export default function AboutApp({ windowId }: AboutAppProps) {
    const socialLinks = [
        { label: "GitHub", icon: Globe, action: () => window.open("https://github.com/tiwarygaurav", "tiwarygaurav") },
        { label: "LinkedIn", icon: Globe, action: () => window.open("https://linkedin.com/in/gauravtiwary21", "gauravtiwary21") },
        { label: "Twitter", icon: Globe, action: () => window.open("https://twitter.com/GauravI970936", "GauravI970936") },
        { label: "Email Me", icon: Mail, action: () => window.open("mailto:gauravt.nic@gmail.com", "gauravt.nic@gmail.com") },
    ];

    const skills = [
        { label: "React & Next.js", icon: Code },
        { label: "TypeScript", icon: Code },
        { label: "Tailwind CSS", icon: Code },
        { label: "Node.js", icon: Code },
        { label: "UI/UX Design", icon: Star },
    ];

    const interests = [
        { label: "Retro Computing", icon: Heart },
        { label: "Pixel Art", icon: Heart },
        { label: "Open Source", icon: Heart },
    ];

    return (
        <ExplorerLayout
            windowId={windowId || 'about'}
            title="About Me"
            address="Control Panel \ System \ About Me"
            sidebarSections={[
                { title: "Connect", items: socialLinks, defaultOpen: true },
                { title: "Top Skills", items: skills, defaultOpen: true },
                { title: "Interests", items: interests, defaultOpen: true },
            ]}
        >
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex flex-col md:flex-row items-center gap-6 mb-8">
                    <div className="relative group">
                        <div className="w-32 h-32 rounded-lg bg-gradient-to-br from-blue-400 to-blue-600 shadow-xl overflow-hidden border-2 border-white transform -rotate-2 group-hover:rotate-0 transition-transform duration-300">
                            {/* Placeholder for real avatar if available */}
                            <User size={64} className="text-white absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                        </div>
                        <div className="absolute -bottom-2 -right-2 bg-yellow-400 text-xs font-bold px-2 py-0.5 rounded border border-yellow-600 shadow-sm rotate-3">
                            v1.0
                        </div>
                    </div>

                    <div className="text-center md:text-left">
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600 drop-shadow-sm mb-1">
                            Kumar Gaurav
                        </h1>
                        <h2 className="text-xl text-gray-500 font-medium mb-3">Full Stack Developer & Designer</h2>

                        <div className="flex flex-wrap justify-center md:justify-start gap-3 text-sm text-gray-600">
                            <span className="flex items-center gap-1 bg-gray-100 px-2 py-1 rounded border border-gray-200"><MapPin size={14} className="text-red-500" /> Mumbai, India</span>
                            <span className="flex items-center gap-1 bg-blue-50 px-2 py-1 rounded border border-blue-100 text-blue-700"><Briefcase size={14} /> Open to Work</span>
                        </div>
                    </div>
                </div>

                {/* Bio */}
                <div className="bg-[#FFFFE1] border border-[#d0d0bf] p-4 rounded shadow-sm mb-8 relative">
                    <div className="absolute -top-3 left-4 bg-[#FFFFE1] px-2 text-xs font-bold text-gray-500 uppercase tracking-wide border border-[#d0d0bf] rounded">
                        Biography
                    </div>
                    <p className="text-gray-800 leading-relaxed text-sm md:text-base">
                        I craft digital experiences with a focus on <strong className="text-blue-700">nostalgia</strong>, <strong className="text-purple-700">interactivity</strong>, and pixel-perfect design.
                        Specializing in React, Next.js, AI-ML and creative coding, I turn complex problems into intuitive,
                        beautiful interfaces. My journey started with a fascination for how things work under the hood, leading me to explore everything from low-level systems to high-level UI architectures.
                    </p>
                </div>

                {/* Two Column Layout for Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Experience */}
                    <div>
                        <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                            <Briefcase className="text-blue-600" size={20} />
                            <h3 className="text-lg font-bold text-gray-700">Experience</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white hover:bg-gray-50 p-3 rounded border border-transparent hover:border-blue-200 transition-colors group">
                                <h4 className="font-bold text-gray-800 group-hover:text-blue-600">Software Engineer</h4>
                                <div className="text-xs text-gray-500 mb-1">VXO Digital • Aug 2025 - Present</div>
                                <p className="text-xs text-gray-600 leading-snug">Developing and Enhancing Platform Architecture, mobile applications, and implementing AI Use cases.</p>
                            </div>

                            <div className="bg-white hover:bg-gray-50 p-3 rounded border border-transparent hover:border-blue-200 transition-colors group">
                                <h4 className="font-bold text-gray-800 group-hover:text-blue-600">Data Engineering Intern</h4>
                                <div className="text-xs text-gray-500 mb-1">Here Technologies • Jan 2025 - July 2025</div>
                                <p className="text-xs text-gray-600 leading-snug">Explored GIS domain, ADAS systems, crafting solutions based on ML Algorithms.</p>
                            </div>
                        </div>
                    </div>

                    {/* Education */}
                    <div>
                        <div className="flex items-center gap-2 mb-4 border-b border-gray-200 pb-2">
                            <GraduationCap className="text-green-600" size={20} />
                            <h3 className="text-lg font-bold text-gray-700">Education</h3>
                        </div>

                        <div className="space-y-4">
                            <div className="bg-white hover:bg-gray-50 p-3 rounded border border-transparent hover:border-green-200 transition-colors group">
                                <h4 className="font-bold text-gray-800 group-hover:text-green-600">B.Tech - Computer Science</h4>
                                <div className="text-xs text-gray-500 mb-1">Birla Institute of Technology Mesra</div>
                                <div className="text-xs text-gray-400">2021 - 2025</div>
                                <p className="text-xs text-gray-600 mt-1 leading-snug">Specialized in Intelligent Systems and Distributed Computing.</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </ExplorerLayout>
    );
}
