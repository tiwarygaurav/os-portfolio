"use client";

import { motion } from 'framer-motion';

const SKILLS = [
    {
        category: 'Frontend', items: [
            { name: 'React / Next.js', level: 95 },
            { name: 'TypeScript', level: 90 },
            { name: 'Tailwind CSS', level: 95 },
            { name: 'Framer Motion', level: 85 }
        ]
    },
    {
        category: 'Backend', items: [
            { name: 'Node.js', level: 80 },
            { name: 'PostgreSQL', level: 75 },
            { name: 'GraphQL', level: 70 },
            { name: 'Docker', level: 65 }
        ]
    },
    {
        category: 'Creative', items: [
            { name: 'UI/UX Design', level: 85 },
            { name: 'Blender 3D', level: 40 },
            { name: 'Figma', level: 90 },
        ]
    }
];

export default function SkillsApp() {
    return (
        <div className="h-full bg-gray-50 p-6 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {SKILLS.map((category) => (
                    <div key={category.category} className="bg-white p-4 rounded shadow-sm border border-gray-200">
                        <h3 className="font-bold text-gray-800 mb-4 border-b pb-2 flex justify-between items-center">
                            {category.category}
                            <span className="text-xs font-normal text-gray-400 bg-gray-100 px-2 py-0.5 rounded">Category</span>
                        </h3>

                        <div className="space-y-4">
                            {category.items.map((skill) => (
                                <div key={skill.name}>
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="font-medium text-gray-700">{skill.name}</span>
                                        <span className="text-gray-400 text-xs">{skill.level}%</span>
                                    </div>
                                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                        <motion.div
                                            initial={{ width: 0 }}
                                            animate={{ width: `${skill.level}%` }}
                                            transition={{ duration: 1, ease: "easeOut", delay: 0.2 }}
                                            className={`h-full rounded-full ${skill.level > 80 ? 'bg-green-500' :
                                                    skill.level > 60 ? 'bg-blue-500' : 'bg-yellow-500'
                                                }`}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}

                {/* Radar Chart Placeholder (Could use Recharts if added, but keeping it simple for now) */}
                <div className="bg-white p-4 rounded shadow-sm border border-gray-200 flex items-center justify-center min-h-[200px]">
                    <div className="text-center">
                        <div className="w-24 h-24 border-4 border-blue-100 rounded-full mx-auto mb-2 flex items-center justify-center animate-pulse">
                            <div className="w-16 h-16 bg-blue-500 rounded-full opacity-20" />
                        </div>
                        <p className="text-gray-400 text-sm">Skills Radar Analysis</p>
                        <p className="text-xs text-gray-300">(Visualizer Module Loading)</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
