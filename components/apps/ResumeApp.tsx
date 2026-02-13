"use client";

import { Download, FileText, Printer, Search, Mail, Phone, Globe, Linkedin, Github } from 'lucide-react';

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
                            <h1 className="text-4xl font-bold uppercase tracking-wider">Kumar Gaurav</h1>
                            <div className="flex gap-4 mt-2 text-sm text-gray-700">
                                <a href="mailto:gauravt.nic@gmail.com" className="flex items-center gap-1 hover:underline">
                                    <Mail size={14} /> gauravt.nic@gmail.com
                                </a>
                                <span className="flex items-center gap-1">
                                    <Phone size={14} /> 6200421041
                                </span>
                            </div>
                            <div className="flex gap-4 mt-1 text-sm text-gray-700">
                                <a href="https://github.com/tiwarygaurav" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                    <Github size={14} /> github.com/tiwarygaurav
                                </a>
                                <a href="https://linkedin.com/in/gauravtiwary21" target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 hover:underline">
                                    <Linkedin size={14} /> linkedin.com/in/gauravtiwary21
                                </a>
                            </div>
                        </div>
                    </div>

                    {/* Content */}
                    <div className="grid grid-cols-[1fr_2fr] gap-8">

                        {/* Left Column */}
                        <div className="space-y-6">
                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Education</h3>
                                <div className="mb-2">
                                    <h4 className="font-bold text-sm">B. Tech Computer Science</h4>
                                    <p className="text-xs text-gray-600">Birla Institute of Technology Mesra</p>
                                    <p className="text-xs text-gray-500">Ranchi, Jharkhand</p>
                                    <p className="text-xs text-gray-500 font-mono">2021 - 2025</p>
                                    <div className="mt-2 text-xs text-gray-600">
                                        <p className="font-semibold">Coursework:</p>
                                        <p>Data Structures & Algorithms, Software Engineering, Computer Networks, Cryptography, AI/ML, OS, DBMS</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Skills</h3>
                                <div className="text-sm space-y-2">
                                    <div>
                                        <p className="font-bold text-xs">Languages</p>
                                        <p className="text-gray-700">Python, JavaScript, Java, SQL, HTML/CSS</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">Backend</p>
                                        <p className="text-gray-700">Angular (basic), Node.js, Spring Boot, REST APIs</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">Dev Tools</p>
                                        <p className="text-gray-700">Git, Docker (basic), Postman</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">ML</p>
                                        <p className="text-gray-700">PyTorch, Numpy, Pandas, GeoPandas</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-xs">Cloud & Deployment</p>
                                        <p className="text-gray-700">AWS EC2, Render (basic), GitHub Actions</p>
                                    </div>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Certifications</h3>
                                <div className="text-sm">
                                    <p className="font-bold">AWS Cloud Practitioner Essential</p>
                                    <p className="text-xs text-gray-600">Amazon • Ongoing</p>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Achievements</h3>
                                <ul className="text-xs list-disc pl-4 space-y-2 text-gray-700">
                                    <li>
                                        Advanced to Round 3 of <strong>Tata Imagination Challenge 2024</strong> (Top 0.6% of ~1M participants).
                                    </li>
                                    <li>
                                        Advanced to Round 2 of <strong>Luminous Techno-X Techathon 2024</strong> (Top 2% of ~95k participants).
                                    </li>
                                </ul>
                            </section>
                        </div>

                        {/* Right Column */}
                        <div className="space-y-6">
                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Experience</h3>

                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h4 className="font-bold">Software Developer Trainee Intern</h4>
                                        <span className="text-xs text-gray-500 font-mono">July 2025 – Current</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-2">VXO Digital • Remote</p>
                                    <ul className="text-sm list-disc pl-4 space-y-1 text-gray-700">
                                        <li>Developed and maintained full-stack features using <strong>Angular</strong> and <strong>Spring Boot</strong> for enterprise modules (Orders, Opportunities, MOM).</li>
                                        <li>Implemented RESTful APIs handling complex data flows, validations, and error handling.</li>
                                        <li>Built an <strong>AI-powered Resume Parser</strong> for automated candidate profiling.</li>
                                        <li>Worked with SQL queries for CRUD operations and transaction workflows.</li>
                                        <li>Followed agile practices and Git workflows for code reviews and feature rollouts.</li>
                                    </ul>
                                </div>

                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h4 className="font-bold">Data Engineering Intern</h4>
                                        <span className="text-xs text-gray-500 font-mono">Jan 2025 – July 2025</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-2">Here Technologies • Mumbai, Maharashtra</p>
                                    <ul className="text-sm list-disc pl-4 space-y-1 text-gray-700">
                                        <li>Developed <strong>Python-based data pipelines</strong> to detect bypass lanes from geospatial features.</li>
                                        <li>Engineered graph-based spatial ML workflows and integrated backend support for edge features.</li>
                                        <li>Enhanced internal Node.js visualization tool by linking road topology with traffic elements.</li>
                                        <li>Collaborated on scalable pipeline design for large-scale geospatial datasets.</li>
                                    </ul>
                                </div>
                            </section>

                            <section>
                                <h3 className="font-bold uppercase text-sm border-b border-gray-300 mb-2">Projects</h3>

                                <div className="mb-4">
                                    <div className="flex justify-between items-baseline mb-1">
                                        <h4 className="font-bold">URL Shortener & Analytics System</h4>
                                        <span className="text-xs text-gray-500 font-mono">Current</span>
                                    </div>
                                    <p className="text-xs font-bold text-gray-600 mb-2">Spring Boot</p>
                                    <ul className="text-sm list-disc pl-4 space-y-1 text-gray-700">
                                        <li>Built a Bitly-like URL shortening service using <strong>Java Spring Boot</strong> and relational database.</li>
                                        <li>Implemented short URL generation logic with collision handling and fast redirection.</li>
                                        <li>Designed backend architecture for link creation, retrieval, and redirection.</li>
                                        <li>Integrated <strong>JPA/Hibernate</strong> for storing original URLs, short codes, and access metadata.</li>
                                        <li>Implemented basic analytics tracking (click count / usage data).</li>
                                    </ul>
                                </div>
                            </section>
                        </div>

                    </div>

                </div>
            </div>
        </div>
    );
}
